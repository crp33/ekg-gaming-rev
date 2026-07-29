// ---------------------------------------------------------------------------
// Playwright + Chromium module
// ---------------------------------------------------------------------------
// Purpose: given a regulator URL, launches headless Chromium, loads the
// page, and returns its rendered text — ready to hand to
// server/modules/claude.js's extractData() the same way an uploaded
// document's extracted text would be (see POST /api/extract-url in
// server/index.js, which wires the two together).
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

// Lazily required so a missing/unbuilt Playwright install doesn't crash the
// whole server at require-time (e.g. `node server/index.js` before running
// `npx playwright install`) — only scrapeUrl() actually needs it.
let chromiumLauncher;
try {
  chromiumLauncher = require('playwright').chromium;
} catch (err) {
  chromiumLauncher = null;
}

const NAV_TIMEOUT_MS = 30000;

/**
 * Loads a regulator report page in headless Chromium and returns its
 * rendered text content (post-JavaScript, unlike a plain HTTP fetch).
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
    throw new Error('scrapeUrl requires a valid http(s) URL.');
  }

  const browser = await chromiumLauncher.launch();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT_MS });
    const text = await page.evaluate(() => document.body.innerText);
    return text.trim();
  } finally {
    await browser.close();
  }
}

module.exports = { scrapeUrl };
