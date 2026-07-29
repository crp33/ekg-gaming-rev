// ---------------------------------------------------------------------------
// Discrepancy rules — single source of truth for post-extraction quality
// checks.
// ---------------------------------------------------------------------------
// Edit thresholds or add/remove rules here. server/modules/discrepancy.js is
// a generic engine that just runs whatever rules are exported below — it has
// no rule-specific logic of its own, so nothing there needs to change when
// you tune a threshold or add a rule.
//
// Each rule is { id, description, check(row, context) }:
//   - `row` is one extracted row: { <fieldKey>: { value, source_note }, ... }
//     (the shape returned by server/modules/claude.js's extractData()).
//   - `context.previousRows` (optional) is the previous period's extracted
//     rows, for rules that compare across periods (e.g. system provider
//     changes). Empty/absent if no prior period was supplied.
//   - `check` returns a short human-readable failure message (string) if the
//     rule fails for this row, or null/undefined if it passes or doesn't
//     apply (e.g. the field it needs wasn't extracted).

// Read a field's numeric value; missing/null/non-numeric becomes NaN so
// rules can bail out with a plain Number.isNaN() check instead of crashing
// on partially-extracted rows.
function num(row, key) {
  const v = row[key] && row[key].value;
  return typeof v === 'number' ? v : NaN;
}

function str(row, key) {
  const v = row[key] && row[key].value;
  return typeof v === 'string' ? v : '';
}

// --- Editable thresholds ---------------------------------------------------
const HOLD_PERCENT_MIN = 5;
const HOLD_PERCENT_MAX = 12;
const RECONCILIATION_TOLERANCE_POINTS = 1; // percentage points

const rules = [
  {
    id: 'hold-percent-band',
    description: `Hold % outside the expected ${HOLD_PERCENT_MIN}–${HOLD_PERCENT_MAX}% band`,
    check(row) {
      const hold = num(row, 'holdPercent');
      if (Number.isNaN(hold)) return null;
      if (hold < HOLD_PERCENT_MIN || hold > HOLD_PERCENT_MAX) {
        return `Hold % is ${hold}%, outside the expected ${HOLD_PERCENT_MIN}–${HOLD_PERCENT_MAX}% band.`;
      }
      return null;
    },
  },
  {
    id: 'handle-revenue-reconciliation',
    description: 'Reported Hold % does not reconcile with Gross Gaming Revenue / Handle',
    check(row) {
      const handle = num(row, 'handle');
      const ggr = num(row, 'grossGamingRevenue');
      const reportedHold = num(row, 'holdPercent');
      if (Number.isNaN(handle) || Number.isNaN(ggr) || Number.isNaN(reportedHold) || handle === 0) {
        return null;
      }
      const computedHold = (ggr / handle) * 100;
      const diff = Math.abs(computedHold - reportedHold);
      if (diff > RECONCILIATION_TOLERANCE_POINTS) {
        return `Reported Hold % (${reportedHold}%) doesn't reconcile with Gross Gaming Revenue / Handle (computed ${computedHold.toFixed(1)}%) — off by ${diff.toFixed(1)} points.`;
      }
      return null;
    },
  },
  {
    id: 'system-provider-change',
    description: 'System provider changed from the previous period for this operator',
    check(row, context) {
      const previousRows = (context && context.previousRows) || [];
      if (previousRows.length === 0) return null; // no prior period supplied

      const provider = str(row, 'systemProvider');
      if (!provider) return null;

      const operator = str(row, 'operator');
      const state = str(row, 'state');
      const vertical = str(row, 'vertical');
      const previous = previousRows.find(
        (r) => str(r, 'operator') === operator && str(r, 'state') === state && str(r, 'vertical') === vertical
      );
      if (!previous) return null;

      const previousProvider = str(previous, 'systemProvider');
      if (previousProvider && previousProvider !== provider) {
        return `System provider changed from "${previousProvider}" to "${provider}" since the previous period.`;
      }
      return null;
    },
  },
];

module.exports = { rules };
