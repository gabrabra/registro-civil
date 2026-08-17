const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { pool }       = require('../db');
const { auth, JWT_SECRET } = require('../middleware/auth');
const { carregarContexto, contarRegistrosDoUsuario } = require('../middleware/permissao');
const router = express.Router();

// Everything the UI needs to decide what to show. Profile and quota are read
// live rather than baked into the token, so changes apply on the next request.
async function montarSessao(userId) {
  const ctx = await carregarContexto(userId);
  if (!ctx) return null;
  return {
    id: ctx.id,
    nome: ctx.nome,
    email: ctx.email,
    perfil: ctx.perfil,
    limite_registros: ctx.limite_registros,
    registros_criados: await contarRegistrosDoUsuario(ctx.id),
  };
}

// POST /auth/login
router.post('/login', async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ error: 'Email e senha obrigatórios' });
  try {
    const { rows } = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email.toLowerCase().trim()]);
    if (!rows.length) return res.status(401).json({ error: 'Credenciais inválidas' });

    const ok = await bcrypt.compare(senha, rows[0].senha_hash);
    if (!ok) return res.status(401).json({ error: 'Credenciais inválidas' });
    if (rows[0].ativo === false) return res.status(403).json({ error: 'Usuário desativado. Procure um administrador.' });

    // Only the id goes in the token — permissions are resolved per request
    const token = jwt.sign({ id: rows[0].id }, JWT_SECRET, { expiresIn: '72h' });
    res.json({ token, user: await montarSessao(rows[0].id) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /auth/me — valida token e retorna usuário com perfil e permissões
router.get('/me', auth, async (req, res) => {
  try {
    const user = await montarSessao(req.user?.id);
    if (!user) return res.status(401).json({ error: 'Usuário não encontrado' });
    res.json({ user });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
