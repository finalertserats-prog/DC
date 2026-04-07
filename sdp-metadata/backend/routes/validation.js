const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { Client } = require('pg');
const mysql = require('mysql2/promise');
const { decrypt } = require('../utils/crypto');
const hive = require('hive-driver');
const { TCLIService, TCLIService_types } = hive.thrift;
const { detectLayer, extractApplication } = require('../utils/lineageParser');

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
  return client;
};

const getSrConnection = async (conn) => {
  const c = await mysql.createConnection({
    host: conn.host, port: Number(conn.port),
    user: conn.username || 'root', password: decrypt(conn.password) || '',
    connectTimeout: 15000,
  });
  return c;
};

const setupHiveClient = async (conn) => {
  const host = conn.host, port = Number(conn.port) || 10000;
  const authUser = (conn.username && conn.username.trim()) ? conn.username : 'hadoop';
  const authPass = conn.password || 'dummy';
  let client = new hive.HiveClient(TCLIService, TCLIService_types);
  client.on('error', () => {});
  try {
    await client.connect({ host, port }, new hive.connections.TcpConnection(),
      new hive.auth.PlainTcpAuthentication({ username: authUser, password: authPass }));
  } catch(e) {
    client = new hive.HiveClient(TCLIService, TCLIService_types);
    client.on('error', () => {});
    await client.connect({ host, port }, new hive.connections.TcpConnection(),
      new hive.auth.NoSaslAuthentication());
  }
  const session = await client.openSession({
    client_protocol: TCLIService_types.TProtocolVersion.HIVE_CLI_SERVICE_PROTOCOL_V10
  });
  const utils = new hive.HiveUtils(TCLIService_types);
  const executeQuery = async (query) => {
    const op = await session.executeStatement(query);
    await utils.waitUntilReady(op, false, () => {});
    await utils.fetchAll(op);
    const result = utils.getResult(op).getValue();
    await op.close();
    return result;
  };
  return { client, session, executeQuery };
};

const getTableStats = async (hiveConn, srConn, dbName, tableName, source) => {
  const stats = { row_count: null, null_pk_count: null, duplicate_pk_count: null, error: null };
  let hClient, hSession;
  try {
    if (source === 'hive') {
      const setup = await setupHiveClient(hiveConn);
      hClient = setup.client; hSession = setup.session;
      const r = await setup.executeQuery(`SELECT COUNT(*) as cnt FROM \`${dbName}\`.\`${tableName}\``);
      stats.row_count = Number(Object.values(r[0])[0]);

      // Get schema to find PK-like columns
      const schema = await setup.executeQuery(`DESCRIBE \`${dbName}\`.\`${tableName}\``);
      const cols = schema.map(row => Object.values(row)[0]).filter(c => c && !c.startsWith('#'));
      const pkCol = cols.find(c => ['id','uuid','record_key','pk','employee_id','employeeid','patient_id'].includes(c.toLowerCase()));

      if (pkCol && stats.row_count > 0) {
        const nullR = await setup.executeQuery(
          `SELECT COUNT(*) as cnt FROM \`${dbName}\`.\`${tableName}\` WHERE \`${pkCol}\` IS NULL`
        );
        stats.null_pk_count = Number(Object.values(nullR[0])[0]);
        stats.pk_column = pkCol;

        if (stats.row_count < 100000) {
          const dupR = await setup.executeQuery(
            `SELECT COUNT(*) as cnt FROM (
              SELECT \`${pkCol}\`, COUNT(*) as c FROM \`${dbName}\`.\`${tableName}\`
              WHERE \`${pkCol}\` IS NOT NULL
              GROUP BY \`${pkCol}\` HAVING COUNT(*) > 1
            ) t`
          );
          stats.duplicate_pk_count = Number(Object.values(dupR[0])[0]);
        }
      }
    } else if (source === 'starrocks') {
      const db = await getSrConnection(srConn);
      try {
        const [rows] = await db.query(`SELECT COUNT(*) as cnt FROM \`${dbName}\`.\`${tableName}\``);
        stats.row_count = Number(rows[0].cnt);

        const [cols] = await db.query(`DESCRIBE \`${dbName}\`.\`${tableName}\``);
        const pkCol = cols.find(c => c.Key === 'true')?.Field ||
          cols.find(c => ['id','uuid','employeeid','employee_id','patient_id'].includes((c.Field||'').toLowerCase()))?.Field;

        if (pkCol && stats.row_count > 0) {
          const [nullRows] = await db.query(`SELECT COUNT(*) as cnt FROM \`${dbName}\`.\`${tableName}\` WHERE \`${pkCol}\` IS NULL`);
          stats.null_pk_count = Number(nullRows[0].cnt);
          stats.pk_column = pkCol;

          if (stats.row_count < 100000) {
            const [dupRows] = await db.query(
              `SELECT COUNT(*) as cnt FROM (
                SELECT \`${pkCol}\`, COUNT(*) as c FROM \`${dbName}\`.\`${tableName}\`
                WHERE \`${pkCol}\` IS NOT NULL
                GROUP BY \`${pkCol}\` HAVING COUNT(*) > 1
              ) t`
            );
            stats.duplicate_pk_count = Number(dupRows[0].cnt);
          }
        }
      } finally { await db.end(); }
    }
  } catch(e) {
    stats.error = e.message;
  } finally {
    try { if (hSession) await hSession.close(); } catch(e) {}
    try { if (hClient) await hClient.close(); } catch(e) {}
  }
  return stats;
};

