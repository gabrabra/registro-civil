import { useState, useEffect, useCallback } from 'react';
import {
  Search, X, ChevronLeft, ChevronRight, LogIn, LogOut, ShieldAlert, Ban,
  FilePlus, FilePenLine, FileX, Sparkles, TriangleAlert, Settings, Activity, ChevronDown,
} from 'lucide-react';
import { auditoriaApi } from '../../api.js';

const ICONES = {
  login:            { Icon: LogIn,        cor: 'text-green-600 bg-green-50' },
  logout:           { Icon: LogOut,       cor: 'text-slate-500 bg-slate-100' },
  login_falhou:     { Icon: ShieldAlert,  cor: 'text-red-600 bg-red-50' },
  criar:            { Icon: FilePlus,     cor: 'text-blue-600 bg-blue-50' },
  editar:           { Icon: FilePenLine,  cor: 'text-amber-600 bg-amber-50' },
  excluir:          { Icon: FileX,        cor: 'text-red-600 bg-red-50' },
  processar_ia:     { Icon: Sparkles,     cor: 'text-violet-600 bg-violet-50' },
  erro_ia:          { Icon: TriangleAlert, cor: 'text-red-600 bg-red-50' },
  permissao_negada: { Icon: Ban,          cor: 'text-red-600 bg-red-50' },
  cota_atingida:    { Icon: Ban,          cor: 'text-amber-600 bg-amber-50' },
  config_alterada:  { Icon: Settings,     cor: 'text-slate-600 bg-slate-100' },
};

