const express = require('express');
const { pool } = require('../db');
const router = express.Router();

// List with search + pagination + optional livro filter
router.get('/', async (req, res) => {
  try {
    const { search = '', page = 1, limit = 10, livro_id } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const like = `%${search}%`;

    const livroFilter = livro_id ? `AND livro_id = ${parseInt(livro_id)}` : '';

    const { rows } = await pool.query(
      `SELECT r.*, l.numero AS livro_numero, l.cartorio AS livro_cartorio
       FROM registros_nascimento r
       LEFT JOIN livros l ON l.id = r.livro_id
       WHERE (r.nome_completo ILIKE $1 OR r.nome_mae ILIKE $1 OR r.nome_pai ILIKE $1
          OR r.numero_termo ILIKE $1 OR CAST(r.ano AS TEXT) ILIKE $1)
       ${livroFilter}
       ORDER BY r.criado_em DESC
       LIMIT $2 OFFSET $3`,
      [like, parseInt(limit), offset]
    );
    const count = await pool.query(
      `SELECT COUNT(*) FROM registros_nascimento r
       WHERE (r.nome_completo ILIKE $1 OR r.nome_mae ILIKE $1 OR r.nome_pai ILIKE $1
          OR r.numero_termo ILIKE $1 OR CAST(r.ano AS TEXT) ILIKE $1)
       ${livroFilter}`,
      [like]
    );
    res.json({ rows, total: parseInt(count.rows[0].count), page: parseInt(page), limit: parseInt(limit) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Get one
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*, l.numero AS livro_numero, l.cartorio AS livro_cartorio
       FROM registros_nascimento r
       LEFT JOIN livros l ON l.id = r.livro_id
       WHERE r.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create
router.post('/', async (req, res) => {
  try {
    const f = req.body;
    const { rows } = await pool.query(
      `INSERT INTO registros_nascimento
        (livro_id, nome_completo, nome_mae, nome_pai, data_nascimento, ano, livro, folha,
         numero_termo, municipio, estado, confianca, observacoes, arquivo_path, arquivo_nome, arquivo_tipo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [f.livro_id ? parseInt(f.livro_id) : null,
       f.nome_completo, f.nome_mae, f.nome_pai, f.data_nascimento,
       f.ano ? parseInt(f.ano) : null, f.livro, f.folha, f.numero_termo,
       f.municipio, f.estado, f.confianca, f.observacoes,
       f.arquivo_path, f.arquivo_nome, f.arquivo_tipo]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Update
router.put('/:id', async (req, res) => {
  try {
    const f = req.body;
    const { rows } = await pool.query(
      `UPDATE registros_nascimento SET
        livro_id=$1, nome_completo=$2, nome_mae=$3, nome_pai=$4, data_nascimento=$5, ano=$6,
        livro=$7, folha=$8, numero_termo=$9, municipio=$10, estado=$11,
        confianca=$12, observacoes=$13, atualizado_em=NOW()
       WHERE id=$14 RETURNING *`,
      [f.livro_id ? parseInt(f.livro_id) : null,
       f.nome_completo, f.nome_mae, f.nome_pai, f.data_nascimento,
       f.ano ? parseInt(f.ano) : null, f.livro, f.folha, f.numero_termo,
       f.municipio, f.estado, f.confianca, f.observacoes, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM registros_nascimento WHERE id=$1 RETURNING arquivo_path', [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    if (rows[0].arquivo_path) {
      const fs = require('fs');
      try { fs.unlinkSync(rows[0].arquivo_path); } catch (_) {}
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
