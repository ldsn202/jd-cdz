import type { DatabaseSync } from 'node:sqlite';
import { JD_BUSINESS_ROLES, PROVIDER_BUSINESS_ROLES, ROLE_ACTIONS, isHumanRole } from './roles.ts';
import type { Account } from './sessions.ts';

export function buildCurrentContext(db: DatabaseSync, account: Account, grants: { grantId: string; scopeProviderIds: string[] }[]) {
  const service = !isHumanRole(account.role);
  const roles = account.role === 'JD_BUSINESS' ? JD_BUSINESS_ROLES
    : account.role === 'PROVIDER_BUSINESS' ? PROVIDER_BUSINESS_ROLES : [account.role];
  return {
    identitySource: 'identity_mock',
    subjectId: account.accountId,
    subjectType: service ? 'SERVICE' : 'HUMAN',
    displayName: account.displayName,
    verifiedAt: new Date().toISOString(),
    validUntil: null,
    authorizationVersion: 'authorization-mock-1',
    sourceIdentities: service ? [] : [{ sourceSystem: 'installation_management', sourceUserId: `src-${account.accountId}` }],
    grants: grants.flatMap((g) => roles.map(role => ({
      grantId: roles.length > 1 ? g.grantId + ':' + role : g.grantId,
      businessRole: service ? null : role,
      actions: [...new Set(ROLE_ACTIONS[role] ?? [])],
      scope: {
        scopeType: 'SERVICE_PROVIDER',
        sourceSystem: null,
        recordType: null,
        resourceIds: [...new Set(g.scopeProviderIds)],
      },
    }))),
  };
}