const mapDagToTable = (dagId) => {
  const { layer } = detectLayer(dagId);
  const app = extractApplication(dagId);
  if (layer === 'orchestrator' || layer === 'unknown' || app === 'unknown') return null;

  const dbMap = {
    source: null,
    staging: null,
    raw_hudi: `${app}`,
    curated: `${app}_curated`,
    service: `${app}_service`,
    bi: `${app}_service`,
    reporting: `${app}_service`,
  };

  return { layer, application: app, db_name: dbMap[layer], source: ['service','bi','reporting'].includes(layer) ? 'starrocks' : 'hive' };
};

// Run DAG-based validation
router.post('/run-dag', async (req, res) => {
  const { airflow_connection_id, hive_connection_id, sr_connection_id, date_filter } = req.body;
  let airflowClient;

  try {
    // Get connections
    const hiveConnRow = hive_connection_id
      ? (await pool.query('SELECT * FROM sdp_connections WHERE id=$1', [hive_connection_id])).rows[0]
      : null;
    const srConnRow = sr_connection_id
      ? (await pool.query('SELECT * FROM sdp_connections WHERE id=$1', [sr_connection_id])).rows[0]
      : null;

    if (hiveConnRow) hiveConnRow.password = decrypt(hiveConnRow.password);

    // Get DAG runs from Airflow
    airflowClient = await getAirflowClient(airflow_connection_id);
    const dateFilter = date_filter || new Date().toISOString().split('T')[0];

    const dagResult = await airflowClient.query(`
      SELECT d.dag_id, d.is_paused, d.schedule_interval,
             dr.state as last_run_state, dr.start_date, dr.end_date, dr.run_id,
             dr.run_type,
             EXTRACT(EPOCH FROM (dr.end_date - dr.start_date))/60.0 as duration_minutes
      FROM dag d
      LEFT JOIN LATERAL (
        SELECT state, start_date, end_date, run_id, run_type
        FROM dag_run
        WHERE dag_id = d.dag_id
        AND start_date >= $1::date
        AND start_date < $1::date + INTERVAL '1 day'
        ORDER BY start_date DESC NULLS LAST LIMIT 1
      ) dr ON true
      WHERE d.is_active = true AND dr.state IS NOT NULL
      ORDER BY dr.start_date DESC
    `, [dateFilter]);

    const results = [];

    for (const dag of dagResult.rows) {
      const mapping = mapDagToTable(dag.dag_id);
      if (!mapping || !mapping.db_name) continue;

      const result = {
        dag_id: dag.dag_id,
        layer: mapping.layer,
        application: mapping.application,
        db_name: mapping.db_name,
        source: mapping.source,
        dag_state: dag.last_run_state,
        start_date: dag.start_date,
        end_date: dag.end_date,
        duration_minutes: dag.duration_minutes ? Number(dag.duration_minutes).toFixed(1) : null,
        run_id: dag.run_id,
        validations: {},
        overall_status: 'PENDING',
      };

      // Only validate tables for successful DAG runs
      if (dag.last_run_state === 'success') {
        const conn = mapping.source === 'starrocks' ? srConnRow : hiveConnRow;
        if (conn) {
          try {
            // Get tables in this database
            let tables = [];
            if (mapping.source === 'hive' && hiveConnRow) {
              let hClient, hSession;
              try {
                const setup = await setupHiveClient(hiveConnRow);
                hClient = setup.client; hSession = setup.session;
                const tRows = await setup.executeQuery(`SHOW TABLES IN \`${mapping.db_name}\``);
                tables = tRows.map(r => Object.values(r)[Object.values(r).length - 1]).slice(0, 5);
              } finally {
                try { if (hSession) await hSession.close(); } catch(e) {}
                try { if (hClient) await hClient.close(); } catch(e) {}
              }
            } else if (mapping.source === 'starrocks' && srConnRow) {
              const db = await getSrConnection(srConnRow);
              try {
                const [tRows] = await db.query(`SHOW TABLES FROM \`${mapping.db_name}\``);
                tables = tRows.map(r => Object.values(r)[0]).slice(0, 5);
              } catch(e) {} finally { await db.end(); }
            }

            // Validate each table
            const tableResults = [];
            for (const tableName of tables) {
              const stats = await getTableStats(hiveConnRow, srConnRow, mapping.db_name, tableName, mapping.source);

              // Previous run count
              const prev = await pool.query(
                `SELECT today_count FROM sdp_observability
                 WHERE db_name=$1 AND table_name=$2
                 AND volume_status IS NOT NULL
                 ORDER BY measured_at DESC LIMIT 1`,
                [mapping.db_name, tableName]
              );
              const previousCount = prev.rows.length ? Number(prev.rows[0].today_count) : null;

              // Volume check
              let volumeStatus = 'PASS';
              if (stats.row_count === 0) volumeStatus = 'WARN';
              else if (previousCount !== null && previousCount > 0) {
                const ratio = stats.row_count / previousCount;
                if (ratio < 0.5) volumeStatus = 'FAIL';
                else if (ratio < 0.8) volumeStatus = 'WARN';
              }

              // PK checks
              let pkStatus = 'PASS';
              if (stats.null_pk_count > 0) pkStatus = 'FAIL';
              else if (stats.duplicate_pk_count > 0) pkStatus = 'FAIL';

              const tableStatus = volumeStatus === 'FAIL' || pkStatus === 'FAIL' ? 'FAIL'
                : volumeStatus === 'WARN' ? 'WARN' : 'PASS';

              tableResults.push({
                table_name: tableName,
                row_count: stats.row_count,
                previous_count: previousCount,
                pk_column: stats.pk_column || null,
                null_pk_count: stats.null_pk_count,
                duplicate_pk_count: stats.duplicate_pk_count,
                volume_status: volumeStatus,
                pk_status: pkStatus,
                overall_status: tableStatus,
                error: stats.error,
              });

              // Save to observability
              await pool.query(
                `INSERT INTO sdp_observability
                 (connection_id, db_name, table_name, total_count, today_count, previous_count,
                  target_date, volume_status, freshness_status, anomaly_score, measured_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())`,
                [
                  mapping.source === 'starrocks' ? sr_connection_id : hive_connection_id,
                  mapping.db_name, tableName,
                  stats.row_count, stats.row_count, previousCount,
                  dateFilter, volumeStatus, 'PASS',
                  volumeStatus === 'FAIL' ? 0.8 : volumeStatus === 'WARN' ? 0.3 : 0,
                ]
              );
            }

            result.validations.tables = tableResults;
            const hasFailure = tableResults.some(t => t.overall_status === 'FAIL');
            const hasWarning = tableResults.some(t => t.overall_status === 'WARN');
            result.overall_status = hasFailure ? 'FAIL' : hasWarning ? 'WARN' : 'PASS';
          } catch(e) {
            result.overall_status = 'ERROR';
            result.error = e.message;
          }
        }
      } else if (dag.last_run_state === 'failed') {
        result.overall_status = 'FAIL';
        result.error = 'DAG run failed';
      } else {
        result.overall_status = dag.last_run_state?.toUpperCase() || 'UNKNOWN';
      }

      results.push(result);
    }

    const summary = {
      total_dags: results.length,
      pass: results.filter(r => r.overall_status === 'PASS').length,
      warn: results.filter(r => r.overall_status === 'WARN').length,
      fail: results.filter(r => r.dag_state === 'failed').length,
      date: dateFilter,
    };

    res.json({ summary, results });
  } catch(e) {
    console.error('[Validation Error]', e.message);
    res.status(500).json({ error: e.message });
  } finally {
    try { if (airflowClient) await airflowClient.end(); } catch(e) {}
  }
});

