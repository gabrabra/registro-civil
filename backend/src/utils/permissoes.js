// Single source of truth for what can be protected and how.
// Both the API guards and the profile editor read from here, so adding a
// module or an action means changing one list.

const MODULOS = [
  { id: 'livros',        label: 'Estante de Livros',  grupo: 'Acervo' },
  { id: 'nascimento',    label: 'Nascimentos',        grupo: 'Registro Civil' },
  { id: 'obito',         label: 'Óbitos',             grupo: 'Registro Civil' },
  { id: 'casamento',     label: 'Casamentos',         grupo: 'Registro Civil' },
  { id: 'testamento',    label: 'Testamentos',        grupo: 'Registro Civil' },
  { id: 'escritura',     label: 'Compra e Venda',     grupo: 'Registro de Imóveis' },
  { id: 'usuarios',      label: 'Usuários',           grupo: 'Administração' },
  { id: 'perfis',        label: 'Perfis de Acesso',   grupo: 'Administração' },
  { id: 'auditoria',     label: 'Registro de Atividades', grupo: 'Administração' },
  { id: 'configuracoes', label: 'Configurações',      grupo: 'Administração' },
];

const ACOES = [
  { id: 'ver',     label: 'Ver' },
  { id: 'criar',   label: 'Criar' },
  { id: 'editar',  label: 'Editar' },
  { id: 'excluir', label: 'Excluir' },
];

const MODULO_IDS = MODULOS.map(m => m.id);
const ACAO_IDS   = ACOES.map(a => a.id);

// Modules that hold records subject to a user's creation quota
const MODULOS_COM_REGISTRO = ['nascimento', 'obito', 'casamento', 'testamento', 'escritura'];

function matrizVazia() {
  return Object.fromEntries(
    MODULO_IDS.map(m => [m, Object.fromEntries(ACAO_IDS.map(a => [a, false]))])
  );
}

// Drops unknown modules/actions and coerces everything to booleans, so a
// hand-edited or outdated stored value can never widen access.
function normalizarPermissoes(bruto) {
  const base = matrizVazia();
  if (!bruto || typeof bruto !== 'object') return base;

  for (const modulo of MODULO_IDS) {
    const entrada = bruto[modulo];
    if (!entrada || typeof entrada !== 'object') continue;
    for (const acao of ACAO_IDS) {
      base[modulo][acao] = entrada[acao] === true;
    }
  }
  return base;
}

// `is_admin` profiles bypass the matrix entirely — this keeps an administrator
// from locking everyone out with a bad checkbox.
function temPermissao(perfil, modulo, acao) {
  if (!perfil) return false;
  if (perfil.is_admin) return true;
  return normalizarPermissoes(perfil.permissoes)?.[modulo]?.[acao] === true;
}

function permissoesDeTodosOsModulos(valor) {
  return Object.fromEntries(
    MODULO_IDS.map(m => [m, Object.fromEntries(ACAO_IDS.map(a => [a, valor]))])
  );
}

// Seeded profiles. Administrator bypasses the matrix; Cartório works the
// records but cannot reach user, profile, or system settings.
const PERFIS_PADRAO = [
  {
    nome: 'Administrador',
    descricao: 'Acesso total ao sistema, incluindo usuários, perfis e configurações.',
    is_admin: true,
    permissoes: permissoesDeTodosOsModulos(true),
  },
  {
    nome: 'Cartório',
    descricao: 'Opera os registros do acervo. Não acessa usuários, perfis nem configurações.',
    is_admin: false,
    permissoes: (() => {
      const p = matrizVazia();
      for (const m of ['livros', ...MODULOS_COM_REGISTRO]) {
        p[m] = { ver: true, criar: true, editar: true, excluir: false };
      }
      return p;
    })(),
  },
];

module.exports = {
  MODULOS,
  ACOES,
  MODULO_IDS,
  ACAO_IDS,
  MODULOS_COM_REGISTRO,
  matrizVazia,
  normalizarPermissoes,
  temPermissao,
  PERFIS_PADRAO,
};
