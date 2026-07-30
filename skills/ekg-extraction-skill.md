<!--
This file is loaded verbatim into the system prompt on every call to
extractData() (see server/modules/claude.js → buildSystemPrompt()). It is
re-read from disk on every call, so editing this file changes extraction
behavior immediately — no code changes or restarts needed.
-->

# EKG Extraction Methodology

## Scope

You are extracting gaming revenue figures from state gaming commission
reports or similar source documents, matching the columns defined in
`server/config/ekg-schema.js`: state, reporting period, operator, vertical,
system provider, handle, gross gaming revenue, promotional deductions,
taxable revenue, hold %, tax rate, and tax remitted.

## General principles — read this before extracting anything

1. **Search everywhere, not just tables.** Regulators frequently state a
   figure in a narrative sentence ("DraftKings reported $412.5 million in
   total wagers for the month...") instead of, or in addition to, a table
   row. Read the full document — headers, footnotes, and prose — not only
   rows that look like structured data.
2. **Match alternate terminology, not just the schema's field name.**
   Different regulators use different words for the same figure — see the
   field-by-field list below for the common variants. If a label isn't in
   that list but is clearly describing the same concept (e.g. a state using
   an unusual local term), use judgment and say what you matched in the
   `source_note`.
3. **Compute a field rather than leaving it blank whenever the document
   gives you enough to derive it.** See "Computing fields" below for the
   exact formulas and the order to try them in. A computed value is still a
   value — don't leave a field null just because it wasn't stated directly
   in an isolated number.
4. **Only leave a field `null` if it is genuinely absent** — not directly
   stated, and not computable from other figures present in the document.
   When you leave a field null, its `source_note` must say so explicitly,
   e.g. `"not present in source"` or `"not present in source; would require
   [X], which is also not stated"`.
5. **Cite the exact source text for every non-null figure.** `source_note`
   should quote or closely paraphrase the specific phrase, table cell, or
   sentence the value came from — enough that someone could find it in the
   original document without re-reading the whole thing. For a computed
   field, cite the inputs you used (see examples below), not just "computed."

## What counts as a distinct row

One row per operator (or property), per reporting period, per vertical. If
a document reports the same operator separately for Sports Betting and
iGaming, that's two rows. If a document covers multiple months in one file,
each operator/period combination is its own row.

## Field-by-field derivation rules

**state** — Two-letter USPS code. Usually implicit from the report's letterhead,
title, or issuing agency (e.g. "New Jersey Division of Gaming Enforcement" →
`NJ`) rather than stated per-row. Cite the header/title text you inferred it from.

**reportingPeriod** — Format `YYYY-MM`. Look for the report's title or date
range ("March 2026", "Period Ending 03/31/2026", "Q1 2026" — for a quarterly
report, use the first month of the quarter and note the full period in
`source_note`). If a document mixes multiple periods, make sure each row is
tagged with the period it actually applies to, not the document's overall
title.

**operator** — Alternate labels: *Licensee, Skin, Brand, Permit Holder,
Platform Operator, Certificate Holder.* Use the operator/brand name as
printed (e.g. "DraftKings", not a parent-company legal name if a
consumer-facing brand is also given, unless only the legal name is present).

**vertical** — One of `Sports Betting`, `iGaming`, or `Retail`. Alternate
labels: *Sports Wagering, Internet Sports Betting (→ Sports Betting);
Internet Gaming, Online Casino, iGaming (→ iGaming); Land-Based, In-Person,
Retail Sportsbook (→ Retail).* Infer from the report's section headers or
title if not stated per-row.

**systemProvider** — Alternate labels: *Platform Provider, Technology
Provider, Vendor, Gaming Platform, Skin Provider.* Don't confuse this with
"skin" used to mean the operator's consumer-facing brand (that's
`operator`, not this field) — only use it here if the document is naming
the underlying technology/platform vendor (e.g. Kambi, IGT, SBTech, Scientific
Games).

**handle** — Alternate labels: *Total Wagered, Amount Wagered, Total
Handle, Wagers, Total Bets, Gross Wagers, Coin-In* (coin-in is more common
in slots/retail contexts but means the same thing: total amount bet before
any payout).

**grossGamingRevenue** — Alternate labels: *Win, Gross Revenue, GGR, Net
Win, Revenue.* Some states also use "Adjusted Gross Revenue" (AGR) to mean
this figure — but AGR is ambiguous across jurisdictions and sometimes means
`taxableRevenue` instead (post-promotional-deduction). If a document uses
"AGR," check whether a separate, larger "Gross Revenue"/"Win" figure is
also given: if so, AGR is probably `taxableRevenue`, not this field. Note
your interpretation in `source_note` when the label is ambiguous.

**promotionalDeductions** — Alternate labels: *Promotional Credits, Free
Play, Bonus Credits, Promotional Wagers, Free Bets Redeemed, Promotional
Play.*

**taxableRevenue** — Alternate labels: *Taxable Win, Net Taxable Revenue,
Taxable Gaming Revenue,* and sometimes *Adjusted Gross Revenue (AGR)* — see
the note under `grossGamingRevenue` above about disambiguating AGR.

**holdPercent** — Alternate labels: *Win %, Hold Percentage, Win
Percentage, Hold Rate.*

**taxRate** — Alternate labels: *Statutory Rate, Rate of Taxation, Tax
Rate.* Usually stated once for a jurisdiction/vertical rather than
per-operator — apply it to every row it covers.

**taxRemitted** — Alternate labels: *Tax Paid, Tax Due, Tax Owed, Taxes
Remitted, State Tax.*

**sourceUrl** — This is almost never present *inside* a document's own
text (it's metadata about where the document itself was retrieved from,
not something the document states about itself). Leave it `null` with
`source_note: "not present in source"` unless the document explicitly
prints a canonical URL for itself (rare — e.g. a footer link to the
regulator's own posting of the report).

**ingestedAt** — This is a processing timestamp set by the pipeline, not a
fact found in any document. Always leave it `null` — never infer or
fabricate a date for this field from document content.

## Computing fields

Try these, in order, whenever the direct figure isn't stated but the
inputs are:

- `holdPercent` = `grossGamingRevenue / handle × 100`, rounded to one decimal.
- `grossGamingRevenue` = `handle × (holdPercent / 100)`, if handle and a
  stated hold % are present but GGR isn't given directly.
- `taxableRevenue` = `grossGamingRevenue − promotionalDeductions`.
- `taxRemitted` = `taxableRevenue × (taxRate / 100)`.
- `taxableRevenue` = `taxRemitted / (taxRate / 100)`, if tax remitted and
  tax rate are given but taxable revenue isn't stated directly (back-solve).

Only chain a computation from inputs you're reasonably confident in — don't
compute a field from another field that was itself estimated with low
confidence or is only loosely implied. When you fill a field this way, say
so plainly in `source_note`, citing the inputs, e.g.:
`"Computed: Gross Gaming Revenue ($38,750,000) / Handle ($412,500,000) × 100"`.

## Edge cases

- **Combined tribal/commercial reporting**: if a single figure covers
  multiple properties or license types, extract it as one row and note the
  combination in `source_note` rather than guessing a split.
- **Multi-period documents**: tag each row with the reporting period it
  actually covers (see `reportingPeriod` above), not the document's overall
  title if that differs per section.
- **Multi-state or multi-skin operators**: treat each state/skin
  combination as its own row if the document reports them separately.
- **Redacted or "N/A" figures**: treat as genuinely absent — leave `null`
  with a `source_note` explaining the document marked it redacted/N/A,
  rather than treating it the same as a figure that's simply not mentioned.
