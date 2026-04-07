const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { Client } = require('pg');
const { decrypt } = require('../utils/crypto');

const getAirflowClient = async (connection_id) => {
  const { rows } = await pool.query('SELECT * FROM sdp_connections WHERE id = $1', [connection_id]);
  if (!rows.length) throw new Error('Connection not found');
  const conn = rows[0];
  const client = new Client({
    host: conn.host, port: conn.port || 5432,
    user: conn.username, password: decrypt(conn.password),
    database: conn.database_name || 'airflow',
    ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000,
  });
  await client.connect();
  return { client, uiUrl: conn.ui_url || `http://${conn.host}:8080` };
};

router.post('/fetch', async (req, res) => {
  let client;
  try {
    const { connection_id, date_filter } = req.body;
    const { client: c, uiUrl } = await getAirflowClient(connection_id);
    client = c;

    const dateStart = date_filter || new Date().toISOString().split('T')[0];

    const statsResult = await client.query(`
      SELECT state, COUNT(*) as count FROM dag_run
      WHERE start_date >= $1::date AND start_date < $1::date + INTERVAL '1 day'
      GROUP BY state
    `, [dateStart]);

    const totalResult = await client.query(`SELECT COUNT(*) as total FROM dag_run`);
    const todayResult = await client.query(`
      SELECT COUNT(*) as today FROM dag_run
      WHERE start_date >= $1::date AND start_date < $1::date + INTERVAL '1 day'
    `, [dateStart]);

    const taskResult = await client.query(`
      SELECT COUNT(*) as total FROM task_instance
      WHERE start_date >= $1::date AND start_date < $1::date + INTERVAL '1 day'
    `, [dateStart]);

    const runtimeResult = await client.query(`
      SELECT 
        COALESCE(SUM(EXTRACT(EPOCH FROM (end_date - start_date))), 0) / 3600.0 as total_hours,
        COALESCE(AVG(EXTRACT(EPOCH FROM (end_date - start_date))), 0) / 60.0 as avg_minutes
      FROM dag_run
      WHERE end_date IS NOT NULL
      AND start_date >= $1::date AND start_date < $1::date + INTERVAL '1 day'
    `, [dateStart]);

    const dagsResult = await client.query(`
      SELECT 
        d.dag_id, d.is_paused, d.schedule_interval, d.next_dagrun,
        latest.state as last_run_state,
        latest.start_date as last_run_start_date,
        latest.run_id
      FROM dag d
      LEFT JOIN LATERAL (
        SELECT state, start_date, run_id
        FROM dag_run
        WHERE dag_run.dag_id = d.dag_id
        AND dag_run.start_date >= $1::date
        AND dag_run.start_date < $1::date + INTERVAL '1 day'
        ORDER BY dag_run.start_date DESC NULLS LAST
        LIMIT 1
      ) latest ON true
      WHERE d.is_active = true
      ORDER BY d.dag_id
    `, [dateStart]);

    const stats = {
      success: 0, failed: 0, running: 0, queued: 0, total: 0,
      total_runs: Number(totalResult.rows[0].total || 0),
      total_tasks: Number(taskResult.rows[0].total || 0),
      total_hours: Number(runtimeResult.rows[0].total_hours || 0).toFixed(2),
      avg_minutes: Number(runtimeResult.rows[0].avg_minutes || 0).toFixed(2),
      today_runs: Number(todayResult.rows[0].today || 0),
    };

    statsResult.rows.forEach(r => {
      const key = r.state?.toLowerCase();
      if (stats[key] !== undefined) stats[key] = Number(r.count);
      stats.total += Number(r.count);
    });

    res.json({ stats, dags: dagsResult.rows, airflow_ui_url: uiUrl });
  } catch (e) {
    console.error('[Audit Fetch Error]', e.message);
    res.status(500).json({ error: e.message });
  } finally {
    try { if (client) await client.end(); } catch(e) {}
  }
});

router.post('/tasks', async (req, res) => {
  let client;
  try {
    const { connection_id, dag_id, run_id } = req.body;
    const { client: c } = await getAirflowClient(connection_id);
    client = c;
    const result = await client.query(`
      SELECT task_id, state, start_date, end_date, operator, try_number
      FROM task_instance
      WHERE dag_id = $1 AND run_id = $2
      ORDER BY start_date ASC NULLS LAST
    `, [dag_id, run_id]);
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    try { if (client) await client.end(); } catch(e) {}
  }
});

module.exports = router;
