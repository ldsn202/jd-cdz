import type { ResolvedIdentity } from './identity';

export class ServiceError extends Error {
  httpStatus: number;
  code: number;
  constructor(httpStatus: number, code: number, message: string) {
    super(message);
    this.name = 'ServiceError';
    this.httpStatus = httpStatus;
    this.code = code;
  }
}

// 40903 的原操作入口承载：保持统一错误壳的 data=null，另以顶层 pendingOperation 字段
// 返回可读的原操作编号与状态（裁决记录见 sub-delivery-plan-jd-charging-T3.1 与 tc-main §四 #1）。
export class PendingWriteError extends ServiceError {
  pendingOperation: { operationId: string; status: string };
  constructor(operationId: string, status: string, message: string) {
    super(409, 40903, message);
    this.name = 'PendingWriteError';
    this.pendingOperation = { operationId, status };
  }
}

export function nowMs(): number {
  return Date.now();
}

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function requireService(identity: ResolvedIdentity): void {
  if (identity.subjectType !== 'SERVICE') {
    throw new ServiceError(403, 40301, '内部路由仅向受控 SERVICE 开放');
  }
}

export function canReadChanges(identity: ResolvedIdentity, feedId: string, providerId: string, sourceSystem: string, recordTypes?: string[]): boolean {
  return identity.grants.some(
    (g) =>
      g.actions.includes('READ_SOURCE_CHANGES') &&
      (g.sourceSystem == null || g.sourceSystem === sourceSystem || (sourceSystem === 'installation-admin' && g.sourceSystem === 'installation_management')) &&
      (g.recordType == null || (!!recordTypes?.length && recordTypes.every(t=>t===g.recordType))) &&
      ((g.scopeType === 'CHANGE_FEED' && g.resourceIds.includes(feedId)) ||
        (g.scopeType === 'SERVICE_PROVIDER' && g.resourceIds.includes(providerId)))
  );
}

export type ChangeBatchBody = {
  feedId: string;
  generationId: string;
  expectedCursor: string;
  response: {
    list: {
      changeId: string;
      recordType: string;
      sourceRecordId: string;
      sourceVersion: string | null;
      changeType: 'UPSERT' | 'REMOVED';
      sourceUpdatedAt: string | null;
      relatedWorkOrderIds: string[];
      associationComplete: boolean;
    }[];
    cursor: string;
    nextCursor: string;
    hasMore: boolean;
    sourceCheckedAt?: string;
    coverageThrough?: string;
    [k: string]: unknown;
  };
};

const RECORD_TYPES = new Set([
  'INSTALLATION_WORK_ORDER', 'INSTALLATION_PLAN', 'INSTALLATION_DETAIL', 'SOURCE_MATERIAL',
  'INSTALLATION_REVIEW', 'SUPPLEMENTAL_RESPONSE', 'PURCHASE_ORDER', 'INSTALLATION_ENTITLEMENT',
  'PROVIDER_RECORD', 'PROVIDER_FORMAT', 'JD_BILL', 'PROVIDER_RECEIVABLE', 'BILLING_TERM', 'FEE_APPROVAL_RECORD',
]);

function validResponse(r: ChangeBatchBody['response']): boolean {
  if (!r || typeof r !== 'object') return false;
  if (!Array.isArray(r.list) || typeof r.cursor !== 'string' || typeof r.nextCursor !== 'string') return false;
  if (typeof r.hasMore !== 'boolean') return false;
  return r.list.every(
    (c) =>
      c && typeof c.changeId === 'string' && RECORD_TYPES.has(c.recordType) &&
      typeof c.sourceRecordId === 'string' && (c.changeType === 'UPSERT' || c.changeType === 'REMOVED')
  );
}

