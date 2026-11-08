import { useFocusEffect } from 'expo-router';
import { DependencyList, useCallback, useRef, useState } from 'react';

/** Load data when the screen is focused (and when deps change). */
export function useLoad<T>(fn: () => Promise<T>, deps: DependencyList = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(async (isRefresh = false) => {
    const id = ++seq.current;
    isRefresh ? setRefreshing(true) : setLoading((l) => l || data === null);
    try {
      const d = await fn();
      if (id === seq.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (id === seq.current) setError((e as Error).message);
    } finally {
      if (id === seq.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, deps);

  useFocusEffect(
    useCallback(() => {
      run();
    }, [run]),
  );

  return { data, error, loading, refreshing, reload: () => run(false), refresh: () => run(true), setData };
}
