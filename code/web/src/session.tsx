import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getSession, type SessionInfo } from './api';

export type SessionState =
  | { status: 'loading' }
  | { status: 'failed'; message: string }
  | { status: 'ready'; session: SessionInfo };

const SessionContext = createContext<SessionState>({ status: 'loading' });

const ACCOUNT_CHANGED = 'jd-charging-account-changed';
export function reloadForAccountChange(notify = false, path = '/') {
  if (notify) {
    try { localStorage.setItem(ACCOUNT_CHANGED, crypto.randomUUID()); } catch { /* Storage can be disabled; the current tab still reloads. */ }
  }
  window.history.replaceState(null, '', '#' + path);
  window.location.reload();
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  useEffect(() => {
    const onChange = (event: StorageEvent) => { if (event.key === ACCOUNT_CHANGED) reloadForAccountChange(); };
    window.addEventListener('storage', onChange);
    return () => window.removeEventListener('storage', onChange);
  }, []);
  useEffect(() => {
    let cancelled = false;
    getSession()
      .then((session) => {
        if (!cancelled) setState({ status: 'ready', session });
      })
      .catch((e) => {
        if (!cancelled) setState({ status: 'failed', message: e instanceof Error ? e.message : '无法核实当前身份' });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  return useContext(SessionContext);
}
