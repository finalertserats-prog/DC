const PDFDocument = require('pdfkit');

const STATUS_COLORS = {
  Active: '#065f46',
  'Low activity': '#92400e',
  Inactive: '#991b1b',
  'No data': '#6b7280',
};

const generateHTML = (profilingData, connectionName, generatedAt) => {
  const activeCount = profilingData.filter(t => t.status === 'Active').length;
  const lowCount = profilingData.filter(t => t.status === 'Low activity').length;
  const inactiveCount = profilingData.filter(t => t.status === 'Inactive').length;
  const noDataCount = profilingData.filter(t => t.status === 'No data').length;

  const tableRows = profilingData.map(t => `
    <tr>
      <td style="font-family:monospace;font-size:12px">${t.table_name}</td>
      <td><span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">${t.category || '—'}</span></td>
      <td style="font-family:monospace;font-size:11px">${t.pk_column || '—'}</td>
      <td style="text-align:right">${t.total_rows !== null ? Number(t.total_rows).toLocaleString() : '—'}</td>
      <td style="text-align:right;color:#065f46">${t.active_rows !== null ? Number(t.active_rows).toLocaleString() : '—'}</td>
      <td style="text-align:right;color:#991b1b">${t.deleted_rows !== null ? Number(t.deleted_rows).toLocaleString() : '—'}</td>
      <td style="font-size:11px">${t.data_since ? new Date(t.data_since).toISOString().split('T')[0] : '—'}</td>
      <td style="font-size:11px">${t.last_modified ? new Date(t.last_modified).toISOString().split('T')[0] : '—'}</td>
      <td style="font-family:monospace;font-size:11px">${t.incremental_col || '—'}</td>
      <td style="font-family:monospace;font-size:11px">${t.load_type || '—'}</td>
      <td>
        <span style="background:${STATUS_COLORS[t.status] ? STATUS_COLORS[t.status] + '22' : '#f0f0f0'};
          color:${STATUS_COLORS[t.status] || '#666'};
          padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;
          border:1px solid ${STATUS_COLORS[t.status] || '#ccc'}">
          ${t.status}
        </span>
      </td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>SDP Profiling Report — ${connectionName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 13px; color: #1a1a1a; background: #fff; padding: 32px; }
  h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
  .subtitle { font-size: 12px; color: #666; margin-bottom: 28px; }
  .metrics { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 28px; }
  .metric { background: #f5f5f5; border-radius: 8px; padding: 16px; }
  .metric .val { font-size: 28px; font-weight: 700; }
  .metric .lbl { font-size: 11px; color: #666; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #f0f0f0; font-size: 11px; font-weight: 700; text-align: left; padding: 8px 10px; border: 1px solid #ddd; white-space: nowrap; }
  td { padding: 6px 10px; border: 1px solid #e0e0e0; vertical-align: middle; }
  tr:nth-child(even) td { background: #fafafa; }
  .section-title { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #666; margin-bottom: 10px; margin-top: 28px; }
  @media print { body { padding: 16px; } }
</style>
</head>
<body>
<h1>SDP Metadata Platform — Data Profiling Report</h1>
<p class="subtitle">
  Connection: <strong>${connectionName}</strong> &nbsp;·&nbsp;
  Generated: <strong>${new Date(generatedAt).toLocaleString()}</strong> &nbsp;·&nbsp;
  Total tables: <strong>${profilingData.length}</strong>
</p>

<div class="metrics">
  <div class="metric"><div class="val" style="color:#065f46">${activeCount}</div><div class="lbl">Active tables</div></div>
  <div class="metric"><div class="val" style="color:#92400e">${lowCount}</div><div class="lbl">Low activity</div></div>
  <div class="metric"><div class="val" style="color:#991b1b">${inactiveCount}</div><div class="lbl">Inactive</div></div>
  <div class="metric"><div class="val" style="color:#6b7280">${noDataCount}</div><div class="lbl">No timestamp data</div></div>
</div>

<p class="section-title">Table inventory</p>
<table>
  <thead>
    <tr>
      <th>Table</th>
      <th>Category</th>
      <th>PK</th>
      <th style="text-align:right">Total rows</th>
      <th style="text-align:right">Active</th>
      <th style="text-align:right">Deleted</th>
      <th>Data since</th>
      <th>Last modified</th>
      <th>Incremental col</th>
      <th>Load type</th>
      <th>Status</th>
    </tr>
  </thead>
  <tbody>${tableRows}</tbody>
</table>
</body>
</html>`;
};

const generatePDF = (profilingData, connectionName, generatedAt) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).font('Helvetica-Bold').text('SDP Metadata Platform', { align: 'left' });
    doc.fontSize(13).font('Helvetica').text('Data Profiling Report', { align: 'left' });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#666')
      .text(`Connection: ${connectionName}   |   Generated: ${new Date(generatedAt).toLocaleString()}   |   Tables: ${profilingData.length}`);
    doc.moveDown(1);

    const activeCount = profilingData.filter(t => t.status === 'Active').length;
    const lowCount = profilingData.filter(t => t.status === 'Low activity').length;
    const inactiveCount = profilingData.filter(t => t.status === 'Inactive').length;

    doc.fontSize(11).fillColor('#000').font('Helvetica-Bold').text('Summary');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').fillColor('#065f46').text(`Active: ${activeCount}`, { continued: true });
    doc.fillColor('#92400e').text(`   Low activity: ${lowCount}`, { continued: true });
    doc.fillColor('#991b1b').text(`   Inactive: ${inactiveCount}`);
    doc.moveDown(1);

    doc.fontSize(11).fillColor('#000').font('Helvetica-Bold').text('Table Inventory');
    doc.moveDown(0.5);

    const headers = ['Table', 'Category', 'Total rows', 'Active', 'Deleted', 'Last modified', 'Incr. col', 'Load type', 'Status'];
    const colWidths = [140, 80, 65, 55, 55, 80, 80, 65, 70];
    const startX = 40;
    let y = doc.y;

    doc.fontSize(9).font('Helvetica-Bold').fillColor('#333');
    let x = startX;
    headers.forEach((h, i) => {
      doc.text(h, x, y, { width: colWidths[i], align: 'left' });
      x += colWidths[i];
    });

    doc.moveTo(startX, y + 14).lineTo(startX + colWidths.reduce((a, b) => a + b, 0), y + 14).strokeColor('#ccc').stroke();
    y += 18;

    doc.fontSize(8).font('Helvetica').fillColor('#000');
    profilingData.forEach((t, idx) => {
      if (y > 520) { doc.addPage(); y = 40; }
      if (idx % 2 === 0) {
        doc.rect(startX, y - 2, colWidths.reduce((a, b) => a + b, 0), 16).fillColor('#fafafa').fill();
        doc.fillColor('#000');
      }
      x = startX;
      const row = [
        t.table_name,
        t.category || '—',
        t.total_rows !== null ? Number(t.total_rows).toLocaleString() : '—',
        t.active_rows !== null ? Number(t.active_rows).toLocaleString() : '—',
        t.deleted_rows !== null ? Number(t.deleted_rows).toLocaleString() : '—',
        t.last_modified ? new Date(t.last_modified).toISOString().split('T')[0] : '—',
        t.incremental_col || '—',
        t.load_type || '—',
        t.status,
      ];
      row.forEach((val, i) => {
        const color = i === 8 ? (STATUS_COLORS[val] || '#666') : '#000';
        doc.fillColor(color).text(String(val), x, y, { width: colWidths[i], align: 'left', ellipsis: true });
        x += colWidths[i];
      });
      y += 16;
    });

    doc.end();
  });
};

module.exports = { generateHTML, generatePDF };