export async function receiveChangeBatch(
  db: D1Database,
  identity: ResolvedIdentity,
  body: ChangeBatchBody
): Promise<{ batchId: string | null; acceptedCount: number; currentCursor: string; jobIds: string[] }> {
  requireService(identity);
  if (!body?.feedId || !body?.generationId || typeof body?.expectedCursor !== 'string') {
    throw new ServiceError(400, 40001, 'feedId、generationId、expectedCursor 必填');
  }
  if (!validResponse(body.response)) {
    throw new ServiceError(502, 50201, '来源返回结构不完整或非法');
  }

  const feed = await db
    .prepare('SELECT id, service_provider_id, source_system FROM change_feed WHERE id = ?')
    .bind(body.feedId)
    .first<{ id: string; service_provider_id: string; source_system: string }>();
  if (!feed || !canReadChanges(identity, feed.id, feed.service_provider_id, feed.source_system, body.response.list.map(c=>c.recordType))) {
    throw new ServiceError(404, 40404, '资源不存在或不可见');
  }

  const gen = await db
    .prepare('SELECT id, feed_id, current_cursor, state, row_version FROM change_feed_generation WHERE id = ? AND feed_id = ?')
    .bind(body.generationId, body.feedId)
    .first<{ id: string; feed_id: string; current_cursor: string; state: string; row_version: number }>();
  if (!gen) throw new ServiceError(404, 40404, '资源不存在或不可见');
  if (gen.state !== 'READY') throw new ServiceError(409, 40901, `配置代次状态非 READY：${gen.state}`);
  if (gen.current_cursor !== body.expectedCursor) {
    throw new ServiceError(409, 40901, '位置冲突：expectedCursor 与当前已接收位置不一致');
  }
  if (body.response.cursor !== body.expectedCursor) {
    throw new ServiceError(502, 50201, '来源返回 cursor 与期望位置不符');
  }

  const now = nowMs();
  if (body.response.list.length === 0) {
    return { batchId: null, acceptedCount: 0, currentCursor: gen.current_cursor, jobIds: [] };
  }

  const statements: D1PreparedStatement[] = [];
  const localChangeIds: string[] = [];
  const jobIds: string[] = [];

  for (const change of body.response.list) {
    const payload = JSON.stringify(change);
    const sha = await sha256Hex(payload);
    const existing = await db
      .prepare('SELECT id, payload_sha256 FROM source_change WHERE feed_id = ? AND source_change_id = ?')
      .bind(body.feedId, change.changeId)
      .first<{ id: string; payload_sha256: string }>();
    let localId: string;
    if (existing) {
      if (existing.payload_sha256 !== sha) {
        throw new ServiceError(409, 40902, `同变化身份不同内容：${change.changeId}`);
      }
      localId = existing.id;
    } else {
      localId = newId('sc');
      statements.push(
        db
          .prepare(
            `INSERT INTO source_change (id, feed_id, source_change_id, record_type, source_record_id, source_version, change_type, association_completeness, associations_json, payload_json, payload_sha256, gmt_create, gmt_modified)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            localId, body.feedId, change.changeId, change.recordType, change.sourceRecordId,
            change.sourceVersion, change.changeType,
            change.associationComplete ? 'COMPLETE' : 'INCOMPLETE',
            JSON.stringify(change.relatedWorkOrderIds ?? []), payload, sha, now, now
          )
      );
    }
    localChangeIds.push(localId);

    const dedupe = `discover:${localId}:${gen.id}`;
    const existingJob = await db
      .prepare('SELECT id FROM background_job WHERE dedupe_key = ?')
      .bind(dedupe)
      .first<{ id: string }>();
    let jobId: string;
    if (existingJob) {
      jobId = existingJob.id;
    } else {
      jobId = newId('bj');
      statements.push(
        db
          .prepare(
            `INSERT INTO background_job (id, purpose, service_provider_id, work_item_id, external_write_id, target_json, dedupe_key, status, available_at, lease_epoch, row_version, gmt_create, gmt_modified)
             VALUES (?, 'DISCOVER_RELATIONS', ?, NULL, NULL, ?, ?, 'READY', ?, 0, 1, ?, ?)`
          )
          .bind(
            jobId, feed.service_provider_id,
            JSON.stringify({ changeId: localId, recordType: change.recordType, sourceRecordId: change.sourceRecordId, generationId: gen.id }),
            dedupe, now, now, now
          )
      );
    }
    jobIds.push(jobId);
    statements.push(
      db
        .prepare(
          `INSERT INTO job_change_trigger (id, job_id, source_change_id, generation_id, gmt_create, gmt_modified)
           SELECT ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (
             SELECT 1 FROM job_change_trigger WHERE job_id = ? AND source_change_id = ? AND generation_id = ?)`
        )
        .bind(newId('jct'), jobId, localId, gen.id, now, now, jobId, localId, gen.id)
    );
  }

  const batchId = newId('cb');
  statements.push(
    db
      .prepare(
        `INSERT INTO change_batch (id, generation_id, from_cursor, next_cursor, change_ids_json, original_response_json, retrieved_at, source_checked_at, coverage_through, has_more, gmt_create, gmt_modified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        batchId, gen.id, body.expectedCursor, body.response.nextCursor,
        JSON.stringify(localChangeIds), JSON.stringify(body.response), now,
        body.response.sourceCheckedAt ? Date.parse(body.response.sourceCheckedAt) : null,
        body.response.coverageThrough ? Date.parse(body.response.coverageThrough) : null,
        body.response.hasMore ? 1 : 0, now, now
      )
  );
  statements.push(
    db
      .prepare(
        `UPDATE change_feed_generation SET current_cursor = ?, row_version = row_version + 1, gmt_modified = ?
         WHERE id = ? AND current_cursor = ? AND row_version = ?`
      )
      .bind(body.response.nextCursor, now, gen.id, body.expectedCursor, gen.row_version)
  );

  const assertionId=newId('change-assert');
  statements.push(db.prepare('INSERT INTO transaction_assertion(id,passed,gmt_create,gmt_modified) VALUES(?,changes(),?,?)').bind(assertionId,now,now),db.prepare('DELETE FROM transaction_assertion WHERE id=?').bind(assertionId));
  try { await db.batch(statements); }
  catch(error){if(/passed|transaction_assertion/.test((error as Error).message))throw new ServiceError(409,40901,'来源读取位置发生并发变化，整批已回滚');throw error;}
  return { batchId, acceptedCount: body.response.list.length, currentCursor: body.response.nextCursor, jobIds };
}
