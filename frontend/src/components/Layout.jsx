import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { LogOut, User, Loader2, ChevronRight } from 'lucide-react';
import Sidebar from './Sidebar.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useBatch } from '../context/BatchContext.jsx';

export default function Layout() {
  const { user, logout }   = useAuth();
  const { isRunning, doneCount, total } = useBatch();
  const navigate  = useNavigate();
  const location  = useLocation();
  const onBatch   = location.pathname === '/nascimentos/lote';

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-12 border-b border-slate-200 bg-white flex items-center justify-end px-5 gap-3 flex-shrink-0">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <User className="w-4 h-4 text-slate-400" />
            <span>{user?.nome || user?.email}</span>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-600 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-red-50"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sair
          </button>
        </header>

        <main className="flex-1 p-6 overflow-auto bg-slate-50">
          <Outlet />
        </main>
      </div>

      {/* Floating batch indicator — só aparece fora da página de lote */}
      {isRunning && !onBatch && (
        <div className="fixed bottom-5 right-5 z-40 bg-white rounded-xl shadow-xl border border-violet-200 px-4 py-3 flex items-center gap-3 min-w-[260px]">
          <div className="flex-shrink-0 w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-violet-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800">Processando em segundo plano</p>
            <p className="text-xs text-slate-500">{doneCount} de {total} arquivos concluídos</p>
          </div>
          <button
            onClick={() => navigate('/nascimentos/lote')}
            className="flex items-center gap-0.5 text-xs font-medium text-violet-600 hover:text-violet-800 transition-colors flex-shrink-0"
          >
            Ver <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
