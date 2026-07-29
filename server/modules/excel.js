// ---------------------------------------------------------------------------
// Excel export module
// ---------------------------------------------------------------------------
// Purpose: generates a downloadable .xlsx workbook from extracted rows,
// matching the columns defined in server/config/ekg-schema.js.
//
// Each value cell carries its field's source_note as an Excel cell comment
// (hover over the cell to see it). Rows flagged by the discrepancy rules
// (server/modules/discrepancy.js) — i.e. rows with a non-empty
// elevateToGroupNote — are highlighted red.

const ExcelJS = require('exceljs');
const { columns } = require('../config/ekg-schema');

const ELEVATE_KEY = 'elevateToGroupNote';

// Standard Excel "bad" red highlight, applied to every cell in a flagged row.
const FLAGGED_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
const FLAGGED_FONT_COLOR = { argb: 'FF9C0006' };

/**
 * Builds an .xlsx workbook from extracted rows.
 * @param {object[]} rows - rows in the shape returned by extractData() (each
 *   field is {value, source_note}), ideally already passed through
 *   flagDiscrepancies() so `elevateToGroupNote` is populated.
 * @returns {Promise<Buffer>} the workbook as a Buffer, ready to send/write.
 */
async function buildWorkbook(rows) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'web-app-tool';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Gaming Revenue Data');

  sheet.columns = columns.map((col) => ({
    header: col.header,
    key: col.key,
    width: Math.max(col.header.length + 2, 14),
  }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const row of rows) {
    const rowValues = {};
    for (const col of columns) {
      const field = row[col.key];
      rowValues[col.key] = field ? field.value : null;
    }
    const excelRow = sheet.addRow(rowValues);

    // Attach each field's source_note as a cell comment.
    for (const col of columns) {
      const field = row[col.key];
      if (field && field.source_note) {
        excelRow.getCell(col.key).note = field.source_note;
      }
    }

    // Highlight rows the discrepancy rules flagged for escalation.
    const elevateNote = row[ELEVATE_KEY] && row[ELEVATE_KEY].value;
    if (elevateNote) {
      excelRow.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = FLAGGED_FILL;
        cell.font = { ...(cell.font || {}), color: FLAGGED_FONT_COLOR };
      });
    }
  }

  return workbook.xlsx.writeBuffer();
}

module.exports = { buildWorkbook };
