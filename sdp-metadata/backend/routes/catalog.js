const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const mysql = require('mysql2/promise');
const { decrypt } = require('../utils/crypto');
const hive = require('hive-driver');
const { TCLIService, TCLIService_types } = hive.thrift;

const LAYER_ORDER = ['raw_hudi','curated','service','bi'];

const getLayer = (dbName) => {
  if (/_service(_live|_odoo|_revenue|_odd)?$/.test(dbName)) return 'service';
  if (/_curated(_live)?$/.test(dbName)) return 'curated';
  if (/_raw$/.test(dbName)) return 'raw_hudi';
  return 'raw_hudi';
};

const getApp = (dbName) => dbName
  .replace(/_service(_live|_odoo|_revenue|_odd)?$/, '')
  .replace(/_curated(_live)?$/, '')
  .replace(/_raw$/, '')
  .replace(/_live$/, '')
  .trim();

const isBiTable = (tableName) => /^sr_/i.test(tableName);

const shouldSkipDb = (dbName) => {
  if (['information_schema','sys','_statistics_','starrocks','default','mysql'].includes(dbName)) return true;
  if (/^(data_observability|metadata|marts|loinc|omop_cdm|adhoc|test_|mlops|openproject|odoo|task_management|p4m|hcp_camp_services|gayatric|sdp_metadata|fhiruat|fhir_s3)/.test(dbName)) return true;
  if (/archive/.test(dbName)) return true;
  return false;
};

const getSrConnection = async (host, port, user, password) => {
  const c = await mysql.createConnection({
    host, port: Number(port), user: user || 'root', password: password || '',
    connectTimeout: 15000,
  });
  try { await c.query('SET new_planner_optimize_timeout = 300000;'); } catch(e){}
  try { await c.query('SET query_timeout = 300;'); } catch(e){}
  return c;
};

