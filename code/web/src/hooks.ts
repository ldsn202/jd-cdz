import { ApiError } from './api';
import { useCallback, useEffect, useRef, useState } from 'react';

export type DataState<T> =
  | { status: 'loading' }
  | { status: 'failed'; error: unknown }
  | { status: 'ready'; data: T; refreshing?: boolean; refreshError?: unknown };

export function useApiData<T>(load: () => Promise<T>, deps: readonly unknown[], retain = false): [DataState<T>, () => void] {
  const [state, setState] = useState<DataState<T>>({ status: 'loading' });
  const [tick, setTick] = useState(0);
  const lastDeps = useRef('');
  useEffect(() => {
    const depsKey = JSON.stringify(retain ? deps.slice(0, 1) : deps);
    const canRetain = retain && lastDeps.current === depsKey;
    lastDeps.current = depsKey;
    let cancelled = false;
    setState((old) => canRetain && old.status === 'ready' ? { ...old, refreshing: true, refreshError: undefined } : { status: 'loading' });
    load()
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data });
      })
      .catch((error) => {
        const accessLost = error instanceof ApiError && [401, 403, 404].includes(error.httpStatus);
        if (!cancelled) setState((old) => canRetain && !accessLost && old.status === 'ready' ? { ...old, refreshing: false, refreshError: error } : { status: 'failed', error });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const retry = useCallback(() => setTick((t) => t + 1), []);
  return [state, retry];
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
