export type LifecycleStatus = { ready: boolean; detail: string };

function localBase(): string {
  const base = new URL(process.env.APP_LIFECYCLE_BASE_URL ?? '');
  if (base.protocol !== 'http:' || !['127.0.0.1','localhost','[::1]'].includes(base.hostname) || base.username || base.password || base.pathname !== '/') throw new Error('生命周期适配器仅允许 localhost HTTP 根地址');
  return base.origin;
}

export async function probeApplicationLifecycle(): Promise<LifecycleStatus> {
  const base = process.env.APP_LIFECYCLE_BASE_URL;
  if (!base) {
    return { ready: false, detail: 'APP_LIFECYCLE_BASE_URL 未配置，本系统环境生命周期适配器未就绪' };
  }
  try {
    const res = await fetch(`${localBase()}/lifecycle/status`, { signal: AbortSignal.timeout(3000), redirect: 'error' });
    if (!res.ok) return { ready: false, detail: `生命周期适配器响应 ${res.status}` };
    const body = await res.json() as { protocol?:string; ready?:boolean };
    if (body.protocol !== 'jd-charging-local-lifecycle-v1' || body.ready !== true) return { ready:false, detail:'生命周期适配器未证明实际可用' };
    return { ready: true, detail: '生命周期适配器可用' };
  } catch (e) {
    return { ready: false, detail: `生命周期适配器不可达：${(e as Error).message}` };
  }
}

export async function callLifecycle(path: string, body: unknown): Promise<{ ok: boolean; detail: string; data?:Record<string,unknown> }> {
  try {
    const res = await fetch(`${localBase()}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(600000),
      redirect: 'error',
    });
    const data = await res.json() as Record<string,unknown>;
    const expected = body as {envId?:string};
    const valid = data.protocol === 'jd-charging-local-lifecycle-v1' && data.ok === true && (!expected?.envId || data.envId === expected.envId);
    return { ok: res.ok && valid, detail: typeof data.error === 'string' ? data.error : `HTTP ${res.status}${valid?'':'，生命周期回执未通过校验'}`, data };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}
