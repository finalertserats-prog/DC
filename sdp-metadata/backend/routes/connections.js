const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { encrypt, decrypt } = require('../utils/crypto');
const { maskHost } = require('../utils/masking');

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM sdp_connections ORDER BY id DESC');
    const safe = rows.map(r => ({
      ...r,
      password: r.password ? '***' : '',
      sr_password: r.sr_password ? '***' : '',
      masked_host: maskHost(r.host),
    }));
    res.json(safe);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', async (req, res) => {
  try {
      const { name, type, host, port, username, password, database_name, sr_username, sr_password, ui_url, description, connection_string } = req.body;    await pool.query(
      'INSERT INTO sdp_connections (name,type,host,port,username,password,database_name,sr_username,sr_password,ui_url,description,connection_string) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
      [name, type, host, port, username, encrypt(password || ''), database_name || '', sr_username || '', encrypt(sr_password || ''), ui_url || '', description || '', connection_string || '']
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, type, host, port, username, password, database_name, sr_username, sr_password, ui_url, description, connection_string } = req.body;    const { rows } = await pool.query('SELECT * FROM sdp_connections WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const finalPass = password === '***' ? rows[0].password : encrypt(password || '');
    const finalSrPass = sr_password === '***' ? rows[0].sr_password : encrypt(sr_password || '');
    await pool.query(
      'UPDATE sdp_connections SET name=$1,type=$2,host=$3,port=$4,username=$5,password=$6,database_name=$7,sr_username=$8,sr_password=$9,ui_url=$10,description=$11,connection_string=$12,updated_at=NOW() WHERE id=$13',
      [name, type, host, port, username, finalPass, database_name || '', sr_username || '', finalSrPass, ui_url || '', description || '', connection_string || '', req.params.id]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM sdp_connections WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/test', async (req, res) => {
  const { decrypt } = require('../utils/crypto');
  try {
    const { type, host, port, username, password, database_name, connection_string } = req.body;
    const pass = decrypt(password) || password;

    if (type === 'mongodb') {
      const { MongoClient } = require('mongodb');
      const auth = username && pass ? `${encodeURIComponent(username)}:${encodeURIComponent(pass)}@` : '';
      const uri = connection_string || `mongodb://${auth}${host}:${port || 27017}/${database_name || ''}?authSource=admin`;
      const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
      await client.connect();
      await client.db().admin().ping();
      await client.close();
    } else if (type === 'postgresql' || type === 'postgres' || type === 'airflow') {
      const { Client } = require('pg');
      const client = new Client({ host, port: Number(port) || 5432, user: username, password: pass, database: database_name || 'postgres', ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
    } else if (type === 'hive') {
      res.json({ success: true, message: 'Hive connection saved — tested on first use' });
      return;
    } else {
      const mysql = require('mysql2/promise');
      const conn = await mysql.createConnection({ host, port: Number(port), user: username, password: pass, database: database_name, connectTimeout: 10000 });
      await conn.query('SELECT 1');
      await conn.end();
    }
    res.json({ success: true, message: 'Connection successful' });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

module.exports = router;