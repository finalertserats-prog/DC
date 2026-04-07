const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const mysql = require('mysql2/promise');
const { decrypt } = require('../utils/crypto');

router.post('/snapshot/:connection_id', async (req, res) => {
  try {
    const { rows: connRows } = await pool.query('SELECT * FROM sdp_connections WHERE id = $1', [req.params.connection_id]);
    if (!connRows.length) return res.status(404).json({ error: 'Connection not found' });
    const conn = connRows[0];

    const connection = await mysql.createConnection({
      host: conn.host, port: conn.port,
      user: conn.username, password: decrypt(conn.password),
      database: conn.database_name, connectTimeout: 30000,
    });

    const [tables] = await connection.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?`,
      [conn.database_name]
    );

    let snapshotCount = 0;
    let diffCount = 0;

    for (const t of tables) {
      const tableName = t.TABLE_NAME;
      const [cols] = await connection.query(
        `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
         FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
        [conn.database_name, tableName]
      );

      const currentColumns = cols.map(c => ({
        name: c.COLUMN_NAME, type: c.DATA_TYPE, nullable: c.IS_NULLABLE, default: c.COLUMN_DEFAULT
      }));

      const { rows: prevSnapshots } = await pool.query(
        `SELECT columns FROM sdp_schema_snapshots WHERE connection_id = $1 AND db_name = $2 AND table_name = $3 ORDER BY snapshot_at DESC LIMIT 1`,
        [req.params.connection_id, conn.database_name, tableName]
      );

      if (prevSnapshots.length) {
        const prevColumns = prevSnapshots[0].columns;
        const prevMap = {};
        prevColumns.forEach(c => { prevMap[c.name] = c; });
        const currMap = {};
        currentColumns.forEach(c => { currMap[c.name] = c; });

        for (const col of currentColumns) {
          if (!prevMap[col.name]) {
            await pool.query(
              'INSERT INTO sdp_schema_diffs (connection_id,db_name,table_name,diff_type,column_name,old_value,new_value) VALUES ($1,$2,$3,$4,$5,$6,$7)',
              [req.params.connection_id, conn.database_name, tableName, 'added', col.name, null, col.type]
            );
            diffCount++;
          } else if (prevMap[col.name].type !== col.type) {
            await pool.query(
              'INSERT INTO sdp_schema_diffs (connection_id,db_name,table_name,diff_type,column_name,old_value,new_value) VALUES ($1,$2,$3,$4,$5,$6,$7)',
              [req.params.connection_id, conn.database_name, tableName, 'type_changed', col.name, prevMap[col.name].type, col.type]
            );
            diffCount++;
          }
        }

        for (const col of prevColumns) {
          if (!currMap[col.name]) {
            await pool.query(
              'INSERT INTO sdp_schema_diffs (connection_id,db_name,table_name,diff_type,column_name,old_value,new_value) VALUES ($1,$2,$3,$4,$5,$6,$7)',
              [req.params.connection_id, conn.database_name, tableName, 'dropped', col.name, col.type, null]
            );
            diffCount++;
          }
        }
      }

      await pool.query(
        'INSERT INTO sdp_schema_snapshots (connection_id,db_name,table_name,columns) VALUES ($1,$2,$3,$4)',
        [req.params.connection_id, conn.database_name, tableName, JSON.stringify(currentColumns)]
      );
      snapshotCount++;
    }

    await connection.end();
    res.json({ success: true, tables_snapshotted: snapshotCount, diffs_detected: diffCount });
  } catch (e) {
    console.error('[Schema Snapshot Error]', e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/diffs/:connection_id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM sdp_schema_diffs WHERE connection_id = $1 ORDER BY detected_at DESC LIMIT 500',
      [req.params.connection_id]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/diffs/:connection_id/:table_name', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM sdp_schema_diffs WHERE connection_id = $1 AND table_name = $2 ORDER BY detected_at DESC',
      [req.params.connection_id, req.params.table_name]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/latest/:connection_id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (table_name) table_name, columns, snapshot_at
       FROM sdp_schema_snapshots WHERE connection_id = $1
       ORDER BY table_name, snapshot_at DESC`,
      [req.params.connection_id]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;