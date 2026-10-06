import type { DatabaseSync } from 'node:sqlite';
import { hasAction, type Account } from '../identity/sessions.ts';
import { ROLE_ACTIONS } from '../identity/roles.ts';
import { recs, type RouteResult } from '../jd-bills/read.ts';
import { emitEvent } from '../src/storage/source-events.ts';

type Auth = { account: Account; grants: { grantId: string; scopeProviderIds: string[] }[] };

type SubmissionBody = {
  submissionId?: unknown;
  humanDecisionId?: unknown;
  installationDraftId?: unknown;
  confirmedDraftVersion?: unknown;
  expectedWorkOrderVersion?: unknown;
  expectedPlanVersion?: unknown;
  expectedDetailVersion?: unknown;
  items?: unknown;
  sourceMaterials?: unknown;
};

const TERMINAL = new Set(['SUCCEEDED', 'REJECTED']);

function badRequest(msg: string): RouteResult {
  return { http: 400, body: { code: 40001, msg, data: null } };
}

function validItems(items: unknown): items is any[] {
  return (
    Array.isArray(items) &&
    items.length >= 1 &&
    items.length <= 100 &&
    items.every(
      (it) =>
        it &&
        typeof it.installationItem === 'string' && it.installationItem.trim() !== '' &&
        typeof it.installedQuantity === 'number' && Number.isFinite(it.installedQuantity) && it.installedQuantity >= 0 &&
        typeof it.unit === 'string' && it.unit.trim() !== '' &&
        typeof it.materialSupplier === 'string' && it.materialSupplier.trim() !== '' &&
        typeof it.serviceScope === 'string' && it.serviceScope.trim() !== ''
    )
  );
}

function validMaterials(materials: unknown): materials is any[] {
  return (
    Array.isArray(materials) &&
    materials.every(
      (m) =>
        m &&
        typeof m.sourceSystem === 'string' && m.sourceSystem.trim() !== '' &&
        typeof m.sourceMaterialId === 'string' && m.sourceMaterialId.trim() !== '' &&
        typeof m.sourceVersion === 'string' && m.sourceVersion.trim() !== ''
    )
  );
}

function resultData(row: { payload: any }) {
  const p = row.payload;
  return {
    submissionId: p.submissionId,
    installationWorkOrderId: p.installationWorkOrderId,
    submissionStatus: p.submissionStatus,
    pendingReason: p.pendingReason ?? null,
    installationDetail: p.installationDetail ?? null,
    resultDescription: p.resultDescription,
    verifiedAt: p.verifiedAt ?? null,
  };
}

function nextDetailVersion(existing: { version: string } | null): string {
  if (!existing) return 'detail-1';
  const m = /^detail-(\d+)$/.exec(existing.version);
  return `detail-${(m ? Number(m[1]) : 1) + 1}`;
}

