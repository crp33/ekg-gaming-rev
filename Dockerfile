# ---------------------------------------------------------------------------
# Dockerfile — only needed because server/modules/playwright.js launches a
# real Chromium browser.
#
# Why not Railway's default Nixpacks builder? Nixpacks can run
# `npx playwright install --with-deps chromium` as a build command, but
# --with-deps shells out to apt-get for Chromium's system libraries (libnss3,
# libatk-1.0, libgbm, libasound2, ...), and Nixpacks' Nix-based build
# environment frequently doesn't have apt-get wired up the way --with-deps
# expects. The result: the build succeeds, the browser binary downloads, and
# then every scrape fails at runtime with something like
#   "error while loading shared libraries: libnss3.so: cannot open shared object file"
# Building FROM Microsoft's own Playwright image sidesteps this entirely —
# it ships Chromium (and Firefox/WebKit) with every required system library
# already installed, and it's what Playwright itself recommends for
# containerized deploys.
#
# Railway auto-detects a Dockerfile in the repo root and uses it instead of
# Nixpacks automatically — no extra Railway config needed. (Double-check
# under Service -> Settings -> Build -> Builder if it doesn't seem to pick
# it up.)
#
# If you never plan to use server/modules/playwright.js's URL-scraping
# feature, you can delete this file and .dockerignore — Railway will fall
# back to Nixpacks (plain `npm install` + `npm start`), which builds faster.
# Nothing else in the app depends on Playwright being present (see
# server/modules/playwright.js's comments) — /api/extract-url will just
# return a clear error instead of working.

# Keep this in sync with the "playwright" version in package.json — the npm
# package and the browser binaries baked into this base image must match,
# or Playwright refuses to launch with a version-mismatch error. Check
# available tags at https://mcr.microsoft.com/en-us/artifact/mar/playwright/tags
# if the exact version below isn't published yet.
ARG PLAYWRIGHT_VERSION=1.62.0
FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-jammy

WORKDIR /app

# Copy manifests first so this layer only rebuilds when dependencies change,
# not on every source edit.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server/index.js"]
