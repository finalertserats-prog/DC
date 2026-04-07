const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { decrypt } = require('../utils/crypto');
const { runFullProfiling, profileGenericDB } = require('../utils/profiler');
const { generateHTML, generatePDF } = require('../utils/reportGenerator');

const makeRunId = () => `run_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

const safeDate = (d) => {
  if (!d) return null;
  try {
    const date = new Date(d);
    if (isNaN(date.getTime())) return null;
    const year = date.getFullYear();
    return year >= 2000 && year <= 2035 ? date : null;
  } catch(e) { return null; }
};

router.post('/run', async (req, res) => {
  try {
    const { connection_id } = req.body;
    const { rows } = await pool.query('SELECT * FROM sdp_connections WHERE id = $1', [connection_id]);
    if (!rows.length) return res.status(404).json({ error: 'Connection not found' });
    const conn = rows[0];
    conn.password = decrypt(conn.password);
    const results = await profileGenericDB(conn);
    const runId = makeRunId();
    const prevRun = await pool.query(
      'SELECT table_name, total_rows FROM sdp_profiling_runs WHERE connection_id = $1 ORDER BY profiled_at DESC LIMIT 500',
      [connection_id]
    );
    const prevMap = {};
    prevRun.rows.forEach(r => { if (!prevMap[r.table_name]) prevMap[r.table_name] = r.total_rows; });
    for (const r of results) {
      try {
        const change = prevMap[r.table_name] != null ? (r.total_rows || 0) - Number(prevMap[r.table_name]) : null;
        await pool.query(
          `INSERT INTO sdp_profiling_runs 
          (run_id,connection_id,db_name,table_name,category,pk_column,pk_type,total_rows,active_rows,deleted_rows,data_since,last_modified,incremental_col,load_type,status,row_count_change)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [runId, connection_id, conn.database_name || r.category, r.table_name, r.category,
           r.pk_column, r.pk_type, r.total_rows, r.active_rows, r.deleted_rows,
           safeDate(r.data_since), safeDate(r.last_modified),
           r.incremental_col, r.load_type, r.status, change]
        );
      } catch(e) {
        console.error('[Profiling] Failed to save', r.table_name, e.message);
      }
    }
    res.json({ success: true, run_id: runId, results });
  } catch (e) {
    console.error('[Profiling Error]', e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/history/:connection_id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (table_name) * FROM sdp_profiling_runs 
       WHERE connection_id = $1 ORDER BY table_name, profiled_at DESC`,
      [req.params.connection_id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/runs/:connection_id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT run_id, MAX(profiled_at) as run_at, COUNT(*) as table_count
       FROM sdp_profiling_runs WHERE connection_id = $1
       GROUP BY run_id ORDER BY run_at DESC LIMIT 20`,
      [req.params.connection_id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/report/html/:connection_id', async (req, res) => {
  try {
    const { rows: connRows } = await pool.query('SELECT * FROM sdp_connections WHERE id = $1', [req.params.connection_id]);
    if (!connRows.length) return res.status(404).json({ error: 'Connection not found' });
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (table_name) * FROM sdp_profiling_runs 
       WHERE connection_id = $1 ORDER BY table_name, profiled_at DESC`,
      [req.params.connection_id]
    );
    const html = generateHTML(rows, connRows[0].name, new Date());
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename="sdp_profiling_${connRows[0].name}_${Date.now()}.html"`);
    res.send(html);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/report/pdf/:connection_id', async (req, res) => {
  try {
    const { rows: connRows } = await pool.query('SELECT * FROM sdp_connections WHERE id = $1', [req.params.connection_id]);
    if (!connRows.length) return res.status(404).json({ error: 'Connection not found' });
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (table_name) * FROM sdp_profiling_runs 
       WHERE connection_id = $1 ORDER BY table_name, profiled_at DESC`,
      [req.params.connection_id]
    );
    const pdf = await generatePDF(rows, connRows[0].name, new Date());
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="sdp_profiling_${connRows[0].name}_${Date.now()}.pdf"`);
    res.send(pdf);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
