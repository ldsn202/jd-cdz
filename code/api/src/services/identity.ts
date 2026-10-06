import type { Bindings } from '../index';

export type Grant = {
  grantId: string;
  businessRole: string | null;
  actions: string[];
  scopeType: string;
  sourceSystem: string | null;
  recordType: string | null;
  resourceIds: string[];
};

export type ResolvedIdentity = {
  identityId: string;
  displayName: string;
  subjectType: 'HUMAN' | 'SERVICE';
  businessRoles: string[];
  authorizationVersion: string | null;
  verifiedAt: number;
  grants: Grant[];
};

type DevTokenMap = Record<string, string>;

export function devTokenMap(env: Bindings): DevTokenMap {
  const raw = env.DEV_IDENTITY_TOKENS;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as DevTokenMap;
    return {};
  } catch {
    return {};
  }
}

export function bearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const m = /^Bearer\s+(.+)$/.exec(authHeader.trim());
  return m ? m[1] : null;
}

export async function resolveIdentity(
  db: D1Database,
  env: Bindings,
  authHeader: string | undefined
): Promise<ResolvedIdentity | null> {
  const token = bearerToken(authHeader);
  if (!token) return null;
  const subjectId = devTokenMap(env)[token];
  if (!subjectId) return null;

  const ref = await db
    .prepare('SELECT id, subject_type, display_name FROM identity_reference WHERE subject_id = ?')
    .bind(subjectId)
    .first<{ id: string; subject_type: 'HUMAN' | 'SERVICE'; display_name: string }>();
  if (!ref) return null;

  const ctx = await db
    .prepare(
      `SELECT id, verified_at, valid_until, authorization_version FROM current_identity
       WHERE identity_reference_id = ? ORDER BY verified_at DESC, id DESC LIMIT 1`
    )
    .bind(ref.id)
    .first<{ id: string; verified_at: number; valid_until: number | null; authorization_version: string | null }>();
  if (!ctx || (ctx.valid_until !== null && ctx.valid_until <= Date.now())) return null;

  const grantsResult = await db
    .prepare(
      `SELECT grant_id, business_role, actions_json, scope_type, source_system, record_type, resource_ids_json
       FROM business_permission WHERE context_id = ? ORDER BY grant_id`
    )
    .bind(ctx.id)
    .all<{
      grant_id: string;
      business_role: string | null;
      actions_json: string;
      scope_type: string;
      source_system: string | null;
      record_type: string | null;
      resource_ids_json: string;
    }>();

  const grants: Grant[] = (grantsResult.results ?? []).map((g) => ({
    grantId: g.grant_id,
    businessRole: g.business_role,
    actions: JSON.parse(g.actions_json) as string[],
    scopeType: g.scope_type,
    sourceSystem: g.source_system,
    recordType: g.record_type,
    resourceIds: JSON.parse(g.resource_ids_json) as string[],
  }));

  const businessRoles = [...new Set(grants.map((g) => g.businessRole).filter((r): r is string => r !== null))];

  return {
    identityId: ref.id,
    displayName: ref.display_name,
    subjectType: ref.subject_type,
    businessRoles,
    authorizationVersion: ctx.authorization_version,
    verifiedAt: ctx.verified_at,
    grants,
  };
}
