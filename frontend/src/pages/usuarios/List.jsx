import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, Loader2, ShieldCheck } from 'lucide-react';
import { usuariosApi } from '../../api.js';
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

function Cota({ usuario }) {
  if (usuario.perfil_is_admin) {
    return <span className="text-xs text-slate-500">ilimitado (admin)</span>;
  }
  if (usuario.limite_registros === null || usuario.limite_registros === undefined) {
    return <span className="text-xs text-slate-500">ilimitado</span>;
  }
  const usados = usuario.registros_criados ?? 0;
  const cheio  = usados >= usuario.limite_registros;
  const pct    = Math.min(100, (usados / Math.max(1, usuario.limite_registros)) * 100);

  return (
    <div className="min-w-[7rem]">
      <div className="flex items-baseline justify-between mb-1">
        <span className={`text-xs font-medium ${cheio ? 'text-red-600' : 'text-slate-600'}`}>
          {usados} / {usuario.limite_registros}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
        <div className={`h-full rounded-full ${cheio ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function UsuariosList() {
  const navigate = useNavigate();
  const { pode, user } = useAuth();
  const [usuarios, setUsuarios] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [toast,    setToast]    = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUsuarios(await usuariosApi.list());
    } catch (e) {
      setToast({ msg: e.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(u) {
    if (!confirm(`Excluir o usuário "${u.nome}"? Os registros criados por ele são mantidos.`)) return;
    setDeleting(u.id);
    try {
      await usuariosApi.remove(u.id);
      setToast({ msg: 'Usuário excluído', type: 'success' });
      load();
    } catch (e) {
      setToast({ msg: e.message, type: 'error' });
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Usuários</h1>
          <p className="text-sm text-slate-500">Quem acessa o sistema, com que perfil e quantos registros pode criar</p>
        </div>
        {pode('usuarios', 'criar') && (
          <button onClick={() => navigate('/configuracoes/usuarios/novo')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" /> Novo Usuário
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-5 py-3.5 font-semibold text-slate-600">Usuário</th>
                <th className="text-left px-4 py-3.5 font-semibold text-slate-600 w-44">Perfil</th>
                <th className="text-left px-4 py-3.5 font-semibold text-slate-600 w-40">Registros</th>
                <th className="text-left px-4 py-3.5 font-semibold text-slate-600 w-28">Situação</th>
                <th className="text-right px-5 py-3.5 font-semibold text-slate-600 w-28">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5} className="text-center py-12 text-slate-400">Carregando...</td></tr>}
              {!loading && usuarios.length === 0 && (
                <tr><td colSpan={5} className="text-center py-12 text-slate-400">Nenhum usuário cadastrado</td></tr>
              )}
              {usuarios.map(u => (
                <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-slate-800">
                      {u.nome}
                      {u.id === user?.id && <span className="ml-2 text-xs text-blue-600">(você)</span>}
                    </p>
                    <p className="text-xs text-slate-500">{u.email}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="inline-flex items-center gap-1.5 text-slate-700">
                      {u.perfil_is_admin && <ShieldCheck className="w-3.5 h-3.5 text-violet-500" />}
                      {u.perfil_nome || <span className="text-slate-400 italic">sem perfil</span>}
                    </span>
                  </td>
                  <td className="px-4 py-3.5"><Cota usuario={u} /></td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      u.ativo ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {u.ativo ? 'Ativo' : 'Desativado'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1.5">
                      {pode('usuarios', 'editar') && (
                        <button title="Editar" onClick={() => navigate(`/configuracoes/usuarios/${u.id}/editar`)}
                          className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                      {pode('usuarios', 'excluir') && u.id !== user?.id && (
                        <button title="Excluir" onClick={() => handleDelete(u)} disabled={deleting === u.id}
                          className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40">
                          {deleting === u.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
