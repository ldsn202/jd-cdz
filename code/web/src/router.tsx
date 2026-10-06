import { useEffect, useState } from 'react';

export type Route = { name: string; params: Record<string, string> };

const PATTERNS: { name: string; pattern: RegExp; keys: string[] }[] = [
  { name: 'home', pattern: /^\/?$/, keys: [] },
  { name: 'work-items', pattern: /^\/work-items\/?$/, keys: [] },
  { name: 'work-item-detail', pattern: /^\/work-items\/([^/]+)\/([^/]+)\/?$/, keys: ['type', 'id'] },
  { name: 'installation-orders', pattern: /^\/installation\/orders\/?$/, keys: [] },
  { name: 'installation-order-detail', pattern: /^\/installation\/orders\/([^/]+)\/?$/, keys: ['id'] },
  { name: 'billing-orders', pattern: /^\/billing\/work-orders\/?$/, keys: [] },
  { name: 'billing-orders', pattern: /^\/billing\/orders\/?$/, keys: [] },
  { name: 'billing-receivable', pattern: /^\/billing\/receivable\/([^/]+)\/?$/, keys: ['id'] },
  { name: 'billing-compare', pattern: /^\/billing\/compare\/([^/]+)\/?$/, keys: ['id'] },
  { name: 'coordination', pattern: /^\/coordination\/?$/, keys: [] },
  { name: 'exceptions', pattern: /^\/exceptions\/?$/, keys: [] },
  { name: 'integration-mappings', pattern: /^\/integration\/mappings\/?$/, keys: [] },
  { name: 'integration-format-edit', pattern: /^\/integration\/providers\/([^/]+)\/formats\/([^/]+)\/edit\/?$/, keys: ['providerId', 'formatId'] },
  { name: 'integration-change-history', pattern: /^\/integration\/change-history\/?$/, keys: [] },
];

export function parseHash(hash: string): Route | null {
  const raw = hash.replace(/^#/, '') || '/';
  const queryStart = raw.indexOf('?');
  const path = queryStart < 0 ? raw : raw.slice(0, queryStart);
  for (const p of PATTERNS) {
    const m = p.pattern.exec(path);
    if (m) {
      const params: Record<string, string> = {};
      p.keys.forEach((k, i) => {
        params[k] = decodeURIComponent(m[i + 1]!);
      });
      if (p.name === 'work-items' && queryStart >= 0) {
        const query = new URLSearchParams(raw.slice(queryStart + 1));
        for (const key of ['responsibility', 'status', 'kind', 'providerId', 'keyword', 'workOrderId', 'page', 'pageSize']) {
          const value = query.get(key);
          if (value) params[key] = value;
        }
      }
      return { name: p.name, params };
    }
  }
  return null;
}

export function useRoute(): Route | null {
  const [route, setRoute] = useState<Route | null>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(path: string): void {
  window.location.hash = path;
}
