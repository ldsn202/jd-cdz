import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { recs, type RouteResult } from '../jd-bills/read.ts';
import { emitEvent } from '../src/storage/source-events.ts';

type RevisionBody = {
  sourceSystem?: unknown;
  recordType?: unknown;
  recordId?: unknown;
  expectedVersion?: unknown;
  revisionNote?: unknown;
  patch?: unknown;
  contentBase64?: unknown;
};

const SUPPORTED: Record<string, { source: string; kind: string; recordType: string; versionPrefix: string }> = {
  PROVIDER_RECEIVABLE: { source: 'provider-receivable', kind: 'provider_receivable', recordType: 'PROVIDER_RECEIVABLE', versionPrefix: 'receivable' },
  INSTALLATION_PLAN: { source: 'installation-admin', kind: 'installation_plan', recordType: 'INSTALLATION_PLAN', versionPrefix: 'plan' },
  BILLING_TERM: { source: 'billing-terms', kind: 'billing_terms', recordType: 'BILLING_TERM', versionPrefix: 'terms' },
  PROVIDER_FORMAT: { source: 'provider-docs', kind: 'format_spec', recordType: 'PROVIDER_FORMAT', versionPrefix: 'format' },
};

function nextVersion(prefix: string, version: string): string {
  const m = new RegExp(`^${prefix}-(\\d+)$`).exec(version);
  return `${prefix}-${(m ? Number(m[1]) : 1) + 1}`;
}

