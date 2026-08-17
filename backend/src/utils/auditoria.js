// Audit trail. Every entry is written fire-and-forget: logging must never be
// the reason a request fails, so errors here are swallowed and reported to the
// console only.

const { pool } = require('../db');

// Catalogue kept here so the filter dropdowns and the writers agree
const ACOES = [
  { id: 'login',            label: 'Login',                  grupo: 'Acesso' },
  { id: 'login_falhou',     label: 'Login recusado',         grupo: 'Acesso' },
  { id: 'logout',           label: 'Logout',                 grupo: 'Acesso' },
  { id: 'criar',            label: 'Criou registro',         grupo: 'Registros' },
  { id: 'editar',           label: 'Editou registro',        grupo: 'Registros' },
  { id: 'excluir',          label: 'Excluiu registro',       grupo: 'Registros' },
  { id: 'processar_ia',     label: 'Leitura com IA',         grupo: 'IA' },
  { id: 'erro_ia',          label: 'Erro na leitura com IA', grupo: 'IA' },
  { id: 'permissao_negada', label: 'Permissão negada',       grupo: 'Segurança' },
  { id: 'cota_atingida',    label: 'Limite de registros atingido', grupo: 'Segurança' },
  { id: 'config_alterada',  label: 'Configuração alterada',  grupo: 'Administração' },
];

const ACAO_IDS = ACOES.map(a => a.id);

// Behind nginx the real address is in x-forwarded-for
function ipDe(req) {
  const fwd = req?.headers?.['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim().slice(0, 60);
  return (req?.ip || req?.socket?.remoteAddress || '').slice(0, 60);
}

/**
 * Writes one audit entry. Never throws and never blocks the caller.
 *
 * The user's name is snapshotted alongside the id so the trail stays readable
 * after a user is deleted.
 */
function registrar(req, {
  acao,
  modulo = null,
  registro_id = null,
  descricao = null,
  detalhes = null,
  sucesso = true,
  usuario = null, // for events with no session yet (failed login)
}) {
  const ctx = usuario || req?.contexto || null;

  pool.query(
    `INSERT INTO auditoria
       (usuario_id, usuario_nome, usuario_email, acao, modulo, registro_id,
        descricao, detalhes, sucesso, ip, user_agent)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      ctx?.id ?? null,
      ctx?.nome ?? null,
      ctx?.email ?? null,
      acao,
      modulo,
      registro_id ?? null,
      descricao ?? null,
      detalhes ? JSON.stringify(detalhes) : null,
      sucesso !== false,
      ipDe(req),
      String(req?.headers?.['user-agent'] || '').slice(0, 300) || null,
    ]
  ).catch(e => console.error('[auditoria] falha ao gravar:', e.message));
}

// Short human-readable label for a record, so the trail says "Excluiu
// nascimento de João" instead of just an id.
function rotuloDoRegistro(modulo, row) {
  if (!row) return null;
  const nome = row.nome_completo || row.testador || row.vendedor || row.numero || null;
  return nome ? String(nome).slice(0, 200) : null;
}

module.exports = { registrar, ACOES, ACAO_IDS, rotuloDoRegistro };
