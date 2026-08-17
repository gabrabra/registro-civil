import { ShieldOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

// Blocks a route the profile can't reach. The API enforces the same rule —
// this exists so a typed URL shows an explanation instead of a broken screen.
export default function RotaPermitida({ modulo, acao = 'ver', children }) {
  const { pode, user, loading } = useAuth();

  if (loading) return null;
  if (pode(modulo, acao)) return children;

  return (
    <div className="max-w-lg mx-auto mt-16 text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-slate-100 mb-4">
        <ShieldOff className="w-7 h-7 text-slate-400" />
      </div>
      <h1 className="text-lg font-semibold text-slate-800 mb-1">Acesso não permitido</h1>
      <p className="text-sm text-slate-500">
        Seu perfil{user?.perfil?.nome ? ` (${user.perfil.nome})` : ''} não tem permissão
        para <strong>{acao}</strong> em <strong>{modulo}</strong>.
      </p>
      <p className="text-sm text-slate-400 mt-2">
        Se precisar deste acesso, peça a um administrador para ajustar seu perfil.
      </p>
    </div>
  );
}
