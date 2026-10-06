import type { Grant, ResolvedIdentity } from './identity';

export function visibleProviderIds(identity: ResolvedIdentity): string[] {
  const ids = new Set<string>();
  for (const g of identity.grants) {
    if (g.scopeType === 'SERVICE_PROVIDER') for (const id of g.resourceIds) ids.add(id);
  }
  return [...ids];
}

export function providerVisible(identity: ResolvedIdentity, providerId: string): boolean {
  return visibleProviderIds(identity).includes(providerId);
}

export function hasAction(
  identity: ResolvedIdentity,
  action: string,
  scopeType: Grant['scopeType'],
  resourceId: string
): boolean {
  return identity.grants.some(
    (g) => g.scopeType === scopeType && g.actions.includes(action) && g.resourceIds.includes(resourceId)
  );
}

export function hasActionAnywhere(identity: ResolvedIdentity, action: string): boolean {
  return identity.grants.some((g) => g.actions.includes(action));
}
