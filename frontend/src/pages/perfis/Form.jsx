import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Save, Loader2, ShieldCheck } from 'lucide-react';
import { perfisApi } from '../../api.js';

export default function PerfisForm() {
  const { id }     = useParams();
  const navigate   = useNavigate();
  const isEdit     = Boolean(id);

  const [catalogo,   setCatalogo]   = useState({ modulos: [], acoes: [] });
  const [nome,       setNome]       = useState('');
  const [descricao,  setDescricao]  = useState('');
  const [permissoes, setPermissoes] = useState({});
  const [isAdmin,    setIsAdmin]    = useState(false);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [erro,       setErro]       = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const cat = await perfisApi.catalogo();
        setCatalogo(cat);
        if (isEdit) {
          const p = await perfisApi.get(id);
          setNome(p.nome);
          setDescricao(p.descricao || '');
          setPermissoes(p.permissoes || cat.matrizVazia);
          setIsAdmin(p.is_admin === true);
        } else {
          setPermissoes(cat.matrizVazia);
        }
      } catch (e) {
        setErro(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isEdit]);

  function alternar(modulo, acao) {
    setPermissoes(p => {
      const atual = p[modulo]?.[acao] === true;
      const novo = { ...p, [modulo]: { ...p[modulo], [acao]: !atual } };
      // Any action implies being able to see the module — otherwise the user
      // would hold a permission they can never reach in the UI.
      if (!atual && acao !== 'ver') novo[modulo].ver = true;
      // Dropping "ver" drops everything else with it
      if (atual && acao === 'ver') {
        for (const a of catalogo.acoes) novo[modulo][a.id] = false;
      }
      return novo;
    });
  }

  function alternarModulo(modulo) {
    setPermissoes(p => {
      const todos = catalogo.acoes.every(a => p[modulo]?.[a.id] === true);
      return { ...p, [modulo]: Object.fromEntries(catalogo.acoes.map(a => [a.id, !todos])) };
    });
  }

  async function salvar(e) {
    e.preventDefault();
    setErro(null);
    if (!nome.trim()) { setErro('Informe o nome do perfil'); return; }

    setSaving(true);
    try {
      const payload = { nome: nome.trim(), descricao: descricao.trim() || null, permissoes };
      if (isEdit) await perfisApi.update(id, payload);
      else        await perfisApi.create(payload);
      navigate('/configuracoes/perfis');
    } catch (e2) {
      setErro(e2.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="max-w-4xl mx-auto py-12 text-center text-slate-400">Carregando...</div>;

  // Group modules the same way the sidebar does, so the matrix reads like the app
  const grupos = catalogo.modulos.reduce((acc, m) => {
    (acc[m.grupo] ||= []).push(m);
    return acc;
  }, {});

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/configuracoes/perfis')}
          className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{isEdit ? 'Editar Perfil' : 'Novo Perfil'}</h1>
          <p className="text-sm text-slate-500">Marque o que este perfil pode fazer em cada módulo</p>
        </div>
      </div>

      {isAdmin && (
        <div className="mb-5 flex items-start gap-3 px-4 py-3 rounded-lg border border-violet-200 bg-violet-50">
          <ShieldCheck className="w-5 h-5 text-violet-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-violet-900">
            Este é o perfil de <strong>administrador</strong>. Ele tem acesso total por definição e suas
            permissões não podem ser alteradas — assim ninguém fica trancado para fora do sistema.
          </p>
        </div>
      )}

      {erro && (
        <div className="mb-5 px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">{erro}</div>
      )}

      <form onSubmit={salvar} className="space-y-5">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div>
            <label htmlFor="nome" className="block text-xs font-medium text-slate-600 mb-1">
              Nome do perfil <span className="text-red-500">*</span>
            </label>
            <input id="nome" value={nome} onChange={e => setNome(e.target.value)} disabled={isAdmin}
              placeholder="ex: Escrevente, Auxiliar, Consulta"
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-slate-50 disabled:text-slate-500" />
          </div>
          <div>
            <label htmlFor="descricao" className="block text-xs font-medium text-slate-600 mb-1">Descrição</label>
            <textarea id="descricao" rows={2} value={descricao} onChange={e => setDescricao(e.target.value)} disabled={isAdmin}
              placeholder="Para que serve este perfil"
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-slate-50 disabled:text-slate-500" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-700">Permissões por módulo</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Marcar Criar, Editar ou Excluir liga o Ver automaticamente — sem ver a tela não há como usar a ação.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-white">
                  <th className="text-left px-5 py-2.5 font-medium text-slate-600">Módulo</th>
                  {catalogo.acoes.map(a => (
                    <th key={a.id} className="px-3 py-2.5 font-medium text-slate-600 w-24 text-center">{a.label}</th>
                  ))}
                  <th className="px-4 py-2.5 w-20" />
                </tr>
              </thead>
              <tbody>
                {Object.entries(grupos).map(([grupo, modulos]) => (
                  <>
                    <tr key={grupo} className="bg-slate-50/70">
                      <td colSpan={catalogo.acoes.length + 2}
                        className="px-5 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        {grupo}
                      </td>
                    </tr>
                    {modulos.map(m => (
                      <tr key={m.id} className="border-b border-slate-100">
                        <td className="px-5 py-2.5 text-slate-800">{m.label}</td>
                        {catalogo.acoes.map(a => (
                          <td key={a.id} className="px-3 py-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={permissoes[m.id]?.[a.id] === true || isAdmin}
                              onChange={() => alternar(m.id, a.id)}
                              disabled={isAdmin}
                              aria-label={`${a.label} em ${m.label}`}
                              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-400 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                            />
                          </td>
                        ))}
                        <td className="px-4 py-2.5 text-right">
                          {!isAdmin && (
                            <button type="button" onClick={() => alternarModulo(m.id)}
                              className="text-xs text-blue-600 hover:text-blue-800">
                              tudo
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pb-6">
          <button type="button" onClick={() => navigate('/configuracoes/perfis')}
            className="px-5 py-2.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={saving || isAdmin}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-sm font-medium transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Salvando...' : 'Salvar Perfil'}
          </button>
        </div>
      </form>
    </div>
  );
}
