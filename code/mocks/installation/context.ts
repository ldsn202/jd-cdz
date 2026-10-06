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

export function getWorkOrderContext(installationDb: DatabaseSync, auth: Auth, workOrderId: string): RouteResult {
  if (!workOrderId || workOrderId.includes('/')) {
    return { http: 400, body: { code: 40001, msg: '工单编号缺失或格式非法', data: null } };
  }
  const wo = recs(installationDb, 'work_order').find((w) => w.id === workOrderId);
  if (!wo) return { http: 404, body: { code: 40401, msg: '工单不存在', data: null } };
  const providerId = wo.payload.serviceProviderId;
  if (!hasAction(auth, 'READ_WORK_ORDER', providerId, ROLE_ACTIONS)) {
    return { http: 403, body: { code: 40301, msg: '当前身份无权读取该工单', data: null } };
  }

  const plan = recs(installationDb, 'installation_plan').find((p) => p.payload.installationWorkOrderId === workOrderId) ?? null;
  const detail = recs(installationDb, 'installation_detail').find((d) => d.payload.installationWorkOrderId === workOrderId) ?? null;
  const canReadMaterials = hasAction(auth, 'READ_SOURCE_MATERIAL', providerId, ROLE_ACTIONS);
  const materials = canReadMaterials
    ? recs(installationDb, 'material_index').filter((m) => m.payload.installationWorkOrderId === workOrderId)
    : [];

  const missingParts: string[] = [];
  if(materials.some(m=>!m.payload.fileRef?.fileId||!m.payload.fileRef?.sourceSystem||!m.payload.fileRef?.sourceVersion))missingParts.push('SOURCE_MATERIAL_REFERENCE');
  if (!plan) missingParts.push('INSTALLATION_PLAN');
  if (!canReadMaterials) missingParts.push('SOURCE_MATERIAL_INDEX');

  return {
    http: 200,
    body: {
      code: 0,
      msg: 'success',
      data: {
        retrievedAt: new Date().toISOString(),
        completeness: missingParts.length === 0 ? 'COMPLETE' : 'INCOMPLETE',
        missingParts,
        installationWorkOrder: {
          installationWorkOrderId: wo.payload.installationWorkOrderId,
          purchaseOrderId: wo.payload.purchaseOrderId ?? null,
          serviceProviderId: providerId,
          sourceSystem: 'installation_management',
          sourceVersion: wo.version,
          sourceUpdatedAt: wo.updatedAt,
        },
        installationPlan: plan
          ? {
              installationPlanId: plan.payload.installationPlanId,
              installationWorkOrderId: plan.payload.installationWorkOrderId,
              sourceSystem: 'installation_management',
              sourceVersion: plan.version,
              sourceUpdatedAt: plan.updatedAt,
              items: plan.payload.items,
            }
          : null,
        installationDetailStatus: detail ? 'SUBMITTED' : 'NOT_SUBMITTED',
        installationDetail: detail
          ? {
              installationDetailId: detail.payload.installationDetailId,
              installationWorkOrderId: detail.payload.installationWorkOrderId,
              sourceSystem: 'installation_management',
              sourceVersion: detail.version,
              sourceUpdatedAt: detail.updatedAt,
              items: detail.payload.items,
            }
          : null,
        sourceMaterialIndexComplete: canReadMaterials,
        sourceMaterials: materials.filter(m=>m.payload.fileRef?.fileId&&m.payload.fileRef?.sourceSystem&&m.payload.fileRef?.sourceVersion).map((m) => ({
          sourceMaterialId: m.payload.fileRef.fileId,
          sourceSystem: m.payload.fileRef.sourceSystem,
          sourceVersion: m.payload.fileRef.sourceVersion,
          name: m.payload.name,
          mediaType: m.payload.mediaType,
          sourceUpdatedAt: m.updatedAt,
        })),
      },
    },
  };
}
