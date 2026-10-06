import type { ResolvedIdentity } from './identity';
import { PendingWriteError, ServiceError, newId, nowMs } from './change-batch';
import type { WorkItemRow } from './work-item-query';
import {
  currentIdentityContextId,
  findPendingOperation,
  matchedGrants,
} from './installation-submit';
import { stableStringify } from './installation-draft';

export const REVIEW_DECIDE_ACTIONS = ['DECIDE_INSTALLATION_REVIEW'] as const;

export type ReviewQuestion = {
  findingId: string | null;
  question: string;
  requiredMaterialDescription: string;
};

export type ReviewDecisionBody = {
  expectedWorkItemVersion: number;
  expectedResponsibilityVersion: number;
  analysisResultId: string;
  action: 'APPROVE' | 'REQUEST_SUPPLEMENT';
  questions?: unknown;
  comment?: string | null;
};

export type ReviewDecisionResult = {
  decisionId: string;
  operationId: string;
  jobId: string;
  workItemId: string;
  rowVersion: number;
  status: 'ACCEPTED';
};

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function validateQuestions(raw: unknown, action: string): ReviewQuestion[] {
  if (action === 'APPROVE') {
    if (raw === undefined) return [];
    if (!Array.isArray(raw) || raw.length !== 0) {
      throw new ServiceError(400, 40001, 'APPROVE 的 questions 必须为空数组');
    }
    return [];
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ServiceError(400, 40001, 'REQUEST_SUPPLEMENT 的 questions 必须为非空数组');
  }
  return raw.map((entry, i) => {
    if (!isPlainObject(entry)) throw new ServiceError(400, 40001, `questions[${i}] 必须为对象`);
    const findingId = entry.findingId;
    if (findingId !== null && findingId !== undefined && (typeof findingId !== 'string' || findingId.trim().length === 0)) {
      throw new ServiceError(400, 40001, `questions[${i}].findingId 必须为非空字符串或 null`);
    }
    if (typeof entry.question !== 'string' || entry.question.trim().length === 0) {
      throw new ServiceError(400, 40001, `questions[${i}].question 必填且非空`);
    }
    if (typeof entry.requiredMaterialDescription !== 'string' || entry.requiredMaterialDescription.trim().length === 0) {
      throw new ServiceError(400, 40001, `questions[${i}].requiredMaterialDescription 必填且非空`);
    }
    return {
      findingId: (findingId as string | null | undefined) ?? null,
      question: entry.question,
      requiredMaterialDescription: entry.requiredMaterialDescription,
    };
  });
}

type ReviewContext = {
  sourceWorkOrderVersion: string;
  installationDetailId: string | null;
  sourceDetailVersion: string | null;
};

export async function loadReviewContext(db: D1Database, workOrderId: string): Promise<ReviewContext | null> {
  // Context is a fixed business input. A later, unbound read must not change the write target.
  const ctx = await db.prepare(
    `SELECT c.source_work_order_version, c.installation_detail_id, c.source_detail_version,
            d.source_id AS detail_source_id, d.source_system AS detail_source_system,
            w.source_system, c.service_provider_id
     FROM installation_work_order w
     JOIN installation_context_snapshot c ON c.id = w.context_snapshot_id
       AND c.installation_work_order_id = w.id AND c.service_provider_id = w.current_service_provider_id
     LEFT JOIN installation_detail d ON d.id = c.installation_detail_id AND d.installation_work_order_id = w.id
     WHERE w.id = ?`
  ).bind(workOrderId).first<{
    source_work_order_version: string | null; installation_detail_id: string | null;
    source_detail_version: string | null; detail_source_id: string | null;
    detail_source_system: string | null; source_system: string; service_provider_id: string;
  }>();
  if (!ctx?.source_work_order_version) return null;
  const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
  if (ctx.installation_detail_id) {
    // Never send the local storage ID, nor pair its identity with another receipt's version.
    if (!nonempty(ctx.detail_source_id) || !nonempty(ctx.source_detail_version) || ctx.detail_source_system !== ctx.source_system) return null;
    return { sourceWorkOrderVersion: ctx.source_work_order_version, installationDetailId: ctx.detail_source_id, sourceDetailVersion: ctx.source_detail_version };
  }
  const receipt = await db.prepare(
    `SELECT receipt_json FROM external_write_operation
     WHERE installation_work_order_id = ? AND service_provider_id = ? AND source_system = ?
       AND interface_kind = 'INSTALLATION_SUBMIT' AND status = 'SUCCEEDED'
     ORDER BY gmt_modified DESC, id DESC LIMIT 1`
  ).bind(workOrderId, ctx.service_provider_id, ctx.source_system).first<{ receipt_json: string }>();
  const detail = receipt ? JSON.parse(receipt.receipt_json).installationDetail : null;
  if (!detail || detail.sourceSystem !== ctx.source_system || !nonempty(detail.installationDetailId) || !nonempty(detail.sourceVersion)) return null;
  return { sourceWorkOrderVersion: ctx.source_work_order_version, installationDetailId: detail.installationDetailId, sourceDetailVersion: detail.sourceVersion };
}

