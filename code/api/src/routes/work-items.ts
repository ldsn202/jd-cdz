import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { ERR, fail, newRequestId, ok, parsePage, toIso, nowMs } from '../lib/contract';
import { hasAction, hasActionAnywhere } from '../services/permission-guard';
import {
  analysisStatusOf,
  loadWorkItem,
  orderReadableProviderIds,
  queryWorkItems,
  queryWorkItemSummary,
  type WorkItemFilters,
  type WorkItemRow,
} from '../services/work-item-query';
import { loadSummaries, summaryAccessOf, type ReconciliationSummary } from '../services/reconciliation-summary';
import { readAnalysisContext, readSupplementRequest } from '../services/work-item-context';

import { analysisProgress, canRequestAnalysis, requestAnalysis } from '../services/analysis-control';
import { requiresManualAnalysis } from '../services/analysis-trigger';
import { ServiceError } from '../services/change-batch';

const workItems = new Hono<{ Bindings: Bindings; Variables: Variables }>();

function readFilters(c: { req: { query: (k: string) => string | undefined } }): WorkItemFilters {
  const responsibilityRaw = c.req.query('responsibility') ?? 'MINE';
  return {
    providerId: c.req.query('providerId') || undefined,
    workOrderId: c.req.query('workOrderId') || undefined,
    kind: c.req.query('kind') || undefined,
    status: c.req.query('status') || undefined,
    keyword: c.req.query('keyword') || undefined,
    responsibility: responsibilityRaw === 'VISIBLE' ? 'VISIBLE' : 'MINE',
  };
}

function mapListItem(
  identity: Variables['identity'],
  row: WorkItemRow,
  summaries: Map<string, ReconciliationSummary | null>
) {
  const access = summaryAccessOf(identity, row);
  return {
    workItemId: row.id,
    title: row.title,
    kind: row.item_kind,
    status: row.status,
    providerId: row.service_provider_id,
    providerName: row.provider_name ?? '',
    workOrderId: row.installation_work_order_id,
    assignee: row.assignee_identity_id
      ? { identityId: row.assignee_identity_id, displayName: row.assignee_display_name ?? '' }
      : null,
    rowVersion: row.row_version,
    responsibilityVersion: row.responsibility_version,
    analysisGeneration: row.analysis_generation,
    analysisStatus: analysisStatusOf(row),
    updatedAt: toIso(row.gmt_modified),
    reconciliationSummary: access === 'ALLOWED' ? summaries.get(row.id) ?? null : null,
    reconciliationSummaryAccess: access,
  };
}

async function checkWorkOrderVisible(
  db: D1Database,
  identity: Variables['identity'],
  workOrderId: string
): Promise<boolean> {
  const ids = orderReadableProviderIds(identity);
  if (ids.length === 0) return false;
  const order = await db
    .prepare(
      `SELECT wo.id FROM installation_work_order wo
       WHERE wo.id = ? AND wo.current_service_provider_id IN (SELECT value FROM json_each(?))`
    )
    .bind(workOrderId, JSON.stringify(ids))
    .first<{ id: string }>();
  return !!order;
}

workItems.get('/work-items', async (c) => {
  const requestId = newRequestId();
  const parsed = parsePage(c, requestId);
  if (parsed instanceof Response) return parsed;
  const identity = c.get('identity');
  const filters = readFilters(c);

  if (filters.workOrderId && !(await checkWorkOrderVisible(c.env.DB, identity, filters.workOrderId))) {
    return fail(c, 404, ERR.NOT_FOUND, '资源不存在或不可见', requestId);
  }

  const result = await queryWorkItems(c.env.DB, identity, filters, parsed.page, parsed.pageSize);
  if ('error' in result) {
    return fail(c, 400, ERR.ENUM_INVALID, `非法枚举值：${result.error === 'KIND' ? 'kind' : 'status'}`, requestId);
  }
  const summaries = await loadSummaries(c.env.DB, result.list);
  return ok(
    c,
    {
      list: result.list.map((r) => mapListItem(identity, r, summaries)),
      total: result.total,
      page: parsed.page,
      pageSize: parsed.pageSize,
      asOf: toIso(nowMs()),
    },
    requestId
  );
});

workItems.get('/work-items/summary', async (c) => {
  const requestId = newRequestId();
  const identity = c.get('identity');
  const filters = readFilters(c);
  if (filters.workOrderId && !(await checkWorkOrderVisible(c.env.DB, identity, filters.workOrderId))) {
    return fail(c, 404, ERR.NOT_FOUND, '资源不存在或不可见', requestId);
  }
  const result = await queryWorkItemSummary(c.env.DB, identity, filters);
  if ('error' in result) {
    return fail(c, 400, ERR.ENUM_INVALID, `非法枚举值：${result.error === 'KIND' ? 'kind' : 'status'}`, requestId);
  }
  return ok(c, { ...result, asOf: toIso(nowMs()) }, requestId);
});

