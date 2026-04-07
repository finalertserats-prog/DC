const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { parseDagToLineage, LAYER_LABELS, LAYER_ORDER } = require('../utils/lineageParser');
const { decrypt } = require('../utils/crypto');
const https = require('https');
const axios = require('axios');

const getAirflowDags = async (conn) => {
  const password = decrypt(conn.password);
  const baseUrl = conn.ui_url || `https://${conn.host}:${conn.port}`;
  const token = Buffer.from(`${conn.username}:${password}`).toString('base64');
  const agent = new https.Agent({ rejectUnauthorized: false });

  let allDags = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const res = await axios.get(`${baseUrl}/api/v1/dags`, {
      params: { limit, offset, only_active: true },
      headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' },
      httpsAgent: agent, timeout: 15000,
    });
    const dags = res.data.dags || [];
    allDags = allDags.concat(dags);
    if (allDags.length >= res.data.total_entries || dags.length < limit) break;
    offset += limit;
  }

  const dagsWithRuns = await Promise.all(allDags.map(async (dag) => {
    try {
      const runRes = await axios.get(`${baseUrl}/api/v1/dags/${dag.dag_id}/dagRuns`, {
        params: { limit: 1, order_by: '-start_date' },
        headers: { 'Authorization': `Basic ${token}` },
        httpsAgent: agent, timeout: 8000,
      });
      const lastRun = runRes.data.dag_runs?.[0];
      return {
        dag_id: dag.dag_id,
        is_paused: dag.is_paused,
        schedule_interval: dag.timetable_summary || dag.schedule_interval?.value || null,
        next_dagrun: dag.next_dagrun,
        last_run_state: lastRun?.state || null,
        last_run_start_date: lastRun?.start_date || null,
        run_id: lastRun?.dag_run_id || null,
      };
    } catch (e) {
      return { dag_id: dag.dag_id, is_paused: dag.is_paused, schedule_interval: null, next_dagrun: dag.next_dagrun, last_run_state: null, last_run_start_date: null, run_id: null };
    }
  }));

  return dagsWithRuns;
};

