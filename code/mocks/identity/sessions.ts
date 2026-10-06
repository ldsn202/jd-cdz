import type { DatabaseSync } from 'node:sqlite';

export type Account = {
  accountId: string;
  displayName: string;
  role: string;
  serviceProviderId: string | null;
  active: boolean;
};

export type Session = {
  token: string;
  accountId: string;
  createdAt: string;
  validUntil: string | null;
};

export type AuthFailure = { http: number; code: number; msg: string };
export type AuthResult = { ok: true; account: Account; grants: { grantId: string; scopeProviderIds: string[] }[] } | { ok: false; failure: AuthFailure };

function rowToAccount(payload: any): Account {
  return {
    accountId: payload.accountId,
    displayName: payload.displayName,
    role: payload.role,
    serviceProviderId: payload.serviceProviderId ?? null,
    active: payload.active !== false,
  };
}

export function getAccount(db: DatabaseSync, accountId: string): Account | null {
  const row = db.prepare("SELECT payload_json FROM source_record WHERE kind = 'account' AND record_id = ?").get(accountId) as
    | { payload_json: string }
    | undefined;
  return row ? rowToAccount(JSON.parse(row.payload_json)) : null;
}

export function createSession(db: DatabaseSync, accountId: string, ttlSeconds: number | null): Session | AuthFailure {
  const account = getAccount(db, accountId);
  if (!account) return { http: 404, code: 40401, msg: '账号不存在' };
  if (!account.active) return { http: 403, code: 40301, msg: '身份被停用' };
  const now = Date.now();
  const session: Session = {
    token: `msess-${crypto.randomUUID()}`,
    accountId,
    createdAt: new Date(now).toISOString(),
    validUntil: ttlSeconds === null ? null : new Date(now + ttlSeconds * 1000).toISOString(),
  };
  db.prepare('INSERT INTO source_record (kind, record_id, source_version, source_updated_at, payload_json) VALUES (?, ?, ?, ?, ?)').run(
    'session',
    session.token,
    'session-1',
    session.createdAt,
    JSON.stringify(session)
  );
  return session;
}

export function resolveAuth(db: DatabaseSync, authorization: string | undefined): AuthResult {
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return { ok: false, failure: { http: 401, code: 40101, msg: '缺少凭据' } };
  }
  const token = authorization.slice('Bearer '.length).trim();
  const row = db.prepare("SELECT payload_json FROM source_record WHERE kind = 'session' AND record_id = ?").get(token) as
    | { payload_json: string }
    | undefined;
  if (!row) return { ok: false, failure: { http: 401, code: 40101, msg: '凭据验证失败' } };
  const session = JSON.parse(row.payload_json) as Session;
  if (session.validUntil !== null && Date.parse(session.validUntil) <= Date.now()) {
    return { ok: false, failure: { http: 401, code: 40101, msg: '会话已失效' } };
  }
  const account = getAccount(db, session.accountId);
  if (!account) return { ok: false, failure: { http: 401, code: 40101, msg: '凭据验证失败' } };
  if (!account.active) return { ok: false, failure: { http: 403, code: 40301, msg: '身份被停用' } };
  const grants = (db.prepare("SELECT payload_json FROM source_record WHERE kind = 'grant'").all() as { payload_json: string }[])
    .map((r) => JSON.parse(r.payload_json))
    .filter((g) => g.accountId === account.accountId)
    .map((g) => ({ grantId: g.grantId, scopeProviderIds: g.scopeProviderIds as string[] }));
  return { ok: true, account, grants };
}

export function hasAction(
  auth: { account: Account; grants: { grantId: string; scopeProviderIds: string[] }[] },
  action: string,
  providerId: string,
  roleActions: Record<string, string[]>
): boolean {
  const allowed = roleActions[auth.account.role] ?? [];
  if (!allowed.includes(action)) return false;
  return auth.grants.some((g) => g.scopeProviderIds.includes(providerId));
}