const KIND_ACTIONS: Record<string, { actions: string[]; when?: (row: WorkItemRow) => boolean }[]> = {
  INSTALLATION_PREPARATION: [{ actions: ['CONFIRM_INSTALLATION_DRAFT', 'SUBMIT_INSTALLATION_DETAIL'] }],
  INSTALLATION_REVIEW: [
    { actions: ['DECIDE_INSTALLATION_REVIEW'], when: (r) => r.status === 'READY' },
    { actions: ['SUBMIT_SUPPLEMENT'], when: (r) => r.status === 'WAITING_SUPPLEMENT' },
    { actions: ['RECORD_EXCEPTION_RESULT'], when: (r) => r.status === 'EXCEPTION' },
  ],
  RECONCILIATION: [{ actions: ['REQUEST_BILLING_VERIFICATION', 'REPLY_BILLING_VERIFICATION'] }],
  CONFIGURATION: [{ actions: ['ENABLE_INTEGRATION_CONFIG'] }],
  COORDINATION: [
    { actions: ['COMPLETE_FULFILLMENT_COORDINATION'], when: (r) => r.status !== 'EXCEPTION' },
    { actions: ['RECORD_EXCEPTION_RESULT'], when: (r) => r.status === 'EXCEPTION' },
  ],
};

function computeAllowedActions(identity: Variables['identity'], row: WorkItemRow): string[] {
  if (row.status === 'COMPLETED' || row.status === 'PROCESSING' || row.pending_write_id) return [];
  if (row.assignee_identity_id !== identity.identityId) return [];
  const rules = KIND_ACTIONS[row.item_kind] ?? [];
  const allowed: string[] = [];
  for (const rule of rules) {
    if (rule.when && !rule.when(row)) continue;
    for (const action of rule.actions) {
      if (hasAction(identity, action, 'SERVICE_PROVIDER', row.service_provider_id)) allowed.push(action);
    }
  }
  if (hasAction(identity, 'RECORD_EXCEPTION_RESULT', 'SERVICE_PROVIDER', row.service_provider_id)
      && !allowed.includes('RECORD_EXCEPTION_RESULT')) allowed.push('RECORD_EXCEPTION_RESULT');
  return allowed;
}

