import { newId, nowMs } from './change-batch';
import { resolveResponsibility } from './responsibility';
import { scheduleInputPreparation } from './source-discovery';

// 外部写入结果采纳：把后台程序回报的外部契约结果固定为操作终态，并完成本地接续。
// 说明：外部调用与回查由后台任务程序执行；本模块只处理「结果已取得」后的本系统事实。

export type WriteAdoption =
  | { ok: true; statements: D1PreparedStatement[]; jobStatus?: 'SUCCEEDED' | 'RETRY_WAIT' | 'BLOCKED' }
  | { ok: false; errorCode: string };

type ExternalResult = {
  submissionStatus?: string;
  operationStatus?: string;
  pendingReason?: string | null;
  installationDetail?: { sourceSystem?: string; installationDetailId?: string; sourceVersion?: string } | null;
  sourceRecord?: { sourceSystem?: string; sourceRecordId?: string; sourceVersion?: string } | null;
  resultDescription?: string | null;
  verifiedAt?: string | null;
};

type WorkItemPointer = {
  row_version: number;
  pending_write_id: string | null;
  status: string;
  service_provider_id: string;
  assignee_identity_id: string | null;
  responsibility_version: number;
  analysis_generation: number;
};

async function loadWorkItemPointer(db: D1Database, workItemId: string): Promise<WorkItemPointer | null> {
  return db
    .prepare(
      `SELECT row_version, pending_write_id, status, service_provider_id, assignee_identity_id, responsibility_version, analysis_generation
       FROM work_item WHERE id = ?`
    )
    .bind(workItemId)
    .first<WorkItemPointer>();
}

async function ensureInstallationDetail(
  db: D1Database,
  workOrderId: string,
  sourceSystem: string,
  sourceId: string,
  now: number
): Promise<D1PreparedStatement | null> {
  const existing = await db
    .prepare('SELECT id FROM installation_detail WHERE source_system = ? AND source_id = ?')
    .bind(sourceSystem, sourceId)
    .first<{ id: string }>();
  if (existing) return null;
  return db
    .prepare(
      `INSERT INTO installation_detail (id, installation_work_order_id, source_system, source_id, gmt_create, gmt_modified)
       SELECT ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (
         SELECT 1 FROM installation_detail WHERE source_system = ? AND source_id = ?)`
    )
    .bind(newId('idet'), workOrderId, sourceSystem, sourceId, now, now, sourceSystem, sourceId);
}

function sourceWriteActivity(
  db: D1Database,
  workItemId: string,
  operationId: string,
  details: Record<string, unknown>,
  now: number
): D1PreparedStatement {
  const eventKey = `source-write-result:${operationId}`;
  return db
    .prepare(
      `INSERT INTO activity_record
       (id, work_item_id, event_key, event_type, actor_identity_id, fact_type, fact_id, occurred_at, details_json, gmt_create, gmt_modified)
       SELECT ?, ?, ?, 'SOURCE_WRITE_RESULT', NULL, 'EXTERNAL_WRITE_OPERATION', ?, ?, ?, ?, ? WHERE NOT EXISTS (
         SELECT 1 FROM activity_record WHERE work_item_id = ? AND event_key = ?)`
    )
    .bind(newId('act'), workItemId, eventKey, operationId, now, JSON.stringify(details), now, now, workItemId, eventKey);
}

