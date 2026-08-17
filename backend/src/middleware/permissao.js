const { pool, TABELAS_DE_REGISTRO } = require('../db');
const { temPermissao, normalizarPermissoes } = require('../utils/permissoes');
const { registrar } = require('../utils/auditoria');

// The JWT carries only the user id — profile and quota are read fresh on every
// request so revoking access takes effect immediately instead of when the
// token expires.
async function carregarContexto(userId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.nome, u.email, u.ativo, u.limite_registros, u.perfil_id,
            p.nome AS perfil_nome, p.is_admin, p.permissoes
       FROM usuarios u
       LEFT JOIN perfis p ON p.id = u.perfil_id
      WHERE u.id = $1`,
    [userId]
  );
  if (!rows.length) return null;

  const r = rows[0];
  return {
    id: r.id,
    nome: r.nome,
    email: r.email,
    ativo: r.ativo !== false,
    limite_registros: r.limite_registros,
    perfil: r.perfil_id
      ? {
          id: r.perfil_id,
          nome: r.perfil_nome,
          is_admin: r.is_admin === true,
          permissoes: normalizarPermissoes(r.permissoes),
        }
      : null,
  };
}

// Attaches req.contexto. Must run after `auth`.
async function comContexto(req, res, next) {
  try {
    const ctx = await carregarContexto(req.user?.id);
    if (!ctx) return res.status(401).json({ error: 'Usuário não encontrado' });
    if (!ctx.ativo) return res.status(403).json({ error: 'Usuário desativado' });
    req.contexto = ctx;
    next();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

function exigePermissao(modulo, acao) {
  return (req, res, next) => {
    if (!req.contexto) return res.status(500).json({ error: 'Contexto não carregado' });
    if (temPermissao(req.contexto.perfil, modulo, acao)) return next();

    const nome = req.contexto.perfil?.nome || 'sem perfil';
    // Denials are worth recording — they show misconfigured profiles and
    // attempts to reach areas a user shouldn't
    registrar(req, {
      acao: 'permissao_negada',
      modulo,
      sucesso: false,
      descricao: `Tentou ${acao} em ${modulo}`,
      detalhes: { acao_tentada: acao, perfil: nome, rota: req.originalUrl, metodo: req.method },
    });

    return res.status(403).json({
      error: `Seu perfil (${nome}) não tem permissão para ${acao} em ${modulo}.`,
      modulo,
      acao,
    });
  };
}

// How many records this user has created across every record table
async function contarRegistrosDoUsuario(userId) {
  const partes = Object.values(TABELAS_DE_REGISTRO)
    .map(t => `SELECT COUNT(*)::int AS n FROM ${t} WHERE criado_por = $1`)
    .join(' UNION ALL ');
  const { rows } = await pool.query(`SELECT COALESCE(SUM(n), 0)::int AS total FROM (${partes}) x`, [userId]);
  return rows[0]?.total ?? 0;
}

// Blocks creation once the user reaches their quota. Admins are exempt, and a
// null limit means unlimited.
function exigeCota() {
  return async (req, res, next) => {
    const ctx = req.contexto;
    if (!ctx) return res.status(500).json({ error: 'Contexto não carregado' });
    if (ctx.perfil?.is_admin) return next();

    const limite = ctx.limite_registros;
    if (limite === null || limite === undefined) return next();

    try {
      const usados = await contarRegistrosDoUsuario(ctx.id);
      if (usados >= limite) {
        registrar(req, {
          acao: 'cota_atingida',
          sucesso: false,
          descricao: `Bloqueado ao tentar criar: ${usados} de ${limite} registros usados`,
          detalhes: { usados, limite, rota: req.originalUrl },
        });
        return res.status(403).json({
          error: `Limite de registros atingido (${usados} de ${limite}). Peça a um administrador para aumentar seu limite.`,
          limite,
          usados,
        });
      }
      next();
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  };
}

module.exports = { comContexto, exigePermissao, exigeCota, carregarContexto, contarRegistrosDoUsuario };
