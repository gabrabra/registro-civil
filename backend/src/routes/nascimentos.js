const express = require('express');
const path    = require('path');
const { pool } = require('../db');
const { locateFields } = require('../utils/imageLocalize');
const { getOllamaBase, getActiveModel } = require('../utils/runpod');
const { registrar } = require('../utils/auditoria');
const { exigePermissao, exigeCota } = require('../middleware/permissao');
const router = express.Router();

function addArquivoUrl(row) {
  if (!row) return row;
  if (!row.arquivo_url && row.arquivo_path) {
    row.arquivo_url = `/files/${path.basename(row.arquivo_path)}`;
  }
  return row;
}

// List with search + pagination + optional livro filter
router.get('/', exigePermissao('nascimento', 'ver'), async (req, res) => {
  try {
    const { search = '', page = 1, limit = 10, livro_id } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const like = `%${search}%`;
    const livroFilter = livro_id ? `AND r.livro_id = ${parseInt(livro_id)}` : '';

    const { rows } = await pool.query(
      `SELECT r.*, l.numero AS livro_numero, l.cartorio AS livro_cartorio
       FROM registros_nascimento r
       LEFT JOIN livros l ON l.id = r.livro_id
       WHERE (r.nome_completo ILIKE $1 OR r.nome_mae ILIKE $1 OR r.nome_pai ILIKE $1
          OR r.numero_termo ILIKE $1 OR CAST(r.ano AS TEXT) ILIKE $1
          OR r.transcricao_completa ILIKE $1)
       ${livroFilter}
       ORDER BY r.criado_em DESC
       LIMIT $2 OFFSET $3`,
      [like, parseInt(limit), offset]
    );
    const count = await pool.query(
      `SELECT COUNT(*) FROM registros_nascimento r
       WHERE (r.nome_completo ILIKE $1 OR r.nome_mae ILIKE $1 OR r.nome_pai ILIKE $1
          OR r.numero_termo ILIKE $1 OR CAST(r.ano AS TEXT) ILIKE $1
          OR r.transcricao_completa ILIKE $1)
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

// Get one
router.get('/:id', exigePermissao('nascimento', 'ver'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*, l.numero AS livro_numero, l.cartorio AS livro_cartorio
       FROM registros_nascimento r
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

// Create
router.post('/', exigePermissao('nascimento', 'criar'), exigeCota(), async (req, res) => {
  try {
    const f = req.body;
    const arquivoUrl = f.arquivo_url || (f.arquivo_path ? `/files/${path.basename(f.arquivo_path)}` : null);
    const { rows } = await pool.query(
      `INSERT INTO registros_nascimento
        (livro_id, nome_completo, nome_mae, nome_pai, data_nascimento, ano, livro, folha,
         numero_termo, municipio, estado, confianca, observacoes, transcricao_completa,
         arquivo_path, arquivo_nome, arquivo_tipo, arquivo_url, campos_bbox, criado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING *`,
      [
        f.livro_id ? parseInt(f.livro_id) : null,
        f.nome_completo, f.nome_mae, f.nome_pai, f.data_nascimento,
        f.ano ? parseInt(f.ano) : null, f.livro, f.folha, f.numero_termo,
        f.municipio, f.estado, f.confianca, f.observacoes,
        f.transcricao_completa || null,
        f.arquivo_path, f.arquivo_nome, f.arquivo_tipo,
        arquivoUrl,
        f.campos_bbox ? JSON.stringify(f.campos_bbox) : null,
        req.contexto.id,
      ]
    );
    registrar(req, { acao: 'criar', modulo: 'nascimento', registro_id: rows[0].id,
      descricao: `Criou nascimento` + (rows[0].nome_completo ? `: ${rows[0].nome_completo}` : '') });
    res.status(201).json(addArquivoUrl(rows[0]));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Update
router.put('/:id', exigePermissao('nascimento', 'editar'), async (req, res) => {
  try {
    const f = req.body;
    const { rows } = await pool.query(
      `UPDATE registros_nascimento SET
        livro_id=$1, nome_completo=$2, nome_mae=$3, nome_pai=$4, data_nascimento=$5, ano=$6,
        livro=$7, folha=$8, numero_termo=$9, municipio=$10, estado=$11,
        confianca=$12, observacoes=$13,
        transcricao_completa = CASE WHEN $14::boolean THEN $15::text ELSE transcricao_completa END,
        atualizado_em=NOW()
       WHERE id=$16 RETURNING *`,
      [
        f.livro_id ? parseInt(f.livro_id) : null,
        f.nome_completo, f.nome_mae, f.nome_pai, f.data_nascimento,
        f.ano ? parseInt(f.ano) : null, f.livro, f.folha, f.numero_termo,
        f.municipio, f.estado, f.confianca, f.observacoes,
        // Only touch the transcription when the client actually sent the field,
        // so a form that omits it does not wipe the stored page text
        Object.hasOwn(f, 'transcricao_completa'),
        f.transcricao_completa || null,
        req.params.id,
      ]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    registrar(req, { acao: 'editar', modulo: 'nascimento', registro_id: rows[0].id,
      descricao: `Editou nascimento` + (rows[0].nome_completo ? `: ${rows[0].nome_completo}` : '') });
    res.json(addArquivoUrl(rows[0]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete
router.delete('/:id', exigePermissao('nascimento', 'excluir'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM registros_nascimento WHERE id=$1 RETURNING arquivo_path, nome_completo', [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    if (rows[0].arquivo_path) {
      const fs = require('fs');
      try { require('fs').unlinkSync(rows[0].arquivo_path); } catch (_) {}
    }
    registrar(req, { acao: 'excluir', modulo: 'nascimento', registro_id: Number(req.params.id),
      descricao: `Excluiu nascimento` + (rows[0].nome_completo ? `: ${rows[0].nome_completo}` : '') });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Localize fields in image — calls AI to get bounding boxes
router.post('/:id/localizar', exigePermissao('nascimento', 'editar'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM registros_nascimento WHERE id = $1', [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });

    const record = rows[0];
    if (!record.arquivo_path) return res.status(400).json({ error: 'Registro sem imagem associada' });

    const isPdf = (record.arquivo_tipo || '').includes('pdf');
    if (isPdf) return res.status(400).json({ error: 'Localização não disponível para PDFs' });

    const modelName = getActiveModel();

    console.log(`[localizar] id=${record.id} model=${modelName}`);
    const bbox = await locateFields(record.arquivo_path, record, getOllamaBase(), modelName);

    if (!bbox) {
      return res.status(422).json({ error: 'Não foi possível localizar os campos. Tente novamente ou verifique se o Ollama está ativo.' });
    }

    await pool.query(
      'UPDATE registros_nascimento SET campos_bbox = $1 WHERE id = $2',
      [JSON.stringify(bbox), record.id]
    );

    res.json({ ok: true, campos_bbox: bbox, model_used: modelName });
  } catch (e) {
    console.error('[localizar]', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
