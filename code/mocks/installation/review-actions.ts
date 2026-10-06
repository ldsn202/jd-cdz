import type { DatabaseSync } from 'node:sqlite';
import { hasAction, type Account } from '../identity/sessions.ts';
import { ROLE_ACTIONS } from '../identity/roles.ts';
import { recs, type RouteResult } from '../jd-bills/read.ts';
import { emitEvent } from '../src/storage/source-events.ts';

type Auth = { account: Account; grants: { grantId: string; scopeProviderIds: string[] }[] };

function badRequest(msg: string): RouteResult {
  return { http: 400, body: { code: 40001, msg, data: null } };
}

function resultData(row: { payload: any }) {
  const p = row.payload;
  return {
    operationId: p.operationId,
    workItemId: p.workItemId,
    installationWorkOrderId: p.installationWorkOrderId,
    action: p.action,
    operationStatus: p.operationStatus,
    pendingReason: p.pendingReason ?? null,
    sourceRecord: p.sourceRecord ?? null,
    resultDescription: p.resultDescription,
    verifiedAt: p.verifiedAt ?? null,
  };
}

function nextWoVersion(version: string): string {
  const m = /^work-order-(\d+)$/.exec(version);
  return `work-order-${(m ? Number(m[1]) : 1) + 1}`;
}

const ACTION_ROLE: Record<string, string> = {
  APPROVE: 'DECIDE_INSTALLATION_REVIEW',
  REQUEST_SUPPLEMENT: 'DECIDE_INSTALLATION_REVIEW',
  SUBMIT_SUPPLEMENT: 'SUBMIT_SUPPLEMENT',
};

