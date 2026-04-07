const cron = require('node-cron');
const { pool } = require('../config/db');

async function runScheduledProfiling() {
  console.log(`[CRON] Starting scheduled profiling at ${new Date().toISOString()}`);
  try {
    const { rows: connections } = await pool.query(
      `SELECT * FROM sdp_connections WHERE type NOT IN ('airflow')`
    );
    for (const conn of connections) {
      try {
        const { runFullProfiling, profileGenericDB } = require('../utils/profiler');
        const { decrypt } = require('../utils/crypto');
        conn.password = decrypt(conn.password);
        const results = conn.type === 'suitecrm' ? await runFullProfiling(conn) : await profileGenericDB(conn);
        const runId = `cron_${Date.now()}`;
        for (const r of results) {
          await pool.query(
            `INSERT INTO sdp_profiling_runs (run_id,connection_id,db_name,table_name,category,pk_column,pk_type,total_rows,active_rows,deleted_rows,data_since,last_modified,incremental_col,load_type,status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
            [runId, conn.id, conn.database_name, r.table_name, r.category, r.pk_column, r.pk_type,
             r.total_rows, r.active_rows, r.deleted_rows, r.data_since, r.last_modified, r.incremental_col, r.load_type, r.status]
          );
        }
        console.log(`[CRON] Profiled ${results.length} tables for ${conn.name}`);
      } catch (e) {
        console.error(`[CRON] Failed for ${conn.name}:`, e.message);
      }
    }
  } catch (e) {
    console.error('[CRON] Fatal error:', e.message);
  }
}

function startCronJobs() {
  cron.schedule('0 6 * * *', runScheduledProfiling, { timezone: 'UTC' });
  console.log('✅ Cron jobs scheduled — profiling runs daily at 06:00 UTC');
}

module.exports = { startCronJobs };