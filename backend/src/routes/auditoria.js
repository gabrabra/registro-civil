const express = require('express');
const { pool } = require('../db');
const { exigePermissao } = require('../middleware/permissao');
const { ACOES, ACAO_IDS } = require('../utils/auditoria');
const { MODULOS } = require('../utils/permissoes');
const router = express.Router();

// Filter options for the UI
router.get('/catalogo', exigePermissao('auditoria', 'ver'), async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT usuario_id AS id, usuario_nome AS nome
         FROM auditoria WHERE usuario_id IS NOT NULL ORDER BY usuario_nome`
    );
    res.json({ acoes: ACOES, modulos: MODULOS, usuarios: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Per-user activity summary — "quantos registros cada um fez"
router.get('/resumo', exigePermissao('auditoria', 'ver'), async (req, res) => {
  const dias = Math.min(365, Math.max(1, parseInt(req.query.dias, 10) || 30));
  try {
    const { rows } = await pool.query(
      `SELECT
         u.id,
         u.nome,
         u.email,
         u.ativo,
         p.nome AS perfil_nome,
         u.limite_registros,
         COUNT(*) FILTER (WHERE a.acao = 'criar')        ::int AS criados,
         COUNT(*) FILTER (WHERE a.acao = 'editar')       ::int AS editados,
         COUNT(*) FILTER (WHERE a.acao = 'excluir')      ::int AS excluidos,
         COUNT(*) FILTER (WHERE a.acao = 'processar_ia') ::int AS leituras_ia,
         COUNT(*) FILTER (WHERE a.acao = 'erro_ia')      ::int AS erros_ia,
         COUNT(*) FILTER (WHERE a.acao = 'login')        ::int AS logins,
         COUNT(*) FILTER (WHERE a.acao = 'login_falhou') ::int AS logins_falhos,
         MAX(a.criado_em) FILTER (WHERE a.acao = 'login') AS ultimo_login,
         MAX(a.criado_em) AS ultima_atividade
       FROM usuarios u
       LEFT JOIN perfis p ON p.id = u.perfil_id
       LEFT JOIN auditoria a
              ON a.usuario_id = u.id
             AND a.criado_em >= NOW() - ($1 || ' days')::interval
       GROUP BY u.id, u.nome, u.email, u.ativo, p.nome, u.limite_registros
       ORDER BY criados DESC, u.nome`,
      [String(dias)]
    );
    res.json({ dias, usuarios: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Paginated, filterable trail
router.get('/', exigePermissao('auditoria', 'ver'), async (req, res) => {
  const { usuario_id, acao, modulo, sucesso, busca = '', de, ate } = req.query;
  const page  = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const offset = (page - 1) * limit;

  const cond = [];
  const params = [];

  // Appends one condition; `montar` receives the placeholder it should use.
  const filtrar = (valor, montar) => {
    params.push(valor);
    cond.push(montar(`$${params.length}`));
  };

  if (usuario_id)                      filtrar(parseInt(usuario_id, 10), p => `a.usuario_id = ${p}`);
  if (acao && ACAO_IDS.includes(acao)) filtrar(acao,   p => `a.acao = ${p}`);
  if (modulo)                          filtrar(modulo, p => `a.modulo = ${p}`);
  if (de)                              filtrar(de,     p => `a.criado_em >= ${p}::date`);
  if (ate)                             filtrar(ate,    p => `a.criado_em < (${p}::date + 1)`);
  if (String(busca).trim()) {
    filtrar(`%${String(busca).trim()}%`,
      p => `(a.descricao ILIKE ${p} OR a.usuario_nome ILIKE ${p} OR a.usuario_email ILIKE ${p})`);
  }
  if (sucesso === 'true')  cond.push('a.sucesso = TRUE');
  if (sucesso === 'false') cond.push('a.sucesso = FALSE');

  const whereSql = cond.length ? `WHERE ${cond.join(' AND ')}` : '';

  try {
    const { rows } = await pool.query(
      `SELECT a.* FROM auditoria a ${whereSql}
       ORDER BY a.criado_em DESC, a.id DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    const total = await pool.query(`SELECT COUNT(*)::int AS n FROM auditoria a ${whereSql}`, params);
    res.json({ rows, total: total.rows[0].n, page, limit });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
