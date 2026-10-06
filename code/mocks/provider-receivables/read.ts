import type { DatabaseSync } from 'node:sqlite';
import { hasAction, type Account } from '../identity/sessions.ts';
import { ROLE_ACTIONS } from '../identity/roles.ts';
import { recs, type RouteResult } from '../jd-bills/read.ts';

type Auth = { account: Account; grants: { grantId: string; scopeProviderIds: string[] }[] };

export function getProviderReceivable(receivableDb: DatabaseSync, installationDb: DatabaseSync, auth: Auth, sourceSystem: string, serviceProviderId: string, providerReceivableId: string, workOrderId: string | undefined): RouteResult {
  if (sourceSystem !== 'provider-receivable') {
    return { http: 400, body: { code: 40001, msg: `来源未配置：${sourceSystem}`, data: null } };
  }
  if (!workOrderId) return { http: 400, body: { code: 40001, msg: 'installationWorkOrderId 必填', data: null } };
  if (!hasAction(auth, 'READ_BILLING_RECORD', serviceProviderId, ROLE_ACTIONS)) {
    return { http: 403, body: { code: 40301, msg: '当前身份无该服务商应收访问权限', data: null } };
  }
  const current = recs(receivableDb, 'provider_receivable').find((r) => r.id === providerReceivableId);
  const revisions = recs(receivableDb, 'provider_receivable_revision').filter((r) => r.payload.providerReceivableId === providerReceivableId);
  const latest = revisions.length > 0 ? revisions[revisions.length - 1] : current;
  if (!latest || latest.payload.serviceProviderId !== serviceProviderId) {
    return { http: 404, body: { code: 40401, msg: '授权范围内指定应收不存在', data: null } };
  }
  const wo = recs(installationDb, 'work_order').find((w) => w.id === workOrderId);
  if (!wo) return { http: 404, body: { code: 40401, msg: '目标工单不存在', data: null } };
  if (!latest.payload.relatedWorkOrderIds.includes(workOrderId)) {
    return { http: 409, body: { code: 40901, msg: '目标工单明确不符', data: null } };
  }
  const single = latest.payload.relatedWorkOrderIds.length === 1;
  const target = single ? latest.payload.reportedTotalAmount : latest.payload.targetWorkOrderAmounts?.[workOrderId] ?? null;
  const missingParts: string[] = [];
  if (!single && target === null) missingParts.push('WORK_ORDER_AMOUNT');
  return {
    http: 200,
    body: {
      code: 0,
      msg: 'success',
      data: {
        retrievedAt: new Date().toISOString(),
        sourceSystem: 'provider-receivable',
        serviceProviderId,
        providerReceivableId,
        installationWorkOrderId: workOrderId,
        sourceVersion: latest.version,
        sourceUpdatedAt: latest.updatedAt,
        previousSourceVersion: latest.payload.previousSourceVersion ?? null,
        sourceRevisionNote: latest.payload.sourceRevisionNote ?? null,
        relatedWorkOrderIds: latest.payload.relatedWorkOrderIds,
        currency: latest.payload.currency ?? null,
        taxBasis: latest.payload.taxBasis ?? 'UNKNOWN',
        sourceStatus: latest.payload.sourceStatus ?? null,
        effectiveStatus: latest.payload.effectiveStatus ?? 'UNKNOWN',
        reportedTotalAmount: latest.payload.reportedTotalAmount,
        targetWorkOrderAmount: target,
        itemsComplete: true,
        items: latest.payload.items,
        completeness: missingParts.length === 0 ? 'COMPLETE' : 'INCOMPLETE',
        missingParts,
      },
    },
  };
}
