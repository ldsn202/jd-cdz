import { buildParsingCapability } from './material-parsing';
import type { ResolvedIdentity } from './identity';
import { PendingWriteError, ServiceError, newId, nowMs } from './change-batch';
import { stableStringify } from './installation-draft';

export const ALLOWED_MEDIA_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const UPLOAD_PURPOSES = ['INSTALLATION_MATERIAL', 'PROVIDER_FORMAT', 'RECEIVABLE_MATERIAL'] as const;
export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];

const EXTENSION_MEDIA: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export type UploadInput = {
  file: File;
  providerId: string;
  purpose: string;
  workItemId?: string;
  configurationId?: string;
  expectedWorkItemVersion?: number;
  replacesMaterialVersionId?: string;
};

export type UploadAccepted = {
  uploadId: string;
  materialVersionId: string;
  workItemId: string | null;
  jobId: string;
  status: 'RECEIVED';
};

export type UploadStatus = {
  uploadId: string;
  materialVersionId: string;
  providerId: string;
  workItemId: string | null;
  jobId: string;
  status: 'RECEIVED' | 'PREPARING' | 'READY' | 'BLOCKED';
  issues: { code: string; description: string }[];
};

type ParseJobRow = {
  id: string;
  status: string;
  work_item_id: string | null;
  target_json: string;
  outcome_json: string | null;
};

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function resolveMediaType(file: File): string | null {
  const declared = (file.type || '').toLowerCase();
  if ((ALLOWED_MEDIA_TYPES as readonly string[]).includes(declared)) return declared;
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  return EXTENSION_MEDIA[ext] ?? null;
}

async function loadParseJobByUploadId(db: D1Database, uploadId: string): Promise<ParseJobRow | null> {
  return db
    .prepare(
      `SELECT id, status, work_item_id, target_json, outcome_json FROM background_job
       WHERE purpose = 'PARSE_MATERIAL' AND json_extract(target_json, '$.uploadId') = ?`
    )
    .bind(uploadId)
    .first<ParseJobRow>();
}

async function loadParseJobByRequestKey(db: D1Database, requestKey: string): Promise<ParseJobRow | null> {
  return db
    .prepare(
      `SELECT id, status, work_item_id, target_json, outcome_json FROM background_job
       WHERE purpose = 'PARSE_MATERIAL' AND json_extract(target_json, '$.requestKey') = ?`
    )
    .bind(requestKey)
    .first<ParseJobRow>();
}

function jobStatusToUpload(status: string): UploadStatus['status'] {
  if (status === 'SUCCEEDED') return 'READY';
  if (status === 'FAILED' || status === 'BLOCKED' || status === 'CANCELLED') return 'BLOCKED';
  if (status === 'RUNNING' || status === 'RETRY_WAIT') return 'PREPARING';
  return 'RECEIVED';
}

function issuesOf(job: ParseJobRow): { code: string; description: string }[] {
  if (!job.outcome_json) return [];
  try {
    const outcome = JSON.parse(job.outcome_json) as { errorCode?: string; result?: { issues?: unknown; parsing?: { issues?: string[] } } };
    if (outcome.errorCode) return [{ code: outcome.errorCode, description: '解析任务未完成，请稍后重试或查看原文' }];
    return (outcome.result?.parsing?.issues ?? []).map(description=>({code:'PARSING_INCOMPLETE',description}));
  } catch {
    return [];
  }
}

