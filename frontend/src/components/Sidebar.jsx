import { NavLink } from 'react-router-dom';
import { Users, BookHeart, Library, ChevronDown, ChevronRight, Power, Loader2, Settings, Home } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { podApi } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

// `modulo` gates the entry: an item is hidden when the profile can't even view it.
const sections = [
  {
    label: 'Acervo',
    icon: Library,
    items: [
      { to: '/livros', label: 'Estante de Livros', modulo: 'livros' },
    ]
  },
  {
    label: 'Registro Civil',
    icon: Users,
    items: [
      { to: '/nascimentos', label: 'Nascimentos', modulo: 'nascimento' },
      { to: '/obitos',      label: 'Óbitos',      modulo: 'obito' },
      { to: '/casamentos',  label: 'Casamentos',  modulo: 'casamento' },
      { to: '/testamentos', label: 'Testamentos', modulo: 'testamento' },
    ]
  },
  {
    label: 'Registro de Imóveis',
    icon: Home,
    items: [
      { to: '/escrituras-compra-venda', label: 'Compra e Venda', modulo: 'escritura' },
    ]
  },
  {
    label: 'Configurações',
    icon: Settings,
    items: [
      { to: '/configuracoes',         label: 'Geral e IA',      modulo: 'configuracoes' },
      { to: '/configuracoes/usuarios', label: 'Usuários',        modulo: 'usuarios' },
      { to: '/configuracoes/perfis',   label: 'Perfis de Acesso', modulo: 'perfis' },
    ]
  },
];

function PodWidget() {
  const [status,  setStatus]  = useState('UNKNOWN');
  const [loading, setLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const pod = await podApi.status();
      setStatus(pod.desiredStatus ?? 'UNKNOWN');
    } catch {
      setStatus('UNKNOWN');
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 30000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  async function handleStop() {
    if (!window.confirm('Parar o pod do RunPod agora?')) return;
    setLoading(true);
    try {
      await podApi.stop();
      setStatus('EXITED');
    } catch (e) {
      alert('Erro ao parar: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleStart() {
    if (!window.confirm('Ligar o pod do RunPod? Pode levar até 3 minutos para ficar pronto.')) return;
    setLoading(true);
    setStatus('RUNNING'); // otimista
    try {
      await podApi.start();
      await fetchStatus();
    } catch (e) {
      alert('Erro ao ligar: ' + e.message);
      await fetchStatus();
    } finally {
      setLoading(false);
    }
  }

  const isRunning = status === 'RUNNING';
  const isStopped = status === 'EXITED';
  const dotColor  = isRunning ? 'bg-green-400' : status === 'UNKNOWN' ? 'bg-slate-500' : 'bg-slate-400';
  const label     = isRunning ? 'RunPod ligado' : isStopped ? 'RunPod desligado' : 'RunPod desconhecido';

  return (
    <div className="px-4 py-3 border-t border-white/10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor} ${isRunning ? 'animate-pulse' : ''}`} />
          <span className="text-xs text-slate-400 truncate">{label}</span>
        </div>
        {isRunning && (
          <button onClick={handleStop} disabled={loading} title="Parar pod"
            className="ml-2 flex-shrink-0 p-1 rounded text-slate-400 hover:text-red-400 hover:bg-white/10 transition-colors disabled:opacity-40">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
          </button>
        )}
        {isStopped && (
          <button onClick={handleStart} disabled={loading} title="Ligar pod"
            className="ml-2 flex-shrink-0 p-1 rounded text-slate-400 hover:text-green-400 hover:bg-white/10 transition-colors disabled:opacity-40">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
    </div>
  );
}

export default function Sidebar() {
  const { pode, user, cota } = useAuth();
  const [open, setOpen] = useState({
    Acervo: true, 'Registro Civil': true, 'Registro de Imóveis': true, 'Configurações': false,
  });

  // Hide entries the profile can't view, and drop sections left empty
  const visiveis = sections
    .map(sec => ({ ...sec, items: sec.items.filter(i => pode(i.modulo, 'ver')) }))
    .filter(sec => sec.items.length > 0);

  return (
    <aside className="w-60 min-h-screen bg-sidebar flex flex-col">
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <BookHeart className="w-6 h-6 text-blue-400" />
          <span className="text-white font-semibold text-base tracking-wide">CartorIA</span>
        </div>
      </div>

      <nav className="flex-1 py-4 overflow-y-auto">
        {visiveis.map(sec => {
          const Icon = sec.icon;
          const isOpen = open[sec.label];
          return (
            <div key={sec.label} className="mb-1">
              <button
                onClick={() => setOpen(o => ({ ...o, [sec.label]: !o[sec.label] }))}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-slate-300 hover:text-white hover:bg-white/5 transition-colors text-sm font-medium"
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1 text-left">{sec.label}</span>
                {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>

              {isOpen && (
                <div className="ml-7 border-l border-white/10 pl-3 mt-0.5">
                  {sec.items.map(item => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        `block py-2 px-3 text-sm rounded transition-colors my-0.5 ${
                          isActive
                            ? 'text-blue-400 bg-blue-900/30 font-medium'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                        }`
                      }
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Quem tem cota vê o quanto já usou, sem precisar abrir outra tela */}
      {user && !cota.ilimitada && (
        <div className="px-4 py-3 border-t border-white/10">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-xs text-slate-400">Seus registros</span>
            <span className={`text-xs font-medium ${cota.restante === 0 ? 'text-red-400' : 'text-slate-300'}`}>
              {cota.usados} / {cota.limite}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${cota.restante === 0 ? 'bg-red-500' : 'bg-blue-500'}`}
              style={{ width: `${Math.min(100, (cota.usados / Math.max(1, cota.limite)) * 100)}%` }}
            />
          </div>
          {cota.restante === 0 && (
            <p className="mt-1.5 text-xs text-red-400">Limite atingido — peça aumento a um administrador.</p>
          )}
        </div>
      )}

      <PodWidget />

      <div className="px-4 py-2 border-t border-white/10">
        <p className="text-xs text-slate-500">IA Indexação v1.1</p>
      </div>
    </aside>
  );
}
