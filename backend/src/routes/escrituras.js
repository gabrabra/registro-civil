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

router.get('/', async (req, res) => {
  try {
    const { search = '', page = 1, limit = 10, livro_id } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const like = `%${search}%`;
    const livroFilter = livro_id ? `AND r.livro_id = ${parseInt(livro_id)}` : '';

    const { rows } = await pool.query(
      `SELECT r.*, l.numero AS livro_numero, l.cartorio AS livro_cartorio
       FROM registros_escritura r
       LEFT JOIN livros l ON l.id = r.livro_id
       WHERE (r.vendedor ILIKE $1 OR r.comprador ILIKE $1 OR r.municipio ILIKE $1
          OR r.endereco_imovel ILIKE $1 OR CAST(r.ano AS TEXT) ILIKE $1)
       ${livroFilter}
       ORDER BY r.criado_em DESC
       LIMIT $2 OFFSET $3`,
      [like, parseInt(limit), offset]
    );
    const count = await pool.query(
      `SELECT COUNT(*) FROM registros_escritura r
       WHERE (r.vendedor ILIKE $1 OR r.comprador ILIKE $1 OR r.municipio ILIKE $1
          OR r.endereco_imovel ILIKE $1 OR CAST(r.ano AS TEXT) ILIKE $1)
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
       FROM registros_escritura r
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
      `INSERT INTO registros_escritura
        (livro_id, vendedor, cpf_vendedor, comprador, cpf_comprador, data_escritura, ano,
         livro, folha, descricao_imovel, endereco_imovel, valor, tabeliao, cartorio,
         municipio, estado, confianca, observacoes, arquivo_path, arquivo_nome, arquivo_tipo, arquivo_url, campos_bbox)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
       RETURNING *`,
      [
        f.livro_id ? parseInt(f.livro_id) : null,
        f.vendedor, f.cpf_vendedor, f.comprador, f.cpf_comprador,
        f.data_escritura,
        f.ano ? parseInt(f.ano) : null,
        f.livro, f.folha, f.descricao_imovel, f.endereco_imovel,
        f.valor, f.tabeliao, f.cartorio,
        f.municipio, f.estado, f.confianca, f.observacoes,
        f.arquivo_path, f.arquivo_nome, f.arquivo_tipo,
        arquivoUrl,
        f.campos_bbox ? JSON.stringify(f.campos_bbox) : null,
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
      `UPDATE registros_escritura SET
        livro_id=$1, vendedor=$2, cpf_vendedor=$3, comprador=$4, cpf_comprador=$5,
        data_escritura=$6, ano=$7, livro=$8, folha=$9, descricao_imovel=$10,
        endereco_imovel=$11, valor=$12, tabeliao=$13, cartorio=$14,
        municipio=$15, estado=$16, confianca=$17, observacoes=$18, atualizado_em=NOW()
       WHERE id=$19 RETURNING *`,
      [
        f.livro_id ? parseInt(f.livro_id) : null,
        f.vendedor, f.cpf_vendedor, f.comprador, f.cpf_comprador,
        f.data_escritura,
        f.ano ? parseInt(f.ano) : null,
        f.livro, f.folha, f.descricao_imovel, f.endereco_imovel,
        f.valor, f.tabeliao, f.cartorio,
        f.municipio, f.estado, f.confianca, f.observacoes,
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
      'DELETE FROM registros_escritura WHERE id=$1 RETURNING arquivo_path', [req.params.id]
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