async function adoptInstallationSubmit(
  db: D1Database,
  op: { id: string; work_item_id: string; installation_work_order_id: string },
  r: ExternalResult,
  receipt: string,
  now: number
): Promise<WriteAdoption> {
  const detail = r.installationDetail;
  if (
    !detail || typeof detail.sourceSystem !== 'string' || detail.sourceSystem.trim().length === 0 ||
    typeof detail.installationDetailId !== 'string' || detail.installationDetailId.trim().length === 0 ||
    typeof detail.sourceVersion !== 'string' || detail.sourceVersion.trim().length === 0
  ) {
    return { ok: false, errorCode: 'WRITE_RECEIPT_INCOMPLETE' };
  }

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE external_write_operation
         SET status = 'SUCCEEDED', receipt_json = ?, verified_at = ?, row_version = row_version + 1, gmt_modified = ?
         WHERE id = ? AND status IN ('REGISTERED','PROCESSING','RESULT_UNKNOWN')`
      )
      .bind(receipt, now, now, op.id),
  ];

  const detailStatement = await ensureInstallationDetail(
    db, op.installation_work_order_id, detail.sourceSystem, detail.installationDetailId, now
  );
  if (detailStatement) statements.push(detailStatement);

  const item = await loadWorkItemPointer(db, op.work_item_id);
  if (!item) return { ok: false, errorCode: 'WRITE_ITEM_MISSING' };

  const basis = JSON.stringify({
    submissionId: op.id,
    operationId: op.id,
    installationDetail: {
      sourceSystem: detail.sourceSystem,
      installationDetailId: detail.installationDetailId,
      sourceVersion: detail.sourceVersion,
    },
  });

  if (item.status !== 'COMPLETED' && item.pending_write_id === op.id) {
    statements.push(
      db
        .prepare(
          `UPDATE work_item
           SET status = 'COMPLETED', completion_code = 'INSTALLATION_SUBMITTED', completion_basis_json = ?,
               completion_decision_id = (SELECT human_decision_id FROM external_write_operation WHERE id = ?),
               completed_at = ?, pending_write_id = NULL, blocked_reason = NULL,
               row_version = row_version + 1, gmt_modified = ?
           WHERE id = ? AND row_version = ? AND pending_write_id = ?`
        )
        .bind(basis, op.id, now, now, op.work_item_id, item.row_version, op.id)
    );
  }

  const order=await db.prepare('SELECT source_system,source_id FROM installation_work_order WHERE id=?').bind(op.installation_work_order_id).first<{source_system:string;source_id:string}>();
  if(!order)return {ok:false,errorCode:'WRITE_ORDER_MISSING'};
  const businessIdentity=JSON.stringify([item.service_provider_id,'INSTALLATION_REVIEW','INSTALLATION_WORK_ORDER',order.source_system,order.source_id,
    'INSTALLATION_DETAIL',detail.sourceSystem,detail.installationDetailId,'DECIDE_INSTALLATION_REVIEW']);
  const reviewKey=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(businessIdentity)))].map(x=>x.toString(16).padStart(2,'0')).join('');
  const existingReview = await db
    .prepare("SELECT id FROM work_item WHERE creation_key = ? OR (business_key=? AND item_kind='INSTALLATION_REVIEW' AND status<>'COMPLETED')")
    .bind(`review:${op.id}`,reviewKey)
    .first<{ id: string }>();
  let reviewId = existingReview?.id;
  if (!reviewId) {
    reviewId = newId('w');
    const reviewer=await resolveResponsibility(db,item.service_provider_id,'DECIDE_INSTALLATION_REVIEW');
    statements.push(
      db
        .prepare(
          `INSERT INTO work_item
           (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json,
            creation_key, title, status, assignee_identity_id, responsibility_version, row_version, analysis_generation,
            gmt_create, gmt_modified)
           SELECT ?, ?, ?, 'INSTALLATION_REVIEW', ?, ?, ?, ?, 'PREPARING', ?, 1, 1, 1, ?, ? WHERE NOT EXISTS (
             SELECT 1 FROM work_item WHERE creation_key = ?)`
        )
        .bind(
          reviewId, item.service_provider_id, op.installation_work_order_id, reviewKey, businessIdentity,
          `review:${op.id}`, `安装资料核查 · ${order.source_id}`, reviewer, now, now, `review:${op.id}`
        )
    );
    statements.push(
      db
        .prepare(
          `INSERT INTO activity_record
           (id, work_item_id, event_key, event_type, actor_identity_id, fact_type, fact_id, occurred_at, details_json, gmt_create, gmt_modified)
           SELECT ?, ?, ?, 'WORK_CREATED', NULL, 'WORK_ITEM', ?, NULL, ?, ?, ? WHERE NOT EXISTS (
             SELECT 1 FROM activity_record WHERE work_item_id = ? AND event_key = ?)`
        )
        .bind(
          newId('act'), reviewId, `work-created:${reviewId}`, reviewId,
          JSON.stringify({ from: op.work_item_id, submissionId: op.id }), now, now, reviewId, `work-created:${reviewId}`
        )
    );
    statements.push(
      db
        .prepare(
          `INSERT INTO work_item_link (id, from_work_item_id, to_work_item_id, reason_code, cause_key, basis_json, gmt_create, gmt_modified)
           SELECT ?, ?, ?, 'STAGE_HANDOFF', ?, ?, ?, ? WHERE NOT EXISTS (
             SELECT 1 FROM work_item_link WHERE from_work_item_id = ? AND reason_code = 'STAGE_HANDOFF' AND cause_key = ?)`
        )
        .bind(newId('wl'), op.work_item_id, reviewId, reviewKey, basis, now, now, op.work_item_id, reviewKey)
    );
  }

  if(reviewId)statements.push(scheduleInputPreparation(db,reviewId,1,item.service_provider_id,now));

  statements.push(
    sourceWriteActivity(
      db, op.work_item_id, op.id,
      { submissionStatus: 'SUCCEEDED', installationDetail: detail, reviewWorkItemId: reviewId }, now
    )
  );
  return { ok: true, statements, jobStatus: 'SUCCEEDED' };
}

async function adoptReviewSync(
  db: D1Database,
  op: { id: string; work_item_id: string; human_decision_id: string; action: string },
  r: ExternalResult,
  receipt: string,
  now: number
): Promise<WriteAdoption> {
  const record = r.sourceRecord;
  if (
    !record || typeof record.sourceSystem !== 'string' || record.sourceSystem.trim().length === 0 ||
    typeof record.sourceRecordId !== 'string' || record.sourceRecordId.trim().length === 0 ||
    typeof record.sourceVersion !== 'string' || record.sourceVersion.trim().length === 0
  ) {
    return { ok: false, errorCode: 'WRITE_RECEIPT_INCOMPLETE' };
  }

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE external_write_operation
         SET status = 'SUCCEEDED', receipt_json = ?, verified_at = ?, row_version = row_version + 1, gmt_modified = ?
         WHERE id = ? AND status IN ('REGISTERED','PROCESSING','RESULT_UNKNOWN')`
      )
      .bind(receipt, now, now, op.id),
  ];

  const item = await loadWorkItemPointer(db, op.work_item_id);
  if (!item) return { ok: false, errorCode: 'WRITE_ITEM_MISSING' };
  const basis = JSON.stringify({
    operationId: op.id,
    action: op.action,
    sourceRecord: {
      sourceSystem: record.sourceSystem,
      sourceRecordId: record.sourceRecordId,
      sourceVersion: record.sourceVersion,
    },
  });

  if (op.action === 'APPROVE') {
    if (item.status !== 'COMPLETED' && item.pending_write_id === op.id) {
      statements.push(
        db
          .prepare(
            `UPDATE work_item
             SET status = 'COMPLETED', completion_code = 'REVIEW_APPROVED', completion_basis_json = ?,
                 completion_decision_id = ?, completed_at = ?, pending_write_id = NULL, blocked_reason = NULL,
                 row_version = row_version + 1, gmt_modified = ?
             WHERE id = ? AND row_version = ? AND pending_write_id = ?`
          )
          .bind(basis, op.human_decision_id, now, now, op.work_item_id, item.row_version, op.id)
      );
    }
  } else if (op.action === 'REQUEST_SUPPLEMENT') {
    const assignee = await resolveResponsibility(db, item.service_provider_id, 'SUBMIT_SUPPLEMENT');
    const assigneeChanged = assignee !== item.assignee_identity_id;
    statements.push(
      db
        .prepare(
          `UPDATE work_item
           SET status = 'WAITING_SUPPLEMENT', active_supplement_request_id = ?, pending_write_id = NULL,
               assignee_identity_id = ?, blocked_reason = ?,
               responsibility_version = responsibility_version + ?, row_version = row_version + 1, gmt_modified = ?
           WHERE id = ? AND row_version = ? AND pending_write_id = ?`
        )
        .bind(
          op.human_decision_id, assignee, assignee ? null : 'RESPONSIBILITY_UNRESOLVED', assigneeChanged ? 1 : 0,
          now, op.work_item_id, item.row_version, op.id
        )
    );
  } else if (op.action === 'SUBMIT_SUPPLEMENT') {
    const assignee = await resolveResponsibility(db, item.service_provider_id, 'DECIDE_INSTALLATION_REVIEW');
    const assigneeChanged = assignee !== item.assignee_identity_id;
    statements.push(
      db
        .prepare(
          `UPDATE supplemental_response SET success_verified_at = ?, gmt_modified = ?
           WHERE submit_decision_id = ? AND success_verified_at IS NULL`
        )
        .bind(now, now, op.human_decision_id)
    );
    statements.push(
      db
        .prepare(
          `UPDATE work_item
           SET status = 'PREPARING', active_supplement_request_id = NULL, pending_write_id = NULL,
               analysis_generation = analysis_generation + 1, current_analysis_result_id = NULL,
               assignee_identity_id = ?, blocked_reason = ?,
               responsibility_version = responsibility_version + ?, row_version = row_version + 1, gmt_modified = ?
           WHERE id = ? AND row_version = ? AND pending_write_id = ?`
        )
        .bind(
          assignee, assignee ? null : 'RESPONSIBILITY_UNRESOLVED', assigneeChanged ? 1 : 0,
          now, op.work_item_id, item.row_version, op.id
        )
    );
  }

  if(op.action==='SUBMIT_SUPPLEMENT')statements.push(scheduleInputPreparation(db,op.work_item_id,item.analysis_generation+1,item.service_provider_id,now));

  statements.push(
    sourceWriteActivity(db, op.work_item_id, op.id, { operationStatus: 'SUCCEEDED', action: op.action, sourceRecord: record }, now)
  );
  return { ok: true, statements, jobStatus: 'SUCCEEDED' };
}

