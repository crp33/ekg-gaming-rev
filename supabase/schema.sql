-- ---------------------------------------------------------------------------
-- EKG Gaming Revenue Extraction — Supabase / Postgres schema
-- ---------------------------------------------------------------------------
-- Run this once in the Supabase SQL editor (Project -> SQL Editor -> New
-- query -> paste -> Run), or via `psql`/`supabase db push`, to set up the
-- tables server/modules/supabase.js writes to.
--
-- CREATING LOGIN USERS
-- This app uses plain Supabase Auth email/password login (no public
-- sign-up form — see public/auth.js). Add users via Project -> Authentication
-- -> Users -> Add user in the Supabase dashboard.
--
-- ---------------------------------------------------------------------------
-- TABLEAU / DIRECT POSTGRES CONNECTION
-- ---------------------------------------------------------------------------
-- Tableau (or any BI tool) can connect directly to this same Postgres
-- database — it does not need to go through the app or the Supabase client
-- library. In Supabase: Project Settings -> Database -> Connection string.
-- Use "Session pooler" mode (port 5432) for Tableau's long-lived
-- connections; "Transaction pooler" (6543) if you hit connection limits
-- with many concurrent Tableau users.
--
-- Point Tableau's PostgreSQL connector at:
--   Server:   the host from that connection string
--   Port:     5432 (session pooler)
--   Database: postgres
--   Schema:   public
--   Tables:   datasets, extracted_rows
--             (join: extracted_rows.dataset_id = datasets.id)
--
-- Recommended: don't hand Tableau the service_role/postgres superuser
-- credentials. Create a dedicated read-only role instead:
--
--   create role tableau_reader login password '<choose a strong password>';
--   grant usage on schema public to tableau_reader;
--   grant select on public.datasets, public.extracted_rows to tableau_reader;
--
-- Note on Row Level Security below: those policies govern access through
-- Supabase's API layer (PostgREST / the JS client, using the
-- anon/authenticated keys) — not a plain Postgres login role you create
-- yourself with `create role ... login`, which sees all rows over a direct
-- SQL connection regardless of RLS unless you also `alter table ... force
-- row level security` and add a policy naming that role. Plain `grant
-- select` (above) is what actually matters for Tableau's connection.
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto; -- for gen_random_uuid()

-- One row per processed upload/scrape.
create table if not exists public.datasets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  uploaded_by uuid references auth.users (id),
  source_filename text,
  narrative_summary text,
  row_count integer not null default 0,
  flagged_count integer not null default 0
);

-- One row per extracted figure-row within a dataset. The column block below
-- is GENERATED from server/config/ekg-schema.js by scripts/generate-schema.js
-- — run `npm run generate-schema` after adding/removing/renaming a column
-- there, rather than hand-editing between the markers. Everything outside
-- the markers (this table's id/created_at/dataset_id, source_notes,
-- indexes, RLS policies, docs above) is hand-written and untouched by the
-- generator.
create table if not exists public.extracted_rows (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  dataset_id uuid not null references public.datasets (id) on delete cascade,

  -- BEGIN GENERATED COLUMNS
  state text, -- State
  reporting_period text, -- Reporting Period
  operator text, -- Operator
  vertical text, -- Vertical
  system_provider text, -- System Provider
  handle numeric, -- Handle
  gross_gaming_revenue numeric, -- Gross Gaming Revenue
  promotional_deductions numeric, -- Promotional Deductions
  taxable_revenue numeric, -- Taxable Revenue
  hold_percent numeric, -- Hold %
  tax_rate numeric, -- Tax Rate
  tax_remitted numeric, -- Tax Remitted
  source_url text, -- Source URL
  ingested_at timestamptz, -- Ingested At
  partial_period_adjustment_applied boolean, -- Partial Period Adjustment Applied
  partial_period_note text, -- Partial Period Note
  elevate_to_group_note text, -- Elevate to Group Note
  -- END GENERATED COLUMNS

  -- Per-field source_note provenance (server/config/ekg-schema.js), keyed by
  -- the same camelCase field names, e.g. {"handle": "Line: \"Total Handle: ...\""}.
  -- Kept as JSONB rather than one column per field's source note so the
  -- columns above stay clean and typed for BI tools like Tableau.
  source_notes jsonb
);

create index if not exists extracted_rows_dataset_id_idx on public.extracted_rows (dataset_id);

-- Row Level Security: any signed-in user can read/write. This is an
-- internal shared analyst tool, not a multi-tenant product — every
-- logged-in user sees every dataset. Tighten to `uploaded_by = auth.uid()`
-- on datasets (and a matching join-based check on extracted_rows) if you
-- later want per-user isolation.
alter table public.datasets enable row level security;
alter table public.extracted_rows enable row level security;

create policy "Authenticated users can read datasets" on public.datasets
  for select using (auth.role() = 'authenticated');
create policy "Authenticated users can insert datasets" on public.datasets
  for insert with check (auth.role() = 'authenticated');

create policy "Authenticated users can read extracted_rows" on public.extracted_rows
  for select using (auth.role() = 'authenticated');
create policy "Authenticated users can insert extracted_rows" on public.extracted_rows
  for insert with check (auth.role() = 'authenticated');

-- server/modules/supabase.js writes using the service_role key, which
-- bypasses RLS entirely (by design — service_role is a trusted server-side
-- credential, never sent to the browser). The policies above govern what
-- the browser's own Supabase client (public/auth.js, using the anon key)
-- could see if it ever queried these tables directly instead of going
-- through the Express API.
