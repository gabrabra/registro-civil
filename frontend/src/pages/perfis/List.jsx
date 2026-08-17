import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, ShieldCheck, Shield, Users, Loader2 } from 'lucide-react';
import { perfisApi } from '../../api.js';
import { useAuth } from '../../context/AuthContext.jsx';

function Toast({ msg, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm max-w-md ${
      type === 'success' ? 'bg-green-600' : 'bg-red-600'
    }`}>
      {msg}
    </div>
  );
}

// Compact summary so the list conveys reach without opening each profile
function ResumoPermissoes({ perfil }) {
  if (perfil.is_admin) {
    return <span className="text-xs text-violet-700 font-medium">Acesso total</span>;
  }
  const modulos = Object.entries(perfil.permissoes || {})
    .filter(([, acoes]) => Object.values(acoes || {}).some(Boolean));

  if (!modulos.length) return <span className="text-xs text-slate-400 italic">Nenhuma permissão</span>;

  return (
    <span className="text-xs text-slate-600">
      {modulos.length} módulo{modulos.length !== 1 ? 's' : ''} liberado{modulos.length !== 1 ? 's' : ''}
    </span>
  );
}

export default function PerfisList() {
  const navigate = useNavigate();
  const { pode } = useAuth();
  const [perfis,   setPerfis]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [toast,    setToast]    = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPerfis(await perfisApi.list());
    } catch (e) {
      setToast({ msg: e.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(perfil) {
    if (!confirm(`Excluir o perfil "${perfil.nome}"?`)) return;
    setDeleting(perfil.id);
    try {
      await perfisApi.remove(perfil.id);
      setToast({ msg: 'Perfil excluído', type: 'success' });
      load();
    } catch (e) {
      setToast({ msg: e.message, type: 'error' });
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Perfis de Acesso</h1>
          <p className="text-sm text-slate-500">Defina o que cada tipo de usuário pode fazer em cada módulo</p>
        </div>
        {pode('perfis', 'criar') && (
          <button onClick={() => navigate('/configuracoes/perfis/novo')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" /> Novo Perfil
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-5 py-3.5 font-semibold text-slate-600">Perfil</th>
              <th className="text-left px-4 py-3.5 font-semibold text-slate-600">Permissões</th>
              <th className="text-left px-4 py-3.5 font-semibold text-slate-600 w-32">Usuários</th>
              <th className="text-right px-5 py-3.5 font-semibold text-slate-600 w-28">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={4} className="text-center py-12 text-slate-400">Carregando...</td></tr>}
            {!loading && perfis.length === 0 && (
              <tr><td colSpan={4} className="text-center py-12 text-slate-400">Nenhum perfil cadastrado</td></tr>
            )}
            {perfis.map(p => (
              <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    {p.is_admin
                      ? <ShieldCheck className="w-4 h-4 text-violet-500 flex-shrink-0" />
                      : <Shield className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800">{p.nome}</p>
                      {p.descricao && <p className="text-xs text-slate-500 truncate max-w-md">{p.descricao}</p>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3.5"><ResumoPermissoes perfil={p} /></td>
                <td className="px-4 py-3.5">
                  <span className="inline-flex items-center gap-1.5 text-slate-600">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    {p.total_usuarios}
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center justify-end gap-1.5">
                    {pode('perfis', 'editar') && !p.is_admin && (
                      <button title="Editar" onClick={() => navigate(`/configuracoes/perfis/${p.id}/editar`)}
                        className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                    {pode('perfis', 'excluir') && !p.is_admin && (
                      <button title="Excluir" onClick={() => handleDelete(p)} disabled={deleting === p.id}
                        className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40">
                        {deleting === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    )}
                    {p.is_admin && <span className="text-xs text-slate-400 italic">protegido</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
