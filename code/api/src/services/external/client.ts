import type { Envelope } from './types.ts';

export class ExternalError extends Error {
  httpStatus: number;
  code: number;
  requestId?: string;

  constructor(httpStatus: number, code: number, message: string, requestId?: string) {
    super(message);
    this.name = 'ExternalError';
    this.httpStatus = httpStatus;
    this.code = code;
    this.requestId = requestId;
  }
}

export interface ExternalEnv {
  EXTERNAL_MODE?: string;
  AI_MODE?: string;
  MOCK_BASE_URL?: string;
  MOCK_ACCOUNT_ID?: string;
  EXTERNAL_REAL_BASE_URL?: string;
  TASK_RUNNER_BASE_URL?: string;
}

function businessBaseUrl(env: ExternalEnv): string {
  const mode = env.EXTERNAL_MODE ?? 'mock';
  if (mode === 'mock') {
    const base = env.MOCK_BASE_URL;
    if (!base) throw new ExternalError(503, 50301, 'EXTERNAL_MODE=mock 但 MOCK_BASE_URL 未配置');
    return base.replace(/\/$/, '');
  }
  const base = env.EXTERNAL_REAL_BASE_URL;
  if (!base) {
    throw new ExternalError(503, 50301, 'EXTERNAL_MODE=real 但真实外部接口未配置（EXTERNAL_REAL_BASE_URL 缺失），不降级为 mock');
  }
  return base.replace(/\/$/, '');
}

function aiBaseUrl(env: ExternalEnv): string {
  const mode = env.AI_MODE ?? 'mock';
  if (mode === 'mock') {
    const base = env.MOCK_BASE_URL;
    if (!base) throw new ExternalError(503, 50301, 'AI_MODE=mock 但 MOCK_BASE_URL 未配置');
    return base.replace(/\/$/, '');
  }
  const base = env.TASK_RUNNER_BASE_URL;
  if (!base) {
    throw new ExternalError(503, 50301, 'AI_MODE=real 但 TASK_RUNNER_BASE_URL 未配置，不回退为固定答案');
  }
  return base.replace(/\/$/, '');
}

const tokenCache = new Map<string, Promise<string>>();

async function mockToken(env: ExternalEnv, base: string): Promise<string> {
  const account = env.MOCK_ACCOUNT_ID;
  if (!account) throw new ExternalError(503, 50301, 'EXTERNAL_MODE=mock 但 MOCK_ACCOUNT_ID 未配置（受控测试会话账号）');
  const key = `${base}|${account}`;
  if (!tokenCache.has(key)) {
    tokenCache.set(key, (async () => {
      let res: Response;
      try {
        res = await fetch(`${base}/api/admin/mock/external/identity/sessions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ accountId: account }),
        });
      } catch (e) {
        throw new ExternalError(503, 50301, `外部依赖不可达：${(e as Error).message}`);
      }
      const body = (await res.json()) as Envelope<{ token: string }>;
      if (body.code !== 0) throw new ExternalError(res.status, body.code, body.msg, body.requestId);
      return body.data.token;
    })());
  }
  try {
    return await tokenCache.get(key)!;
  } catch (e) {
    tokenCache.delete(key);
    throw e;
  }
}

export type CallDetail<T> = { data: T; requestId: string | null; httpStatus: number };

async function callDetailed<T>(base: string, path: string, init?: RequestInit, token?: string): Promise<CallDetail<T>> {
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init?.headers ?? {}) },
    });
  } catch (e) {
    throw new ExternalError(503, 50301, `外部依赖不可达：${(e as Error).message}`);
  }
  let body: Envelope<T>;
  try {
    body = (await res.json()) as Envelope<T>;
  } catch {
    throw new ExternalError(502, 50201, `依赖返回非 JSON（HTTP ${res.status}）`);
  }
  if (body.code !== 0) {
    if (body.code === 40101 && token) tokenCache.clear();
    throw new ExternalError(res.status, body.code, body.msg, body.requestId);
  }
  return { data: body.data, requestId: body.requestId ?? null, httpStatus: res.status };
}

async function call<T>(base: string, path: string, init?: RequestInit, token?: string): Promise<T> {
  return (await callDetailed<T>(base, path, init, token)).data;
}

export async function detailedMockCall<T>(env: ExternalEnv, path: string, init?: RequestInit): Promise<CallDetail<T>> {
  const base = businessBaseUrl(env);
  const mode = env.EXTERNAL_MODE ?? 'mock';
  const token = mode === 'mock' ? await mockToken(env, base) : undefined;
  return callDetailed<T>(base, path, init, token);
}

export async function externalGet<T>(env: ExternalEnv, path: string): Promise<T> {
  const base = businessBaseUrl(env);
  const token = (env.EXTERNAL_MODE ?? 'mock') === 'mock' ? await mockToken(env, base) : undefined;
  return call<T>(base, path, undefined, token);
}

export async function externalPost<T>(env: ExternalEnv, path: string, body: unknown): Promise<T> {
  const base = businessBaseUrl(env);
  const token = (env.EXTERNAL_MODE ?? 'mock') === 'mock' ? await mockToken(env, base) : undefined;
  return call<T>(base, path, { method: 'POST', body: JSON.stringify(body) }, token);
}

export async function aiPost<T>(env: ExternalEnv, path: string, body: unknown): Promise<T> {
  const base = aiBaseUrl(env);
  const token = (env.AI_MODE ?? 'mock') === 'mock' ? await mockToken(env, base) : undefined;
  return call<T>(base, path, { method: 'POST', body: JSON.stringify(body) }, token);
}
