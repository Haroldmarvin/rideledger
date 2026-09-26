const fs = require('fs');
const path = require('path');

const LOGO_PATH = path.join(__dirname, '..', '..', 'assets', 'logo-tile.png');
const PDFDocument = require('pdfkit');
const { formatCents } = require('../../utils/money');

const ACCENT = '#0F4C81';
const MUTED = '#6B7280';
const TEXT = '#111827';

function fmt(value, format, symbol) {
  if (format === 'money') return formatCents(value, symbol);
  if (value === null || value === undefined) return '';
  return String(value);
}

/** Render a report to a PDF buffer (A4 landscape, repeating table header, totals row, page numbers). */
function reportToPdf(report) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36, bufferPages: true, info: { Title: report.title, Author: report.company } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const sym = report.currencySymbol;
    const left = doc.page.margins.left;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const bottom = () => doc.page.height - doc.page.margins.bottom - 20;

    // Header
    doc.rect(left, 30, width, 4).fill(ACCENT);
    let brandX = left;
    if (fs.existsSync(LOGO_PATH)) {
      doc.save();
      doc.roundedRect(left, 40, 60, 60, 10).clip();
      doc.image(LOGO_PATH, left, 40, { width: 60, height: 60 });
      doc.restore();
      brandX = left + 70;
    }
    doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(18).text(report.company, brandX, 50);
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text('Track Every Ride. Account for Every Delivery.', brandX, 72);
    doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(14).text(report.title, left, 42, { width, align: 'right' });
    doc.font('Helvetica').fontSize(9).fillColor(TEXT)
      .text(`Period: ${report.period.from} to ${report.period.to}`, left, 62, { width, align: 'right' })
      .fillColor(MUTED)
      .text(`Generated ${new Date(report.generatedAt).toISOString().replace('T', ' ').slice(0, 16)} UTC by ${report.generatedBy}`, { width, align: 'right' });
    doc.y = 110;
    doc.fillColor(MUTED).fontSize(8.5).text(`Filters: ${report.filters.length ? report.filters.map(([k, v]) => `${k}: ${v}`).join('  •  ') : 'None'}`, left, doc.y, { width });
    doc.moveDown(0.6);

    // Summary grid
    if (report.summary.length) {
      const perRow = 5;
      const boxW = width / perRow;
      const boxH = 34;
      let y = doc.y;
      report.summary.forEach((s, i) => {
        const col = i % perRow;
        if (col === 0 && i > 0) y += boxH + 4;
        const x = left + col * boxW;
        doc.roundedRect(x + 2, y, boxW - 4, boxH, 3).fillAndStroke('#F3F6FA', '#E5E7EB');
        doc.fillColor(MUTED).font('Helvetica').fontSize(7.5).text(s.label.toUpperCase(), x + 8, y + 6, { width: boxW - 16, lineBreak: false, ellipsis: true });
        const negative = s.format === 'money' && s.value < 0;
        doc.fillColor(negative ? '#B91C1C' : TEXT).font('Helvetica-Bold').fontSize(11).text(fmt(s.value, s.format, sym), x + 8, y + 17, { width: boxW - 16, lineBreak: false });
      });
      doc.y = y + boxH + 12;
    }

    // Table
    const cols = report.columns.filter((c) => c.pdf !== false);
    const weights = cols.map((c) => c.width || (c.format === 'money' ? 12 : 10));
    const totalW = weights.reduce((a, b) => a + b, 0);
    const colW = weights.map((w) => (w / totalW) * width);
    const rowH = 16;
    const fontSize = cols.length > 11 ? 7 : 8;

    const drawHeader = () => {
      const y = doc.y;
      doc.rect(left, y, width, rowH + 2).fill(ACCENT);
      let x = left;
      cols.forEach((c, i) => {
        doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(fontSize)
          .text(c.label, x + 3, y + 5, { width: colW[i] - 6, align: c.format ? 'right' : 'left', lineBreak: false, ellipsis: true });
        x += colW[i];
      });
      doc.y = y + rowH + 2;
    };

    const drawRow = (values, { bold = false, fill = null } = {}) => {
      if (doc.y + rowH > bottom()) { doc.addPage(); doc.y = doc.page.margins.top; drawHeader(); }
      const y = doc.y;
      if (fill) doc.rect(left, y, width, rowH).fill(fill);
      let x = left;
      cols.forEach((c, i) => {
        const raw = values[c.key];
        const negative = c.format === 'money' && Number(raw) < 0;
        doc.fillColor(negative ? '#B91C1C' : TEXT).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize)
          .text(fmt(raw, c.format, sym), x + 3, y + 4, { width: colW[i] - 6, align: c.format ? 'right' : 'left', lineBreak: false, ellipsis: true });
        x += colW[i];
      });
      doc.moveTo(left, y + rowH).lineTo(left + width, y + rowH).lineWidth(0.4).strokeColor('#E5E7EB').stroke();
      doc.y = y + rowH;
    };

    drawHeader();
    if (!report.rows.length) {
      doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(9).text('No records for the selected period and filters.', left, doc.y + 8);
    } else {
      report.rows.forEach((r, i) => drawRow(r, { fill: i % 2 ? '#FAFBFC' : null }));
      if (Object.keys(report.totals).length) {
        const totals = { ...report.totals };
        totals[cols[0].key] = 'TOTAL';
        drawRow(totals, { bold: true, fill: '#E5EDF5' });
      }
    }

    for (const note of report.notes) {
      doc.moveDown(0.8);
      doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(8).text(`Note: ${note}`, left, doc.y, { width });
    }

    // Footer with page numbers
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      const y = doc.page.height - doc.page.margins.bottom - 8;
      doc.fillColor(MUTED).font('Helvetica').fontSize(7.5)
        .text(`${report.company} • ${report.title}`, left, y, { width: width / 2, lineBreak: false })
        .text(`Page ${i + 1} of ${range.count}`, left + width / 2, y, { width: width / 2, align: 'right', lineBreak: false });
    }
    doc.end();
  });
}

module.exports = { reportToPdf };
