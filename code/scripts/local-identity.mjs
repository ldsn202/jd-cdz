import { createHash } from 'node:crypto';

const roles = {
  JD_INSTALLATION_REVIEW: 'INSTALLATION_REVIEWER', JD_RECONCILIATION: 'BUSINESS_RECONCILER',
  JD_COORDINATION: 'FULFILLMENT_COORDINATOR', PROVIDER_DATA: 'PROVIDER_DOCUMENT_CLERK',
  PROVIDER_RECEIVABLE: 'PROVIDER_RECEIVABLE_OWNER', PROVIDER_INTEGRATION: 'PROVIDER_INTEGRATION_CONTACT',
};
const quote = value => value == null ? 'NULL' : typeof value === 'number' ? String(value) : "'" + String(value).replaceAll("'", "''") + "'";

// Identity bootstrap only. Business records always enter through the Worker HTTP API.
export function identitySql(context) {
  if (!context.subjectId || !context.identitySource || !Array.isArray(context.grants) || !context.grants.length) throw Error('来源身份不完整');
  if (!['SERVICE', 'HUMAN'].includes(context.subjectType)) throw Error('来源身份类型无效');
  const grants = context.grants.map(g => {
    const role = context.subjectType === 'SERVICE' ? null : roles[g.businessRole];
    if (context.subjectType === 'HUMAN' && !role) throw Error('未登记的来源业务角色：' + g.businessRole);
    if (g.scope?.scopeType !== 'SERVICE_PROVIDER' || !g.scope.resourceIds?.length || !g.actions?.length) throw Error('来源授权范围不完整');
    return { ...g, businessRole: role };
  });
  const content = JSON.stringify([context.authorizationVersion, context.sourceIdentities, grants]);
  const digest = createHash('sha256').update(content).digest('hex');
  const ref = 'local:' + context.subjectId, ctx = ref + ':' + digest;
  const now = Math.max(Date.now(), Date.parse(context.verifiedAt));
  if (!Number.isFinite(now)) throw Error('来源身份时间无效');
  const insert = (table, values, condition) => `INSERT INTO ${table} SELECT ${values.map(quote).join(',')} WHERE ${condition};`;
  const sql = [insert('identity_reference', [ref, context.identitySource, context.subjectId, context.subjectType, context.displayName, now, now], `NOT EXISTS(SELECT 1 FROM identity_reference WHERE id=${quote(ref)})`)];
  sql.push(`UPDATE identity_reference SET display_name=${quote(context.displayName)},gmt_modified=MAX(gmt_modified,${now}) WHERE id=${quote(ref)} AND display_name<>${quote(context.displayName)};`);
  grants.forEach((g, i) => sql.push(insert('business_permission', [ctx + ':grant:' + i, ctx, g.grantId, g.businessRole, JSON.stringify(g.actions), g.scope.scopeType, g.scope.sourceSystem, g.scope.recordType, JSON.stringify(g.scope.resourceIds), now, now], `NOT EXISTS(SELECT 1 FROM current_identity WHERE id=${quote(ctx)}) AND NOT EXISTS(SELECT 1 FROM business_permission WHERE id=${quote(ctx + ':grant:' + i)})`)));
  const stamp=`(SELECT MAX(${now},COALESCE(MAX(verified_at)+1,${now})) FROM current_identity WHERE identity_reference_id=${quote(ref)})`;
  const identityInsert=insert('current_identity', [ctx, ref, context.subjectType, '__IDENTITY_STAMP__', context.validUntil ? Date.parse(context.validUntil) : null, context.authorizationVersion, JSON.stringify(context.sourceIdentities ?? []), grants.length, ctx, '__IDENTITY_STAMP__', '__IDENTITY_STAMP__'], `NOT EXISTS(SELECT 1 FROM current_identity WHERE id=${quote(ctx)})`);
  sql.push(identityInsert.replaceAll("'__IDENTITY_STAMP__'",stamp));
  return sql.join('\n');
}