// Sync lineage from Airflow
router.post('/sync', async (req, res) => {
  try {
    const { connection_id } = req.body;
    const { rows } = await pool.query('SELECT * FROM sdp_connections WHERE id = $1', [connection_id]);
    if (!rows.length) return res.status(404).json({ error: 'Connection not found' });
    const conn = rows[0];
    if (conn.type !== 'airflow') return res.status(400).json({ error: 'Connection must be Airflow type' });

    const dags = await getAirflowDags(conn);
    const { nodes, edges } = parseDagToLineage(dags);

    for (const node of nodes) {
      await pool.query(
        `INSERT INTO sdp_lineage_nodes (node_id, connection_id, db_name, table_name, layer, application, node_type)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (node_id) DO UPDATE SET layer=$4, application=$5, node_type=$6`,
        [node.node_id, connection_id, node.layer, node.table_name, node.layer, node.application, node.transformation]
      );
    }

    for (const edge of edges) {
      await pool.query(
        `INSERT INTO sdp_lineage_edges (source_node_id, target_node_id, dag_id, transformation_type)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (source_node_id, target_node_id) DO UPDATE SET dag_id=$3, transformation_type=$4`,
        [edge.source_node_id, edge.target_node_id, edge.dag_id, edge.transformation_type]
      );
    }

    res.json({ success: true, nodes: nodes.length, edges: edges.length, total_dags: dags.length });
  } catch (e) {
    console.error('[Lineage Sync Error]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Full graph
router.get('/graph', async (req, res) => {
  try {
    const { rows: nodes } = await pool.query('SELECT * FROM sdp_lineage_nodes ORDER BY layer, application');
    const { rows: edges } = await pool.query('SELECT * FROM sdp_lineage_edges');
    res.json({ nodes, edges, layer_labels: LAYER_LABELS });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Graph filtered by application
router.get('/graph/:application', async (req, res) => {
  try {
    const app = req.params.application;
    const { rows: nodes } = await pool.query(
      'SELECT * FROM sdp_lineage_nodes WHERE application = $1 ORDER BY layer', [app]
    );
    const nodeIds = nodes.map(n => n.node_id);
    if (!nodeIds.length) return res.json({ nodes: [], edges: [], layer_labels: LAYER_LABELS });
    const { rows: edges } = await pool.query(
      'SELECT * FROM sdp_lineage_edges WHERE source_node_id = ANY($1) OR target_node_id = ANY($1)', [nodeIds]
    );
    res.json({ nodes, edges, layer_labels: LAYER_LABELS });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Column lineage data for an application
// Returns nodes with their schema columns + explicit column lineage mappings
router.get('/app-columns/:application', async (req, res) => {
  try {
    const app = req.params.application;

    const { rows: nodes } = await pool.query(
      'SELECT * FROM sdp_lineage_nodes WHERE application = $1 ORDER BY layer', [app]
    );

    const nodeIds = nodes.map(n => n.node_id);
    if (!nodeIds.length) return res.json({ nodes: [], edges: [], column_lineage: [] });

    // Get edges
    const { rows: edges } = await pool.query(
      'SELECT * FROM sdp_lineage_edges WHERE source_node_id = ANY($1) OR target_node_id = ANY($1)', [nodeIds]
    );

    // Get explicit column lineage
    const { rows: colLineage } = await pool.query(
      `SELECT cl.* FROM sdp_column_lineage cl
       WHERE cl.source_node_id = ANY($1) OR cl.target_node_id = ANY($1)`,
      [nodeIds]
    );

    // For each node, get its schema columns from snapshots
    const nodesWithCols = await Promise.all(nodes.map(async (node) => {
      try {
        // Try exact table name match first
        const { rows: snapshots } = await pool.query(
          `SELECT columns FROM sdp_schema_snapshots
           WHERE table_name = $1
           ORDER BY snapshot_at DESC LIMIT 1`,
          [node.table_name]
        );

        if (snapshots.length && snapshots[0].columns) {
          return { ...node, columns: snapshots[0].columns };
        }

        // Try partial match (table_name might be a prefix like 'biometric' matching 'biometric_data')
        const { rows: fuzzy } = await pool.query(
          `SELECT columns, table_name FROM sdp_schema_snapshots
           WHERE table_name ILIKE $1
           ORDER BY snapshot_at DESC LIMIT 1`,
          [`${node.table_name}%`]
        );

        if (fuzzy.length && fuzzy[0].columns) {
          return { ...node, columns: fuzzy[0].columns, matched_table: fuzzy[0].table_name };
        }

        return { ...node, columns: [] };
      } catch (e) {
        return { ...node, columns: [] };
      }
    }));

    res.json({ nodes: nodesWithCols, edges, column_lineage: colLineage });
  } catch (e) {
    console.error('[App Columns Error]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Save explicit column lineage mapping
router.post('/column-lineage', async (req, res) => {
  try {
    const { source_node_id, target_node_id, source_column, target_column, transformation } = req.body;
    await pool.query(
      'INSERT INTO sdp_column_lineage (source_node_id,target_node_id,source_column,target_column,transformation) VALUES ($1,$2,$3,$4,$5)',
      [source_node_id, target_node_id, source_column, target_column, transformation || '']
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// All applications
router.get('/applications', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT application, COUNT(*) as node_count
       FROM sdp_lineage_nodes
       WHERE application != 'unknown'
       GROUP BY application ORDER BY application`
    );
    res.json(rows.map(r => r.application));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Clear all lineage data
router.delete('/clear', async (req, res) => {
  try {
    await pool.query('DELETE FROM sdp_lineage_edges');
    await pool.query('DELETE FROM sdp_lineage_nodes');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;