"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface AsyncState<T> {
  data: T | undefined;
  error: Error | null;
  loading: boolean;
  reload: () => Promise<void>;
  setData: (d: T) => void;
}

/** Runs an async loader when deps change. Keeps previous data while reloading (no flashing). */
export function useAsync<T>(fn: (() => Promise<T>) | null, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(!!fn);
  const run = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const reload = useCallback(async () => {
    const f = fnRef.current;
    if (!f) return;
    const id = ++run.current;
    setLoading(true);
    setError(null);
    try {
      const d = await f();
      if (id === run.current) setData(d);
    } catch (e) {
      if (id === run.current) setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      if (id === run.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, reload, setData };
}
