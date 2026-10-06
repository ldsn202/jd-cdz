import type { DatabaseSync } from 'node:sqlite';
import { hasAction, type Account } from '../identity/sessions.ts';
import { ROLE_ACTIONS } from '../identity/roles.ts';
import { recs, type RouteResult } from '../jd-bills/read.ts';

type Auth = { account: Account; grants: { grantId: string; scopeProviderIds: string[] }[] };

export function getFeeEvidence(termsDb: DatabaseSync, installationDb: DatabaseSync, jdBillingDb: DatabaseSync, auth: Auth, workOrderId: string, serviceProviderId: string | undefined): RouteResult {
  if (!serviceProviderId) return { http: 400, body: { code: 40001, msg: 'serviceProviderId 必填', data: null } };
  const wo = recs(installationDb, 'work_order').find((w) => w.id === workOrderId);
  if (!wo) return { http: 404, body: { code: 40401, msg: '授权范围内工单不存在', data: null } };
  const canBilling = hasAction(auth, 'READ_BILLING_RECORD', serviceProviderId, ROLE_ACTIONS);
  const canMaterial = hasAction(auth, 'READ_SOURCE_MATERIAL', serviceProviderId, ROLE_ACTIONS);
  if (!canBilling && !canMaterial) {
    return { http: 403, body: { code: 40301, msg: '当前身份无目标工单或服务商范围权限', data: null } };
  }
  if (wo.payload.serviceProviderId !== serviceProviderId) {
    return { http: 409, body: { code: 40901, msg: '工单与服务商关联明确不符', data: null } };
  }

  const bill = recs(jdBillingDb, 'jd_bill').find((b) => b.payload.relatedWorkOrderIds.includes(workOrderId));
  const period = bill?.payload.billingPeriod ?? null;

  const allTerms = recs(termsDb, 'billing_terms').filter((t) => t.payload.serviceProviderId === serviceProviderId && (!period || t.payload.billingPeriod === period));
  const allApprovals = recs(termsDb, 'fee_approval').filter((a) => a.payload.approvedWorkOrderIds?.includes(workOrderId));

  return {
    http: 200,
    body: {
      code: 0,
      msg: 'success',
      data: {
        retrievedAt: new Date().toISOString(),
        installationWorkOrderId: workOrderId,
        serviceProviderId,
        workOrderSourceVersion: wo.version,
        lookupScope: `目标工单 ${workOrderId} 关联服务商 ${serviceProviderId} 的计费条款${period ? `（账期 ${period}）` : ''}及针对该工单的费用批准记录`,
        termListComplete: true,
        approvalListComplete: true,
        terms: allTerms.map((t) => ({
          sourceSystem: 'billing-terms',
          sourceRecordId: t.id,
          sourceVersion: t.version,
          sourceUpdatedAt: t.updatedAt,
          title: `计费条款 ${t.id}`,
          sourceStatus: null,
          scope: `${t.payload.effectiveRange}；覆盖项目：${(t.payload.coveredItems ?? []).join('、')}`,
          applicability: 'APPLICABLE',
          applicabilityBasis: `条款记录明确归属服务商 ${serviceProviderId}${period ? ` 及账期 ${period}` : ''}`,
          recordText: t.payload.text ?? null,
          materialReferences: [],
          effectiveStatus: 'EFFECTIVE',
        })),
        approvals: allApprovals.map((a) => ({
          sourceSystem: 'billing-terms',
          sourceRecordId: a.id,
          sourceVersion: a.version,
          sourceUpdatedAt: a.updatedAt,
          title: `费用批准 ${a.id}`,
          sourceStatus: null,
          scope: `批准工单：${(a.payload.approvedWorkOrderIds ?? []).join('、')}`,
          applicability: 'APPLICABLE',
          applicabilityBasis: `批准记录明确覆盖工单 ${workOrderId}`,
          recordText: a.payload.recordText ?? `${a.payload.approver}：批准 ${a.payload.jdBillId} 所列费用。`,
          materialReferences: [],
          decision: 'APPROVED',
          decidedAt: a.payload.approvedAt ?? null,
        })),
        completeness: 'COMPLETE',
        missingParts: [],
      },
    },
  };
}
