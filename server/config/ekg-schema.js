// ---------------------------------------------------------------------------
// ⚠️  PLACEHOLDER COLUMNS — REPLACE BEFORE RELYING ON THIS FILE  ⚠️
// ---------------------------------------------------------------------------
// No real column list was provided when this file was generated. The
// columns below are sensible placeholders modeled on how state gaming
// commissions (e.g. NJ DGE, PA Gaming Control Board) typically publish
// monthly sports betting / iGaming revenue reports — they are NOT
// confirmed to match your actual output requirements.
//
// Replace the `columns` array below with your real column list, then
// remove this warning.
// ---------------------------------------------------------------------------

// This is the single source of truth for the output columns of our gaming
// revenue data. Every other module (Excel export, Supabase table shape,
// Claude extraction prompts, front-end rendering) should import `columns`
// (or the derived HEADERS / FIELD_NAMES below) from here rather than
// hardcoding column names, so the schema only has to change in one place.
const columns = [
  {
    key: 'state',
    header: 'State',
    type: 'string',
    description: 'Two-letter USPS code for the reporting jurisdiction (e.g. NJ, PA).',
  },
  {
    key: 'reportingPeriod',
    header: 'Reporting Period',
    type: 'string',
    description: "Reporting month, formatted YYYY-MM, as published in the state's report.",
  },
  {
    key: 'operator',
    header: 'Operator',
    type: 'string',
    description: "Licensed operator or skin name exactly as it appears in the state's report (e.g. DraftKings, FanDuel).",
  },
  {
    key: 'vertical',
    header: 'Vertical',
    type: 'string',
    description: "Product line the row applies to: 'Sports Betting', 'iGaming', or 'Retail'.",
  },
  {
    key: 'systemProvider',
    header: 'System Provider',
    type: 'string',
    description:
      'Sports betting platform / technology vendor powering this operator (e.g. Kambi, IGT, SBTech), as stated in the report, if available.',
  },
  {
    key: 'handle',
    header: 'Handle',
    type: 'number',
    description: 'Total dollar amount wagered in the period, as reported by the state.',
  },
  {
    key: 'grossGamingRevenue',
    header: 'Gross Gaming Revenue',
    type: 'number',
    description: 'Handle minus winnings paid out to bettors (GGR), as reported by the state.',
  },
  {
    key: 'promotionalDeductions',
    header: 'Promotional Deductions',
    type: 'number',
    description: 'Free bet / bonus credit dollars the state allows operators to deduct before tax.',
  },
  {
    key: 'taxableRevenue',
    header: 'Taxable Revenue',
    type: 'number',
    description: 'Gross Gaming Revenue minus Promotional Deductions — the base the tax rate is applied to.',
  },
  {
    key: 'holdPercent',
    header: 'Hold %',
    type: 'number',
    description: 'Gross Gaming Revenue / Handle, expressed as a percentage rounded to one decimal.',
  },
  {
    key: 'taxRate',
    header: 'Tax Rate',
    type: 'number',
    description: 'Statutory tax rate (%) applied to Taxable Revenue for this jurisdiction and vertical.',
  },
  {
    key: 'taxRemitted',
    header: 'Tax Remitted',
    type: 'number',
    description: 'Taxable Revenue multiplied by Tax Rate — tax dollars owed for the period.',
  },
  {
    key: 'sourceUrl',
    header: 'Source URL',
    type: 'string',
    description: 'URL of the state gaming commission report this row was extracted from, for audit/citation.',
  },
  {
    key: 'ingestedAt',
    header: 'Ingested At',
    type: 'date',
    description: 'ISO timestamp of when this row was scraped/parsed and written to the database.',
  },
  {
    key: 'partialPeriodAdjustmentApplied',
    header: 'Partial Period Adjustment Applied',
    type: 'boolean',
    description:
      'True if this row is a partial-period or tribal property where the estimation rules in skills/ekg-partial-period-skill.md were applied.',
  },
  {
    key: 'partialPeriodNote',
    header: 'Partial Period Note',
    type: 'string',
    description:
      'Explanation of the estimate logic applied for this row (e.g. WPD × estimated days operated, unit-count exclusion, Class 3 back-into-total). Empty if the partial-period skill did not apply.',
  },
  {
    key: 'elevateToGroupNote',
    header: 'Elevate to Group Note',
    type: 'string',
    // Populated after extraction by server/modules/discrepancy.js, not by
    // Claude — see the `source: 'computed'` filter in
    // server/modules/claude.js's buildOutputSchema().
    source: 'computed',
    description:
      'Explanation of which quality rules (server/config/discrepancy-rules.js) this row failed and why it should be escalated. Empty if no rule failed.',
  },
];

// Derived, ordered helpers — kept in sync with `columns` automatically so
// nothing has to be duplicated by hand.
const FIELD_NAMES = columns.map((col) => col.key);
const HEADERS = columns.map((col) => col.header);

module.exports = { columns, FIELD_NAMES, HEADERS };