export function postInstallationDetailSubmission(installationDb: DatabaseSync, auth: Auth, workOrderId: string, body: SubmissionBody): RouteResult {
  for (const f of ['submissionId', 'humanDecisionId', 'installationDraftId', 'confirmedDraftVersion', 'expectedWorkOrderVersion', 'expectedPlanVersion'] as const) {
    if (typeof body[f] !== 'string' || (body[f] as string).trim() === '') return badRequest(`${f} 必填且非空`);
  }
  if (body.expectedDetailVersion !== null && typeof body.expectedDetailVersion !== 'string') return badRequest('expectedDetailVersion 须为 string 或 null');
  if (!validItems(body.items)) return badRequest('items 须为 1-100 项且每项字段完整（installedQuantity 非负）');
  if (!validMaterials(body.sourceMaterials)) return badRequest('sourceMaterials 每项须含 sourceSystem/sourceMaterialId/sourceVersion 非空');

  const wo = recs(installationDb, 'work_order').find((w) => w.id === workOrderId);
  if (!wo) return { http: 404, body: { code: 40401, msg: '授权范围内工单不存在', data: null } };
  if (!hasAction(auth, 'SUBMIT_INSTALLATION_DETAIL', wo.payload.serviceProviderId, ROLE_ACTIONS)) {
    return { http: 403, body: { code: 40301, msg: '当前身份无提交权限或无有效人员确认', data: null } };
  }

  const submissionId = body.submissionId as string;
  const existing = recs(installationDb, 'installation_detail_submission').find((s) => s.payload.submissionId === submissionId);
  const contentKey = JSON.stringify({ workOrderId, items: body.items, sourceMaterials: body.sourceMaterials, confirmedDraftVersion: body.confirmedDraftVersion });
  if (existing) {
    if (existing.payload.contentKey !== contentKey) {
      return { http: 409, body: { code: 40902, msg: '该提交编号已用于另一份确认内容', data: null } };
    }
    return { http: 200, body: { code: 0, msg: 'success', data: resultData(existing) } };
  }
  const pendingOther = recs(installationDb, 'installation_detail_submission').find(
    (s) => s.payload.installationWorkOrderId === workOrderId && s.payload.submissionStatus === 'PENDING'
  );
  if (pendingOther) {
    return { http: 409, body: { code: 40903, msg: '同工单另一笔提交/核查/补充动作尚未确认结果', data: null } };
  }

  const plan = recs(installationDb, 'installation_plan').find((p) => p.payload.installationWorkOrderId === workOrderId);
  const detail = recs(installationDb, 'installation_detail').find((d) => d.payload.installationWorkOrderId === workOrderId) ?? null;
  if (wo.version !== body.expectedWorkOrderVersion || !plan || plan.version !== body.expectedPlanVersion) {
    return { http: 409, body: { code: 40901, msg: '受理前版本变化或版本缺失，刷新必要资料后再提交', data: null } };
  }
  if (detail === null && body.expectedDetailVersion !== null) {
    return { http: 409, body: { code: 40901, msg: '首次提交须确认尚无正式明细（expectedDetailVersion=null）', data: null } };
  }
  if (detail !== null && body.expectedDetailVersion !== detail.version) {
    return { http: 409, body: { code: 40901, msg: '修订提交的预期明细版本与当前版本不符', data: null } };
  }

  const materialIndex = recs(installationDb, 'material_index').filter((m) => m.payload.installationWorkOrderId === workOrderId);
  for (const m of body.sourceMaterials as any[]) {
    const idx = materialIndex.find((x) => x.payload.sourceMaterialId === m.sourceMaterialId);
    if (!idx || m.sourceVersion !== idx.version) {
      return badRequest(`材料引用不可核实：${m.sourceMaterialId}@${m.sourceVersion}`);
    }
  }

  const now = new Date().toISOString();
  const detailVersion = nextDetailVersion(detail);
  const detailId = detail?.payload.installationDetailId ?? `DTL-${workOrderId.slice('WO-2609-'.length)}`;
  const submissionRow = {
    submissionId,
    installationWorkOrderId: workOrderId,
    serviceProviderId: wo.payload.serviceProviderId,
    humanDecisionId: body.humanDecisionId,
    installationDraftId: body.installationDraftId,
    confirmedDraftVersion: body.confirmedDraftVersion,
    contentKey,
    submissionStatus: 'SUCCEEDED',
    pendingReason: null,
    installationDetail: { sourceSystem: 'installation_management', installationDetailId: detailId, sourceVersion: detailVersion },
    resultDescription: '安装明细已提交，进入京东核查',
    verifiedAt: now,
  };

  installationDb.exec('BEGIN');
  try {
    installationDb
      .prepare('INSERT INTO source_record (kind, record_id, source_version, source_updated_at, payload_json) VALUES (?, ?, ?, ?, ?)')
      .run('installation_detail_submission', submissionId, 'submission-1', now, JSON.stringify(submissionRow));
    const detailPayload = {
      installationDetailId: detailId,
      installationWorkOrderId: workOrderId,
      items: body.items,
      submittedBy: auth.account.accountId,
      submissionId,
    };
    if (detail) {
      installationDb
        .prepare('UPDATE source_record SET source_version = ?, source_updated_at = ?, payload_json = ? WHERE kind = ? AND record_id = ?')
        .run(detailVersion, now, JSON.stringify(detailPayload), 'installation_detail', detail.id);
    } else {
      installationDb
        .prepare('INSERT INTO source_record (kind, record_id, source_version, source_updated_at, payload_json) VALUES (?, ?, ?, ?, ?)')
        .run('installation_detail', detailId, detailVersion, now, JSON.stringify(detailPayload));
    }
    emitEvent(installationDb, {
      changeId: `chg-${submissionId}`,
      providerId: wo.payload.serviceProviderId,
      recordType: 'INSTALLATION_DETAIL',
      sourceRecordId: detailId,
      sourceVersion: detailVersion,
      changeType: 'UPSERT',
      sourceUpdatedAt: now,
      relatedWorkOrderIds: [workOrderId],
      associationComplete: true,
    });
    installationDb.exec('COMMIT');
  } catch (e) {
    installationDb.exec('ROLLBACK');
    throw e;
  }
  return { http: 200, body: { code: 0, msg: 'success', data: resultData({ payload: submissionRow }) } };
}

export function getInstallationDetailSubmission(installationDb: DatabaseSync, auth: Auth, workOrderId: string, submissionId: string): RouteResult {
  const wo = recs(installationDb, 'work_order').find((w) => w.id === workOrderId);
  if (!wo) return { http: 404, body: { code: 40401, msg: '授权范围内工单不存在', data: null } };
  const row = recs(installationDb, 'installation_detail_submission').find((s) => s.payload.submissionId === submissionId);
  if (!row || row.payload.installationWorkOrderId !== workOrderId) {
    return { http: 404, body: { code: 40401, msg: '授权范围内关联操作不存在', data: null } };
  }
  const canRead =
    hasAction(auth, 'SUBMIT_INSTALLATION_DETAIL', wo.payload.serviceProviderId, ROLE_ACTIONS) ||
    hasAction(auth, 'READ_WORK_ORDER', wo.payload.serviceProviderId, ROLE_ACTIONS) ||
    hasAction(auth, 'DECIDE_INSTALLATION_REVIEW', wo.payload.serviceProviderId, ROLE_ACTIONS);
  if (!canRead) {
    return { http: 403, body: { code: 40301, msg: '当前身份无读取权限', data: null } };
  }
  return { http: 200, body: { code: 0, msg: 'success', data: resultData(row) } };
}
