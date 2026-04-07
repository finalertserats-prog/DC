const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const { rows } = await pool.query('SELECT * FROM sdp_users WHERE username = $1', [username]);
    if (!rows.length || rows[0].password !== password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign(
      { username: rows[0].username, role: rows[0].role },
      process.env.JWT_SECRET || 'sdp_secret',
      { expiresIn: '12h' }
    );
    res.json({ token, user: { username: rows[0].username, role: rows[0].role } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/signup', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    const existing = await pool.query('SELECT id FROM sdp_users WHERE username = $1', [username]);
    if (existing.rows.length) return res.status(400).json({ error: 'Username already exists' });
    await pool.query('INSERT INTO sdp_users (username, password, role) VALUES ($1, $2, $3)', [username, password, 'viewer']);
    const token = jwt.sign({ username, role: 'viewer' }, process.env.JWT_SECRET || 'sdp_secret', { expiresIn: '12h' });
    res.json({ token, user: { username, role: 'viewer' } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;