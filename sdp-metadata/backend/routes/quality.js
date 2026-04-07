const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const mysql = require('mysql2/promise');
const { decrypt } = require('../utils/crypto');

const makeRunId = () => `qrun_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

const evaluateRule = async (connection, rule) => {
  const { db_name, table_name, column_name, rule_type, rule_config } = rule;
  let actual = null;
  let passed = false;
  let message = '';

  try {
    if (rule_type === 'null_check') {
      const [rows] = await connection.query(
        `SELECT COUNT(*) as total, SUM(CASE WHEN \`${column_name}\` IS NULL THEN 1 ELSE 0 END) as nulls FROM \`${db_name}\`.\`${table_name}\``
      );
      const nullPct = rows[0].total > 0 ? (Number(rows[0].nulls) / Number(rows[0].total)) * 100 : 0;
      actual = `${nullPct.toFixed(2)}%`;
      passed = nullPct <= (rule_config.max_null_pct || 5);
      message = passed ? `Null % is ${actual} (within limit)` : `Null % is ${actual} (exceeds limit of ${rule_config.max_null_pct}%)`;
    } else if (rule_type === 'row_count') {
      const [rows] = await connection.query(`SELECT COUNT(*) as total FROM \`${db_name}\`.\`${table_name}\``);
      actual = Number(rows[0].total).toLocaleString();
      const count = Number(rows[0].total);
      passed = count >= (rule_config.min_rows || 0) && (!rule_config.max_rows || count <= rule_config.max_rows);
      message = passed ? `Row count ${actual} is within range` : `Row count ${actual} is outside expected range`;
    } else if (rule_type === 'freshness') {
      const col = rule_config.date_column || 'date_modified';
      const [rows] = await connection.query(`SELECT MAX(\`${col}\`) as last_update FROM \`${db_name}\`.\`${table_name}\``);
      const lastUpdate = rows[0].last_update;
      if (!lastUpdate) { actual = 'NULL'; passed = false; message = 'No date found'; }
      else {
        const daysDiff = (Date.now() - new Date(lastUpdate).getTime()) / (1000 * 60 * 60 * 24);
        actual = `${daysDiff.toFixed(1)} days ago`;
        passed = daysDiff <= (rule_config.max_days || 1);
        message = passed ? `Last updated ${actual}` : `Data is stale — ${actual}`;
      }
    } else if (rule_type === 'format_check') {
      const [rows] = await connection.query(
        `SELECT COUNT(*) as total, SUM(CASE WHEN \`${column_name}\` NOT REGEXP ? THEN 1 ELSE 0 END) as invalid
         FROM \`${db_name}\`.\`${table_name}\` WHERE \`${column_name}\` IS NOT NULL`,
        [rule_config.regex || '.*']
      );
      const invalidCount = Number(rows[0].invalid || 0);
      actual = `${invalidCount} invalid values`;
      passed = invalidCount === 0;
      message = passed ? 'All values match format' : `${invalidCount} values do not match expected format`;
    } else if (rule_type === 'duplicate_check') {
      const [rows] = await connection.query(
        `SELECT COUNT(*) as total, COUNT(DISTINCT \`${column_name}\`) as distinct_count FROM \`${db_name}\`.\`${table_name}\``
      );
      const dupes = Number(rows[0].total) - Number(rows[0].distinct_count);
      actual = `${dupes} duplicates`;
      passed = dupes === 0;
      message = passed ? 'No duplicates found' : `${dupes} duplicate values found`;
    }
  } catch (e) {
    actual = 'Error';
    passed = false;
    message = e.message;
  }

  return { actual, passed, message };
};

router.get('/:connection_id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM sdp_quality_rules WHERE connection_id = $1 ORDER BY created_at DESC',
      [req.params.connection_id]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/rule', async (req, res) => {
  try {
    const { connection_id, db_name, table_name, column_name, rule_type, rule_config } = req.body;
    await pool.query(
      'INSERT INTO sdp_quality_rules (connection_id,db_name,table_name,column_name,rule_type,rule_config) VALUES ($1,$2,$3,$4,$5,$6)',
      [connection_id, db_name, table_name, column_name || null, rule_type, JSON.stringify(rule_config)]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/rule/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM sdp_quality_rules WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/run/:connection_id', async (req, res) => {
  try {
    const { rows: connRows } = await pool.query('SELECT * FROM sdp_connections WHERE id = $1', [req.params.connection_id]);
    if (!connRows.length) return res.status(404).json({ error: 'Connection not found' });
    const conn = connRows[0];
    const { rows: rules } = await pool.query(
      'SELECT * FROM sdp_quality_rules WHERE connection_id = $1 AND is_active = true',
      [req.params.connection_id]
    );
    if (!rules.length) return res.json({ success: true, results: [], message: 'No active rules' });

    const connection = await mysql.createConnection({
      host: conn.host, port: conn.port,
      user: conn.username, password: decrypt(conn.password),
      connectTimeout: 30000,
    });

    const runId = makeRunId();
    const results = [];

    for (const rule of rules) {
      const { actual, passed, message } = await evaluateRule(connection, rule);
      await pool.query(
        'INSERT INTO sdp_quality_results (rule_id,run_id,status,actual_value,expected_value,message) VALUES ($1,$2,$3,$4,$5,$6)',
        [rule.id, runId, passed ? 'pass' : 'fail', actual, JSON.stringify(rule.rule_config), message]
      );
      results.push({ rule_id: rule.id, rule_type: rule.rule_type, table_name: rule.table_name, column_name: rule.column_name, status: passed ? 'pass' : 'fail', actual, message });
    }

    await connection.end();
    res.json({ success: true, run_id: runId, results });
  } catch (e) {
    console.error('[Quality Run Error]', e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/results/:connection_id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT qr.*, rl.rule_type, rl.table_name, rl.column_name, rl.db_name
       FROM sdp_quality_results qr
       JOIN sdp_quality_rules rl ON qr.rule_id = rl.id
       WHERE rl.connection_id = $1
       ORDER BY qr.checked_at DESC LIMIT 200`,
      [req.params.connection_id]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;