export async function buildWriteAdoption(
  db: D1Database,
  job: { id: string; external_write_id: string | null; work_item_id: string | null; target_json: string },
  attemptStatus: 'SUCCEEDED' | 'FAILED' | 'UNKNOWN',
  dispatchState: string,
  result: unknown
): Promise<WriteAdoption> {
  if (!job.external_write_id) return { ok: false, errorCode: 'WRITE_OP_MISSING' };
  const op = await db
    .prepare(
      `SELECT id, status, work_item_id, installation_work_order_id, source_system, interface_kind, action,
              human_decision_id, row_version
       FROM external_write_operation WHERE id = ?`
    )
    .bind(job.external_write_id)
    .first<{
      id: string; status: string; work_item_id: string; installation_work_order_id: string;
      source_system: string; interface_kind: string; action: string; human_decision_id: string; row_version: number;
    }>();
  if (!op) return { ok: false, errorCode: 'WRITE_OP_MISSING' };

  if (op.status === 'SUCCEEDED' || op.status === 'REJECTED') {
    return { ok: true, statements: [], jobStatus: 'SUCCEEDED' };
  }

  const now = nowMs();
  const statements: D1PreparedStatement[] = [];

  if (attemptStatus !== 'SUCCEEDED') {
    if (dispatchState === 'NOT_SENT') {
      return { ok: true, statements: [], jobStatus: undefined };
    }
    statements.push(
      db
        .prepare(
          `UPDATE external_write_operation
           SET status = 'RESULT_UNKNOWN', row_version = row_version + 1, gmt_modified = ?
           WHERE id = ? AND status IN ('REGISTERED','PROCESSING','RESULT_UNKNOWN')`
        )
        .bind(now, op.id)
    );
    return { ok: true, statements, jobStatus: 'BLOCKED' };
  }

  const r = (result ?? null) as ExternalResult | null;
  const status = r?.submissionStatus ?? r?.operationStatus;
  if (status !== 'SUCCEEDED' && status !== 'REJECTED' && status !== 'PENDING') {
    return { ok: false, errorCode: 'WRITE_RESULT_INVALID' };
  }
  const receipt = JSON.stringify({ ...r, workOrderId: op.installation_work_order_id });

  if (status === 'PENDING') {
    if (r?.pendingReason === 'RESULT_UNKNOWN') {
      statements.push(
        db
          .prepare(
            `UPDATE external_write_operation
             SET status = 'RESULT_UNKNOWN', row_version = row_version + 1, gmt_modified = ?
             WHERE id = ? AND status IN ('REGISTERED','PROCESSING','RESULT_UNKNOWN')`
          )
          .bind(now, op.id)
      );
    }
    return { ok: true, statements, jobStatus: 'SUCCEEDED' };
  }

  if (status === 'REJECTED') {
    const description = typeof r?.resultDescription === 'string' && r.resultDescription.trim().length > 0
      ? r.resultDescription
      : '原系统明确拒绝本次动作，未写入';
    statements.push(
      db
        .prepare(
          `UPDATE external_write_operation
           SET status = 'REJECTED', receipt_json = ?, verified_at = ?, row_version = row_version + 1, gmt_modified = ?
           WHERE id = ? AND status IN ('REGISTERED','PROCESSING','RESULT_UNKNOWN')`
        )
        .bind(receipt, now, now, op.id)
    );
    const item = await loadWorkItemPointer(db, op.work_item_id);
    if (item && item.status !== 'COMPLETED' && item.pending_write_id === op.id) {
      const backStatus =
        op.interface_kind === 'REVIEW_SYNC' && op.action === 'SUBMIT_SUPPLEMENT'
          ? 'WAITING_SUPPLEMENT'
          : 'READY';
      statements.push(
        db
          .prepare(
            `UPDATE work_item SET status = ?, pending_write_id = NULL, blocked_reason = ?,
                    row_version = row_version + 1, gmt_modified = ?
             WHERE id = ? AND row_version = ? AND pending_write_id = ?`
          )
          .bind(backStatus, description, now, op.work_item_id, item.row_version, op.id)
      );
    }
    statements.push(
      sourceWriteActivity(db, op.work_item_id, op.id, { operationStatus: 'REJECTED', resultDescription: description }, now)
    );
    return { ok: true, statements, jobStatus: 'SUCCEEDED' };
  }

  if (op.interface_kind === 'INSTALLATION_SUBMIT') {
    return adoptInstallationSubmit(db, op, r ?? {}, receipt, now);
  }
  if (op.interface_kind === 'REVIEW_SYNC') {
    return adoptReviewSync(db, op, r ?? {}, receipt, now);
  }
  return { ok: false, errorCode: 'WRITE_KIND_UNSUPPORTED' };
}