workItems.get('/work-items/:workItemId', async (c) => {
  const requestId = newRequestId();
  const identity = c.get('identity');
  const workItemId = c.req.param('workItemId');
  if (!hasActionAnywhere(identity, 'READ_WORK_ITEM')) {
    return fail(c, 404, ERR.NOT_FOUND, '资源不存在或不可见', requestId);
  }
  const row = await loadWorkItem(c.env.DB, identity, workItemId);
  if (!row) {
    return fail(c, 404, ERR.NOT_FOUND, '资源不存在或不可见', requestId);
  }

  let analysis: unknown = null;
  if (row.current_analysis_result_id && (row.item_kind !== 'RECONCILIATION' || hasAction(identity, 'READ_BILLING_RECORD', 'SERVICE_PROVIDER', row.service_provider_id))) {
    const ar = await c.env.DB.prepare(
      `SELECT id, run_id, snapshot_id, status, summary, findings_json, open_questions_json, validated_at
       FROM analysis_result WHERE id = ? AND work_item_id = ?`
    )
      .bind(row.current_analysis_result_id, row.id)
      .first<{
        id: string; run_id: string; snapshot_id: string; status: string; summary: string;
        findings_json: string; open_questions_json: string; validated_at: number;
      }>();
    if (ar) {
      const inputContext = hasAction(identity, 'READ_SOURCE_MATERIAL', 'SERVICE_PROVIDER', row.service_provider_id)
        ? await readAnalysisContext(c.env.DB, ar.snapshot_id)
        : { contextRecords: [], evidenceMaterials: [] };
      analysis = {
        ...inputContext,
        contextRecords: inputContext.contextRecords.filter(r =>
          !['JD_BILL','PROVIDER_RECEIVABLE','BILLING_TERM','FEE_APPROVAL_RECORD'].includes(r.recordType)
          || hasAction(identity, 'READ_BILLING_RECORD', 'SERVICE_PROVIDER', row.service_provider_id)),
        resultId: ar.id,
        runId: ar.run_id,
        inputSnapshotId: ar.snapshot_id,
        analysisGeneration: row.analysis_generation,
        status: ar.status,
        summary: ar.summary,
        findings: JSON.parse(ar.findings_json),
        openQuestions: JSON.parse(ar.open_questions_json),
        validatedAt: toIso(ar.validated_at),
      };
    }
  }

  let pendingOperation: unknown = null;
  if (row.pending_write_id) {
    const op = await c.env.DB.prepare(`SELECT id, status FROM external_write_operation WHERE id = ?`)
      .bind(row.pending_write_id)
      .first<{ id: string; status: string }>();
    if (op) pendingOperation = { operationId: op.id, status: op.status };
  }

  const completion = row.completion_code
    ? {
        code: row.completion_code,
        basis: row.completion_basis_json ? JSON.parse(row.completion_basis_json) : null,
        decisionId: row.completion_decision_id,
        completedAt: row.completed_at ? toIso(row.completed_at) : null,
      }
    : null;

  const links = await c.env.DB.prepare(
    `SELECT l.to_work_item_id AS related_id, l.reason_code, w.title
     FROM work_item_link l JOIN work_item w ON w.id = l.to_work_item_id
     WHERE l.from_work_item_id = ?
     UNION
     SELECT l.from_work_item_id AS related_id, l.reason_code, w.title
     FROM work_item_link l JOIN work_item w ON w.id = l.from_work_item_id
     WHERE l.to_work_item_id = ?`
  )
    .bind(row.id, row.id)
    .all<{ related_id: string; reason_code: string; title: string }>();
  const relatedItems: { workItemId: string; reasonCode: string; title: string }[] = [];
  for (const l of links.results ?? []) {
    if (await loadWorkItem(c.env.DB, identity, l.related_id)) {
      relatedItems.push({ workItemId: l.related_id, reasonCode: l.reason_code, title: l.title });
    }
  }

  const summaries = await loadSummaries(c.env.DB, [row]);
  const base = mapListItem(identity, row, summaries);
  const progress=await analysisProgress(c.env.DB, row, requiresManualAnalysis(c.env));

  return ok(
    c,
    {
      ...base,
      analysis,
      analysisProgress: progress,
      analysisTriggerMode: requiresManualAnalysis(c.env) ? 'manual' : 'automatic',
      analysisRuntimeError: c.env.ANALYSIS_RUNTIME_ERROR || null,
      canRequestAnalysis: canRequestAnalysis(identity, row) && progress.state !== 'CHECKED',
      activeSupplementRequest: await readSupplementRequest(c.env.DB, row.id, row.active_supplement_request_id),
      pendingOperation,
      completion,
      allowedActions: computeAllowedActions(identity, row),
      blockedReasons: [
        ...(row.status === 'BLOCKED' && row.blocked_reason
          ? [{ code: 'BLOCKED', description: row.blocked_reason }]
          : []),
        ...(row.status === 'WAITING_SUPPLEMENT' && !row.assignee_identity_id
          ? [{ code: 'RESPONSIBILITY_UNRESOLVED', description: '尚未取得服务商资料责任人，暂不可提交补充回复' }]
          : []),
      ],
      relatedItems,
    },
    requestId
  );
});

workItems.post('/work-items/:workItemId/analysis', async (c) => {
  const requestId = newRequestId(), identity = c.get('identity');
  const row = await loadWorkItem(c.env.DB, identity, c.req.param('workItemId'));
  if (!row) return fail(c, 404, ERR.NOT_FOUND, '资源不存在或不可见', requestId);
  if (c.env.ANALYSIS_RUNTIME_ERROR) return fail(c, 503, 50301, c.env.ANALYSIS_RUNTIME_ERROR, requestId);
  const key = c.req.header('Idempotency-Key');
  if (!key || key.length > 120) return fail(c, 400, ERR.FIELD_INVALID, '需要有效的请求编号', requestId);
  let body: { expectedVersion?: number };
  try { body = await c.req.json(); } catch { return fail(c, 400, ERR.FIELD_INVALID, '请求正文无效', requestId); }
  if (!body || !Number.isInteger(body.expectedVersion) || Number(body.expectedVersion) < 1) return fail(c, 400, ERR.FIELD_INVALID, '需要有效的事项版本', requestId);
  try { return ok(c, await requestAnalysis(c.env.DB, identity, row, key, body.expectedVersion!), requestId); }
  catch (e) { if (e instanceof ServiceError) return fail(c, e.httpStatus, e.code, e.message, requestId); throw e; }
});

