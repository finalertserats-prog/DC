const mysql = require('mysql2/promise');
const { decrypt } = require('./crypto');

const getStatus = (lastModified) => {
  if (!lastModified) return 'No data';
  const days = (Date.now() - new Date(lastModified)) / (1000 * 60 * 60 * 24);
  if (days <= 180) return 'Active';
  if (days <= 730) return 'Low activity';
  return 'Inactive';
};

// ─── Pure data-driven column detection — works for any schema ─────────────
const detectColumns = (colNames) => {
  const lower = colNames.map(c => c.toLowerCase());

  const modCol = colNames.find((c, i) =>
    ['modif','updat','chang','alter','edit','revis','last_mod','last_upd'].some(p => lower[i].includes(p))
  ) || null;

  const createdCol = colNames.find((c, i) =>
    !['modif','updat','chang','alter','edit','revis'].some(p => lower[i].includes(p)) &&
    ['creat','enter','insert','added','origin','since','start','born'].some(p => lower[i].includes(p))
  ) || null;

  const deletedCol = colNames.find((c, i) =>
    ['delet','remov','archiv','trash','purge','is_del','soft_del','inactive'].some(p => lower[i].includes(p))
  ) || null;

  const pkCol = colNames.find(c =>
    /^id$/i.test(c) || /^_id$/i.test(c) || /^uuid$/i.test(c) ||
    /^guid$/i.test(c) || /^pk$/i.test(c)
  ) || colNames.find(c => /_id$/i.test(c)) || null;

  // ─── Smart category from actual column patterns ──────────────────────
  const classifyTable = (tableName, allColNames, totalRows) => {
    const t = tableName.toLowerCase();
    const cols = allColNames.map(c => c.toLowerCase());

    // Custom fields — has id_c pattern
    if (t.endsWith('_cstm') || t.endsWith('_custom') || cols.includes('id_c')) {
      return 'Custom fields';
    }

    // Audit/log tables — append-only, usually has created but no modified
    if (
      t.endsWith('_audit') || t.endsWith('_log') || t.endsWith('_logs') ||
      t.endsWith('_history') || t.endsWith('_trail') || t.endsWith('_events')
    ) {
      return 'Audit';
    }

    // Operational tables — high volume system-generated data
    // Detect by: very high rows relative to FK pattern OR operational column names
    const hasOperationalCols = cols.some(c =>
      ['queue','status','priority','retry','attempt','job','task','worker','process','batch','scheduled'].some(p => c.includes(p))
    );
    if (hasOperationalCols && totalRows > 1000) {
      return 'Operational';
    }

    // Relationship/junction tables — mostly FK columns
    const fkCols = cols.filter(c => c.endsWith('_id') || c.endsWith('_ids'));
    const nonFkCols = cols.filter(c =>
      !c.endsWith('_id') && !c.endsWith('_ids') &&
      !['id','deleted','date_modified','date_entered','created_at','updated_at'].includes(c)
    );
    if (fkCols.length >= 2 && nonFkCols.length <= 3 && cols.length <= 8) {
      return 'Relationship';
    }

    // Reference/lookup — small static tables with no FK pattern
    if (totalRows <= 50 && fkCols.length === 0) {
      return 'Reference';
    }

    // Config tables
    if (t === 'config' || t === 'settings' || t === 'configuration' || t === 'preferences') {
      return 'Config';
    }

    // Default
    return 'Table';
  };

  return { modCol, createdCol, deletedCol, pkCol, classifyTable };
};

