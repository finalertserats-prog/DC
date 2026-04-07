const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');

router.get('/stats', async (req, res) => {
  try {
    const { rows: connections } = await pool.query('SELECT COUNT(*) as count FROM sdp_connections');
    const { rows: profilingRuns } = await pool.query('SELECT COUNT(DISTINCT run_id) as count FROM sdp_profiling_runs');
    const { rows: qualityRules } = await pool.query('SELECT COUNT(*) as count FROM sdp_quality_rules WHERE is_active=true');
    const { rows: schemaDiffs } = await pool.query('SELECT COUNT(*) as count FROM sdp_schema_diffs WHERE detected_at > NOW() - INTERVAL \'7 days\'');
    const { rows: recentActivity } = await pool.query('SELECT * FROM sdp_table_metadata ORDER BY last_updated DESC LIMIT 5');
    const { rows: qualitySummary } = await pool.query(
      `SELECT status, COUNT(*) as count FROM sdp_quality_results
       WHERE checked_at > NOW() - INTERVAL '24 hours' GROUP BY status`
    );
    const { rows: recentDiffs } = await pool.query(
      'SELECT * FROM sdp_schema_diffs ORDER BY detected_at DESC LIMIT 5'
    );
    const { rows: profilingSummary } = await pool.query(
      `SELECT status, COUNT(*) as count FROM sdp_profiling_runs
       WHERE profiled_at > NOW() - INTERVAL '24 hours' GROUP BY status`
    );

    res.json({
      totals: {
        connections: Number(connections[0].count),
        profiling_runs: Number(profilingRuns[0].count),
        quality_rules: Number(qualityRules[0].count),
        schema_changes_7d: Number(schemaDiffs[0].count),
      },
      recent_activity: recentActivity,
      quality_summary: qualitySummary,
      recent_diffs: recentDiffs,
      profiling_summary: profilingSummary,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;