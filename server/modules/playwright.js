// ---------------------------------------------------------------------------
// Playwright + Chromium module
// ---------------------------------------------------------------------------
// Purpose: browser automation / scraping / screenshotting.
//
// Setup when implementing:
//   npm install playwright
//   npx playwright install --with-deps chromium
//
// Note for Railway: the Playwright browser binaries need to be installed in
// the deploy environment too. Either run `npx playwright install --with-deps
// chromium` as part of the Railway build command, or use a Docker-based
// deploy with a Playwright base image.
//
// Example shape once implemented:
//
//   const { chromium } = require('playwright');
//
//   async function scrapePage(url) {
//     const browser = await chromium.launch();
//     const page = await browser.newPage();
//     await page.goto(url);
//     const title = await page.title();
//     await browser.close();
//     return { title };
//   }
//
//   module.exports = { scrapePage };

async function scrapePage(_url) {
  throw new Error('playwright module not yet implemented');
}

module.exports = { scrapePage };
