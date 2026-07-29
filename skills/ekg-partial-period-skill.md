# EKG Partial-Period & Tribal Property Methodology

Applies whenever a property in the input opened, closed, or otherwise
changed status partway through the reporting period, or is a tribal gaming
property reporting Class II / Class III figures. Detect this from context in
`<raw_input>` — an explicit open/close date, language like "opened in
[month]" or "partial year", tribal/compact terminology, or a reporting note
calling out a mid-period change. If none of these signals are present in the
input, this skill does not apply to that row — use the standard full-period
figures as-is.

## Revenue estimation for partial-period operation

If a property operated only part of the reporting period, do **not** use any
full-period revenue figure reported for it — a full-period number is not a
valid stand-in for a property that wasn't open the whole period. Instead,
estimate revenue as:

    estimated revenue = average Win Per Day (WPD) × estimated number of days operated

- WPD comes from the property's own reported daily win figures for the days
  it was actually open, or from a stated average WPD if the source document
  gives one directly.
- "Estimated number of days operated" is derived from the open/close date(s)
  stated or implied in the source document for that reporting period — not
  the length of the full period.
- If the source document doesn't give enough information to compute WPD or
  days operated, do not fabricate the estimate. Leave the affected value(s)
  null and explain what was missing in the field's `source_note` and in
  `partialPeriodNote`.

## Unit counts

Include a unit count for a property only if the property was still open at
the end of the reporting year. If it closed before the end of the year,
exclude its unit count entirely rather than reporting a stale or partial
figure.

## Class 2 / Class 3 reconciliation

Always compute the Class 3 figure by subtraction:

    Class 3 = Total − Class 2

Never estimate or independently derive Class 3 from any other source or
formula. Class 2 and Class 3 must always sum back to the reported Total for
that property and period. If they don't reconcile, re-check Class 2 and
Total rather than adjusting Class 3 to force a match.

## Flagging

Whenever any rule in this skill is applied to a row — a partial-period
revenue estimate, a unit-count exclusion, or a Class 3 back-calculation —
set that row's `partialPeriodAdjustmentApplied` to `true` and use
`partialPeriodNote` to give a short, specific explanation of exactly what
was estimated and how, for example:

> "Opened 2026-09-01, so used WPD × days-operated: $1,240 WPD × 121 days ≈
> $150,040. Units excluded (property closed 2026-11-15, before year end).
> Class 3 = Total $412,000 − Class 2 $290,000 = $122,000."

If none of these rules applied to a row, leave `partialPeriodAdjustmentApplied`
false and `partialPeriodNote` empty.
