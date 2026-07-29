// ---------------------------------------------------------------------------
// Discrepancy flagging module
// ---------------------------------------------------------------------------
// Purpose: runs the quality rules defined in server/config/discrepancy-rules.js
// against extracted rows (the { rows: [...] } shape returned by
// server/modules/claude.js's extractData()) and attaches an
// "elevateToGroupNote" field to each row summarizing any rule failures.
//
// This is a deterministic, code-based check — not an LLM call — so it's
// fast, free, and fully auditable. To add or tune a rule, edit
// server/config/discrepancy-rules.js; nothing here needs to change.

const { rules } = require('../config/discrepancy-rules');

/**
 * Runs all discrepancy rules against every row and attaches
 * `elevateToGroupNote: { value, source_note }` to each row in place.
 * @param {object[]} rows - extracted rows (each field is {value, source_note}).
 * @param {{ previousRows?: object[] }} [context] - optional context, e.g. the
 *   previous period's rows for rules that compare across periods.
 * @returns {object[]} the same rows array, mutated in place, for convenience.
 */
function flagDiscrepancies(rows, context = {}) {
  for (const row of rows) {
    const failures = [];
    for (const rule of rules) {
      let message;
      try {
        message = rule.check(row, context);
      } catch (err) {
        message = `Rule "${rule.id}" errored: ${err.message}`;
      }
      if (message) failures.push(message);
    }

    row.elevateToGroupNote = {
      value: failures.join(' '),
      source_note: failures.length ? `Flagged by ${failures.length} discrepancy rule(s).` : '',
    };
  }
  return rows;
}

module.exports = { flagDiscrepancies };
