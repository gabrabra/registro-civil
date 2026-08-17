const express = require('express');
const path    = require('path');
const { pool } = require('../db');
const router  = express.Router();

function addArquivoUrl(row) {
  if (!row) return row;
  if (!row.arquivo_url && row.arquivo_path) {
    row.arquivo_url = `/files/${path.basename(row.arquivo_path)}`;
  }
  return row;
}

// List with search + pagination + optional livro filter
router.get('/', async (req, res) => {
  try {
    const { search = '', page = 1, limit = 10, livro_id } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const like = `%${search}%`;
    const livroFilter = livro_id ? `AND r.livro_id = ${parseInt(livro_id)}` : '';

    const { rows } = await pool.query(
      `SELECT r.*, l.numero AS livro_numero, l.cartorio AS livro_cartorio
       FROM registros_testamento r
       LEFT JOIN livros l ON l.id = r.livro_id
       WHERE (r.testador ILIKE $1 OR r.tabeliao ILIKE $1 OR r.municipio ILIKE $1
          OR CAST(r.ano AS TEXT) ILIKE $1 OR r.transcricao_completa ILIKE $1)
       ${livroFilter}
       ORDER BY r.criado_em DESC
       LIMIT $2 OFFSET $3`,
      [like, parseInt(limit), offset]
    );
    const count = await pool.query(
      `SELECT COUNT(*) FROM registros_testamento r
       WHERE (r.testador ILIKE $1 OR r.tabeliao ILIKE $1 OR r.municipio ILIKE $1
          OR CAST(r.ano AS TEXT) ILIKE $1 OR r.transcricao_completa ILIKE $1)
       ${livroFilter}`,
      [like]
    );
    res.json({
      rows: rows.map(addArquivoUrl),
      total: parseInt(count.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*, l.numero AS livro_numero, l.cartorio AS livro_cartorio
       FROM registros_testamento r
       LEFT JOIN livros l ON l.id = r.livro_id
       WHERE r.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(addArquivoUrl(rows[0]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const f = req.body;
    const arquivoUrl = f.arquivo_url || (f.arquivo_path ? `/files/${path.basename(f.arquivo_path)}` : null);
    const { rows } = await pool.query(
      `INSERT INTO registros_testamento
        (livro_id, testador, data_testamento, ano, livro, folha, tabeliao, testemunhas,
         municipio, estado, confianca, observacoes, transcricao_completa,
         arquivo_path, arquivo_nome, arquivo_tipo, arquivo_url, campos_bbox, arquivos_urls)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [
        f.livro_id ? parseInt(f.livro_id) : null,
        f.testador, f.data_testamento,
        f.ano ? parseInt(f.ano) : null,
        f.livro, f.folha, f.tabeliao, f.testemunhas,
        f.municipio, f.estado, f.confianca, f.observacoes,
        f.transcricao_completa || null,
        f.arquivo_path, f.arquivo_nome, f.arquivo_tipo,
        arquivoUrl,
        f.campos_bbox ? JSON.stringify(f.campos_bbox) : null,
        f.arquivos_urls ? JSON.stringify(f.arquivos_urls) : null,
      ]
    );
    res.status(201).json(addArquivoUrl(rows[0]));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const f = req.body;
    const { rows } = await pool.query(
      `UPDATE registros_testamento SET
        livro_id=$1, testador=$2, data_testamento=$3, ano=$4, livro=$5, folha=$6,
        tabeliao=$7, testemunhas=$8, municipio=$9, estado=$10,
        confianca=$11, observacoes=$12,
        transcricao_completa = CASE WHEN $13::boolean THEN $14::text ELSE transcricao_completa END,
        atualizado_em=NOW()
       WHERE id=$15 RETURNING *`,
      [
        f.livro_id ? parseInt(f.livro_id) : null,
        f.testador, f.data_testamento,
        f.ano ? parseInt(f.ano) : null,
        f.livro, f.folha, f.tabeliao, f.testemunhas,
        f.municipio, f.estado, f.confianca, f.observacoes,
        Object.hasOwn(f, 'transcricao_completa'),
        f.transcricao_completa || null,
        req.params.id,
      ]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(addArquivoUrl(rows[0]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM registros_testamento WHERE id=$1 RETURNING arquivo_path', [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    if (rows[0].arquivo_path) {
      try { require('fs').unlinkSync(rows[0].arquivo_path); } catch (_) {}
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