const setupHiveClient = async (conn) => {
  const host = conn.host;
  const port = Number(conn.port) || 10000;
  const authUser = (conn.username && conn.username.trim()) ? conn.username : 'hadoop';
  const authPass = conn.password || 'dummy';
  let client = new hive.HiveClient(TCLIService, TCLIService_types);
  client.on('error', () => {});
  try {
    await client.connect({ host, port }, new hive.connections.TcpConnection(),
      new hive.auth.PlainTcpAuthentication({ username: authUser, password: authPass }));
  } catch (e) {
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

router.post('/starrocks/databases', async (req, res) => {
  try {
    const { connection_id } = req.body;
    const { rows } = await pool.query('SELECT * FROM sdp_connections WHERE id = $1', [connection_id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const conn = rows[0];
    const db = await getSrConnection(conn.host, conn.port, conn.username, decrypt(conn.password));
    const [databases] = await db.query('SHOW DATABASES');
    await db.end();
    res.json(databases.map(r => Object.values(r)[0]).filter(d => !shouldSkipDb(d)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/starrocks/tables', async (req, res) => {
  try {
    const { connection_id, db_name } = req.body;
    const { rows } = await pool.query('SELECT * FROM sdp_connections WHERE id = $1', [connection_id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const conn = rows[0];
    const db = await getSrConnection(conn.host, conn.port, conn.username, decrypt(conn.password));
    const [tables] = await db.query(`SHOW TABLES FROM \`${db_name}\``);
    await db.end();
    res.json(tables.map(r => Object.values(r)[0]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/starrocks/columns', async (req, res) => {
  try {
    const { connection_id, db_name, table_name } = req.body;
    const { rows } = await pool.query('SELECT * FROM sdp_connections WHERE id = $1', [connection_id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const conn = rows[0];
    const db = await getSrConnection(conn.host, conn.port, conn.username, decrypt(conn.password));
    const [cols] = await db.query(`DESCRIBE \`${db_name}\`.\`${table_name}\``);
    await db.end();
    res.json(cols);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/hive/databases', async (req, res) => {
  let client, session;
  try {
    const { connection_id } = req.body;
    const { rows } = await pool.query('SELECT * FROM sdp_connections WHERE id = $1', [connection_id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const conn = rows[0];
    conn.password = decrypt(conn.password);
    const setup = await setupHiveClient(conn);
    client = setup.client; session = setup.session;
    const r = await setup.executeQuery('SHOW DATABASES');
    res.json(r.map(row => Object.values(row)[0]).filter(d => !shouldSkipDb(d)));
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally {
    try { if (session) await session.close(); } catch(e) {}
    try { if (client) await client.close(); } catch(e) {}
  }
});

router.post('/hive/tables', async (req, res) => {
  let client, session;
  try {
    const { connection_id, db_name } = req.body;
    const { rows } = await pool.query('SELECT * FROM sdp_connections WHERE id = $1', [connection_id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const conn = rows[0];
    conn.password = decrypt(conn.password);
    const setup = await setupHiveClient(conn);
    client = setup.client; session = setup.session;
    await setup.executeQuery(`USE \`${db_name}\``);
    const r = await setup.executeQuery('SHOW TABLES');
    res.json(r.map(row => Object.values(row)[Object.values(row).length - 1]));
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally {
    try { if (session) await session.close(); } catch(e) {}
    try { if (client) await client.close(); } catch(e) {}
  }
});

router.post('/hive/columns', async (req, res) => {
  let client, session;
  try {
    const { connection_id, db_name, table_name } = req.body;
    const { rows } = await pool.query('SELECT * FROM sdp_connections WHERE id = $1', [connection_id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const conn = rows[0];
    conn.password = decrypt(conn.password);
    const setup = await setupHiveClient(conn);
    client = setup.client; session = setup.session;
    await setup.executeQuery(`USE \`${db_name}\``);
    const r = await setup.executeQuery(`DESCRIBE \`${table_name}\``);
    res.json(r.map(row => {
      const vals = Object.values(row);
      return { name: vals[0], type: vals[1], comment: vals[2] || '' };
    }).filter(c => c.name && !c.name.startsWith('#')));
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally {
    try { if (session) await session.close(); } catch(e) {}
    try { if (client) await client.close(); } catch(e) {}
  }
});

router.post('/real-lineage', async (req, res) => {
  let client, session;
  try {
    const { hive_connection_id, sr_connection_id } = req.body;
    const nodes = [];

    if (hive_connection_id) {
      const { rows } = await pool.query('SELECT * FROM sdp_connections WHERE id = $1', [hive_connection_id]);
      if (rows.length) {
        const conn = rows[0];
        conn.password = decrypt(conn.password);
        const setup = await setupHiveClient(conn);
        client = setup.client; session = setup.session;
        const dbRows = await setup.executeQuery('SHOW DATABASES');
        const dbs = dbRows.map(r => Object.values(r)[0]).filter(d => !shouldSkipDb(d));
        for (const dbName of dbs) {
          try {
            await setup.executeQuery(`USE \`${dbName}\``);
            const tableRows = await setup.executeQuery('SHOW TABLES');
            const tables = tableRows.map(r => Object.values(r)[Object.values(r).length - 1]);
            const layer = getLayer(dbName);
            const app = getApp(dbName);
            for (const tableName of tables) {
              nodes.push({ node_id: `hive__${dbName}__${tableName}`, source: 'hive', db_name: dbName, table_name: tableName, layer, application: app });
            }
          } catch (e) {}
        }
        try { if (session) await session.close(); } catch(e) {}
        try { if (client) await client.close(); } catch(e) {}
        client = null; session = null;
      }
    }

    if (sr_connection_id) {
      const { rows } = await pool.query('SELECT * FROM sdp_connections WHERE id = $1', [sr_connection_id]);
      if (rows.length) {
        const conn = rows[0];
        const db = await getSrConnection(conn.host, conn.port, conn.username, decrypt(conn.password));
        const [databases] = await db.query('SHOW DATABASES');
        const dbs = databases.map(r => Object.values(r)[0]).filter(d => !shouldSkipDb(d));
        for (const dbName of dbs) {
          try {
            const [tables] = await db.query(`SHOW TABLES FROM \`${dbName}\``);
            const srLayer = getLayer(dbName);
            const app = getApp(dbName);
            for (const t of tables) {
              const tableName = Object.values(t)[0];
              const finalLayer = isBiTable(tableName) ? 'bi' : srLayer;
              nodes.push({ node_id: `sr__${dbName}__${tableName}`, source: 'starrocks', db_name: dbName, table_name: tableName, layer: finalLayer, application: app });
            }
          } catch (e) {}
        }
        await db.end();
      }
    }

    const byApp = {};
    nodes.forEach(n => {
      if (!byApp[n.application]) byApp[n.application] = [];
      byApp[n.application].push(n);
    });

    const edges = [];
    const edgeSet = new Set();
    const normalize = (name) => name.replace(/^hv_|^sr_|^hvc_/i, '').replace(/_curated$|_service$|_raw$/,'').toLowerCase();

    Object.values(byApp).forEach(appNodes => {
      const byLayer = {};
      LAYER_ORDER.forEach(l => { byLayer[l] = []; });
      appNodes.forEach(n => {
        if (!byLayer[n.layer]) byLayer[n.layer] = [];
        byLayer[n.layer].push(n);
      });
      const presentLayers = LAYER_ORDER.filter(l => byLayer[l]?.length > 0);

      for (let i = 0; i < presentLayers.length - 1; i++) {
        const srcNodes = byLayer[presentLayers[i]];
        const tgtNodes = byLayer[presentLayers[i + 1]];

        // If source layer has 1-2 nodes, connect to ALL target nodes
        if (srcNodes.length <= 2) {
          for (const src of srcNodes) {
            for (const tgt of tgtNodes) {
              const key = `${src.node_id}||${tgt.node_id}`;
              if (!edgeSet.has(key)) {
                edgeSet.add(key);
                edges.push({ source_node_id: src.node_id, target_node_id: tgt.node_id, transformation_type: 'pipeline' });
              }
            }
          }
        } else {
          // Multiple source nodes — try name matching
          for (const src of srcNodes) {
            const srcNorm = normalize(src.table_name);
            let matched = false;
            for (const tgt of tgtNodes) {
              const tgtNorm = normalize(tgt.table_name);
              if (srcNorm === tgtNorm || tgtNorm.includes(srcNorm) || srcNorm.includes(tgtNorm)) {
                const key = `${src.node_id}||${tgt.node_id}`;
                if (!edgeSet.has(key)) {
                  edgeSet.add(key);
                  edges.push({ source_node_id: src.node_id, target_node_id: tgt.node_id, transformation_type: 'pipeline' });
                  matched = true;
                }
              }
            }
            // No match found — connect to all targets as fallback
            if (!matched) {
              for (const tgt of tgtNodes) {
                const key = `${src.node_id}||${tgt.node_id}`;
                if (!edgeSet.has(key)) {
                  edgeSet.add(key);
                  edges.push({ source_node_id: src.node_id, target_node_id: tgt.node_id, transformation_type: 'pipeline' });
                }
              }
            }
          }
        }
      }
    });

    res.json({ nodes, edges, total_nodes: nodes.length, total_edges: edges.length });
  } catch (e) {
    console.error('[Real Lineage Error]', e.message);
    res.status(500).json({ error: e.message });
  } finally {
    try { if (session) await session.close(); } catch(e) {}
    try { if (client) await client.close(); } catch(e) {}
  }
});

router.post('/node/columns', async (req, res) => {
  let client, session;
  try {
    const { connection_id, db_name, table_name, source } = req.body;
    const { rows } = await pool.query('SELECT * FROM sdp_connections WHERE id = $1', [connection_id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const conn = rows[0];

    if (source === 'starrocks') {
      const db = await getSrConnection(conn.host, conn.port, conn.username, decrypt(conn.password));
      const [cols] = await db.query(`DESCRIBE \`${db_name}\`.\`${table_name}\``);
      await db.end();
      res.json(cols.map(c => ({ name: c.Field, type: c.Type, key: c.Key === 'true' })));
    } else {
      conn.password = decrypt(conn.password);
      const setup = await setupHiveClient(conn);
      client = setup.client; session = setup.session;
      await setup.executeQuery(`USE \`${db_name}\``);
      const r = await setup.executeQuery(`DESCRIBE \`${table_name}\``);
      res.json(r.map(row => {
        const vals = Object.values(row);
        return { name: vals[0], type: vals[1], comment: vals[2] || '' };
      }).filter(c => c.name && !c.name.startsWith('#') && !c.name.startsWith('_hoodie')));
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally {
    try { if (session) await session.close(); } catch(e) {}
    try { if (client) await client.close(); } catch(e) {}
  }
});

module.exports = router;