// ─── MySQL / MariaDB / StarRocks / SuiteCRM ───────────────────────────────
const profileMySQL = async (conn) => {
  let connection;
  const results = [];
  try {
    connection = await mysql.createConnection({
      host: conn.host, port: conn.port,
      user: conn.username, password: conn.password,
      database: conn.database_name, connectTimeout: 30000,
    });
    const dbName = conn.database_name;

    const [tables] = await connection.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES 
       WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`,
      [dbName]
    );

    const [allCols] = await connection.query(
      `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_KEY
       FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ?
       ORDER BY TABLE_NAME, ORDINAL_POSITION`,
      [dbName]
    );

    const colsByTable = {};
    allCols.forEach(c => {
      if (!colsByTable[c.TABLE_NAME]) colsByTable[c.TABLE_NAME] = [];
      colsByTable[c.TABLE_NAME].push({ name: c.COLUMN_NAME, type: c.DATA_TYPE, key: c.COLUMN_KEY });
    });

    for (const t of tables) {
      const tableName = t.TABLE_NAME;
      try {
        const cols = colsByTable[tableName] || [];
        const colNames = cols.map(c => c.name);
        const { modCol, createdCol, deletedCol, pkCol, classifyTable } = detectColumns(colNames);
        const actualPk = cols.find(c => c.key === 'PRI')?.name || pkCol;
        const incrementalCol = modCol || createdCol || null;

        // Get row counts
        const [countRows] = await connection.query(
          `SELECT COUNT(*) as total 
           ${deletedCol ? `, SUM(CASE WHEN \`${deletedCol}\`=1 OR \`${deletedCol}\`='1' OR \`${deletedCol}\`=true THEN 1 ELSE 0 END) as del` : ''}
           FROM \`${tableName}\``
        );
        const total = Number(countRows[0].total);
        const deleted = deletedCol ? Number(countRows[0].del || 0) : null;

        // Get timestamps
        let lastMod = null, dataSince = null;
        if (modCol && total > 0) {
          const [r] = await connection.query(`SELECT MAX(\`${modCol}\`) as v FROM \`${tableName}\``);
          lastMod = r[0].v;
        }
        if (createdCol && total > 0) {
          const [r] = await connection.query(`SELECT MIN(\`${createdCol}\`) as v FROM \`${tableName}\``);
          dataSince = r[0].v;
        }

        const category = classifyTable(tableName, colNames, total);

        results.push({
          table_name: tableName,
          pk_column: actualPk,
          pk_type: actualPk ? (cols.find(c => c.name === actualPk)?.type || 'varchar') : null,
          category,
          incremental_col: incrementalCol,
          load_type: incrementalCol ? 'incremental' : 'full',
          total_rows: total,
          active_rows: deleted != null ? total - deleted : total,
          deleted_rows: deleted,
          data_since: dataSince,
          last_modified: lastMod,
          status: getStatus(lastMod || dataSince),
        });
      } catch (e) {
        results.push({
          table_name: tableName, status: 'Error', total_rows: null,
          pk_column: null, pk_type: null, category: 'Table',
          load_type: 'full', incremental_col: null,
        });
      }
    }
  } finally {
    try { if (connection) await connection.end(); } catch(e) {}
  }
  return results;
};