export function postReviewAction(installationDb: DatabaseSync, auth: Auth, workOrderId: string, body: Record<string, unknown>): RouteResult {
  for (const f of ['operationId', 'workItemId', 'expectedWorkItemVersion', 'humanDecisionId', 'installationDetailId', 'expectedDetailVersion', 'expectedWorkOrderVersion'] as const) {
    if (typeof body[f] !== 'string' || (body[f] as string).trim() === '') return badRequest(`${f} 必填且非空`);
  }
  const action = body.action;
  if (action !== 'APPROVE' && action !== 'REQUEST_SUPPLEMENT' && action !== 'SUBMIT_SUPPLEMENT') return badRequest('action 非法');
  if (action === 'SUBMIT_SUPPLEMENT') {
    if (body.expectedAnalysisVersion !== null) return badRequest('SUBMIT_SUPPLEMENT 的 expectedAnalysisVersion 须为 null');
    if (typeof body.replyToOperationId !== 'string' || (body.replyToOperationId as string).trim() === '') return badRequest('SUBMIT_SUPPLEMENT 必须指向仍待回复的退回动作');
  } else {
    if (typeof body.expectedAnalysisVersion !== 'string' || (body.expectedAnalysisVersion as string).trim() === '') return badRequest('expectedAnalysisVersion 必填');
    if (body.replyToOperationId !== null) return badRequest('仅 SUBMIT_SUPPLEMENT 可携带 replyToOperationId');
  }
  if (typeof body.comment !== 'string') return badRequest('comment 必填');
  if (action !== 'APPROVE' && (body.comment as string).trim() === '') return badRequest('退回须有具体问题，补充须有具体回复');
  if ((body.comment as string).length > 4000) return badRequest('comment 超过 4000 字符上限');
  const materials = body.sourceMaterials;
  if (!Array.isArray(materials) || materials.length > 100 || !materials.every((m: any) => m && typeof m.sourceSystem === 'string' && m.sourceSystem.trim() !== '' && typeof m.sourceMaterialId === 'string' && m.sourceMaterialId.trim() !== '' && typeof m.sourceVersion === 'string' && m.sourceVersion.trim() !== '')) {
    return badRequest('sourceMaterials 每项须含 sourceSystem/sourceMaterialId/sourceVersion 非空（无文件为 []）');
  }

  const wo = recs(installationDb, 'work_order').find((w) => w.id === workOrderId);
  if (!wo) return { http: 404, body: { code: 40401, msg: '授权范围内工单不存在', data: null } };
  const providerId = wo.payload.serviceProviderId;
  if (!hasAction(auth, ACTION_ROLE[action]!, providerId, ROLE_ACTIONS)) {
    return { http: 403, body: { code: 40301, msg: '当前身份非该动作的当前责任人或越权', data: null } };
  }

  const operationId = body.operationId as string;
  const contentKey = JSON.stringify({ workOrderId, action, comment: body.comment, replyToOperationId: body.replyToOperationId ?? null, sourceMaterials: materials, workItemId: body.workItemId });
  const existing = recs(installationDb, 'review_action').find((r) => r.payload.operationId === operationId);
  if (existing) {
    if (existing.payload.contentKey !== contentKey) {
      return { http: 409, body: { code: 40902, msg: '同 operationId 的内容与原登记不同', data: null } };
    }
    return { http: 200, body: { code: 0, msg: 'success', data: resultData(existing) } };
  }
  const pendingOther = recs(installationDb, 'review_action').find((r) => r.payload.installationWorkOrderId === workOrderId && r.payload.operationStatus === 'PENDING')
    ?? recs(installationDb, 'installation_detail_submission').find((s) => s.payload.installationWorkOrderId === workOrderId && s.payload.submissionStatus === 'PENDING');
  if (pendingOther) {
    return { http: 409, body: { code: 40903, msg: '存在未确认结果的写动作', data: null } };
  }

  const detail = recs(installationDb, 'installation_detail').find((d) => d.payload.installationWorkOrderId === workOrderId);
  if (!detail || detail.payload.installationDetailId !== (body.installationDetailId as string)) {
    return { http: 404, body: { code: 40401, msg: '授权范围内明细不存在', data: null } };
  }
  if (detail.version !== body.expectedDetailVersion || wo.version !== body.expectedWorkOrderVersion) {
    return { http: 409, body: { code: 40901, msg: '明细或工单版本已变，保留意见并刷新相关信息', data: null } };
  }

  const reviewActions = recs(installationDb, 'review_action').filter((r) => r.payload.installationWorkOrderId === workOrderId && r.payload.operationStatus === 'SUCCEEDED');
  if (action === 'SUBMIT_SUPPLEMENT') {
    const target = reviewActions.find((r) => r.payload.operationId === (body.replyToOperationId as string) && r.payload.action === 'REQUEST_SUPPLEMENT');
    const answered = target && reviewActions.some((r) => r.payload.action === 'SUBMIT_SUPPLEMENT' && r.payload.replyToOperationId === target.payload.operationId);
    if (!target || answered) {
      return { http: 409, body: { code: 40903, msg: '该补充要求已不在待回复状态，请刷新原事项', data: null } };
    }
  }

  const materialIndex = recs(installationDb, 'material_index').filter((m) => m.payload.installationWorkOrderId === workOrderId);
  for (const m of materials as any[]) {
    const idx = materialIndex.find((x) => x.payload.sourceMaterialId === m.sourceMaterialId);
    if (!idx || idx.version !== m.sourceVersion) {
      return badRequest(`材料引用不可核实：${m.sourceMaterialId}@${m.sourceVersion}`);
    }
  }

  const now = new Date().toISOString();
  const newWoVersion = nextWoVersion(wo.version);
  const row = {
    operationId,
    workItemId: body.workItemId,
    installationWorkOrderId: workOrderId,
    serviceProviderId: providerId,
    action,
    comment: body.comment,
    replyToOperationId: body.replyToOperationId ?? null,
    sourceMaterials: materials,
    humanDecisionId: body.humanDecisionId,
    expectedWorkItemVersion: body.expectedWorkItemVersion,
    contentKey,
    operationStatus: 'SUCCEEDED',
    pendingReason: null,
    sourceRecord: {
      sourceSystem: 'installation_management',
      sourceRecordId: `review-${operationId}`,
      sourceVersion: 'review-1',
      workOrderSourceVersion: newWoVersion,
    },
    resultDescription:
      action === 'APPROVE' ? '核查通过结果已保存（不表示费用获批或业务结束）'
      : action === 'REQUEST_SUPPLEMENT' ? '退回补充已保存，原事项待服务商回复'
      : '补充回复已保存，原事项将更新分析并交京东复核',
    verifiedAt: now,
    operatorAccountId: auth.account.accountId,
  };

  installationDb.exec('BEGIN');
  try {
    installationDb
      .prepare('INSERT INTO source_record (kind, record_id, source_version, source_updated_at, payload_json) VALUES (?, ?, ?, ?, ?)')
      .run('review_action', operationId, 'review-action-1', now, JSON.stringify(row));
    const woPayload = { ...wo.payload };
    installationDb
      .prepare('UPDATE source_record SET source_version = ?, source_updated_at = ?, payload_json = ? WHERE kind = ? AND record_id = ?')
      .run(newWoVersion, now, JSON.stringify(woPayload), 'work_order', wo.id);
    emitEvent(installationDb, {
      changeId: `chg-${operationId}`,
      providerId,
      recordType: action === 'SUBMIT_SUPPLEMENT' ? 'SUPPLEMENTAL_RESPONSE' : 'INSTALLATION_REVIEW',
      sourceRecordId: `review-${operationId}`,
      sourceVersion: 'review-1',
      changeType: 'UPSERT',
      sourceUpdatedAt: now,
      relatedWorkOrderIds: [workOrderId],
      associationComplete: true,
    });
    emitEvent(installationDb, {
      changeId: `chg-wo-${operationId}`,
      providerId,
      recordType: 'INSTALLATION_WORK_ORDER',
      sourceRecordId: wo.id,
      sourceVersion: newWoVersion,
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
  return { http: 200, body: { code: 0, msg: 'success', data: resultData({ payload: row }) } };
}

export function getReviewAction(installationDb: DatabaseSync, auth: Auth, workOrderId: string, operationId: string): RouteResult {
  const wo = recs(installationDb, 'work_order').find((w) => w.id === workOrderId);
  if (!wo) return { http: 404, body: { code: 40401, msg: '授权范围内工单不存在', data: null } };
  const row = recs(installationDb, 'review_action').find((r) => r.payload.operationId === operationId);
  if (!row || row.payload.installationWorkOrderId !== workOrderId) {
    return { http: 404, body: { code: 40401, msg: '授权范围内关联操作不存在', data: null } };
  }
  const providerId = wo.payload.serviceProviderId;
  const canRead =
    hasAction(auth, 'READ_WORK_ORDER', providerId, ROLE_ACTIONS) ||
    hasAction(auth, 'DECIDE_INSTALLATION_REVIEW', providerId, ROLE_ACTIONS) ||
    hasAction(auth, 'SUBMIT_SUPPLEMENT', providerId, ROLE_ACTIONS) ||
    hasAction(auth, 'READ_WORK_ITEM', providerId, ROLE_ACTIONS);
  if (!canRead) {
    return { http: 403, body: { code: 40301, msg: '当前身份无读取权限', data: null } };
  }
  return { http: 200, body: { code: 0, msg: 'success', data: resultData(row) } };
}
