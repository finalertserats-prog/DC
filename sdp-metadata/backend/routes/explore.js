const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const mysql = require('mysql2/promise');
const { decrypt } = require('../utils/crypto');
const { maskValue } = require('../utils/masking');

const getConn = async (id) => {
  const { rows } = await pool.query('SELECT * FROM sdp_connections WHERE id = $1', [id]);
  if (!rows.length) throw new Error('Connection not found');
  const conn = rows[0];
  conn.password = decrypt(conn.password);
  return conn;
};

const getMysql = async (conn) => {
  const c = await mysql.createConnection({
    host: conn.host, port: conn.port,
    user: conn.username, password: conn.password,
    connectTimeout: 30000,
  });
  try { await c.query('SET SESSION wait_timeout=300'); } catch(e) {}
  return c;
};

const getPg = async (conn) => {
  const { Client } = require('pg');
  const client = new Client({
    host: conn.host, port: conn.port || 5432,
    user: conn.username, password: conn.password,
    database: conn.database_name || 'postgres',
    ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000,
  });
  await client.connect();
  return client;
};

const getMongo = async (conn) => {
  const { MongoClient } = require('mongodb');
  const auth = conn.username && conn.password
    ? `${encodeURIComponent(conn.username)}:${encodeURIComponent(conn.password)}@` : '';
  const uri = conn.connection_string ||
    `mongodb://${auth}${conn.host}:${conn.port || 27017}/?authSource=admin`;
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  return client;
};

const getHiveClient = async (conn) => {
  const hive = require('hive-driver');
  const { TCLIService, TCLIService_types } = hive.thrift;
  const host = conn.host, port = Number(conn.port) || 10000;
  const authUser = (conn.username && conn.username.trim()) ? conn.username : 'hadoop';
  let client = new hive.HiveClient(TCLIService, TCLIService_types);
  client.on('error', () => {});
  try {
    await client.connect({ host, port }, new hive.connections.TcpConnection(),
      new hive.auth.PlainTcpAuthentication({ username: authUser, password: conn.password || 'dummy' }));
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

const flattenDoc = (doc) => {
  const r = {};
  const flatten = (obj, prefix) => {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? prefix + '.' + k : k;
      if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && k !== '_id') {
        flatten(v, key);
      } else {
        r[key] = Array.isArray(v) ? JSON.stringify(v) : v;
      }
    }
  };
  flatten(doc, '');
  return r;
};

const isMySQL = (t) => ['mysql','suitecrm','starrocks','mariadb'].includes(t);
const isPg = (t) => ['postgres','postgresql'].includes(t);
const isMongo = (t) => t === 'mongodb';
const isHive = (t) => t === 'hive';

