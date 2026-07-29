<!--
⚠️  PLACEHOLDER — REPLACE WITH THE REAL EKG METHODOLOGY

This file is loaded verbatim into the system prompt on every call to
extractData() (see server/modules/claude.js → loadMethodologySkill()). It is
re-read from disk on every call, so editing this file changes extraction
behavior immediately — no code changes or restarts needed.

Send the real methodology and it will replace the placeholder sections below.
-->

# EKG Extraction Methodology

## Scope

You are extracting gaming revenue figures — handle, gross gaming revenue,
promotional deductions, taxable revenue, hold percentage, tax rate, and tax
remitted — from state gaming commission reports or similar source documents,
matching the columns defined in `server/config/ekg-schema.js`.

## What counts as a distinct row

*(placeholder — describe how to identify one row: e.g. one row per operator
per reporting period per vertical (Sports Betting / iGaming / Retail))*

## Field-by-field derivation rules

*(placeholder — for each column in ekg-schema.js, describe exactly how to
read or compute it from the source document: which section/table it usually
appears in, alternate terminology different states use for the same figure,
rounding conventions, and how Hold %, Taxable Revenue, and Tax Remitted
should be derived when the source document doesn't state them directly)*

## Edge cases

*(placeholder — e.g. combined tribal/commercial reporting, retroactive
corrections, multi-state operators reported under different skin names,
redacted or "N/A" figures, reports that mix multiple reporting periods in
one document)*
