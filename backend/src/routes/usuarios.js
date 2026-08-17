const express = require('express');
const bcrypt  = require('bcryptjs');
const { pool } = require('../db');
const { exigePermissao, contarRegistrosDoUsuario } = require('../middleware/permissao');
const router = express.Router();

const SELECT_USUARIO = `
  SELECT u.id, u.nome, u.email, u.ativo, u.limite_registros, u.perfil_id, u.criado_em,
         p.nome AS perfil_nome, p.is_admin AS perfil_is_admin
    FROM usuarios u
    LEFT JOIN perfis p ON p.id = u.perfil_id
`;

function emailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

// Rejects weak passwords at the API, not just in the browser
function validarSenha(senha) {
  if (String(senha || '').length < 8) return 'A senha deve ter ao menos 8 caracteres';
  return null;
}

function parseLimite(valor) {
  if (valor === '' || valor === null || valor === undefined) return null; // unlimited
  const n = parseInt(valor, 10);
  if (Number.isNaN(n) || n < 0) return NaN;
  return n;
}

router.get('/', exigePermissao('usuarios', 'ver'), async (_req, res) => {
  try {
    const { rows } = await pool.query(`${SELECT_USUARIO} ORDER BY u.nome`);
    // Show quota consumption alongside the limit so the list is actionable
    const comUso = await Promise.all(rows.map(async u => ({
      ...u,
      registros_criados: await contarRegistrosDoUsuario(u.id),
    })));
    res.json(comUso);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', exigePermissao('usuarios', 'ver'), async (req, res) => {
  try {
    const { rows } = await pool.query(`${SELECT_USUARIO} WHERE u.id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json({ ...rows[0], registros_criados: await contarRegistrosDoUsuario(rows[0].id) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', exigePermissao('usuarios', 'criar'), async (req, res) => {
  const { nome, email, senha, perfil_id, limite_registros, ativo } = req.body;

  if (!String(nome || '').trim()) return res.status(400).json({ error: 'Nome é obrigatório' });
  if (!emailValido(email))        return res.status(400).json({ error: 'E-mail inválido' });
  const erroSenha = validarSenha(senha);
  if (erroSenha)                  return res.status(400).json({ error: erroSenha });
  if (!perfil_id)                 return res.status(400).json({ error: 'Selecione um perfil de acesso' });

  const limite = parseLimite(limite_registros);
  if (Number.isNaN(limite)) return res.status(400).json({ error: 'Limite de registros inválido' });

  try {
    const perfil = await pool.query('SELECT id FROM perfis WHERE id = $1', [perfil_id]);
    if (!perfil.rows.length) return res.status(400).json({ error: 'Perfil não encontrado' });

    const hash = await bcrypt.hash(senha, 10);
    const { rows } = await pool.query(
      `INSERT INTO usuarios (nome, email, senha_hash, perfil_id, limite_registros, ativo)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [nome.trim(), email.toLowerCase().trim(), hash, perfil_id, limite, ativo !== false]
    );
    const criado = await pool.query(`${SELECT_USUARIO} WHERE u.id = $1`, [rows[0].id]);
    res.status(201).json(criado.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Já existe um usuário com esse e-mail' });
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', exigePermissao('usuarios', 'editar'), async (req, res) => {
  const { nome, email, senha, perfil_id, limite_registros, ativo } = req.body;
  const id = parseInt(req.params.id, 10);

  if (!String(nome || '').trim()) return res.status(400).json({ error: 'Nome é obrigatório' });
  if (!emailValido(email))        return res.status(400).json({ error: 'E-mail inválido' });
  if (!perfil_id)                 return res.status(400).json({ error: 'Selecione um perfil de acesso' });

  // Password is optional on update — blank means "keep the current one"
  if (senha) {
    const erroSenha = validarSenha(senha);
    if (erroSenha) return res.status(400).json({ error: erroSenha });
  }

  const limite = parseLimite(limite_registros);
  if (Number.isNaN(limite)) return res.status(400).json({ error: 'Limite de registros inválido' });

  try {
    const alvo = await pool.query('SELECT id FROM usuarios WHERE id = $1', [id]);
    if (!alvo.rows.length) return res.status(404).json({ error: 'Usuário não encontrado' });

    // Guard against an administrator removing their own access mid-session
    if (id === req.contexto.id) {
      const novoPerfil = await pool.query('SELECT is_admin FROM perfis WHERE id = $1', [perfil_id]);
      if (!novoPerfil.rows[0]?.is_admin) {
        return res.status(400).json({ error: 'Você não pode remover seu próprio acesso de administrador.' });
      }
      if (ativo === false) {
        return res.status(400).json({ error: 'Você não pode desativar a si mesmo.' });
      }
    }

    const hash = senha ? await bcrypt.hash(senha, 10) : null;
    await pool.query(
      `UPDATE usuarios SET nome = $1, email = $2, perfil_id = $3, limite_registros = $4, ativo = $5,
              senha_hash = COALESCE($6, senha_hash), atualizado_em = NOW()
        WHERE id = $7`,
      [nome.trim(), email.toLowerCase().trim(), perfil_id, limite, ativo !== false, hash, id]
    );
    const atualizado = await pool.query(`${SELECT_USUARIO} WHERE u.id = $1`, [id]);
    res.json(atualizado.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Já existe um usuário com esse e-mail' });
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', exigePermissao('usuarios', 'excluir'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (id === req.contexto.id) return res.status(400).json({ error: 'Você não pode excluir a si mesmo.' });

  try {
    const { rows } = await pool.query('DELETE FROM usuarios WHERE id = $1 RETURNING id', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