router.get('/latest', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT DISTINCT ON (connection_id, db_name, table_name)
        connection_id, db_name, table_name, total_count, today_count, previous_count,
        volume_status, freshness_status, anomaly_score, measured_at
      FROM sdp_observability
      WHERE volume_status IS NOT NULL
      ORDER BY connection_id, db_name, table_name, measured_at DESC
    `);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/summary', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE volume_status='PASS') as healthy,
        COUNT(*) FILTER (WHERE volume_status='FAIL') as failed,
        COUNT(*) FILTER (WHERE volume_status='WARN') as warning,
        COUNT(*) FILTER (WHERE volume_status='FAIL') as volume_failures,
        COUNT(*) FILTER (WHERE freshness_status='FAIL') as freshness_failures
      FROM (
        SELECT DISTINCT ON (connection_id, db_name, table_name)
          volume_status, freshness_status
        FROM sdp_observability
        WHERE volume_status IS NOT NULL
        ORDER BY connection_id, db_name, table_name, measured_at DESC
      ) latest
    `);
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/history/:connection_id/:db_name/:table_name', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT today_count, volume_status, freshness_status, anomaly_score, measured_at
      FROM sdp_observability
      WHERE connection_id=$1 AND db_name=$2 AND table_name=$3
      AND volume_status IS NOT NULL
      ORDER BY measured_at DESC LIMIT 30
    `, [req.params.connection_id, req.params.db_name, req.params.table_name]);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