function quando(iso) {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function Linha({ e }) {
  const [aberto, setAberto] = useState(false);
  const { Icon, cor } = ICONES[e.acao] || { Icon: Activity, cor: 'text-slate-500 bg-slate-100' };
  const temDetalhes = e.detalhes && Object.keys(e.detalhes).length > 0;

  return (
    <>
      <tr className={`border-b border-slate-100 ${e.sucesso ? '' : 'bg-red-50/40'}`}>
        <td className="px-4 py-3 whitespace-nowrap text-slate-500 text-xs align-top">{quando(e.criado_em)}</td>
        <td className="px-4 py-3 align-top">
          <div className="flex items-start gap-2.5">
            <span className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${cor}`}>
              <Icon className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <p className="text-slate-800">{e.descricao || e.acao}</p>
              {temDetalhes && (
                <button type="button" onClick={() => setAberto(a => !a)}
                  className="mt-0.5 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
                  <ChevronDown className={`w-3 h-3 transition-transform ${aberto ? 'rotate-180' : ''}`} />
                  detalhes
                </button>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-3 align-top">
          <p className="text-slate-700">{e.usuario_nome || <span className="text-slate-400 italic">—</span>}</p>
          {e.usuario_email && <p className="text-xs text-slate-400">{e.usuario_email}</p>}
        </td>
        <td className="px-4 py-3 align-top text-slate-500 text-xs">{e.modulo || '—'}</td>
        <td className="px-4 py-3 align-top text-slate-400 text-xs font-mono">{e.ip || '—'}</td>
      </tr>
      {aberto && (
        <tr className="border-b border-slate-100 bg-slate-50">
          <td />
          <td colSpan={4} className="px-4 py-3">
            <pre className="text-xs text-slate-600 whitespace-pre-wrap break-all font-mono">
              {JSON.stringify(e.detalhes, null, 2)}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}

function Resumo({ dias, onDias }) {
  const [dados, setDados] = useState(null);

  useEffect(() => {
    auditoriaApi.resumo(dias).then(setDados).catch(() => setDados(null));
  }, [dias]);

  if (!dados) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-5 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 bg-slate-50 border-b border-slate-200">
        <h2 className="text-sm font-semibold text-slate-700">Atividade por usuário</h2>
        <select value={dias} onChange={e => onDias(Number(e.target.value))}
          className="text-xs border border-slate-300 rounded-lg px-2 py-1 bg-white">
          <option value={7}>últimos 7 dias</option>
          <option value={30}>últimos 30 dias</option>
          <option value={90}>últimos 90 dias</option>
          <option value={365}>último ano</option>
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs">
              <th className="text-left px-5 py-2.5 font-medium text-slate-600">Usuário</th>
              <th className="px-3 py-2.5 font-medium text-slate-600 text-center">Criou</th>
              <th className="px-3 py-2.5 font-medium text-slate-600 text-center">Editou</th>
              <th className="px-3 py-2.5 font-medium text-slate-600 text-center">Excluiu</th>
              <th className="px-3 py-2.5 font-medium text-slate-600 text-center">Leituras IA</th>
              <th className="px-3 py-2.5 font-medium text-slate-600 text-center">Erros IA</th>
              <th className="px-3 py-2.5 font-medium text-slate-600 text-center">Logins</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600">Último acesso</th>
            </tr>
          </thead>
          <tbody>
            {dados.usuarios.map(u => (
              <tr key={u.id} className="border-b border-slate-100">
                <td className="px-5 py-2.5">
                  <p className="text-slate-800">{u.nome}{!u.ativo && <span className="ml-1.5 text-xs text-slate-400">(desativado)</span>}</p>
                  <p className="text-xs text-slate-400">
                    {u.perfil_nome || 'sem perfil'}
                    {u.limite_registros !== null && ` · limite ${u.limite_registros}`}
                  </p>
                </td>
                <td className="px-3 py-2.5 text-center font-medium text-slate-800">{u.criados}</td>
                <td className="px-3 py-2.5 text-center text-slate-600">{u.editados}</td>
                <td className="px-3 py-2.5 text-center text-slate-600">{u.excluidos}</td>
                <td className="px-3 py-2.5 text-center text-slate-600">{u.leituras_ia}</td>
                <td className={`px-3 py-2.5 text-center ${u.erros_ia > 0 ? 'text-red-600 font-medium' : 'text-slate-400'}`}>
                  {u.erros_ia}
                </td>
                <td className="px-3 py-2.5 text-center text-slate-600">
                  {u.logins}
                  {u.logins_falhos > 0 && <span className="text-red-500 text-xs ml-1">({u.logins_falhos} falhos)</span>}
                </td>
                <td className="px-4 py-2.5 text-xs text-slate-500">
                  {u.ultimo_login ? quando(u.ultimo_login) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AuditoriaList() {
  const [catalogo, setCatalogo] = useState({ acoes: [], modulos: [], usuarios: [] });
  const [dados,    setDados]    = useState({ rows: [], total: 0 });
  const [loading,  setLoading]  = useState(true);
  const [page,     setPage]     = useState(1);
  const [dias,     setDias]     = useState(30);
  const [filtro,   setFiltro]   = useState({ usuario_id: '', acao: '', modulo: '', sucesso: '', busca: '', de: '', ate: '' });

  const limit = 50;

  useEffect(() => { auditoriaApi.catalogo().then(setCatalogo).catch(() => {}); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit };
      for (const [k, v] of Object.entries(filtro)) if (v) params[k] = v;
      setDados(await auditoriaApi.list(params));
    } catch {
      setDados({ rows: [], total: 0 });
    } finally {
      setLoading(false);
    }
  }, [page, filtro]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [filtro]);

  const set = (k, v) => setFiltro(f => ({ ...f, [k]: v }));
  const limpar = () => setFiltro({ usuario_id: '', acao: '', modulo: '', sucesso: '', busca: '', de: '', ate: '' });
  const temFiltro = Object.values(filtro).some(Boolean);
  const totalPages = Math.ceil(dados.total / limit);
  const campo = 'text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300';

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Registro de Atividades</h1>
        <p className="text-sm text-slate-500">Tudo que acontece no sistema: acessos, registros, leituras com IA e bloqueios</p>
      </div>

      <Resumo dias={dias} onDias={setDias} />

      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[14rem]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={filtro.busca} onChange={e => set('busca', e.target.value)}
              placeholder="Buscar na descrição ou por usuário..."
              className={`${campo} w-full pl-9`} />
          </div>

          <select value={filtro.usuario_id} onChange={e => set('usuario_id', e.target.value)} className={campo}>
            <option value="">Todos os usuários</option>
            {catalogo.usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>

          <select value={filtro.acao} onChange={e => set('acao', e.target.value)} className={campo}>
            <option value="">Todas as ações</option>
            {catalogo.acoes.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>

          <select value={filtro.modulo} onChange={e => set('modulo', e.target.value)} className={campo}>
            <option value="">Todos os módulos</option>
            {catalogo.modulos.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>

          <select value={filtro.sucesso} onChange={e => set('sucesso', e.target.value)} className={campo}>
            <option value="">Sucesso e falha</option>
            <option value="true">Só sucesso</option>
            <option value="false">Só falhas</option>
          </select>

          <input type="date" value={filtro.de} onChange={e => set('de', e.target.value)} className={campo} title="De" />
          <input type="date" value={filtro.ate} onChange={e => set('ate', e.target.value)} className={campo} title="Até" />

          {temFiltro && (
            <button onClick={limpar} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 px-2">
              <X className="w-4 h-4" /> Limpar
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs">
                <th className="text-left px-4 py-3 font-semibold text-slate-600 w-32">Quando</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">O que aconteceu</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 w-52">Quem</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 w-28">Módulo</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 w-32">IP</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5} className="text-center py-12 text-slate-400">Carregando...</td></tr>}
              {!loading && dados.rows.length === 0 && (
                <tr><td colSpan={5} className="text-center py-12 text-slate-400">
                  {temFiltro ? 'Nenhuma atividade com esses filtros' : 'Nenhuma atividade registrada ainda'}
                </td></tr>
              )}
              {dados.rows.map(e => <Linha key={e.id} e={e} />)}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 bg-slate-50">
            <span className="text-xs text-slate-500">
              {dados.total.toLocaleString('pt-BR')} evento{dados.total !== 1 ? 's' : ''} · página {page} de {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 rounded text-slate-500 hover:bg-white disabled:opacity-30">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className="p-1.5 rounded text-slate-500 hover:bg-white disabled:opacity-30">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
