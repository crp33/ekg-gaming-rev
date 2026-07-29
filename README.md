# EKG Gaming Revenue Extraction Tool

Node.js + Express backend serving a static HTML/JS front end from one
process. Built to run as a long-lived server (Railway), not serverless —
see "Why Railway, not serverless" below.

Upload a gaming revenue report (PDF, HTML, or text) — or scrape one from a
regulator URL — and Claude extracts structured figures plus a draft
narrative summary, flags rows against configurable quality rules, and lets
you download the result as Excel. Optionally, sign-in (Supabase Auth) and
dataset storage (Supabase Postgres) can be turned on by configuration.

## Folder structure

```
web-app-tool/
├── server/
│   ├── index.js             # Express app entrypoint — routes, middleware, starts the server
│   ├── middleware/
│   │   └── auth.js          # Login gate — no-op unless Supabase is configured
│   ├── modules/              # Independent feature modules
│   │   ├── document.js       # Extracts raw text from an uploaded PDF/HTML/text file
│   │   ├── claude.js         # Claude API call: structured extraction + narrative summary
│   │   ├── discrepancy.js    # Runs server/config/discrepancy-rules.js against extracted rows
│   │   ├── excel.js          # .xlsx export (source-note cell comments, flagged-row highlighting)
│   │   ├── supabase.js       # Dataset storage + session verification (optional by config)
│   │   └── playwright.js     # Chromium scraping of a regulator URL (optional)
│   ├── config/
│   │   ├── ekg-schema.js      # Single source of truth for output columns
│   │   └── discrepancy-rules.js  # Editable quality-check rules
│   └── fixtures/
│       └── sample-rows.js    # Sample data for the Excel-export demo endpoint
├── skills/                   # Editable prompt methodology, loaded fresh into Claude calls
│   ├── ekg-extraction-skill.md
│   ├── ekg-partial-period-skill.md
│   └── ekg-narrative-style-skill.md
├── supabase/
│   └── schema.sql            # Table schema + Tableau direct-connection instructions
├── public/                   # Static front end, served directly by Express — no build step
│   ├── index.html
│   ├── auth.js                # Login gate UI (Supabase Auth)
│   ├── app.js                 # Upload/process/results/export UI
│   └── style.css
├── scripts/                  # Manual/offline test scripts (no server needed)
├── Dockerfile                 # Only needed for Playwright/Chromium on Railway — see below
├── .dockerignore
├── .env                       # Local secrets (gitignored, not committed)
├── .env.example                # Documents required env vars
├── package.json
└── README.md
```

## Run locally

```bash
npm install
cp .env.example .env   # then fill in real values
npm start               # or: npm run dev (auto-restarts on file changes)
```

Visit http://localhost:3000. With only `ANTHROPIC_API_KEY` set, you get the
full upload → extract → review → Excel export flow, no login required. Add
the `SUPABASE_*` variables to turn on login and dataset storage (see
below) — everything works with or without them.

## Environment variables

Set in `.env` locally, and as service variables in Railway for production.
See `.env.example` for the full list and comments:

- `PORT` — local dev port (Railway injects its own `PORT`, already handled)
- `ANTHROPIC_API_KEY` — required for extraction; see `server/modules/claude.js`
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — optional; see next section

## Supabase: login + dataset storage (optional)

`server/modules/supabase.js` is **optional by configuration**: leave the
three `SUPABASE_*` variables blank and the tool runs exactly as if this
feature didn't exist — no login screen, no storage, nothing else affected.
Set all three and both turn on automatically, no code changes needed.

**Set it up:**

1. Create a Supabase project.
2. Run [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL
   editor (Project → SQL Editor) — creates the `datasets` and
   `extracted_rows` tables, indexes, and Row Level Security policies.
3. Add login users: Project → Authentication → Users → Add user (email +
   password). There's no public sign-up form — this is an internal tool, so
   users are provisioned by an admin, not self-served.
4. Copy three values from Project Settings → API into `.env`:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY` (labeled "anon public") — safe to expose to the
     browser, sent to the front end via `GET /api/config`
   - `SUPABASE_SERVICE_ROLE_KEY` (labeled "service_role secret") — **never**
     exposed to the browser; used only server-side to verify sessions and
     write data

Once set, every API route except `/api/health` and `/api/config` requires a
valid logged-in session (`server/middleware/auth.js`), and every successful
extraction is persisted to `datasets` + `extracted_rows`
(`server/modules/supabase.js`) — best-effort, so a Supabase hiccup never
blocks a user from getting their extracted data back.

### Connecting Tableau

Tableau can connect directly to the same Postgres database Supabase runs on
— it doesn't need to go through this app or the Supabase client library.
Full instructions, including the recommended read-only role, are in the
comment block at the top of [`supabase/schema.sql`](supabase/schema.sql).

## Playwright + Chromium: scraping a regulator URL (optional)

`server/modules/playwright.js` launches headless Chromium, loads a given
URL, and returns its rendered text — fed into the same `extractData()` call
as an uploaded file, via `POST /api/extract-url` (body: `{ "url": "..." }`).
It's never required: the upload flow doesn't call into this module at all.

This module — and the whole app — needs a persistent server process, not
serverless: Chromium is a real OS process with a large installed binary and
multi-second startup time, neither of which fit a serverless
function's ephemeral filesystem or cold-start budget. That's the main
reason this app targets Railway rather than a serverless platform.

There's no "Scrape a URL" control in the front end yet — the API route
works standalone (see curl example below) if you want to wire in a UI
control for it.

```bash
curl -X POST http://localhost:3000/api/extract-url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/some-report"}'
```

### Running Chromium in production

Locally, `npx playwright install chromium` puts the browser binary in a
user cache directory and it just works. In a deployed container that same
binary also needs a pile of OS-level shared libraries (fonts, `libnss3`,
`libgbm`, `libasound2`, ...) that aren't there by default. This repo's
[`Dockerfile`](Dockerfile) solves that by building on Microsoft's official
Playwright image, which ships Chromium with all of those already installed
— see the comments in that file for why Railway's default Nixpacks builder
is the flakier path here. Railway auto-detects the Dockerfile and uses it;
no extra config needed. If you don't need URL scraping, delete
`Dockerfile` and `.dockerignore` and Railway falls back to plain
Nixpacks (`npm install` + `npm start`), which builds faster.

## Deploy to Railway

1. Push this project to a GitHub repo (private is fine — Railway just needs
   read access once you authorize it).
2. In Railway: **New Project → Deploy from GitHub repo**. Authorize
   Railway's GitHub App if this is your first time, then pick the repo.
3. Railway detects the `Dockerfile` in the repo root automatically and
   builds from it (see "Running Chromium in production" above) — no build
   command to configure.
4. Under the service's **Variables** tab, add `ANTHROPIC_API_KEY` and,
   if using Supabase, `SUPABASE_URL` / `SUPABASE_ANON_KEY` /
   `SUPABASE_SERVICE_ROLE_KEY` (same names as `.env.example`). These live
   only in Railway's dashboard — nothing in the repo or the Dockerfile ever
   contains real secret values.
5. Railway sets `PORT` automatically; `server/index.js` already reads
   `process.env.PORT` so no change is needed.
6. Once deployed, open the service and confirm `<your-url>/api/health`
   returns `{"status":"ok"}`. Under **Settings → Networking**, generate a
   public domain if one isn't already assigned — that's the URL to share.
7. By default, Railway redeploys automatically on every push to the
   connected branch — no extra setup. Check **Settings → Deploy → Source**
   if you ever need to change which branch triggers it.
