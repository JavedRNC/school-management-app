import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { api } from './api';
import { useAuth } from './auth';
import type { SchoolClass, User } from './types';

const KEY_CHILD = 'selected_child';

interface ChildState {
  /** Parent's linked children (empty for students). */
  children: User[];
  /** Selected child (parent) — undefined for students. */
  child: User | undefined;
  setChildId: (id: number) => void;
  /** Pass as `student_id` to /me/*, /timetable, /posts. Undefined for students (server uses self). */
  studentId: number | undefined;
  classNames: Record<number, string>;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

const empty: ChildState = {
  children: [], child: undefined, setChildId: () => {}, studentId: undefined, classNames: {}, loading: false, error: null, reload: () => {},
};
const ChildContext = createContext<ChildState>(empty);

export function ChildProvider({ children: content }: { children: ReactNode }) {
  const { user } = useAuth();
  const [kids, setKids] = useState<User[]>([]);
  const [classNames, setClassNames] = useState<Record<number, string>>({});
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (user?.role !== 'parent') return;
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const [list, classes, stored] = await Promise.all([
          api<User[]>('/me/children'),
          api<SchoolClass[]>('/classes').catch(() => [] as SchoolClass[]),
          AsyncStorage.getItem(KEY_CHILD).catch(() => null),
        ]);
        if (!alive) return;
        setKids(list);
        setClassNames(Object.fromEntries(classes.map((c) => [c.id, c.name])));
        const want = stored ? Number(stored) : null;
        setSelected((cur) => {
          const ids = list.map((k) => k.id);
          if (cur && ids.includes(cur)) return cur;
          if (want && ids.includes(want)) return want;
          return list[0]?.id ?? null;
        });
        setError(null);
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [user?.role, user?.id, tick]);

  const setChildId = useCallback((id: number) => {
    setSelected(id);
    AsyncStorage.setItem(KEY_CHILD, String(id)).catch(() => {});
  }, []);

  const value = useMemo<ChildState>(() => {
    const child = kids.find((k) => k.id === selected);
    return { children: kids, child, setChildId, studentId: child?.id, classNames, loading, error, reload: () => setTick((x) => x + 1) };
  }, [kids, selected, setChildId, classNames, loading, error]);

  if (user?.role !== 'parent') return <>{content}</>;
  return <ChildContext.Provider value={value}>{content}</ChildContext.Provider>;
}

export function useChild(): ChildState {
  return useContext(ChildContext);
}

/** Query params for student-facing endpoints (adds student_id for parents). */
export function childParams(studentId: number | undefined, extra: Record<string, string | number | undefined> = {}) {
  return studentId ? { ...extra, student_id: studentId } : extra;
}