export async function reviewDecision(
  db: D1Database,
  identity: ResolvedIdentity,
  row: WorkItemRow,
  idempotencyKey: string,
  body: ReviewDecisionBody
): Promise<ReviewDecisionResult> {
  if (!isPlainObject(body)) throw new ServiceError(400, 40001, '请求正文必须为对象');
  const allowedKeys = new Set([
    'expectedWorkItemVersion', 'expectedResponsibilityVersion', 'analysisResultId', 'action', 'questions', 'comment',
  ]);
  for (const key of Object.keys(body)) {
    if (!allowedKeys.has(key)) throw new ServiceError(400, 40001, `正文包含未声明字段：${key}`);
  }
  if (!Number.isInteger(body.expectedWorkItemVersion) || !Number.isInteger(body.expectedResponsibilityVersion)) {
    throw new ServiceError(400, 40001, 'expectedWorkItemVersion 与 expectedResponsibilityVersion 必填且为整数');
  }
  if (body.action !== 'APPROVE' && body.action !== 'REQUEST_SUPPLEMENT') {
    throw new ServiceError(400, 40002, 'action 须为 APPROVE 或 REQUEST_SUPPLEMENT');
  }
  if (typeof body.analysisResultId !== 'string' || body.analysisResultId.trim().length === 0) {
    throw new ServiceError(400, 40001, 'analysisResultId 必填');
  }
  if (body.comment !== undefined && body.comment !== null && typeof body.comment !== 'string') {
    throw new ServiceError(400, 40001, 'comment 必须为字符串或 null');
  }
  const questions = validateQuestions(body.questions, body.action);

  const order = await db
    .prepare('SELECT id, source_system, source_id FROM installation_work_order WHERE id = ?')
    .bind(row.installation_work_order_id)
    .first<{ id: string; source_system: string; source_id: string }>();
  if (!order) throw new ServiceError(422, 42201, '事项未关联可用的安装工单');

  const requestKey = `review:${identity.identityId}:${row.id}:${idempotencyKey}`;
  const contentDigest = await sha256Hex(
    stableStringify({
      expectedWorkItemVersion: body.expectedWorkItemVersion,
      expectedResponsibilityVersion: body.expectedResponsibilityVersion,
      analysisResultId: body.analysisResultId,
      action: body.action,
      questions,
      comment: body.comment ?? null,
    })
  );

  const priorDecision = await db
    .prepare(`SELECT id FROM human_decision WHERE request_key = ? AND origin = 'LOCAL'`)
    .bind(requestKey)
    .first<{ id: string }>();
  if (priorDecision) {
    const priorOp = await db
      .prepare('SELECT id, content_sha256 FROM external_write_operation WHERE human_decision_id = ?')
      .bind(priorDecision.id)
      .first<{ id: string; content_sha256: string }>();
    if (!priorOp) throw new ServiceError(500, 50001, '确认记录缺少外部写入登记');
    if (priorOp.content_sha256 !== contentDigest) {
      throw new ServiceError(409, 40902, '同一请求键已用于另一份确认内容');
    }
    const priorJob = await db
      .prepare(`SELECT id FROM background_job WHERE external_write_id = ? AND purpose = 'WRITE_EXTERNAL'`)
      .bind(priorOp.id)
      .first<{ id: string }>();
    return {
      decisionId: priorDecision.id,
      operationId: priorOp.id,
      jobId: priorJob?.id ?? '',
      workItemId: row.id,
      rowVersion: row.row_version,
      status: 'ACCEPTED',
    };
  }

  const pending = await findPendingOperation(db, row.id, row.installation_work_order_id);
  if (pending) {
    const opRow = await db
      .prepare(
        `SELECT o.id, o.human_decision_id, d.expected_work_item_version, d.expected_responsibility_version
         FROM external_write_operation o JOIN human_decision d ON d.id = o.human_decision_id WHERE o.id = ?`
      )
      .bind(pending.operationId)
      .first<{
        id: string; human_decision_id: string;
        expected_work_item_version: number | null; expected_responsibility_version: number | null;
      }>();
    if (
      opRow &&
      opRow.expected_work_item_version === body.expectedWorkItemVersion &&
      opRow.expected_responsibility_version === body.expectedResponsibilityVersion
    ) {
      const priorJob = await db
        .prepare(`SELECT id FROM background_job WHERE external_write_id = ? AND purpose = 'WRITE_EXTERNAL'`)
        .bind(opRow.id)
        .first<{ id: string }>();
      return {
        decisionId: opRow.human_decision_id,
        operationId: opRow.id,
        jobId: priorJob?.id ?? '',
        workItemId: row.id,
        rowVersion: row.row_version,
        status: 'ACCEPTED',
      };
    }
    throw new PendingWriteError(pending.operationId, pending.status, '事项或工单存在未决外部写入');
  }

  if (row.status === 'COMPLETED') throw new ServiceError(409, 40901, '事项已完成，不可再次提交决定');
  if (row.row_version !== body.expectedWorkItemVersion) {
    throw new ServiceError(409, 40901, '事项版本已变化，请刷新后重新确认');
  }
  if (row.responsibility_version !== body.expectedResponsibilityVersion) {
    throw new ServiceError(409, 40901, '责任版本已变化，请刷新后重新确认');
  }
  if (row.current_analysis_result_id !== body.analysisResultId) {
    throw new ServiceError(409, 40901, '分析结果不是当前代次，请刷新后重新确认');
  }

  const analysis = await db
    .prepare('SELECT id, status, open_questions_json FROM analysis_result WHERE id = ? AND work_item_id = ?')
    .bind(body.analysisResultId, row.id)
    .first<{ id: string; status: string; open_questions_json: string }>();
  if (!analysis) throw new ServiceError(409, 40901, '分析结果不属于本事项，请刷新后重新确认');
  if (body.action === 'APPROVE') {
    const open = JSON.parse(analysis.open_questions_json) as unknown[];
    if (analysis.status !== 'ANALYZED' || open.length > 0) {
      throw new ServiceError(422, 42201, '分析仍有未解决缺项，不可直接通过');
    }
  }

  const context = await loadReviewContext(db, row.installation_work_order_id ?? '');
  if (!context) throw new ServiceError(422, 42201, '缺少安装上下文，不可提交核查决定');
  const installationDetailId = context.installationDetailId;
  const sourceDetailVersion = context.sourceDetailVersion;
  if (!installationDetailId || !sourceDetailVersion) {
    throw new ServiceError(422, 42201, '正式安装明细或版本缺失，不可提交核查决定');
  }

  const operationId = newId('rv');
  const humanDecisionId = newId('hd');
  const jobId = newId('bj');
  const comment = body.comment ?? '';
  const requestJson = {
    operationId,
    workItemId: row.id,
    expectedWorkItemVersion: String(body.expectedWorkItemVersion),
    humanDecisionId,
    action: body.action,
    installationDetailId,
    expectedDetailVersion: sourceDetailVersion,
    expectedWorkOrderVersion: context.sourceWorkOrderVersion,
    expectedAnalysisVersion: body.analysisResultId,
    replyToOperationId: null,
    comment,
    sourceMaterials: [] as unknown[],
  };
  const requestText = JSON.stringify(requestJson);
  const verifiedAt = nowMs();

  const contextId = await currentIdentityContextId(db, identity.identityId);
  if (!contextId) throw new ServiceError(401, 40101, '当前身份上下文无效');
  const grants = matchedGrants(identity, row.service_provider_id, REVIEW_DECIDE_ACTIONS);
  if (grants.length === 0) throw new ServiceError(403, 40301, '当前身份无核查决定授权');
  const matchedJson = JSON.stringify(grants.map((g) => g.grantId));

  const contentForDecision = JSON.stringify({ ...requestJson, questions });

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO human_decision
         (id, work_item_id, service_provider_id, origin, action_type, request_key, actor_identity_id, identity_context_id,
          matched_grants_json, expected_work_item_version, expected_responsibility_version, analysis_result_id, confirmed_at,
          content_json, source_system, source_record_type, source_record_id, source_actor_ref_json, gmt_create, gmt_modified)
         VALUES (?, ?, ?, 'LOCAL', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?)`
      )
      .bind(
        humanDecisionId, row.id, row.service_provider_id, body.action, requestKey, identity.identityId, contextId,
        matchedJson, body.expectedWorkItemVersion, body.expectedResponsibilityVersion, body.analysisResultId,
        verifiedAt, contentForDecision, verifiedAt, verifiedAt
      ),
    db
      .prepare(
        `INSERT INTO external_write_operation
         (id, human_decision_id, work_item_id, service_provider_id, installation_work_order_id, source_system,
          interface_kind, action, request_json, content_sha256, status, receipt_json, verified_at, row_version, gmt_create, gmt_modified)
         VALUES (?, ?, ?, ?, ?, ?, 'REVIEW_SYNC', ?, ?, ?, 'REGISTERED', NULL, NULL, 1, ?, ?)`
      )
      .bind(
        operationId, humanDecisionId, row.id, row.service_provider_id, row.installation_work_order_id,
        order.source_system, body.action, requestText, contentDigest, verifiedAt, verifiedAt
      ),
    db
      .prepare(
        `INSERT INTO background_job
         (id, purpose, service_provider_id, work_item_id, external_write_id, target_json, dedupe_key, status, available_at,
          lease_epoch, lease_token, lease_owner, lease_until, row_version, outcome_json, gmt_create, gmt_modified)
         VALUES (?, 'WRITE_EXTERNAL', ?, ?, ?, ?, ?, 'READY', ?, 0, NULL, NULL, NULL, 1, NULL, ?, ?)`
      )
      .bind(
        jobId, row.service_provider_id, row.id, operationId,
        JSON.stringify({
          operationId,
          installationWorkOrderId: order.source_id,
          workItemId: row.id,
          action: body.action,
          request: requestJson,
        }),
        `write:${operationId}`, verifiedAt, verifiedAt, verifiedAt
      ),
    db
      .prepare(
        `INSERT INTO activity_record
         (id, work_item_id, event_key, event_type, actor_identity_id, fact_type, fact_id, occurred_at, details_json, gmt_create, gmt_modified)
         VALUES (?, ?, ?, 'DECISION_CONFIRMED', ?, 'HUMAN_DECISION', ?, ?, ?, ?, ?)`
      )
      .bind(
        newId('act'), row.id, `decision:${humanDecisionId}`, identity.identityId, humanDecisionId, verifiedAt,
        JSON.stringify({ action: body.action, operationId, questions }), verifiedAt, verifiedAt
      ),
    db
      .prepare(
        `UPDATE work_item SET pending_write_id = ?, status = 'PROCESSING', row_version = row_version + 1, gmt_modified = ?
         WHERE id = ? AND row_version = ? AND responsibility_version = ? AND pending_write_id IS NULL AND status <> 'COMPLETED'`
      )
      .bind(operationId, verifiedAt, row.id, row.row_version, row.responsibility_version),
  ];

  const results = await db.batch(statements);
  if (results[results.length - 1].meta.changes !== 1) {
    throw new ServiceError(409, 40901, '确认条件已变化，决定未生效');
  }

  return {
    decisionId: humanDecisionId,
    operationId,
    jobId,
    workItemId: row.id,
    rowVersion: row.row_version + 1,
    status: 'ACCEPTED',
  };
}
