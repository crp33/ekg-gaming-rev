// ---------------------------------------------------------------------------
// Sample extracted rows — for demoing the Excel export and discrepancy
// flagging features without needing a live Claude API call.
// ---------------------------------------------------------------------------
// Shaped exactly like the output of server/modules/claude.js's extractData()
// ({ <fieldKey>: { value, source_note }, ... } per row), minus
// `elevateToGroupNote` — that's populated by server/modules/discrepancy.js,
// not part of raw extraction output.
//
// Includes one clean row and one row per discrepancy rule in
// server/config/discrepancy-rules.js, so running flagDiscrepancies() over
// this fixture demonstrates every rule at once:
//   - DraftKings: clean, nothing flagged
//   - FanDuel: Hold % (3.4%) below the 5% band minimum
//   - BetMGM: reported Hold % (9%) doesn't reconcile with GGR/Handle (6%)
//   - Blue Heron Tribal Casino: system provider changed since samplePreviousRows

function field(value, sourceNote) {
  return { value, source_note: sourceNote };
}

const sampleRows = [
  {
    state: field('NJ', 'Report header: "NEW JERSEY DIVISION OF GAMING ENFORCEMENT"'),
    reportingPeriod: field('2026-03', 'Report title: "...Revenue Report — March 2026"'),
    operator: field('DraftKings', 'Line: "Operator: DraftKings (Skin: DraftKings Sportsbook)"'),
    vertical: field('Sports Betting', 'Report section header'),
    systemProvider: field('Kambi', 'Line: "Platform: Kambi"'),
    handle: field(412500000, 'Line: "Total Handle: $412,500,000"'),
    grossGamingRevenue: field(38750000, 'Line: "Gross Revenue (Win): $38,750,000"'),
    promotionalDeductions: field(4100000, 'Line: "Promotional Credits/Free Play: $4,100,000"'),
    taxableRevenue: field(34650000, 'Computed: Gross Gaming Revenue − Promotional Deductions'),
    holdPercent: field(9.4, 'Computed: Gross Gaming Revenue / Handle'),
    taxRate: field(13, 'Line: "Tax Rate: 13%"'),
    taxRemitted: field(4504500, 'Computed: Taxable Revenue × Tax Rate'),
    sourceUrl: field('https://www.example-nj-dge.gov/reports/2026-03.pdf', 'Sample fixture — not a real filing'),
    ingestedAt: field('2026-07-28T00:00:00.000Z', 'Sample fixture timestamp'),
    partialPeriodAdjustmentApplied: field(false, 'Full period; skill not triggered'),
    partialPeriodNote: field('', ''),
  },
  {
    state: field('NJ', 'Report header: "NEW JERSEY DIVISION OF GAMING ENFORCEMENT"'),
    reportingPeriod: field('2026-03', 'Report title: "...Revenue Report — March 2026"'),
    operator: field('FanDuel', 'Line: "Operator: FanDuel (Skin: FanDuel Sportsbook)"'),
    vertical: field('Sports Betting', 'Report section header'),
    systemProvider: field('IGT', 'Line: "Platform: IGT"'),
    handle: field(498200000, 'Line: "Total Handle: $498,200,000"'),
    grossGamingRevenue: field(17000000, 'Line: "Gross Revenue (Win): $17,000,000"'),
    promotionalDeductions: field(2000000, 'Line: "Promotional Credits/Free Play: $2,000,000"'),
    taxableRevenue: field(15000000, 'Computed: Gross Gaming Revenue − Promotional Deductions'),
    holdPercent: field(3.4, 'Computed: Gross Gaming Revenue / Handle'),
    taxRate: field(13, 'Line: "Tax Rate: 13%"'),
    taxRemitted: field(1950000, 'Computed: Taxable Revenue × Tax Rate'),
    sourceUrl: field('https://www.example-nj-dge.gov/reports/2026-03.pdf', 'Sample fixture — not a real filing'),
    ingestedAt: field('2026-07-28T00:00:00.000Z', 'Sample fixture timestamp'),
    partialPeriodAdjustmentApplied: field(false, 'Full period; skill not triggered'),
    partialPeriodNote: field('', ''),
  },
  {
    state: field('NJ', 'Report header: "NEW JERSEY DIVISION OF GAMING ENFORCEMENT"'),
    reportingPeriod: field('2026-03', 'Report title: "...Revenue Report — March 2026"'),
    operator: field('BetMGM', 'Line: "Operator: BetMGM (Skin: BetMGM Sportsbook)"'),
    vertical: field('Sports Betting', 'Report section header'),
    systemProvider: field('SBTech', 'Line: "Platform: SBTech"'),
    handle: field(200000000, 'Line: "Total Handle: $200,000,000"'),
    grossGamingRevenue: field(12000000, 'Line: "Gross Revenue (Win): $12,000,000"'),
    promotionalDeductions: field(1500000, 'Line: "Promotional Credits/Free Play: $1,500,000"'),
    taxableRevenue: field(10500000, 'Computed: Gross Gaming Revenue − Promotional Deductions'),
    // Reported Hold % (9%) doesn't match Gross Gaming Revenue / Handle (6%)
    // — simulates a data-entry/OCR error in the source document.
    holdPercent: field(9.0, 'Line: "Hold %: 9.0%" (as printed in the report)'),
    taxRate: field(13, 'Line: "Tax Rate: 13%"'),
    taxRemitted: field(1365000, 'Computed: Taxable Revenue × Tax Rate'),
    sourceUrl: field('https://www.example-nj-dge.gov/reports/2026-03.pdf', 'Sample fixture — not a real filing'),
    ingestedAt: field('2026-07-28T00:00:00.000Z', 'Sample fixture timestamp'),
    partialPeriodAdjustmentApplied: field(false, 'Full period; skill not triggered'),
    partialPeriodNote: field('', ''),
  },
  {
    state: field('NJ', 'Report header: "NEW JERSEY DIVISION OF GAMING ENFORCEMENT"'),
    reportingPeriod: field('2026-03', 'Report title: "...Revenue Report — March 2026"'),
    operator: field('Blue Heron Tribal Casino', 'Line: "Property: Blue Heron Tribal Casino"'),
    vertical: field('iGaming', 'Report section header'),
    systemProvider: field('NewVendorZ', 'Line: "Platform: NewVendorZ (migrated from NewVendorY mid-quarter)"'),
    handle: field(5000000, 'Line: "Total Handle: $5,000,000"'),
    grossGamingRevenue: field(450000, 'Line: "Gross Revenue (Win): $450,000"'),
    promotionalDeductions: field(50000, 'Line: "Promotional Credits/Free Play: $50,000"'),
    taxableRevenue: field(400000, 'Computed: Gross Gaming Revenue − Promotional Deductions'),
    holdPercent: field(9.0, 'Computed: Gross Gaming Revenue / Handle'),
    taxRate: field(13, 'Line: "Tax Rate: 13%"'),
    taxRemitted: field(52000, 'Computed: Taxable Revenue × Tax Rate'),
    sourceUrl: field('https://www.example-nj-dge.gov/reports/2026-03.pdf', 'Sample fixture — not a real filing'),
    ingestedAt: field('2026-07-28T00:00:00.000Z', 'Sample fixture timestamp'),
    partialPeriodAdjustmentApplied: field(
      true,
      'Property description noted a system migration mid-quarter; flagged for review per ekg-partial-period-skill.md'
    ),
    partialPeriodNote: field(
      'Applied WPD × days-operated estimate for the migration window; see skills/ekg-partial-period-skill.md.',
      'Derived from the property status note in the source document'
    ),
  },
];

