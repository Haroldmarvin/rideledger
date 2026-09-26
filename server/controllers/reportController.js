const { buildReport, REPORT_TYPES } = require('../services/reportService');
const { reportToExcel } = require('../services/exporters/excel');
const { reportToPdf } = require('../services/exporters/pdf');
const { audit } = require('../services/audit');
const { asyncHandler, qs } = require('../utils/helpers');

const listTypes = asyncHandler(async (req, res) => {
  res.json({ types: Object.entries(REPORT_TYPES).map(([key, title]) => ({ key, title })) });
});

const viewReport = asyncHandler(async (req, res) => {
  const report = await buildReport(qs(req.query.type) || 'daily', req.query, req.user);
  res.json({ report });
});

function fileName(report, ext) {
  return `AfriKapitalKitchen_${report.type}_${report.period.from}_to_${report.period.to}.${ext}`;
}

const exportExcel = asyncHandler(async (req, res) => {
  const report = await buildReport(qs(req.query.type) || 'daily', req.query, req.user);
  const buffer = await reportToExcel(report);
  await audit(req, { action: 'Admin exported report to Excel', entityType: 'Report', entityRef: report.type, newData: { period: report.period, filters: report.filters, rows: report.rows.length } });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName(report, 'xlsx')}"`);
  res.send(Buffer.from(buffer));
});

const exportPdf = asyncHandler(async (req, res) => {
  const report = await buildReport(qs(req.query.type) || 'daily', req.query, req.user);
  const buffer = await reportToPdf(report);
  await audit(req, { action: 'Admin exported report to PDF', entityType: 'Report', entityRef: report.type, newData: { period: report.period, filters: report.filters, rows: report.rows.length } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName(report, 'pdf')}"`);
  res.send(buffer);
});

module.exports = { listTypes, viewReport, exportExcel, exportPdf };
