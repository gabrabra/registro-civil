const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { pool }       = require('../db');
const { auth, JWT_SECRET } = require('../middleware/auth');
const router = express.Router();

// POST /auth/login
router.post('/login', async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ error: 'Email e senha obrigatórios' });
  try {
    const { rows } = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email.toLowerCase().trim()]);
    if (!rows.length) return res.status(401).json({ error: 'Credenciais inválidas' });
    const ok = await bcrypt.compare(senha, rows[0].senha_hash);
    if (!ok) return res.status(401).json({ error: 'Credenciais inválidas' });
    const user = { id: rows[0].id, nome: rows[0].nome, email: rows[0].email };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '72h' });
    res.json({ token, user });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /auth/me — valida token e retorna usuário
router.get('/me', auth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
