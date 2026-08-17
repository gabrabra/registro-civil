const express = require('express');
const { pool } = require('../db');
const { exigePermissao } = require('../middleware/permissao');
const { MODULOS, ACOES, normalizarPermissoes, matrizVazia } = require('../utils/permissoes');
const router = express.Router();

// Catalog the profile editor renders its checkbox matrix from
router.get('/catalogo', exigePermissao('perfis', 'ver'), (_req, res) => {
  res.json({ modulos: MODULOS, acoes: ACOES, matrizVazia: matrizVazia() });
});

router.get('/', exigePermissao('perfis', 'ver'), async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, COUNT(u.id)::int AS total_usuarios
         FROM perfis p
         LEFT JOIN usuarios u ON u.perfil_id = p.id
        GROUP BY p.id
        ORDER BY p.is_admin DESC, p.nome`
    );
    res.json(rows.map(r => ({ ...r, permissoes: normalizarPermissoes(r.permissoes) })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', exigePermissao('perfis', 'ver'), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM perfis WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Perfil não encontrado' });
    res.json({ ...rows[0], permissoes: normalizarPermissoes(rows[0].permissoes) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', exigePermissao('perfis', 'criar'), async (req, res) => {
  const { nome, descricao, permissoes } = req.body;
  if (!String(nome || '').trim()) return res.status(400).json({ error: 'Nome do perfil é obrigatório' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO perfis (nome, descricao, is_admin, permissoes)
       VALUES ($1, $2, FALSE, $3) RETURNING *`,
      [nome.trim(), descricao || null, JSON.stringify(normalizarPermissoes(permissoes))]
    );
    res.status(201).json({ ...rows[0], permissoes: normalizarPermissoes(rows[0].permissoes) });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Já existe um perfil com esse nome' });
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', exigePermissao('perfis', 'editar'), async (req, res) => {
  const { nome, descricao, permissoes } = req.body;
  if (!String(nome || '').trim()) return res.status(400).json({ error: 'Nome do perfil é obrigatório' });

  try {
    const atual = await pool.query('SELECT is_admin FROM perfis WHERE id = $1', [req.params.id]);
    if (!atual.rows.length) return res.status(404).json({ error: 'Perfil não encontrado' });

    // The administrator profile keeps full access by definition; editing its
    // matrix would be a silent no-op, so we reject instead of pretending.
    if (atual.rows[0].is_admin) {
      return res.status(400).json({ error: 'O perfil de administrador tem acesso total e não pode ter permissões alteradas.' });
    }

    const { rows } = await pool.query(
      `UPDATE perfis SET nome = $1, descricao = $2, permissoes = $3, atualizado_em = NOW()
        WHERE id = $4 RETURNING *`,
      [nome.trim(), descricao || null, JSON.stringify(normalizarPermissoes(permissoes)), req.params.id]
    );
    res.json({ ...rows[0], permissoes: normalizarPermissoes(rows[0].permissoes) });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Já existe um perfil com esse nome' });
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', exigePermissao('perfis', 'excluir'), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT is_admin FROM perfis WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Perfil não encontrado' });
    if (rows[0].is_admin) return res.status(400).json({ error: 'O perfil de administrador não pode ser excluído.' });

    const emUso = await pool.query('SELECT COUNT(*)::int AS n FROM usuarios WHERE perfil_id = $1', [req.params.id]);
    if (emUso.rows[0].n > 0) {
      return res.status(409).json({
        error: `Este perfil está em uso por ${emUso.rows[0].n} usuário(s). Mude o perfil deles antes de excluir.`,
      });
    }

    await pool.query('DELETE FROM perfis WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
