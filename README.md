# Web App Tool

Node.js + Express backend serving a static HTML/JS front end from one
process. Built to run as a long-lived server (Railway), not serverless.

## Folder structure

```
web-app-tool/
├── server/
│   ├── index.js           # Express app entrypoint — starts the server, serves /public, mounts routes
│   └── modules/            # Feature modules, each independent and stubbed out until implemented
│       ├── playwright.js   # Browser automation / scraping (Playwright + Chromium)
│       ├── claude.js       # Anthropic Claude API calls
│       ├── supabase.js     # Supabase (Postgres) reads/writes
│       └── excel.js        # .xlsx export
├── public/                 # Static front end, served directly by Express — no build step
│   ├── index.html
│   ├── app.js
│   └── style.css
├── .env                    # Local secrets (gitignored, not committed)
├── .env.example             # Documents required env vars
├── package.json
└── README.md
```

Each file in `server/modules/` currently throws "not yet implemented" and
has a comment block showing the intended shape (imports, function signature,
example usage) so it can be filled in independently without touching the
others or `server/index.js`. Wire a module in by requiring it in
`server/index.js` and mounting a route that calls it.

## Run locally

```bash
npm install
cp .env.example .env   # then fill in real values
npm start               # or: npm run dev (auto-restarts on file changes)
```

Visit http://localhost:3000 — it should show "Backend status: ok", backed
by the `/api/health` route.

## Environment variables

Set in `.env` locally, and as service variables in Railway for production.
See `.env.example` for the full list:

- `PORT` — local dev port (Railway injects its own `PORT`, already handled in `server/index.js`)
- `ANTHROPIC_API_KEY` — for `server/modules/claude.js`
- `SUPABASE_URL`, `SUPABASE_KEY` — for `server/modules/supabase.js`

## Deploy to Railway

1. Push this project to a GitHub repo.
2. In Railway: **New Project → Deploy from GitHub repo**, select the repo.
3. Railway auto-detects Node.js and runs `npm install` then `npm start`
   (from `package.json`). No extra build config needed for the current
   minimal app.
4. Under the service's **Variables** tab, add `ANTHROPIC_API_KEY`,
   `SUPABASE_URL`, `SUPABASE_KEY` (same names as `.env.example`). Do **not**
   commit `.env` — Railway variables are the production equivalent.
5. Railway sets `PORT` automatically; `server/index.js` already reads
   `process.env.PORT` so no change is needed.
6. Once deployed, Railway gives you a public URL — open it and confirm
   `/api/health` returns `{"status":"ok"}`.

### Note when adding Playwright

Playwright needs its Chromium binary installed in the deploy environment,
not just `npm install`ed as a package. Once `server/modules/playwright.js`
is implemented, either:

- add a Railway **build command** of
  `npm install && npx playwright install --with-deps chromium`, or
- switch to a Dockerfile-based deploy using a Playwright base image.

This isn't needed yet — the current app has no Playwright dependency
installed.
