import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

import { api, loadStored, setToken, setUnauthorizedHandler } from './api';
import type { User } from './types';

interface AuthState {
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);
const KEY_USER = 'user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const logout = useCallback(async () => {
    await setToken(null);
    await AsyncStorage.removeItem(KEY_USER);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => void logout());
    (async () => {
      const { token } = await loadStored();
      const cached = await AsyncStorage.getItem(KEY_USER);
      if (token && cached) {
        setUser(JSON.parse(cached));
        // refresh in background; 401 triggers logout via handler
        api<User>('/auth/me')
          .then((u) => {
            setUser(u);
            AsyncStorage.setItem(KEY_USER, JSON.stringify(u));
          })
          .catch(() => {});
      }
      setReady(true);
    })();
  }, [logout]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<{ token: string; user: User }>('/auth/login', { body: { email, password } });
    await setToken(res.token);
    await AsyncStorage.setItem(KEY_USER, JSON.stringify(res.user));
    setUser(res.user);
    return res.user;
  }, []);

  return <AuthContext.Provider value={{ user, ready, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
