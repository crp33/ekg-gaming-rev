require('dotenv').config();

const path = require('path');
const express = require('express');
const multer = require('multer');
const { buildWorkbook } = require('./modules/excel');
const { flagDiscrepancies } = require('./modules/discrepancy');
const { extractData } = require('./modules/claude');
const { extractTextFromUpload, MAX_UPLOAD_BYTES } = require('./modules/document');
const { scrapeUrl } = require('./modules/playwright');
const { isConfigured: isSupabaseConfigured, saveDataset } = require('./modules/supabase');
const { requireAuth } = require('./middleware/auth');
const { columns } = require('./config/ekg-schema');
const { sampleRows, samplePreviousRows } = require('./fixtures/sample-rows');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Simple health check — useful for confirming the server is alive locally
// and for Railway's deploy health checks. Deliberately not behind auth.
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Public runtime config for the front end (public/auth.js). Must stay
// unauthenticated — it's what lets an unauthenticated browser find out
// whether it needs to log in at all, and if so, the public (anon) key to do
// it with. authRequired mirrors server/modules/supabase.js's isConfigured():
// when Supabase isn't set up, the front end skips the login screen entirely.
app.get('/api/config', (_req, res) => {
  res.json({
    authRequired: isSupabaseConfigured(),
    supabaseUrl: process.env.SUPABASE_URL || null,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || null,
  });
});

// Column metadata for the front end — lets it build the results table from
// ekg-schema.js instead of duplicating the column list in client-side JS.
app.get('/api/schema', requireAuth, (_req, res) => {
  res.json({ columns });
});

// Shared by /api/extract and /api/extract-url: runs the same
// extract -> flag -> best-effort-save -> respond pipeline regardless of
// where the raw text came from (an upload vs. a scraped page).
async function processRawText({ rawText, req, res, sourceFilename }) {
  const result = await extractData(rawText);
  if (!result.ok) {
    res.status(502).json(result);
    return;
  }

  flagDiscrepancies(result.rows);

  // Storage is best-effort — a Supabase failure (or Supabase simply not
  // being configured) must never stop extracted results from reaching the
  // user. See server/modules/supabase.js.
  try {
    await saveDataset({
      rows: result.rows,
      narrativeSummary: result.narrativeSummary,
      uploadedBy: req.user ? req.user.id : null,
      sourceFilename,
    });
  } catch (err) {
    console.error('Failed to save dataset to Supabase:', err.message);
  }

  res.json(result);
}

// Upload a document (PDF/HTML/text), extract structured data + a draft
// narrative summary in one Claude call, then flag discrepancies before
// returning. This backs the front end's upload box + "Process" button.
app.post('/api/extract', requireAuth, upload.single('document'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ ok: false, error: 'No file uploaded (expected form field "document").' });
    return;
  }

  let rawText;
  try {
    rawText = await extractTextFromUpload(req.file);
  } catch (err) {
    res.status(400).json({ ok: false, error: `Could not read uploaded file: ${err.message}` });
    return;
  }

  await processRawText({ rawText, req, res, sourceFilename: req.file.originalname });
});

// Same pipeline as /api/extract, but starting from a regulator URL instead
// of an uploaded file: server/modules/playwright.js loads the page in
// Chromium and hands its text to the same extractor. Optional feature — see
// the comments in server/modules/playwright.js. Body: { url: "https://..." }.
app.post('/api/extract-url', requireAuth, async (req, res) => {
  const { url } = req.body || {};
  if (!url) {
    res.status(400).json({ ok: false, error: 'Request body must include a "url".' });
    return;
  }

  let rawText;
  try {
    rawText = await scrapeUrl(url);
  } catch (err) {
    res.status(502).json({ ok: false, error: `Could not scrape URL: ${err.message}` });
    return;
  }

  await processRawText({ rawText, req, res, sourceFilename: url });
});

// Excel export of already-extracted rows: flags discrepancies, then builds
// and streams the .xlsx. Body: { rows: [...], previousRows?: [...] } — both
// in the shape returned by server/modules/claude.js's extractData().rows.
app.post('/api/export/excel', requireAuth, async (req, res) => {
  const { rows, previousRows } = req.body || {};
  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ error: 'Request body must include a non-empty "rows" array.' });
    return;
  }

  try {
    const flaggedRows = flagDiscrepancies(rows, { previousRows: previousRows || [] });
    const buffer = await buildWorkbook(flaggedRows);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="ekg-export.xlsx"');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: `Failed to build Excel export: ${err.message}` });
  }
});

// Same export, but over the bundled sample dataset (server/fixtures/sample-rows.js)
// — a one-click way to see the Excel export + discrepancy highlighting working
// without needing a real extraction run first.
app.get('/api/export/excel/sample', requireAuth, async (_req, res) => {
  try {
    const flaggedRows = flagDiscrepancies(structuredClone(sampleRows), {
      previousRows: samplePreviousRows,
    });
    const buffer = await buildWorkbook(flaggedRows);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="ekg-sample-export.xlsx"');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: `Failed to build sample Excel export: ${err.message}` });
  }
});

// Error handler — must be registered last. Ensures upload failures (e.g.
// file too large) come back as JSON instead of Express's default HTML error
// page, which the front end's fetch() calls can't parse.
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    res.status(400).json({ ok: false, error: `Upload error: ${err.message}` });
    return;
  }
  console.error(err);
  res.status(500).json({ ok: false, error: 'Internal server error.' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  if (!isSupabaseConfigured()) {
    console.log('Supabase is not configured — running without login or dataset storage (see .env.example).');
  }
});