// ─── PostgreSQL ────────────────────────────────────────────────────────────
const profilePostgres = async (conn) => {
  const { Client } = require('pg');
  const client = new Client({
    host: conn.host, port: conn.port || 5432,
    user: conn.username, password: conn.password,
    database: conn.database_name || 'postgres',
    ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000,
  });
  const results = [];
  try {
    await client.connect();
    const schema = conn.schema_name || 'public';

    const tablesResult = await client.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename`, [schema]
    );
    const colsResult = await client.query(
      `SELECT c.table_name, c.column_name, c.data_type,
              CASE WHEN pk.column_name IS NOT NULL THEN 'PRI' ELSE '' END as column_key
       FROM information_schema.columns c
       LEFT JOIN (
         SELECT ku.table_name, ku.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage ku ON tc.constraint_name = ku.constraint_name
         WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = $1
       ) pk ON c.table_name = pk.table_name AND c.column_name = pk.column_name
       WHERE c.table_schema = $1 ORDER BY c.table_name, c.ordinal_position`, [schema]
    );

    const colsByTable = {};
    colsResult.rows.forEach(c => {
      if (!colsByTable[c.table_name]) colsByTable[c.table_name] = [];
      colsByTable[c.table_name].push({ name: c.column_name, type: c.data_type, key: c.column_key });
    });

    for (const t of tablesResult.rows) {
      const tableName = t.tablename;
      try {
        const cols = colsByTable[tableName] || [];
        const colNames = cols.map(c => c.name);
        const { modCol, createdCol, deletedCol, pkCol, classifyTable } = detectColumns(colNames);
        const actualPk = cols.find(c => c.key === 'PRI')?.name || pkCol;
        const incrementalCol = modCol || createdCol || null;

        const countResult = await client.query(
          `SELECT COUNT(*) as total FROM "${schema}"."${tableName}"`
        );
        const total = Number(countResult.rows[0].total);

        let lastMod = null, dataSince = null;
        if (modCol && total > 0) {
          const r = await client.query(`SELECT MAX("${modCol}") as v FROM "${schema}"."${tableName}"`);
          lastMod = r.rows[0].v;
        }
        if (createdCol && total > 0) {
          const r = await client.query(`SELECT MIN("${createdCol}") as v FROM "${schema}"."${tableName}"`);
          dataSince = r.rows[0].v;
        }

        results.push({
          table_name: tableName,
          pk_column: actualPk,
          pk_type: actualPk ? (cols.find(c => c.name === actualPk)?.type || 'uuid') : null,
          category: classifyTable(tableName, colNames, total),
          incremental_col: incrementalCol,
          load_type: incrementalCol ? 'incremental' : 'full',
          total_rows: total, active_rows: total, deleted_rows: null,
          data_since: dataSince, last_modified: lastMod,
          status: getStatus(lastMod || dataSince),
        });
      } catch (e) {
        results.push({
          table_name: tableName, status: 'Error', total_rows: null,
          pk_column: null, pk_type: null, category: 'Table',
          load_type: 'full', incremental_col: null,
        });
      }
    }
  } finally {
    try { await client.end(); } catch(e) {}
  }
  return results;
};

// ─── MongoDB ──────────────────────────────────────────────────────────────
const profileMongoDB = async (conn) => {
  const { MongoClient } = require('mongodb');
  const results = [];
  let client;
  try {
    const auth = conn.username && conn.password
      ? `${encodeURIComponent(conn.username)}:${encodeURIComponent(conn.password)}@` : '';
    const uri = conn.connection_string ||
      `mongodb://${auth}${conn.host}:${conn.port || 27017}/?authSource=admin`;
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
    await client.connect();

    const skipDbs = ['admin', 'config', 'local'];
    const dbNames = conn.database_name
      ? [conn.database_name]
      : (await client.db().admin().listDatabases()).databases
          .map(d => d.name).filter(d => !skipDbs.includes(d));

    for (const dbName of dbNames) {
      try {
        const db = client.db(dbName);
        const collections = await db.listCollections().toArray();
        for (const col of collections) {
          const colName = col.name;
          try {
            const collection = db.collection(colName);
            const total = await collection.countDocuments();
            const sample = total > 0 ? await collection.findOne({}) : null;
            const fields = sample ? Object.keys(sample) : [];
            const { modCol, createdCol, classifyTable } = detectColumns(fields);

            let lastMod = null, dataSince = null;
            if (modCol && total > 0) {
              const latest = await collection.find({}).sort({ [modCol]: -1 }).limit(1).toArray();
              if (latest.length) lastMod = latest[0][modCol];
            }
            if (createdCol && total > 0) {
              const earliest = await collection.find({}).sort({ [createdCol]: 1 }).limit(1).toArray();
              if (earliest.length) dataSince = earliest[0][createdCol];
            }
            // Fallback — ObjectId timestamp
            if (!lastMod && !dataSince && sample?._id?.getTimestamp) {
              try {
                const newest = await collection.find({}).sort({ _id: -1 }).limit(1).toArray();
                const oldest = await collection.find({}).sort({ _id: 1 }).limit(1).toArray();
                const isValid = (ts) => ts && ts.getFullYear?.() >= 2010 && ts.getFullYear?.() <= 2035;
                const nt = newest[0]?._id?.getTimestamp?.();
                const ot = oldest[0]?._id?.getTimestamp?.();
                if (nt && isValid(nt)) lastMod = nt;
                if (ot && isValid(ot)) dataSince = ot;
              } catch(e) {}
            }

            results.push({
              table_name: dbNames.length > 1 ? `${dbName}.${colName}` : colName,
              pk_column: '_id', pk_type: 'ObjectId',
              category: classifyTable(colName, fields, total),
              incremental_col: modCol || createdCol || '_id',
              load_type: 'incremental',
              total_rows: total, active_rows: total, deleted_rows: null,
              data_since: dataSince, last_modified: lastMod,
              status: getStatus(lastMod || dataSince),
            });
          } catch(e) {
            results.push({
              table_name: `${dbName}.${colName}`, status: 'Error',
              total_rows: null, pk_column: '_id', pk_type: 'ObjectId',
              category: 'Collection', load_type: 'full', incremental_col: null,
            });
          }
        }
      } catch(e) {}
    }
  } finally {
    try { if (client) await client.close(); } catch(e) {}
  }
  return results;
};

