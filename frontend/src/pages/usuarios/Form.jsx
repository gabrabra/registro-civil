import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Save, Loader2, Infinity as InfinityIcon } from 'lucide-react';
import { usuariosApi, perfisApi } from '../../api.js';
import { useAuth } from '../../context/AuthContext.jsx';

export default function UsuariosForm() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const isEdit   = Boolean(id);
  const { user } = useAuth();
  const eEuMesmo = isEdit && String(user?.id) === String(id);

  const [perfis,  setPerfis]  = useState([]);
  const [form,    setForm]    = useState({
    nome: '', email: '', senha: '', perfil_id: '', limite_registros: '', ativo: true,
  });
  const [semLimite, setSemLimite] = useState(true);
  const [usados,    setUsados]    = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [erro,      setErro]      = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const lista = await perfisApi.list();
        setPerfis(lista);

        if (isEdit) {
          const u = await usuariosApi.get(id);
          const temLimite = u.limite_registros !== null && u.limite_registros !== undefined;
          setForm({
            nome: u.nome, email: u.email, senha: '',
            perfil_id: String(u.perfil_id || ''),
            limite_registros: temLimite ? String(u.limite_registros) : '',
            ativo: u.ativo !== false,
          });
          setSemLimite(!temLimite);
          setUsados(u.registros_criados ?? 0);
        } else {
          // Default to the non-admin profile so a new user isn't accidentally an admin
          const padrao = lista.find(p => !p.is_admin) || lista[0];
          if (padrao) setForm(f => ({ ...f, perfil_id: String(padrao.id) }));
        }
      } catch (e) {
        setErro(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isEdit]);

  function set(campo, valor) {
    setForm(f => ({ ...f, [campo]: valor }));
  }

  async function salvar(e) {
    e.preventDefault();
    setErro(null);

    if (!form.nome.trim())  return setErro('Informe o nome');
    if (!form.email.trim()) return setErro('Informe o e-mail');
    if (!isEdit && form.senha.length < 8) return setErro('A senha deve ter ao menos 8 caracteres');
    if (isEdit && form.senha && form.senha.length < 8) return setErro('A senha deve ter ao menos 8 caracteres');
    if (!form.perfil_id) return setErro('Selecione um perfil de acesso');

    setSaving(true);
    try {
      const payload = {
        nome: form.nome.trim(),
        email: form.email.trim(),
        perfil_id: parseInt(form.perfil_id, 10),
        limite_registros: semLimite ? null : (form.limite_registros === '' ? null : parseInt(form.limite_registros, 10)),
        ativo: form.ativo,
      };
      if (form.senha) payload.senha = form.senha;

      if (isEdit) await usuariosApi.update(id, payload);
      else        await usuariosApi.create(payload);
      navigate('/configuracoes/usuarios');
    } catch (e2) {
      setErro(e2.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="max-w-2xl mx-auto py-12 text-center text-slate-400">Carregando...</div>;

  const perfilSelecionado = perfis.find(p => String(p.id) === form.perfil_id);
  const campo = 'w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition-colors';

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/configuracoes/usuarios')}
          className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{isEdit ? 'Editar Usuário' : 'Novo Usuário'}</h1>
          <p className="text-sm text-slate-500">Acesso, perfil e limite de registros</p>
        </div>
      </div>

      {erro && (
        <div className="mb-5 px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">{erro}</div>
      )}

      <form onSubmit={salvar} className="space-y-5">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-slate-700 border-b border-slate-100 pb-2">Dados de acesso</h2>

          <div>
            <label htmlFor="nome" className="block text-xs font-medium text-slate-600 mb-1">
              Nome <span className="text-red-500">*</span>
            </label>
            <input id="nome" value={form.nome} onChange={e => set('nome', e.target.value)} className={campo} />
          </div>

          <div>
            <label htmlFor="email" className="block text-xs font-medium text-slate-600 mb-1">
              E-mail <span className="text-red-500">*</span>
            </label>
            <input id="email" type="email" autoComplete="off" value={form.email}
              onChange={e => set('email', e.target.value)} className={campo} />
          </div>

          <div>
            <label htmlFor="senha" className="block text-xs font-medium text-slate-600 mb-1">
              Senha {!isEdit && <span className="text-red-500">*</span>}
            </label>
            <input id="senha" type="password" autoComplete="new-password" value={form.senha}
              onChange={e => set('senha', e.target.value)} className={campo}
              placeholder={isEdit ? 'Deixe em branco para manter a senha atual' : 'Mínimo de 8 caracteres'} />
            <p className="mt-1 text-xs text-slate-400">
              Armazenada com bcrypt — nem administradores conseguem ler a senha depois de salva.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-slate-700 border-b border-slate-100 pb-2">Perfil e limites</h2>

          <div>
            <label htmlFor="perfil" className="block text-xs font-medium text-slate-600 mb-1">
              Perfil de acesso <span className="text-red-500">*</span>
            </label>
            <select id="perfil" value={form.perfil_id} onChange={e => set('perfil_id', e.target.value)}
              className={`${campo} bg-white`}>
              <option value="">— Selecione —</option>
              {perfis.map(p => (
                <option key={p.id} value={p.id}>{p.nome}{p.is_admin ? ' (acesso total)' : ''}</option>
              ))}
            </select>
            {perfilSelecionado?.descricao && (
              <p className="mt-1 text-xs text-slate-500">{perfilSelecionado.descricao}</p>
            )}
            {eEuMesmo && (
              <p className="mt-1 text-xs text-amber-600">
                Você está editando a si mesmo — não é possível remover o próprio acesso de administrador.
              </p>
            )}
          </div>

          <div>
            <span className="block text-xs font-medium text-slate-600 mb-2">Limite de registros</span>

            <label className="flex items-center gap-2 mb-2 cursor-pointer">
              <input type="checkbox" checked={semLimite} onChange={e => setSemLimite(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-400" />
              <span className="text-sm text-slate-700 flex items-center gap-1.5">
                <InfinityIcon className="w-4 h-4 text-slate-400" /> Sem limite
              </span>
            </label>

            {!semLimite && (
              <>
                <input type="number" min="0" value={form.limite_registros}
                  onChange={e => set('limite_registros', e.target.value)}
                  placeholder="ex: 500" className={campo} />
                {isEdit && (
                  <p className="mt-1 text-xs text-slate-500">
                    Já criou <strong>{usados}</strong> registro{usados !== 1 ? 's' : ''}. Um limite abaixo disso
                    bloqueia novas criações, mas nada do que já existe é apagado.
                  </p>
                )}
              </>
            )}
            <p className="mt-1.5 text-xs text-slate-400">
              Conta nascimentos, testamentos e escrituras criados por este usuário. Perfis de administrador
              nunca são limitados.
            </p>
          </div>

          <label className="flex items-center gap-2 cursor-pointer pt-1">
            <input type="checkbox" checked={form.ativo} onChange={e => set('ativo', e.target.checked)}
              disabled={eEuMesmo}
              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-400 disabled:opacity-50" />
            <span className="text-sm text-slate-700">Usuário ativo</span>
          </label>
          <p className="text-xs text-slate-400 -mt-2">Desativar bloqueia o login sem apagar nada.</p>
        </div>

        <div className="flex items-center justify-end gap-3 pb-6">
          <button type="button" onClick={() => navigate('/configuracoes/usuarios')}
            className="px-5 py-2.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Salvando...' : 'Salvar Usuário'}
          </button>
        </div>
      </form>
    </div>
  );
}