// Previous period's rows for the same operators — only used by the
// 'system-provider-change' rule, which needs the same operator/state/vertical
// to compare systemProvider across periods. Only Blue Heron's entry matters
// for the demo; the others are here for realism.
const samplePreviousRows = [
  {
    operator: field('DraftKings', 'Previous-period fixture'),
    state: field('NJ', 'Previous-period fixture'),
    vertical: field('Sports Betting', 'Previous-period fixture'),
    systemProvider: field('Kambi', 'Previous-period fixture'),
  },
  {
    operator: field('FanDuel', 'Previous-period fixture'),
    state: field('NJ', 'Previous-period fixture'),
    vertical: field('Sports Betting', 'Previous-period fixture'),
    systemProvider: field('IGT', 'Previous-period fixture'),
  },
  {
    operator: field('BetMGM', 'Previous-period fixture'),
    state: field('NJ', 'Previous-period fixture'),
    vertical: field('Sports Betting', 'Previous-period fixture'),
    systemProvider: field('SBTech', 'Previous-period fixture'),
  },
  {
    operator: field('Blue Heron Tribal Casino', 'Previous-period fixture'),
    state: field('NJ', 'Previous-period fixture'),
    vertical: field('iGaming', 'Previous-period fixture'),
    systemProvider: field('OldVendorY', 'Previous-period fixture — this operator used a different provider last period'),
  },
];

module.exports = { sampleRows, samplePreviousRows };
