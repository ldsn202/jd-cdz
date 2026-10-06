import type { Bindings } from '../index';
import { devTokenMap } from './identity';

export const LOCAL_ACCOUNT_COOKIE = 'jd-charging-account';

export function localAccountSwitching(env: Bindings, url: string): boolean {
  return env.LOCAL_ACCOUNT_SWITCHING === 'true' && env.EXTERNAL_MODE === 'mock'
    && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname);
}

export async function localAccounts(env: Bindings) {
  const subjects = [...new Set(Object.values(devTokenMap(env)))];
  const rows = await env.DB.prepare(`SELECT r.subject_id, r.id, r.display_name, p.business_role
    FROM identity_reference r
    JOIN current_identity c ON c.id = (SELECT id FROM current_identity
      WHERE identity_reference_id = r.id ORDER BY verified_at DESC, id DESC LIMIT 1)
    LEFT JOIN business_permission p ON p.context_id = c.id
    WHERE r.subject_type = 'HUMAN' AND r.subject_id IN (SELECT value FROM json_each(?))
      AND (c.valid_until IS NULL OR c.valid_until > ?)
    ORDER BY r.subject_id, p.business_role`).bind(JSON.stringify(subjects), Date.now())
    .all<{ subject_id: string; id: string; display_name: string; business_role: string | null }>();
  const accounts = new Map<string, { accountId: string; identityId: string; displayName: string; businessRoles: string[] }>();
  for (const row of rows.results ?? []) {
    const account = accounts.get(row.subject_id) ?? { accountId: row.subject_id, identityId: row.id, displayName: row.display_name, businessRoles: [] };
    if (row.business_role && !account.businessRoles.includes(row.business_role)) account.businessRoles.push(row.business_role);
    accounts.set(row.subject_id, account);
  }
  return [...accounts.values()];
}