export function postSourceRevision(
  dbs: Map<string, DatabaseSync>,
  filesDir: string,
  operatorAccountId: string,
  body: RevisionBody
): RouteResult {
  if (typeof body.sourceSystem !== 'string' || typeof body.recordType !== 'string' || typeof body.recordId !== 'string' || body.recordId.trim() === '') {
    return { http: 400, body: { code: 40001, msg: 'sourceSystem/recordType/recordId 必填', data: null } };
  }
  if (typeof body.expectedVersion !== 'string' || body.expectedVersion.trim() === '') {
    return { http: 400, body: { code: 40001, msg: 'expectedVersion 必填（输入明确来源对象和预期版本）', data: null } };
  }
  if (body.patch === null || typeof body.patch !== 'object' || Array.isArray(body.patch)) {
    return { http: 400, body: { code: 40001, msg: 'patch 须为对象（只修改该来源记录的字段）', data: null } };
  }

  if (body.recordType === 'SOURCE_MATERIAL') {
    const db = dbs.get('file-service')!;
    const metas = recs(db, 'file_meta').filter((f) => f.payload.fileId === body.recordId);
    if (metas.length === 0) return { http: 404, body: { code: 40401, msg: '材料不存在', data: null } };
    const current = metas[metas.length - 1];
    if (body.expectedVersion !== current.payload.sourceVersion) {
      return { http: 409, body: { code: 40901, msg: '预期版本与当前版本不符', data: null } };
    }
    if (typeof body.contentBase64 !== 'string' || body.contentBase64.length === 0) {
      return { http: 400, body: { code: 40001, msg: 'SOURCE_MATERIAL 修订须携带 contentBase64', data: null } };
    }
    const bytes = Buffer.from(body.contentBase64, 'base64');
    if (bytes.length === 0) return { http: 400, body: { code: 40001, msg: 'contentBase64 解码为零字节', data: null } };
    const newVersion = nextVersion('material', current.payload.sourceVersion);
    const ext = (current.payload.name as string).split('.').pop();
    const rel = path.join(current.payload.fileId, `${newVersion}.${ext}`);
    mkdirSync(path.join(filesDir, current.payload.fileId), { recursive: true });
    writeFileSync(path.join(filesDir, rel), bytes);
    const now = new Date().toISOString();
    const payload = {
      ...current.payload,
      sourceVersion: newVersion,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      sizeBytes: bytes.length,
      relativePath: rel,
    };
    db.exec('BEGIN');
    try {
      db.prepare('INSERT INTO source_record (kind, record_id, source_version, source_updated_at, payload_json) VALUES (?, ?, ?, ?, ?)')
        .run('file_meta', `${current.payload.fileId}@${newVersion}`, 'file-1', now, JSON.stringify(payload));
      emitEvent(db, {
        changeId: `chg-rev-${current.payload.fileId}-${newVersion}`,
        providerId: (body.patch as any).providerId ?? 'SP-000',
        recordType: 'SOURCE_MATERIAL',
        sourceRecordId: current.payload.fileId,
        sourceVersion: newVersion,
        changeType: 'UPSERT',
        sourceUpdatedAt: now,
        relatedWorkOrderIds: [],
        associationComplete: false,
      });
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    return { http: 200, body: { code: 0, msg: 'success', data: { recordId: current.payload.fileId, newVersion, operatorAccountId, revisedAt: now } } };
  }

  const spec = SUPPORTED[body.recordType];
  if (!spec || spec.source !== body.sourceSystem) {
    return { http: 400, body: { code: 40001, msg: `不支持的修订类型或来源：${body.sourceSystem}/${body.recordType}`, data: null } };
  }
  const db = dbs.get(spec.source)!;
  const current = recs(db, spec.kind).find((r) => r.id === body.recordId);
  if (!current) return { http: 404, body: { code: 40401, msg: '来源记录不存在', data: null } };
  if (body.recordType !== 'PROVIDER_RECEIVABLE' && current.version !== body.expectedVersion) {
    return { http: 409, body: { code: 40901, msg: `预期版本 ${body.expectedVersion} 与当前版本 ${current.version} 不符`, data: null } };
  }
  const patch = body.patch as Record<string, unknown>;
  const now = new Date().toISOString();
  const newVersion = nextVersion(spec.versionPrefix, current.version);

  if (body.recordType === 'PROVIDER_RECEIVABLE') {
    const revisions = recs(db, 'provider_receivable_revision').filter((r) => r.payload.providerReceivableId === current.id);
    const latest = revisions.length > 0 ? revisions[revisions.length - 1] : current;
    if (latest.version !== body.expectedVersion) {
      return { http: 409, body: { code: 40901, msg: `预期版本 ${body.expectedVersion} 与当前版本 ${latest.version} 不符`, data: null } };
    }
    const newRecVersion = nextVersion(spec.versionPrefix, latest.version);
    const payload = {
      ...latest.payload,
      ...patch,
      providerReceivableId: current.id,
      previousSourceVersion: latest.version,
      sourceRevisionNote: typeof body.revisionNote === 'string' ? body.revisionNote : null,
    };
    db.exec('BEGIN');
    try {
      db.prepare('INSERT INTO source_record (kind, record_id, source_version, source_updated_at, payload_json) VALUES (?, ?, ?, ?, ?)')
        .run('provider_receivable_revision', `${current.id}#${newRecVersion}`, newRecVersion, now, JSON.stringify(payload));
      emitEvent(db, {
        changeId: `chg-rev-${current.id}-${newRecVersion}`,
        providerId: latest.payload.serviceProviderId,
        recordType: 'PROVIDER_RECEIVABLE',
        sourceRecordId: current.id,
        sourceVersion: newRecVersion,
        changeType: 'UPSERT',
        sourceUpdatedAt: now,
        relatedWorkOrderIds: latest.payload.relatedWorkOrderIds,
        associationComplete: true,
      });
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    return { http: 200, body: { code: 0, msg: 'success', data: { recordId: current.id, newVersion: newRecVersion, previousSourceVersion: latest.version, operatorAccountId, revisedAt: now } } };
  }

  const payload = { ...current.payload, ...patch };
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE source_record SET source_version = ?, source_updated_at = ?, payload_json = ? WHERE kind = ? AND record_id = ?')
      .run(newVersion, now, JSON.stringify(payload), spec.kind, current.id);
    emitEvent(db, {
      changeId: `chg-rev-${current.id}-${newVersion}`,
      providerId: current.payload.serviceProviderId ?? 'SP-000',
      recordType: spec.recordType,
      sourceRecordId: current.id,
      sourceVersion: newVersion,
      changeType: 'UPSERT',
      sourceUpdatedAt: now,
      relatedWorkOrderIds: current.payload.installationWorkOrderId ? [current.payload.installationWorkOrderId] : [],
      associationComplete: true,
    });
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { http: 200, body: { code: 0, msg: 'success', data: { recordId: current.id, newVersion, previousSourceVersion: current.version, operatorAccountId, revisedAt: now } } };
}
