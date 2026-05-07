const express = require('express');
const { pool } = require('../db');
const router = express.Router();

const SELECT = `
  SELECT l.*,
    COUNT(r.id)::integer AS total_digitalizados,
    CASE WHEN l.termo_fim IS NOT NULL AND l.termo_inicio IS NOT NULL
         THEN (l.termo_fim - l.termo_inicio + 1) ELSE NULL END AS total_esperado
  FROM livros l
  LEFT JOIN registros_nascimento r ON r.livro_id = l.id
`;

// List all
router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query(`${SELECT} GROUP BY l.id ORDER BY l.estado, l.municipio, l.numero`);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get one
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`${SELECT} WHERE l.id = $1 GROUP BY l.id`, [req.params.id]);
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
      `INSERT INTO livros (numero, cartorio, cnpj, cns, termo_inicio, termo_fim, data_inicio, data_fim, municipio, estado, descricao)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [f.numero, f.cartorio, f.cnpj || null, f.cns || null,
       f.termo_inicio ? parseInt(f.termo_inicio) : null,
       f.termo_fim    ? parseInt(f.termo_fim)    : null,
       f.data_inicio  || null, f.data_fim || null,
       f.municipio || null, f.estado || null, f.descricao || null]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update
router.put('/:id', async (req, res) => {
  try {
    const f = req.body;
    const { rows } = await pool.query(
      `UPDATE livros SET numero=$1, cartorio=$2, cnpj=$3, cns=$4,
         termo_inicio=$5, termo_fim=$6, data_inicio=$7, data_fim=$8,
         municipio=$9, estado=$10, descricao=$11
       WHERE id=$12 RETURNING *`,
      [f.numero, f.cartorio, f.cnpj || null, f.cns || null,
       f.termo_inicio ? parseInt(f.termo_inicio) : null,
       f.termo_fim    ? parseInt(f.termo_fim)    : null,
       f.data_inicio  || null, f.data_fim || null,
       f.municipio || null, f.estado || null, f.descricao || null,
       req.params.id]
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
    const { rows } = await pool.query('DELETE FROM livros WHERE id=$1 RETURNING id', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
