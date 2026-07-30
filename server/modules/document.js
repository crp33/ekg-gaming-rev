// ---------------------------------------------------------------------------
// Document module — extracts raw text from an uploaded file
// ---------------------------------------------------------------------------
// Purpose: turns an uploaded PDF, HTML, or plain-text file into raw text
// ready to hand to server/modules/claude.js's extractData(). parsePdfBuffer()
// is also reused by server/modules/playwright.js for PDFs fetched by URL, so
// PDF parsing has exactly one implementation (with exactly one fallback
// policy) regardless of how the bytes arrived.

const path = require('path');
const cheerio = require('cheerio');
const llamaparse = require('./llamaparse');

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB — also enforced by multer in the route

// Points pdfjs at its own bundled standard-font metrics so it doesn't warn
// (or mis-measure glyph widths) on PDFs using the base 14 fonts without an
// embedded font program. Needs a trailing slash — pdfjs appends filenames.
const STANDARD_FONT_DATA_URL = `${path.join(
  path.dirname(require.resolve('pdfjs-dist/package.json')),
  'standard_fonts'
)}/`;

// pdfjs-dist ships ESM-only builds; this project is CommonJS, so it's loaded
// via dynamic import() and cached rather than require()'d at the top.
let pdfjsPromise;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs').then((pdfjsLib) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
      return pdfjsLib;
    });
  }
  return pdfjsPromise;
}

async function extractPdfText(buffer) {
  const pdfjsLib = await loadPdfjs();
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
  }).promise;
  const pageTexts = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    pageTexts.push(content.items.map((item) => item.str).join(' '));
  }
  return pageTexts.join('\n\n').trim();
}

// ---------------------------------------------------------------------------
// parsePdfBuffer() — the single entry point every PDF (upload or scraped
// URL) goes through. Behavior is unchanged from the plain extractPdfText()
// above UNLESS server/modules/llamaparse.js is configured (USE_LLAMAPARSE=true
// + LLAMAPARSE_API_KEY set in .env — see .env.example): only then does it try
// LlamaParse first, falling back to extractPdfText() if LlamaParse errors,
// times out, or isn't configured. This is the ONLY fallback policy in the
// app — server/modules/playwright.js calls this too, so both input paths
// (upload and URL) get identical behavior.
// ---------------------------------------------------------------------------

async function parsePdfBuffer(buffer, filename) {
  if (!llamaparse.isConfigured()) {
    return extractPdfText(buffer);
  }

  try {
    return await llamaparse.parseWithLlamaParse(buffer, filename);
  } catch (err) {
    console.error(`LlamaParse failed, falling back to extractPdfText(): ${err.message}`);
    return extractPdfText(buffer);
  }
}

/**
 * @param {{ buffer: Buffer, mimetype: string, originalname: string }} file - a multer file object
 * @returns {Promise<string>} extracted plain text
 */
async function extractTextFromUpload(file) {
  const name = (file.originalname || '').toLowerCase();
  const isPdf = file.mimetype === 'application/pdf' || name.endsWith('.pdf');
  const isHtml = file.mimetype === 'text/html' || name.endsWith('.html') || name.endsWith('.htm');

  if (isPdf) {
    return parsePdfBuffer(file.buffer, file.originalname);
  }

  if (isHtml) {
    const $ = cheerio.load(file.buffer.toString('utf8'));
    $('script, style, noscript').remove();
    return $('body').text().replace(/\n{3,}/g, '\n\n').trim();
  }

  // Anything else (.txt, .md, unrecognized) — treat as plain text.
  return file.buffer.toString('utf8');
}

module.exports = { extractTextFromUpload, extractPdfText, parsePdfBuffer, MAX_UPLOAD_BYTES };