router.post('/databases', async (req, res) => {
  try {
    const conn = await getConn(req.body.connection_id);
    const type = conn.type?.toLowerCase();
    if (isMongo(type)) {
      const client = await getMongo(conn);
      try {
        if (conn.database_name) {
          res.json([conn.database_name]);
        } else {
          const skip = ['admin','config','local'];
          const dbs = await client.db().admin().listDatabases();
          res.json(dbs.databases.map(d => d.name).filter(d => !skip.includes(d)));
        }
      } finally { await client.close(); }
    } else if (isPg(type)) {
      const client = await getPg(conn);
      try {
        const r = await client.query(`SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('pg_catalog','information_schema','pg_toast') ORDER BY schema_name`);
        res.json(r.rows.map(row => row.schema_name));
      } finally { await client.end(); }
    } else if (isHive(type)) {
      let client, session;
      try {
        const setup = await getHiveClient(conn);
        client = setup.client; session = setup.session;
        const r = await setup.executeQuery('SHOW DATABASES');
        const skip = ['information_schema','sys','default'];
        res.json(r.map(row => Object.values(row)[0]).filter(d => d && !skip.includes(d)));
      } finally {
        try { if (session) await session.close(); } catch(e) {}
        try { if (client) await client.close(); } catch(e) {}
      }
    } else {
      const c = await getMysql(conn);
      const [rows] = await c.query('SHOW DATABASES');
      await c.end();
      const skip = ['information_schema','mysql','performance_schema','sys'];
      res.json(rows.map(r => Object.values(r)[0]).filter(d => !skip.includes(d)));
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/tables', async (req, res) => {
  try {
    const { connection_id, db_name } = req.body;
    const conn = await getConn(connection_id);
    const type = conn.type?.toLowerCase();
    if (isMongo(type)) {
      const client = await getMongo(conn);
      try {
        const cols = await client.db(db_name).listCollections().toArray();
        res.json(cols.map(c => c.name));
      } finally { await client.close(); }
    } else if (isPg(type)) {
      const client = await getPg(conn);
      try {
        const r = await client.query(`SELECT tablename FROM pg_tables WHERE schemaname=$1 ORDER BY tablename`, [db_name]);
        res.json(r.rows.map(row => row.tablename));
      } finally { await client.end(); }
    } else if (isHive(type)) {
      let client, session;
      try {
        const setup = await getHiveClient(conn);
        client = setup.client; session = setup.session;
        await setup.executeQuery('USE `' + db_name + '`');
        const r = await setup.executeQuery('SHOW TABLES');
        res.json(r.map(row => Object.values(row)[Object.values(row).length - 1]));
      } finally {
        try { if (session) await session.close(); } catch(e) {}
        try { if (client) await client.close(); } catch(e) {}
      }
    } else {
      const c = await getMysql(conn);
      const [rows] = await c.query('SHOW TABLES FROM `' + db_name + '`');
      await c.end();
      res.json(rows.map(r => Object.values(r)[0]));
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/schema', async (req, res) => {
  try {
    const { connection_id, db_name, table_name } = req.body;
    const conn = await getConn(connection_id);
    const type = conn.type?.toLowerCase();
    if (isMongo(type)) {
      const client = await getMongo(conn);
      try {
        const collection = client.db(db_name).collection(table_name);
        const total = await collection.countDocuments();
        const sample = await collection.findOne({});
        const flat = sample ? flattenDoc(sample) : {};
        const schema = Object.entries(flat).map(([k, v]) => ({
          Field: k, Type: Array.isArray(v) ? 'array' : typeof v,
          Null: 'YES', Key: k === '_id' ? 'PRI' : '', Default: null, Extra: ''
        }));
        res.json({ schema, total_rows: total, recent_diffs: [], metadata: null });
      } finally { await client.close(); }
    } else if (isPg(type)) {
      const client = await getPg(conn);
      try {
        const r = await client.query(`SELECT column_name as "Field", data_type as "Type", is_nullable as "Null", '' as "Key", column_default as "Default", '' as "Extra" FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position`, [db_name, table_name]);
        const count = await client.query('SELECT COUNT(*) as cnt FROM "' + db_name + '"."' + table_name + '"');
        res.json({ schema: r.rows, total_rows: Number(count.rows[0].cnt), recent_diffs: [], metadata: null });
      } finally { await client.end(); }
    } else if (isHive(type)) {
      let client, session;
      try {
        const setup = await getHiveClient(conn);
        client = setup.client; session = setup.session;
        await setup.executeQuery('USE `' + db_name + '`');
        const r = await setup.executeQuery('DESCRIBE `' + table_name + '`');
        const schema = r
          .map(row => { const vals = Object.values(row); return { Field: vals[0], Type: vals[1], Null: 'YES', Key: '', Default: null, Extra: '' }; })
          .filter(c => c.Field && !c.Field.startsWith('#') && !c.Field.startsWith('_hoodie'));
        const countR = await setup.executeQuery('SELECT COUNT(*) as cnt FROM `' + table_name + '`');
        const total = Number(Object.values(countR[0])[0]);
        res.json({ schema, total_rows: total, recent_diffs: [], metadata: null });
      } finally {
        try { if (session) await session.close(); } catch(e) {}
        try { if (client) await client.close(); } catch(e) {}
      }
    } else {
      const c = await getMysql(conn);
      const [schema] = await c.query('DESCRIBE `' + db_name + '`.`' + table_name + '`');
      const [countRows] = await c.query('SELECT COUNT(*) as cnt FROM `' + db_name + '`.`' + table_name + '`');
      await c.end();
      const { rows: diffs } = await pool.query('SELECT * FROM sdp_schema_diffs WHERE connection_id=$1 AND table_name=$2 ORDER BY detected_at DESC LIMIT 10', [connection_id, table_name]);
      const { rows: meta } = await pool.query('SELECT * FROM sdp_table_metadata WHERE connection_id=$1 AND db_name=$2 AND table_name=$3', [connection_id, db_name, table_name]);
      res.json({ schema, total_rows: Number(countRows[0].cnt), recent_diffs: diffs, metadata: meta[0] || null });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/preview', async (req, res) => {
  try {
    const { connection_id, db_name, table_name } = req.body;
    const conn = await getConn(connection_id);
    const type = conn.type?.toLowerCase();
    if (isMongo(type)) {
      const client = await getMongo(conn);
      try {
        const docs = await client.db(db_name).collection(table_name).find({}).limit(50).toArray();
        const masked = docs.map(doc => {
          const flat = flattenDoc(doc);
          const r = {};
          for (const [k, v] of Object.entries(flat)) r[k] = maskValue(v, k);
          return r;
        });
        res.json(masked);
      } finally { await client.close(); }
    } else if (isPg(type)) {
      const client = await getPg(conn);
      try {
        const r = await client.query('SELECT * FROM "' + db_name + '"."' + table_name + '" LIMIT 50');
        const masked = r.rows.map(row => {
          const r2 = {};
          for (const [k, v] of Object.entries(row)) r2[k] = maskValue(v, k);
          return r2;
        });
        res.json(masked);
      } finally { await client.end(); }
    } else if (isHive(type)) {
      let client, session;
      try {
        const setup = await getHiveClient(conn);
        client = setup.client; session = setup.session;
        await setup.executeQuery('USE `' + db_name + '`');
        const r = await setup.executeQuery('SELECT * FROM `' + table_name + '` LIMIT 50');
        const masked = r.map(row => {
          const r2 = {};
          for (const [k, v] of Object.entries(row)) r2[k] = maskValue(v, k);
          return r2;
        });
        res.json(masked);
      } finally {
        try { if (session) await session.close(); } catch(e) {}
        try { if (client) await client.close(); } catch(e) {}
      }
    } else {
      const c = await getMysql(conn);
      const [rows] = await c.query('SELECT * FROM `' + db_name + '`.`' + table_name + '` LIMIT 50');
      await c.end();
      const masked = rows.map(row => {
        const r = {};
        for (const [k, v] of Object.entries(row)) r[k] = maskValue(v, k);
        return r;
      });
      res.json(masked);
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/query', async (req, res) => {
  try {
    const { connection_id, db_name, query } = req.body;
    const safe = query.trim().replace(/;+$/, '');
    const lower = safe.toLowerCase();
    const conn = await getConn(connection_id);
    const type = conn.type?.toLowerCase();
    if (isMongo(type)) {
      return res.status(400).json({ error: 'Use the Preview tab for MongoDB. Raw queries not supported.' });
    }
    if (!lower.startsWith('select') && !lower.startsWith('show') && !lower.startsWith('desc') && !lower.startsWith('with')) {
      return res.status(400).json({ error: 'Only SELECT, SHOW, DESCRIBE, or WITH queries are allowed' });
    }
    if (isPg(type)) {
      const client = await getPg(conn);
      try {
        const r = await client.query(safe);
        const masked = r.rows.slice(0, 100).map(row => {
          const r2 = {};
          for (const [k, v] of Object.entries(row)) r2[k] = maskValue(v, k);
          return r2;
        });
        res.json(masked);
      } finally { await client.end(); }
    } else if (isHive(type)) {
      let client, session;
      try {
        const setup = await getHiveClient(conn);
        client = setup.client; session = setup.session;
        if (db_name) await setup.executeQuery('USE `' + db_name + '`');
        const r = await setup.executeQuery(safe);
        const masked = r.slice(0, 100).map(row => {
          const r2 = {};
          for (const [k, v] of Object.entries(row)) r2[k] = maskValue(v, k);
          return r2;
        });
        res.json(masked);
      } finally {
        try { if (session) await session.close(); } catch(e) {}
        try { if (client) await client.close(); } catch(e) {}
      }
    } else {
      const c = await getMysql(conn);
      if (db_name) await c.query('USE `' + db_name + '`');
      const [rows] = await c.query(safe);
      await c.end();
      const limited = Array.isArray(rows) ? rows.slice(0, 100) : [rows];
      const masked = limited.map(row => {
        if (typeof row !== 'object') return { result: maskValue(row) };
        const r = {};
        for (const [k, v] of Object.entries(row)) r[k] = maskValue(v, k);
        return r;
      });
      res.json(masked);
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/profile-column', async (req, res) => {
  try {
    const { connection_id, db_name, table_name, column_name } = req.body;
    const conn = await getConn(connection_id);
    const type = conn.type?.toLowerCase();
    if (isMongo(type)) {
      const client = await getMongo(conn);
      try {
        const collection = client.db(db_name).collection(table_name);
        const total = await collection.countDocuments();
        const nullCount = await collection.countDocuments({ [column_name]: null });
        const distinct = await collection.distinct(column_name);
        const topVals = await collection.aggregate([
          { $match: { [column_name]: { $ne: null } } },
          { $group: { _id: '$' + column_name, count: { $sum: 1 } } },
          { $sort: { count: -1 } }, { $limit: 5 }
        ]).toArray();
        res.json({ total_rows: total, distinct_count: distinct.length, null_count: nullCount, min_val: null, max_val: null, top_values: topVals.map(t => ({ value: String(t._id), count: t.count })) });
      } finally { await client.close(); }
    } else if (isPg(type)) {
      const client = await getPg(conn);
      try {
        const r = await client.query('SELECT COUNT(*) as total_rows, COUNT(DISTINCT "' + column_name + '") as distinct_count, SUM(CASE WHEN "' + column_name + '" IS NULL THEN 1 ELSE 0 END) as null_count, MIN(CAST("' + column_name + '" AS TEXT)) as min_val, MAX(CAST("' + column_name + '" AS TEXT)) as max_val FROM "' + db_name + '"."' + table_name + '"');
        const top = await client.query('SELECT CAST("' + column_name + '" AS TEXT) as value, COUNT(*) as count FROM "' + db_name + '"."' + table_name + '" WHERE "' + column_name + '" IS NOT NULL GROUP BY "' + column_name + '" ORDER BY count DESC LIMIT 5');
        res.json({ ...r.rows[0], top_values: top.rows });
      } finally { await client.end(); }
    } else if (isHive(type)) {
      res.json({ total_rows: null, distinct_count: null, null_count: null, min_val: null, max_val: null, top_values: [] });
    } else {
      const c = await getMysql(conn);
      const [stats] = await c.query('SELECT COUNT(*) as total_rows, COUNT(DISTINCT `' + column_name + '`) as distinct_count, SUM(CASE WHEN `' + column_name + '` IS NULL THEN 1 ELSE 0 END) as null_count, MIN(CAST(`' + column_name + '` AS CHAR)) as min_val, MAX(CAST(`' + column_name + '` AS CHAR)) as max_val FROM `' + db_name + '`.`' + table_name + '`');
      const [topVals] = await c.query('SELECT CAST(`' + column_name + '` AS CHAR) as value, COUNT(*) as count FROM `' + db_name + '`.`' + table_name + '` WHERE `' + column_name + '` IS NOT NULL GROUP BY `' + column_name + '` ORDER BY count DESC LIMIT 5');
      await c.end();
      res.json({ ...stats[0], top_values: topVals });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
