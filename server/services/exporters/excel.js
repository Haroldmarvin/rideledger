const ExcelJS = require('exceljs');
const { centsToDecimal } = require('../../utils/money');

const ACCENT = 'FF0F4C81';

/** Build an .xlsx buffer from a report object (money is converted from cents at the very last step). */
async function reportToExcel(report) {
  const wb = new ExcelJS.Workbook();
  wb.creator = report.company;
  wb.created = new Date(report.generatedAt);
  const ws = wb.addWorksheet(report.title.slice(0, 31), {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
    views: [{ state: 'frozen', ySplit: 0 }],
  });
  const moneyFmt = `"${report.currencySymbol}"#,##0.00;[Red]-"${report.currencySymbol}"#,##0.00`;
  const cols = report.columns;
  const lastCol = Math.max(cols.length, 4);

  const addBanner = (text, opts = {}) => {
    const row = ws.addRow([text]);
    ws.mergeCells(row.number, 1, row.number, lastCol);
    row.getCell(1).font = { bold: !!opts.bold, size: opts.size || 11, color: { argb: opts.color || 'FF1F2937' } };
    return row;
  };

  addBanner(report.company, { bold: true, size: 16, color: ACCENT });
  addBanner(report.title, { bold: true, size: 13 });
  addBanner(`Period: ${report.period.from} to ${report.period.to}`);
  addBanner(`Generated: ${new Date(report.generatedAt).toLocaleString('en-GB', { timeZone: 'UTC' })} UTC by ${report.generatedBy}`, { color: 'FF6B7280' });
  addBanner(`Filters: ${report.filters.length ? report.filters.map(([k, v]) => `${k}: ${v}`).join(' | ') : 'None'}`, { color: 'FF6B7280' });
  ws.addRow([]);

  if (report.summary.length) {
    const h = ws.addRow(['Summary']);
    h.getCell(1).font = { bold: true, size: 12, color: { argb: ACCENT } };
    for (const s of report.summary) {
      const r = ws.addRow([s.label, s.format === 'money' ? centsToDecimal(s.value) : s.value]);
      r.getCell(1).font = { color: { argb: 'FF374151' } };
      r.getCell(2).font = { bold: true };
      if (s.format === 'money') r.getCell(2).numFmt = moneyFmt;
      r.getCell(2).alignment = { horizontal: 'right' };
    }
    ws.addRow([]);
  }

  const header = ws.addRow(cols.map((c) => c.label));
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF9CA3AF' } } };
  });
  header.height = 22;
  ws.autoFilter = { from: { row: header.number, column: 1 }, to: { row: header.number, column: cols.length } };
  ws.views = [{ state: 'frozen', ySplit: header.number }];

  for (const row of report.rows) {
    const r = ws.addRow(cols.map((c) => (c.format === 'money' ? centsToDecimal(row[c.key]) : row[c.key] ?? '')));
    cols.forEach((c, i) => {
      const cell = r.getCell(i + 1);
      if (c.format === 'money') { cell.numFmt = moneyFmt; cell.alignment = { horizontal: 'right' }; }
      if (c.format === 'int') cell.alignment = { horizontal: 'right' };
    });
  }
  if (!report.rows.length) addBanner('No records for the selected period and filters.', { color: 'FF6B7280' });

  if (Object.keys(report.totals).length && report.rows.length) {
    const t = ws.addRow(cols.map((c, i) => {
      if (i === 0) return 'TOTAL';
      if (report.totals[c.key] === undefined) return '';
      return c.format === 'money' ? centsToDecimal(report.totals[c.key]) : report.totals[c.key];
    }));
    t.eachCell((cell, n) => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5EDF5' } };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'double' } };
      const c = cols[n - 1];
      if (c && c.format === 'money') { cell.numFmt = moneyFmt; cell.alignment = { horizontal: 'right' }; }
    });
  }

  for (const note of report.notes) { ws.addRow([]); addBanner(`Note: ${note}`, { color: 'FF6B7280' }); }

  cols.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = c.width || (c.format === 'money' ? 13 : 12);
  });
  ws.getColumn(1).width = Math.max(ws.getColumn(1).width, 24);

  return wb.xlsx.writeBuffer();
}

module.exports = { reportToExcel };
