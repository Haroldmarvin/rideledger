import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import api, { setUnauthorizedHandler, tokenStore } from '../services/api';

const AuthContext = createContext(null);

function decodeExp(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [notice, setNotice] = useState(null); // e.g. "Your session has expired"
  const timer = useRef(null);

  const logout = useCallback((message) => {
    tokenStore.clear();
    setUser(null);
    if (timer.current) clearTimeout(timer.current);
    if (message) setNotice(message);
  }, []);

  const scheduleExpiry = useCallback((token) => {
    if (timer.current) clearTimeout(timer.current);
    const exp = decodeExp(token);
    if (!exp) return;
    const ms = exp - Date.now();
    if (ms <= 0) { logout('Your session has expired. Please log in again.'); return; }
    // Automatic logout when the session expires (setTimeout max is ~24.8 days)
    timer.current = setTimeout(() => logout('Your session has expired. Please log in again.'), Math.min(ms, 2147483000));
  }, [logout]);

  useEffect(() => {
    setUnauthorizedHandler((msg) => logout(msg || 'Please log in again.'));
    const token = tokenStore.get();
    if (!token) { setBooting(false); return; }
    const exp = decodeExp(token);
    if (exp && exp < Date.now()) { logout('Your session has expired. Please log in again.'); setBooting(false); return; }
    api.get('/auth/me')
      .then((res) => { setUser(res.data.user); scheduleExpiry(token); })
      .catch((err) => { if (err.status === 401) logout(); else if (err.isNetwork) setNotice('Cannot reach the server. Some features need a connection.'); })
      .finally(() => setBooting(false));
  }, [logout, scheduleExpiry]);

  const login = useCallback(async (identifier, password) => {
    const res = await api.post('/auth/login', { identifier, password });
    tokenStore.set(res.data.token);
    scheduleExpiry(res.data.token);
    setNotice(null);
    setUser(res.data.user);
    return res.data.user;
  }, [scheduleExpiry]);

  const refreshUser = useCallback(async () => {
    const res = await api.get('/auth/me');
    setUser(res.data.user);
    return res.data.user;
  }, []);

  const replaceToken = useCallback((token) => { tokenStore.set(token); scheduleExpiry(token); }, [scheduleExpiry]);

  const value = useMemo(() => ({
    user, booting, notice, setNotice, login, logout, refreshUser, replaceToken,
    isAdmin: user?.role === 'admin', isRider: user?.role === 'rider',
  }), [user, booting, notice, login, logout, refreshUser, replaceToken]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