// ─── Hive ─────────────────────────────────────────────────────────────────
const profileHive = async (conn) => {
  const hive = require('hive-driver');
  const { TCLIService, TCLIService_types } = hive.thrift;
  let client, session;
  const results = [];
  try {
    const host = conn.host, port = Number(conn.port) || 10000;
    const authUser = (conn.username && conn.username.trim()) ? conn.username : 'hadoop';
    client = new hive.HiveClient(TCLIService, TCLIService_types);
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
    session = await client.openSession({
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
    const dbName = conn.database_name || 'default';
    await executeQuery('USE `' + dbName + '`');
    const tableRows = await executeQuery('SHOW TABLES');
    const tables = tableRows.map(r => Object.values(r)[Object.values(r).length - 1]);
    for (const tableName of tables.slice(0, 100)) {
      try {
        const schemaRows = await executeQuery('DESCRIBE `' + tableName + '`');
        const fields = schemaRows
          .map(r => Object.values(r)[0])
          .filter(c => c && !c.startsWith('#') && !c.startsWith('_hoodie'));
        const { modCol, createdCol, pkCol, classifyTable } = detectColumns(fields);
        const countRows = await executeQuery('SELECT COUNT(*) as cnt FROM `' + tableName + '`');
        const total = Number(Object.values(countRows[0])[0]);
        results.push({
          table_name: tableName,
          pk_column: pkCol, pk_type: pkCol ? 'string' : null,
          category: classifyTable(tableName, fields, total),
          incremental_col: modCol || createdCol || null,
          load_type: modCol || createdCol ? 'incremental' : 'full',
          total_rows: total, active_rows: total, deleted_rows: null,
          data_since: null, last_modified: null,
          status: total > 0 ? 'Active' : 'No data',
        });
      } catch(e) {
        results.push({
          table_name: tableName, status: 'Error', total_rows: null,
          pk_column: null, pk_type: null, category: 'Table',
          load_type: 'full', incremental_col: null,
        });
      }
    }
  } finally {
    try { if (session) await session.close(); } catch(e) {}
    try { if (client) await client.close(); } catch(e) {}
  }
  return results;
};

// ─── Main dispatcher ──────────────────────────────────────────────────────
const profileGenericDB = async (conn) => {
  const type = (conn.type || '').toLowerCase();
  if (type === 'mongodb') return profileMongoDB(conn);
  if (type === 'postgresql' || type === 'postgres') return profilePostgres(conn);
  if (type === 'hive') return profileHive(conn);
  return profileMySQL(conn);
};

const runFullProfiling = async (conn) => profileGenericDB(conn);

module.exports = { runFullProfiling, profileGenericDB, getStatus };