export async function acceptUpload(
  db: D1Database,
  files: R2Bucket,
  identity: ResolvedIdentity,
  idempotencyKey: string,
  input: UploadInput
): Promise<UploadAccepted> {
  const { file } = input;
  if (!file || typeof file === 'string' || !(file instanceof File) || file.size === 0) {
    throw new ServiceError(400, 40001, 'file 必填且字节非空');
  }
  if (typeof input.providerId !== 'string' || input.providerId.trim().length === 0) {
    throw new ServiceError(400, 40001, 'providerId 必填');
  }
  if (!(UPLOAD_PURPOSES as readonly string[]).includes(input.purpose)) {
    throw new ServiceError(400, 40002, 'purpose 非法');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ServiceError(413, 41301, `文件超过 ${MAX_UPLOAD_BYTES} 字节上限`);
  }
  const mediaType = resolveMediaType(file);
  if (!mediaType) {
    throw new ServiceError(422, 42201, '仅支持 PDF、PNG、JPEG 或 XLSX');
  }

  const requestKey = `upload:${identity.identityId}:${idempotencyKey}`;
  const bytes = await file.arrayBuffer();
  const sha256 = await sha256Hex(bytes);

  const metadataDigest = stableStringify({
    providerId: input.providerId,
    purpose: input.purpose,
    workItemId: input.workItemId ?? null,
    configurationId: input.configurationId ?? null,
    replacesMaterialVersionId: input.replacesMaterialVersionId ?? null,
  });

  const prior = await loadParseJobByRequestKey(db, requestKey);
  if (prior) {
    const target = JSON.parse(prior.target_json) as {
      uploadId: string; materialVersionId: string; fileSha256: string; workItemId: string | null; metadataDigest: string;
    };
    if (target.fileSha256 !== sha256 || target.metadataDigest !== metadataDigest) {
      throw new ServiceError(409, 40902, '同一请求键已用于不同文件或上传用途');
    }
    return {
      uploadId: target.uploadId,
      materialVersionId: target.materialVersionId,
      workItemId: target.workItemId,
      jobId: prior.id,
      status: 'RECEIVED',
    };
  }

  let workItemId: string | null = input.workItemId ?? null;
  if (input.purpose === 'INSTALLATION_MATERIAL' || input.purpose === 'RECEIVABLE_MATERIAL') {
    if (!workItemId) throw new ServiceError(422, 42201, '该用途必须指定 workItemId');
  }
  if (workItemId) {
    if (!Number.isInteger(input.expectedWorkItemVersion)) {
      throw new ServiceError(400, 40001, '指定事项时 expectedWorkItemVersion 必填');
    }
    const item = await db
      .prepare(
        `SELECT id, service_provider_id, status, row_version, responsibility_version, analysis_generation, pending_write_id
         FROM work_item WHERE id = ?`
      )
      .bind(workItemId)
      .first<{
        id: string; service_provider_id: string; status: string; row_version: number;
        responsibility_version: number; analysis_generation: number; pending_write_id: string | null;
      }>();
    if (!item) throw new ServiceError(404, 40404, '资源不存在或不可见');
    if (item.service_provider_id !== input.providerId) {
      throw new ServiceError(403, 40301, '上传服务商与事项归属不一致');
    }
    if (item.pending_write_id) {
      const op = await db
        .prepare('SELECT status FROM external_write_operation WHERE id = ?')
        .bind(item.pending_write_id)
        .first<{ status: string }>();
      throw new PendingWriteError(item.pending_write_id, op?.status ?? 'UNKNOWN', '事项存在未决外部写入');
    }
    if (item.status === 'COMPLETED') throw new ServiceError(409, 40901, '事项已完成，不可再上传材料');
    if (item.row_version !== input.expectedWorkItemVersion) {
      throw new ServiceError(409, 40901, '事项版本已变化，请刷新后重试');
    }
  } else {
    workItemId = null;
  }

  const uploadId = newId('up');
  const materialVersionId = newId('smv');
  const sourceMaterialId = newId('sm');
  const jobId = newId('bj');
  const now = nowMs();
  const safeName = file.name.replace(/[^\w.一-龥-]/g, '_') || 'upload.bin';
  const contentLocator = `uploads/${uploadId}/${safeName}`;


  await files.put(contentLocator, bytes, { httpMetadata: { contentType: mediaType } });

  const target = {
    uploadId,
    providerId: input.providerId,
    purpose: input.purpose,
    workItemId,
    configurationId: input.configurationId ?? null,
    replacesMaterialVersionId: input.replacesMaterialVersionId ?? null,
    materialVersionId,
    requestKey,
    fileSha256: sha256,
    metadataDigest,
  };

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO source_material (id, source_system, source_material_id, gmt_create, gmt_modified)
         SELECT ?, 'LOCAL_UPLOAD', ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM source_material WHERE id = ?)`
      )
      .bind(sourceMaterialId, uploadId, now, now, sourceMaterialId),
    db
      .prepare(
        `INSERT INTO source_material_version
         (id, source_material_id, source_version, read_state, name, media_type, byte_length, content_sha256, content_locator, retrieved_at, source_updated_at, gmt_create, gmt_modified)
         SELECT ?, ?, ?, 'VERIFIED', ?, ?, ?, ?, ?, ?, NULL, ?, ? WHERE NOT EXISTS (SELECT 1 FROM source_material_version WHERE id = ?)`
      )
      .bind(
        materialVersionId, sourceMaterialId, `local:${uploadId}`, file.name, mediaType,
        file.size, sha256, contentLocator, now, now, now, materialVersionId
      ),
    db
      .prepare(
        `INSERT INTO background_job
         (id, purpose, service_provider_id, work_item_id, external_write_id, target_json, dedupe_key, status, available_at,
          lease_epoch, lease_token, lease_owner, lease_until, row_version, outcome_json, gmt_create, gmt_modified)
         VALUES (?, 'PARSE_MATERIAL', ?, ?, NULL, ?, ?, 'READY', ?, 0, NULL, NULL, NULL, 1, NULL, ?, ?)`
      )
      .bind(jobId, input.providerId, workItemId, JSON.stringify(target), `upload:${uploadId}`, now, now, now),
    buildParsingCapability(db, { jobId, materialVersionId, sha256, now }),
  ];

  if (workItemId) {
    const assertion = newId('upload-assert');
    statements.unshift(db.prepare(`INSERT INTO transaction_assertion
      SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM work_item WHERE id=? AND row_version=? AND assignee_identity_id=? AND status<>'COMPLETED' AND pending_write_id IS NULL) THEN 1 ELSE 0 END,?,?`)
      .bind(assertion, workItemId, input.expectedWorkItemVersion, identity.identityId, now, now));
    statements.push(
      db
        .prepare(
          `UPDATE work_item
           SET analysis_generation = analysis_generation + CASE WHEN status IN ('WAITING_SUPPLEMENT','WAITING_REPLY') THEN 0 ELSE 1 END,
               current_analysis_result_id = CASE WHEN status IN ('WAITING_SUPPLEMENT','WAITING_REPLY') THEN current_analysis_result_id ELSE NULL END,
               current_configuration_version_id = CASE WHEN ?='PROVIDER_FORMAT' AND status NOT IN ('WAITING_SUPPLEMENT','WAITING_REPLY') THEN NULL ELSE current_configuration_version_id END,
               status = CASE WHEN status IN ('WAITING_SUPPLEMENT','WAITING_REPLY') THEN status ELSE 'PREPARING' END,
               row_version = row_version + 1, gmt_modified = ?
           WHERE id = ? AND row_version = ? AND status <> 'COMPLETED' AND pending_write_id IS NULL`
        )
        .bind(input.purpose, now, workItemId, input.expectedWorkItemVersion)
    );
    statements.push(db.prepare('DELETE FROM transaction_assertion WHERE id=?').bind(assertion));
  }

  let results: D1Result[];
  try { results = await db.batch(statements); }
  catch { throw new ServiceError(409, 40901, '上传条件已变化，请刷新事项后重试'); }
  const last = results[results.length - 1];
  if (last.meta.changes !== 1) {
    throw new ServiceError(409, 40901, '上传条件已变化，登记未生效');
  }

  return { uploadId, materialVersionId, workItemId, jobId, status: 'RECEIVED' };
}

export async function readUploadStatus(db: D1Database, uploadId: string): Promise<UploadStatus | null> {
  const job = await loadParseJobByUploadId(db, uploadId);
  if (!job) return null;
  const target = JSON.parse(job.target_json) as { materialVersionId: string; providerId: string; workItemId: string | null };
  return {
    uploadId,
    materialVersionId: target.materialVersionId,
    providerId: target.providerId,
    workItemId: target.workItemId,
    jobId: job.id,
    status: jobStatusToUpload(job.status),
    issues: issuesOf(job),
  };
}
