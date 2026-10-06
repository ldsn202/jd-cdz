import type { DatabaseSync } from 'node:sqlite';
import { hasAction, type Account } from '../identity/sessions.ts';
import { ROLE_ACTIONS } from '../identity/roles.ts';

export type RouteResult = { http: number; body: { code: number; msg: string; data: unknown } };

type Auth = { account: Account; grants: { grantId: string; scopeProviderIds: string[] }[] };

function recs(db: DatabaseSync, kind: string) {
  return (db.prepare("SELECT record_id, source_version, source_updated_at, payload_json FROM source_record WHERE kind = ?").all(kind) as any[]).map((r) => ({
    id: r.record_id,
    version: r.source_version,
    updatedAt: r.source_updated_at,
    payload: JSON.parse(r.payload_json),
  }));
}

export function getInstallationEntitlements(
  entitlementDb: DatabaseSync,
  installationDb: DatabaseSync,
  auth: Auth,
  purchaseOrderId: string,
  workOrderId: string | undefined
): RouteResult {
  if (!purchaseOrderId || !workOrderId) {
    return { http: 400, body: { code: 40001, msg: 'purchaseOrderId 或 installationWorkOrderId 缺失', data: null } };
  }
  const wo = recs(installationDb, 'work_order').find((w) => w.id === workOrderId);
  if (!wo) return { http: 404, body: { code: 40401, msg: '工单不存在', data: null } };
  if (!hasAction(auth, 'READ_WORK_ORDER', wo.payload.serviceProviderId, ROLE_ACTIONS)) {
    return { http: 403, body: { code: 40301, msg: '当前身份无权读取该工单关联订单', data: null } };
  }
  const po = recs(entitlementDb, 'purchase_order').find((p) => p.id === purchaseOrderId);
  if (!po) return { http: 404, body: { code: 40401, msg: '购买订单不存在', data: null } };
  if (wo.payload.purchaseOrderId !== purchaseOrderId) {
    return { http: 409, body: { code: 40901, msg: '工单与请求订单明确不匹配', data: null } };
  }

  const entitlements = recs(entitlementDb, 'installation_entitlement').filter((e) => e.payload.purchaseOrderId === purchaseOrderId);
  return {
    http: 200,
    body: {
      code: 0,
      msg: 'success',
      data: {
        retrievedAt: new Date().toISOString(),
        installationWorkOrderId: workOrderId,
        workOrderSourceVersion: wo.version,
        purchaseOrder: {
          purchaseOrderId: po.id,
          sourceSystem: 'purchase_order_system',
          sourceVersion: po.version,
          sourceUpdatedAt: po.updatedAt,
        },
        entitlementListComplete: true,
        entitlements: entitlements.map((e) => {
          const applicable = e.payload.installationWorkOrderId === workOrderId;
          return {
            installationEntitlementId: e.payload.entitlementId,
            name: '充电桩安装权益',
            sourceSystem: 'installation_entitlement_system',
            sourceVersion: e.version,
            sourceUpdatedAt: e.updatedAt,
            coveredServiceScope: e.payload.serviceScope ?? null,
            quantityType: typeof e.payload.quantityUpperLimit === 'number' ? 'LIMITED' : 'UNKNOWN',
            includedQuantity: typeof e.payload.quantityUpperLimit === 'number' ? e.payload.quantityUpperLimit : null,
            unit: typeof e.payload.quantityUpperLimit === 'number' ? '单' : null,
            validity: e.payload.effective === true ? 'VALID' : 'UNKNOWN',
            validityBasis: e.payload.effective === true ? '源记录明确为当前有效' : null,
            applicability: applicable ? 'APPLICABLE' : 'NOT_APPLICABLE',
            applicabilityBasis: applicable ? `源记录明确关联工单 ${workOrderId}` : `源记录关联其他工单 ${e.payload.installationWorkOrderId}`,
          };
        }),
        completeness: 'COMPLETE',
        missingParts: [],
      },
    },
  };
}
