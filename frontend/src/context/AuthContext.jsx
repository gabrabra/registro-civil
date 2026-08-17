import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('rc_token') || sessionStorage.getItem('rc_token');
    if (!token) { setLoading(false); return; }
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(({ user }) => setUser(user))
      .catch(() => {
        localStorage.removeItem('rc_token');
        sessionStorage.removeItem('rc_token');
      })
      .finally(() => setLoading(false));
  }, []);

  function login(token, userData, remember) {
    if (remember) localStorage.setItem('rc_token', token);
    else          sessionStorage.setItem('rc_token', token);
    setUser(userData);
  }

  async function logout() {
    // Record the event before dropping the token — the request needs it
    try {
      const token = localStorage.getItem('rc_token') || sessionStorage.getItem('rc_token');
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch { /* sair nunca pode falhar por causa do log */ }

    localStorage.removeItem('rc_token');
    sessionStorage.removeItem('rc_token');
    setUser(null);
  }

  // Mirrors the server-side check. The UI uses it to hide what the user can't
  // do — the API still enforces it, this only avoids dead-end buttons.
  const pode = useCallback((modulo, acao) => {
    const perfil = user?.perfil;
    if (!perfil) return false;
    if (perfil.is_admin) return true;
    return perfil.permissoes?.[modulo]?.[acao] === true;
  }, [user]);

  const cota = useMemo(() => {
    const limite = user?.limite_registros;
    if (user?.perfil?.is_admin || limite === null || limite === undefined) {
      return { ilimitada: true, usados: user?.registros_criados ?? 0, limite: null, restante: null };
    }
    const usados = user?.registros_criados ?? 0;
    return { ilimitada: false, usados, limite, restante: Math.max(0, limite - usados) };
  }, [user]);

  const valor = useMemo(
    () => ({ user, loading, login, logout, pode, cota, isAdmin: user?.perfil?.is_admin === true }),
    [user, loading, pode, cota]
  );

  return <AuthCtx.Provider value={valor}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