function describeActivity(detailsJson: string): string {
  try {
    const d = JSON.parse(detailsJson) as { description?: unknown; summary?: unknown };
    if (typeof d.description === 'string' && d.description.length > 0) return d.description;
    if (typeof d.summary === 'string' && d.summary.length > 0) return d.summary;
  } catch {
    // 非对象详情按原文返回
  }
  return detailsJson;
}

workItems.get('/work-items/:workItemId/activities', async (c) => {
  const requestId = newRequestId();
  const parsed = parsePage(c, requestId);
  if (parsed instanceof Response) return parsed;
  const identity = c.get('identity');
  const workItemId = c.req.param('workItemId');
  const row = await loadWorkItem(c.env.DB, identity, workItemId);
  if (!row) {
    return fail(c, 404, ERR.NOT_FOUND, '资源不存在或不可见', requestId);
  }
  const totalRow = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM activity_record WHERE work_item_id = ?`)
    .bind(workItemId)
    .first<{ n: number }>();
  const rows = await c.env.DB.prepare(
    `SELECT a.id, a.event_type, a.actor_identity_id, i.display_name AS actor_name,
            a.occurred_at, a.details_json, a.fact_type, a.fact_id, a.gmt_create,
            (SELECT o.id FROM external_write_operation o WHERE o.work_item_id = a.work_item_id
              AND ((a.fact_type = 'EXTERNAL_WRITE_OPERATION' AND o.id = a.fact_id)
                OR (a.fact_type = 'HUMAN_DECISION' AND o.human_decision_id = a.fact_id)) LIMIT 1) AS operation_id
     FROM activity_record a LEFT JOIN identity_reference i ON i.id = a.actor_identity_id
     WHERE a.work_item_id = ? ORDER BY a.gmt_create DESC, a.id DESC LIMIT ? OFFSET ?`
  )
    .bind(workItemId, parsed.pageSize, (parsed.page - 1) * parsed.pageSize)
    .all<{
      id: string; event_type: string; actor_identity_id: string | null; actor_name: string | null;
      occurred_at: number | null; details_json: string; fact_type: string | null; fact_id: string | null;
      gmt_create: number; operation_id: string | null;
    }>();
  const list = (rows.results ?? []).map((r) => ({
    activityId: r.id,
    eventType: r.event_type,
    actor: r.actor_identity_id ? { identityId: r.actor_identity_id, displayName: r.actor_name ?? '' } : null,
    occurredAt: r.occurred_at ? toIso(r.occurred_at) : null,
    description: describeActivity(r.details_json),
    factType: r.fact_type,
    factId: r.fact_id,
    operationId: r.operation_id,
  }));
  return ok(c, { list, total: totalRow?.n ?? 0, page: parsed.page, pageSize: parsed.pageSize }, requestId);
});

workItems.get('/operations/:operationId', async (c) => {
  const requestId = newRequestId();
  const identity = c.get('identity');
  const operationId = c.req.param('operationId');
  const op = await c.env.DB.prepare(
    `SELECT id, work_item_id, service_provider_id, status, receipt_json, verified_at
     FROM external_write_operation WHERE id = ?`
  )
    .bind(operationId)
    .first<{
      id: string; work_item_id: string; service_provider_id: string; status: string;
      receipt_json: string | null; verified_at: number | null;
    }>();
  if (!op) {
    return fail(c, 404, ERR.NOT_FOUND, '资源不存在或不可见', requestId);
  }
  const row = await loadWorkItem(c.env.DB, identity, op.work_item_id);
  if (!row) {
    return fail(c, 404, ERR.NOT_FOUND, '资源不存在或不可见', requestId);
  }

  let localContinuationStatus: 'NOT_READY' | 'PENDING' | 'COMPLETED' | 'BLOCKED';
  if (op.status === 'REJECTED') {
    localContinuationStatus = 'BLOCKED';
  } else if (op.status !== 'SUCCEEDED') {
    localContinuationStatus = 'NOT_READY';
  } else {
    const cont = await c.env.DB.prepare(
      `SELECT 1 AS x FROM activity_record WHERE work_item_id = ? AND event_type = 'SOURCE_WRITE_RESULT' AND fact_id = ?`
    )
      .bind(op.work_item_id, op.id)
      .first<{ x: number }>();
    localContinuationStatus = cont ? 'COMPLETED' : 'PENDING';
  }

  return ok(
    c,
    {
      operationId: op.id,
      workItemId: op.work_item_id,
      status: op.status,
      receipt: op.receipt_json ? JSON.parse(op.receipt_json) : null,
      verifiedAt: op.verified_at ? toIso(op.verified_at) : null,
      localContinuationStatus,
    },
    requestId
  );
});

export default workItems;
