import { registerPush, unregisterPush } from './push';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

import { api, loadStored, setPasswordChangeHandler, setToken, setUnauthorizedHandler } from './api';
import type { Area, Level, Role, SchoolInfo, User } from './types';

interface AuthState {
  user: User | null;
  school: SchoolInfo | null;
  ready: boolean;
  login: (schoolCode: string, loginId: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  /** Replace the signed-in user (after password change / consent / profile edit). */
  setUser: (u: User) => void;
  refreshSchool: () => Promise<SchoolInfo | null>;
}

const AuthContext = createContext<AuthState | null>(null);
const KEY_USER = 'user';
export const KEY_SCHOOL_CODE = 'school_code';

/** Where each role lands after sign-in. VP/Coordinator share the principal interface. */
export function homeFor(u: Pick<User, 'role' | 'must_change_password' | 'consent_at'>): string {
  if (u.must_change_password) return '/change-password';
  if (u.role === 'parent' && !u.consent_at) return '/consent';
  return `/${roleHome(u.role)}`;
}

export function roleHome(role: Role): 'admin' | 'principal' | 'teacher' | 'student' | 'parent' {
  if (role === 'vice_principal' || role === 'coordinator') return 'principal';
  return role;
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Platform admin', principal: 'Principal', vice_principal: 'Vice Principal', coordinator: 'Coordinator',
  teacher: 'Teacher', student: 'Student', parent: 'Parent',
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [school, setSchool] = useState<SchoolInfo | null>(null);
  const [ready, setReady] = useState(false);

  const setUser = useCallback((u: User) => {
    setUserState(u);
    AsyncStorage.setItem(KEY_USER, JSON.stringify(u)).catch(() => {});
  }, []);

  const logout = useCallback(async () => {
    await unregisterPush();          // while the session is still valid
    await setToken(null);
    await AsyncStorage.removeItem(KEY_USER);
    setUserState(null);
    setSchool(null);
  }, []);

  const refreshSchool = useCallback(async () => {
    try {
      const s = await api<SchoolInfo>('/school/me');
      setSchool(s);
      return s;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => void logout());
    setPasswordChangeHandler(() => router.replace('/change-password'));
    (async () => {
      const { token } = await loadStored();
      const cached = await AsyncStorage.getItem(KEY_USER);
      if (token && cached) {
        const u = JSON.parse(cached) as User;
        if (u.login_id === undefined) {
          await logout(); // stored by the old single-school app version
        } else {
          setUserState(u);
          api<User>('/auth/me').then((me) => { setUser(me); if (!me.must_change_password) void registerPush(); }).catch(() => {});
          if (u.school_id) api<SchoolInfo>('/school/me').then(setSchool).catch(() => {});
        }
      }
      setReady(true);
    })();
  }, [logout, setUser]);

  const login = useCallback(async (schoolCode: string, loginId: string, password: string) => {
    const res = await api<{ token: string; user: User }>('/auth/login', {
      body: { school_code: schoolCode.trim(), login_id: loginId.trim(), password },
    });
    await setToken(res.token);
    await AsyncStorage.setItem(KEY_SCHOOL_CODE, schoolCode.trim().toUpperCase());
    setUser(res.user);
    if (!res.user.must_change_password) void registerPush();
    if (res.user.school_id && !res.user.must_change_password) {
      api<SchoolInfo>('/school/me').then(setSchool).catch(() => {});
    } else {
      setSchool(null);
    }
    return res.user;
  }, [setUser]);

  return (
    <AuthContext.Provider value={{ user, school, ready, login, logout, setUser, refreshSchool }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

/** Permission level for the signed-in staff member (principal = edit everywhere). */
export function usePerm(area: Area): Level {
  const { user, school } = useAuth();
  if (!user) return 'none';
  if (user.role === 'principal') return 'edit';
  return school?.permissions?.[area] ?? 'none';
}

export function useCan(area: Area, level: Level = 'view'): boolean {
  const l = usePerm(area);
  const rank = { none: 0, view: 1, edit: 2 } as const;
  return rank[l] >= rank[level];
}

export function useModule(module: string): boolean {
  const { school } = useAuth();
  return !!school?.modules?.includes(module);
}
