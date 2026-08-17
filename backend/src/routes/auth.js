const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { pool }       = require('../db');
const { auth, JWT_SECRET } = require('../middleware/auth');
const { carregarContexto, contarRegistrosDoUsuario } = require('../middleware/permissao');
const { registrar } = require('../utils/auditoria');
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
    const alvo = email.toLowerCase().trim();
    const { rows } = await pool.query('SELECT * FROM usuarios WHERE email = $1', [alvo]);

    if (!rows.length) {
      // The response stays generic on purpose (no user enumeration); the log
      // is where the detail belongs.
      registrar(req, {
        acao: 'login_falhou', modulo: 'auth', sucesso: false,
        descricao: `Tentativa de login com e-mail não cadastrado: ${alvo}`,
        detalhes: { email: alvo, motivo: 'email_inexistente' },
      });
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const u = rows[0];
    const ok = await bcrypt.compare(senha, u.senha_hash);
    if (!ok) {
      registrar(req, {
        acao: 'login_falhou', modulo: 'auth', sucesso: false,
        usuario: { id: u.id, nome: u.nome, email: u.email },
        descricao: 'Senha incorreta',
        detalhes: { motivo: 'senha_incorreta' },
      });
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    if (u.ativo === false) {
      registrar(req, {
        acao: 'login_falhou', modulo: 'auth', sucesso: false,
        usuario: { id: u.id, nome: u.nome, email: u.email },
        descricao: 'Login recusado: usuário desativado',
        detalhes: { motivo: 'usuario_desativado' },
      });
      return res.status(403).json({ error: 'Usuário desativado. Procure um administrador.' });
    }

    // Only the id goes in the token — permissions are resolved per request
    const token = jwt.sign({ id: u.id }, JWT_SECRET, { expiresIn: '72h' });
    const user = await montarSessao(u.id);

    registrar(req, {
      acao: 'login', modulo: 'auth',
      usuario: { id: u.id, nome: u.nome, email: u.email },
      descricao: `Entrou no sistema${user?.perfil?.nome ? ` como ${user.perfil.nome}` : ''}`,
    });

    res.json({ token, user });
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

// POST /auth/logout — o token é descartado no cliente; isto existe para o log
router.post('/logout', auth, async (req, res) => {
  try {
    const ctx = await carregarContexto(req.user?.id);
    registrar(req, {
      acao: 'logout', modulo: 'auth',
      usuario: ctx ? { id: ctx.id, nome: ctx.nome, email: ctx.email } : null,
      descricao: 'Saiu do sistema',
    });
  } catch { /* logout nunca falha por causa do log */ }
  res.json({ ok: true });
});

module.exports = router;
