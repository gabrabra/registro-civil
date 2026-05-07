import { createContext, useContext, useState, useEffect } from 'react';

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

  function logout() {
    localStorage.removeItem('rc_token');
    sessionStorage.removeItem('rc_token');
    setUser(null);
  }

  return (
    <AuthCtx.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
