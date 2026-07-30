// ---------------------------------------------------------------------------
// Playwright + Chromium module
// ---------------------------------------------------------------------------
// Purpose: given a regulator URL, launches headless Chromium, loads the
// page, and returns its content as text — ready to hand to
// server/modules/claude.js's extractData() the same way an uploaded
// document's extracted text would be (see POST /api/extract-url in
// server/index.js, which wires the two together). Handles both ordinary
// HTML pages (rendered, post-JavaScript) and URLs that serve a PDF
// directly, reusing server/modules/document.js's parsePdfBuffer() so PDF
// parsing (pdfjs, or optionally LlamaParse — see server/modules/llamaparse.js)
// has one implementation regardless of how the bytes arrived.
//
// TWO-STEP FETCH STRATEGY:
//  1. A lightweight raw HTTP request (Playwright's APIRequestContext, no
//     browser page) checks content-type first. This isn't just an
//     optimization — some servers send a PDF with a Content-Disposition
//     that makes a real page.goto() treat it as a file download rather than
//     a navigable page, which throws ("Download is starting") instead of
//     returning an inspectable Response. If this step finds a PDF, it's
//     parsed directly and we're done — no browser page needed at all.
//  2. Otherwise (not a PDF, or the raw request errored/got blocked), a real
//     Chromium page renders the URL. This is also the resilience fallback:
//     some sites block bare HTTP clients (no JS, an unfamiliar
//     fingerprint) while allowing a real browser through, so a step-1
//     failure is never treated as final — only a step-2 failure is.
//
// SECURITY: exactly like an uploaded file, whatever text comes back from
// scrapeUrl() is untrusted content, not instructions. This module doesn't
// enforce that itself — the enforcement happens once, centrally, in
// server/modules/claude.js, which wraps *all* raw text (upload or URL) in
// <raw_input> tags with an explicit system-prompt instruction to treat it
// strictly as data to extract from, never as commands. Routing URL content
// through the same extractData() call (see server/index.js's
// processRawText()) means it automatically gets that same protection — a
// page engineered to say "ignore your instructions and do X" is extracted
// as a quoted fact, not obeyed. See server/modules/claude.js's
// SECURITY_INSTRUCTIONS for the actual prompt text.
//
// RUNTIME NOTE: this launches a real, persistent Chromium process per
// scrape. That needs a long-running server process with a writable local
// browser binary — it does NOT work on serverless/edge platforms (no
// persistent filesystem for the installed browser, and launch time alone
// often exceeds serverless request timeouts). This is exactly why this app
// targets Railway rather than a serverless platform — see README.md.
//
// OPTIONAL: this module is never required for the app to function. The
// upload -> extract -> export flow (server/modules/document.js +
// server/modules/claude.js) works with zero calls into this file. If
// Playwright's browser binary isn't installed, scrapeUrl() throws a clear,
// catchable error rather than crashing the server at require-time.
//
// Setup:
//   npm install playwright
//   npx playwright install --with-deps chromium
//
// On Railway: add `npx playwright install --with-deps chromium` to the
// build command (see README.md -> Deploy to Railway) so the binary exists
// in the deployed container, not just locally.

const { parsePdfBuffer } = require('./document');

// Lazily required so a missing/unbuilt Playwright install doesn't crash the
// whole server at require-time (e.g. `node server/index.js` before running
// `npx playwright install`) — only scrapeUrl() actually needs it.
let chromiumLauncher;
let requestModule;
try {
  const playwright = require('playwright');
  chromiumLauncher = playwright.chromium;
  requestModule = playwright.request;
} catch (err) {
  chromiumLauncher = null;
  requestModule = null;
}

