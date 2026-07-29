// Demo/manual test for discrepancy flagging + Excel export, using the
// bundled sample data — no server, no API key needed.
//
// Run with:
//   node scripts/test-excel-export.js

const fs = require('fs');
const path = require('path');
const { flagDiscrepancies } = require('../server/modules/discrepancy');
const { buildWorkbook } = require('../server/modules/excel');
const { sampleRows, samplePreviousRows } = require('../server/fixtures/sample-rows');

(async () => {
  const rows = flagDiscrepancies(structuredClone(sampleRows), { previousRows: samplePreviousRows });

  console.log('Discrepancy results:');
  for (const row of rows) {
    const note = row.elevateToGroupNote.value;
    console.log(`  - ${row.operator.value}: ${note ? `FLAGGED — ${note}` : 'clean'}`);
  }

  const buffer = await buildWorkbook(rows);
  const outPath = path.join(__dirname, '..', 'ekg-sample-export.xlsx');
  fs.writeFileSync(outPath, buffer);
  console.log(`\nWrote ${buffer.length} bytes to ${outPath}`);
})();
