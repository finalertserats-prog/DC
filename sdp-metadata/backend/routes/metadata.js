const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');

router.get('/:connection_id/:db_name/:table_name', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM sdp_table_metadata WHERE connection_id=$1 AND db_name=$2 AND table_name=$3',
      [req.params.connection_id, req.params.db_name, req.params.table_name]
    );
    res.json(rows.length ? rows[0] : { description: '', use_case: '', owner: '', tags: [], column_comments: {} });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/save', async (req, res) => {
  try {
    const { connection_id, db_name, table_name, description, use_case, owner, tags, column_comments } = req.body;
    await pool.query(
      `INSERT INTO sdp_table_metadata (connection_id,db_name,table_name,description,use_case,owner,tags,column_comments,last_updated)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
       ON CONFLICT (connection_id,db_name,table_name)
       DO UPDATE SET description=$4,use_case=$5,owner=$6,tags=$7,column_comments=$8,last_updated=NOW()`,
      [connection_id, db_name, table_name, description, use_case, owner, tags, JSON.stringify(column_comments || {})]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;