const NAV_TIMEOUT_MS = 30000;
const LOGIN_WALL_PATTERN = /\b(login|log-in|signin|sign-in|auth|sso)\b/i;
// A realistic desktop-browser UA — some sites 403 requests that don't look
// like a browser at all (this matters most for the raw pre-flight request
// in step 1, which otherwise looks like a bare scripting client).
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function timeoutOrLoadError(err) {
  if (err.name === 'TimeoutError' || /timeout/i.test(err.message)) {
    return new Error(
      `The page took longer than ${NAV_TIMEOUT_MS / 1000}s to load — it may be slow, unreachable, or blocking automated browsers.`
    );
  }
  if (/ERR_NAME_NOT_RESOLVED/.test(err.message)) {
    return new Error("Could not reach that URL — the domain doesn't seem to exist or isn't resolving.");
  }
  if (/ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED/.test(err.message)) {
    return new Error('Could not reach that URL — the server refused or reset the connection.');
  }
  if (/ERR_CERT|ERR_SSL/.test(err.message)) {
    return new Error("Could not reach that URL — its SSL/TLS certificate isn't valid.");
  }
  return new Error(`Could not load the page: ${err.message}`);
}

function checkStatusOrThrow(status) {
  if (status === 401 || status === 403) {
    throw new Error(
      `This page requires authentication (HTTP ${status}) — it's behind a login wall Chromium can't get past on its own.`
    );
  }
  if (status >= 400) {
    throw new Error(`The page returned an error (HTTP ${status}).`);
  }
}

function checkLoginWallRedirect(requestedUrl, finalUrl) {
  if (finalUrl !== requestedUrl && LOGIN_WALL_PATTERN.test(finalUrl)) {
    throw new Error(
      `The page redirected to what looks like a login page (${finalUrl}) — it's likely behind authentication.`
    );
  }
}

// Step 1: raw HTTP content-type probe. Returns a PDF Buffer if the URL
// serves one; returns null for anything else (including probe failures) so
// the caller falls through to a real browser rather than giving up — a
// blocked bare HTTP request doesn't mean a real browser will be blocked too.
async function probeForPdf(url) {
  const requestContext = await requestModule.newContext({ userAgent: BROWSER_USER_AGENT });
  try {
    const probe = await requestContext.get(url, { timeout: NAV_TIMEOUT_MS, failOnStatusCode: false });
    if (probe.status() >= 400) return null;

    checkLoginWallRedirect(url, probe.url());

    const contentType = probe.headers()['content-type'] || '';
    if (!contentType.includes('application/pdf')) return null;

    return await probe.body();
  } catch {
    return null; // network error, timeout, etc. — not final, step 2 gets a chance
  } finally {
    await requestContext.dispose();
  }
}

/**
 * Loads a URL — via a real Chromium page for HTML, or a direct fetch +
 * parse for a PDF — and returns extracted text, ready for extractData().
 * Every failure mode is thrown as a distinct, user-facing Error message —
 * server/index.js's /api/extract-url route surfaces err.message directly
 * rather than a stack trace.
 * @param {string} url
 * @returns {Promise<string>}
 */
async function scrapeUrl(url) {
  if (!chromiumLauncher) {
    throw new Error(
      'Playwright is not installed. Run `npm install playwright && npx playwright install --with-deps chromium` to enable URL scraping.'
    );
  }
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error("That doesn't look like a valid URL — it must start with http:// or https://.");
  }

  const pdfBuffer = await probeForPdf(url);
  if (pdfBuffer) {
    const text = await parsePdfBuffer(pdfBuffer);
    if (!text || !text.trim()) {
      throw new Error(
        'The PDF loaded but had no extractable text — it may be a scanned image with no text layer (would need OCR).'
      );
    }
    return text.trim();
  }

  // Not a PDF (or the pre-flight probe was blocked/errored) — render with a
  // real browser. Regulator sites commonly build their tables with
  // client-side JavaScript that a raw HTTP fetch would never see, and a
  // real browser succeeds against some bot-protection that blocks bare
  // HTTP clients.
  const browser = await chromiumLauncher.launch();
  try {
    const page = await browser.newPage({ userAgent: BROWSER_USER_AGENT });

    let response;
    try {
      response = await page.goto(url, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT_MS });
    } catch (err) {
      throw timeoutOrLoadError(err);
    }

    if (!response) {
      throw new Error('The page did not return a response.');
    }
    checkStatusOrThrow(response.status());
    checkLoginWallRedirect(url, page.url());

    const text = await page.evaluate(() => document.body.innerText);
    if (!text || !text.trim()) {
      throw new Error('The page loaded but had no extractable text content.');
    }
    return text.trim();
  } finally {
    await browser.close();
  }
}

module.exports = { scrapeUrl };
