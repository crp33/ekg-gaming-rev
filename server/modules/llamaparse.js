// ---------------------------------------------------------------------------
// LlamaParse module — alternative PDF parser
// ---------------------------------------------------------------------------
// Purpose: an ALTERNATIVE to server/modules/document.js's extractPdfText()
// (pdfjs-dist), which sends the PDF to the hosted LlamaParse API instead and
// gets back clean markdown. LlamaParse tends to do a much better job on
// PDFs with real tables (exactly what regulator revenue reports are), where
// pdfjs's plain text-item extraction can scramble column alignment.
//
// OPTIONAL BY CONFIGURATION, same pattern as server/modules/playwright.js and
// server/modules/supabase.js: set BOTH USE_LLAMAPARSE=true and
// LLAMAPARSE_API_KEY in .env to turn this on. With either unset, isConfigured()
// returns false and document.js's parsePdfBuffer() never calls into this file
// at all — the current pdfjs-only behavior is completely unchanged. This
// module makes no network calls and has no side effects unless explicitly
// asked to via parseWithLlamaParse().
//
// FALLBACK: this module only ever throws — it never decides what happens on
// failure. document.js's parsePdfBuffer() is the one place that catches a
// thrown error here and falls back to extractPdfText(), so there is exactly
// one fallback policy for both the upload path and the URL-scrape path
// (server/modules/playwright.js) that both call through parsePdfBuffer().
//
// API reference (verified against developers.llamaindex.ai, 2026-07):
//   POST   /api/v2/parse/upload            multipart file upload, returns a job id
//   GET    /api/v2/parse/{job_id}          poll until status is COMPLETED/FAILED
//   GET    /api/v2/parse/{job_id}?expand=markdown   fetch the parsed markdown
// All three require `Authorization: Bearer <LLAMAPARSE_API_KEY>`.

const API_BASE = 'https://api.cloud.llamaindex.ai/api/v2/parse';
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 120000; // overall budget for upload + parse + poll
const REQUEST_TIMEOUT_MS = 30000; // per individual HTTP call

function isConfigured() {
  return process.env.USE_LLAMAPARSE === 'true' && Boolean(process.env.LLAMAPARSE_API_KEY);
}

function authHeaders() {
  return { Authorization: `Bearer ${process.env.LLAMAPARSE_API_KEY}` };
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function startJob(buffer, filename) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'application/pdf' }), filename || 'document.pdf');
  // tier/version are both required by the API (confirmed via a live 400 —
  // there's no "use defaults" empty-object shortcut). "cost_effective" is
  // LlamaParse's standard layout-aware tier — a reasonable default for a
  // batch document-extraction tool; bump to "agentic" or "premium" here if
  // a harder document needs it.
  form.append('configuration', JSON.stringify({ tier: 'cost_effective', version: 'latest' }));

  const res = await fetchWithTimeout(`${API_BASE}/upload`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });
  if (!res.ok) {
    throw new Error(`LlamaParse upload failed: HTTP ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  // The docs site's exact response nesting has drifted between versions
  // (some examples show { id, status } at the top level, others nest under
  // { job: { id, status } }) — check both rather than trust one shape.
  const jobId = data.id || (data.job && data.job.id);
  if (!jobId) {
    throw new Error(`LlamaParse upload response had no job id: ${JSON.stringify(data)}`);
  }
  return jobId;
}

async function pollUntilComplete(jobId) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await fetchWithTimeout(`${API_BASE}/${jobId}`, { headers: authHeaders() });
    if (!res.ok) {
      throw new Error(`LlamaParse status check failed: HTTP ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    const status = data.status || (data.job && data.job.status);
    if (status === 'COMPLETED') return;
    if (status === 'FAILED' || status === 'CANCELLED') {
      throw new Error(`LlamaParse job ${status.toLowerCase()}: ${JSON.stringify(data)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`LlamaParse job did not complete within ${POLL_TIMEOUT_MS / 1000}s.`);
}

async function fetchMarkdown(jobId) {
  const res = await fetchWithTimeout(`${API_BASE}/${jobId}?expand=markdown`, { headers: authHeaders() });
  if (!res.ok) {
    throw new Error(`LlamaParse result fetch failed: HTTP ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const pages = (data.markdown && data.markdown.pages) || [];
  const text = pages.map((p) => p.markdown || '').join('\n\n').trim();
  if (!text) {
    throw new Error(`LlamaParse returned no markdown content: ${JSON.stringify(data)}`);
  }
  return text;
}

/**
 * Parses a PDF buffer via the hosted LlamaParse API and returns clean
 * markdown text. Throws on any failure (auth, timeout, empty result) —
 * callers decide what to do about it (see document.js's parsePdfBuffer()).
 * @param {Buffer} buffer
 * @param {string} [filename]
 * @returns {Promise<string>}
 */
async function parseWithLlamaParse(buffer, filename) {
  const jobId = await startJob(buffer, filename);
  await pollUntilComplete(jobId);
  return fetchMarkdown(jobId);
}

module.exports = { isConfigured, parseWithLlamaParse };
