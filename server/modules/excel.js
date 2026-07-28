// ---------------------------------------------------------------------------
// Excel export module
// ---------------------------------------------------------------------------
// Purpose: generates .xlsx files from in-memory data for download.
//
// Setup when implementing:
//   npm install exceljs
//
// Example shape once implemented:
//
//   const ExcelJS = require('exceljs');
//
//   async function buildWorkbook(rows) {
//     const workbook = new ExcelJS.Workbook();
//     const sheet = workbook.addWorksheet('Data');
//     if (rows.length) sheet.columns = Object.keys(rows[0]).map((key) => ({ header: key, key }));
//     sheet.addRows(rows);
//     return workbook.xlsx.writeBuffer();
//   }
//
//   module.exports = { buildWorkbook };
//
// To serve it from a route:
//   const buffer = await buildWorkbook(rows);
//   res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
//   res.setHeader('Content-Disposition', 'attachment; filename="export.xlsx"');
//   res.send(buffer);

async function buildWorkbook(_rows) {
  throw new Error('excel module not yet implemented');
}

module.exports = { buildWorkbook };
