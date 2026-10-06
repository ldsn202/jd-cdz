import type { DatabaseSync } from 'node:sqlite';
import { hasAction, type Account } from '../identity/sessions.ts';
import { ROLE_ACTIONS } from '../identity/roles.ts';

export type RouteResult = { http: number; body: { code: number; msg: string; data: unknown } };

type Auth = { account: Account; grants: { grantId: string; scopeProviderIds: string[] }[] };

export function recs(db: DatabaseSync, kind: string) {
  return (db.prepare("SELECT record_id, source_version, source_updated_at, payload_json FROM source_record WHERE kind = ?").all(kind) as any[]).map((r) => ({
    id: r.record_id,
    version: r.source_version,
    updatedAt: r.source_updated_at,
    payload: JSON.parse(r.payload_json),
  }));
}

export function getJdBill(jdBillingDb: DatabaseSync, installationDb: DatabaseSync, auth: Auth, jdBillId: string, workOrderId: string | undefined): RouteResult {
  if (!workOrderId) return { http: 400, body: { code: 40001, msg: 'installationWorkOrderId 必填', data: null } };
  const bill = recs(jdBillingDb, 'jd_bill').find((b) => b.id === jdBillId);
  if (!bill) return { http: 404, body: { code: 40401, msg: '指定账单不存在', data: null } };
  if (!hasAction(auth, 'READ_BILLING_RECORD', bill.payload.serviceProviderId, ROLE_ACTIONS)) {
    return { http: 403, body: { code: 40301, msg: '当前身份无整张账单访问权限', data: null } };
  }
  const wo = recs(installationDb, 'work_order').find((w) => w.id === workOrderId);
  if (!wo) return { http: 404, body: { code: 40401, msg: '目标工单不存在', data: null } };
  if (!bill.payload.relatedWorkOrderIds.includes(workOrderId)) {
    return { http: 409, body: { code: 40901, msg: '账单与目标工单明确不符', data: null } };
  }
  const single = bill.payload.relatedWorkOrderIds.length === 1;
  const target = single ? bill.payload.reportedTotalAmount : bill.payload.targetWorkOrderAmounts?.[workOrderId] ?? null;
  const missingParts: string[] = [];
  if (!single && target === null) missingParts.push('WORK_ORDER_AMOUNT');
  return {
    http: 200,
    body: {
      code: 0,
      msg: 'success',
      data: {
        retrievedAt: new Date().toISOString(),
        jdBillId: bill.id,
        installationWorkOrderId: workOrderId,
        serviceProviderId: bill.payload.serviceProviderId,
        sourceSystem: 'jd_bill_system',
        sourceVersion: bill.version,
        sourceUpdatedAt: bill.updatedAt,
        relatedWorkOrderIds: bill.payload.relatedWorkOrderIds,
        currency: bill.payload.currency ?? null,
        taxBasis: bill.payload.taxBasis ?? 'UNKNOWN',
        sourceStatus: bill.payload.sourceStatus ?? null,
        effectiveStatus: bill.payload.effectiveStatus ?? 'UNKNOWN',
        reportedTotalAmount: bill.payload.reportedTotalAmount,
        targetWorkOrderAmount: target,
        itemsComplete: true,
        items: bill.payload.items,
        completeness: missingParts.length === 0 ? 'COMPLETE' : 'INCOMPLETE',
        missingParts,
      },
    },
  };
}
