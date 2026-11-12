import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, loadSession, saveSession, setExpiredHandler, type User } from './api';

type Ctx = {
  user: User | null;
  login: (code: string, loginId: string, password: string) => Promise<User>;
  logout: () => void;
  setUser: (u: User, token?: string) => void;
  expired: boolean;
};
const AuthCtx = createContext<Ctx>(null as unknown as Ctx);
export const useAuth = () => useContext(AuthCtx);

export const homeOf = (u: User) => (u.role === 'admin' ? '/admin' : '/school');

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState(() => loadSession());
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    setExpiredHandler(() => { setSession(null); setExpired(true); });
  }, []);

  const login = useCallback(async (code: string, loginId: string, password: string) => {
    // client:"web" → a 12-hour session that only Admin and Principal accounts can get
    const res = await api<{ token: string; user: User }>('/auth/login', {
      auth: false, body: { school_code: code.trim(), login_id: loginId.trim(), password, client: 'web' },
    });
    saveSession(res);
    setSession(res);
    setExpired(false);
    return res.user;
  }, []);

  const logout = useCallback(() => {
    saveSession(null);
    setSession(null);
    setExpired(false);
  }, []);

  const setUser = useCallback((u: User, token?: string) => {
    setSession((s) => {
      if (!s) return s;
      const next = { token: token ?? s.token, user: u };
      saveSession(next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ user: session?.user ?? null, login, logout, setUser, expired }), [session, login, logout, setUser, expired]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
