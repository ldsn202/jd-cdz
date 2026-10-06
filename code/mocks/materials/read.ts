import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { hasAction, type Account } from '../identity/sessions.ts';
import { ROLE_ACTIONS } from '../identity/roles.ts';

export type RouteResult = { http: number; body: { code: number; msg: string; data: unknown } };

type Auth = { account: Account; grants: { grantId: string; scopeProviderIds: string[] }[] };

const SUPPORTED = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
const MAX_BYTES = 10 * 1024 * 1024;

function recs(db: DatabaseSync, kind: string) {
  return (db.prepare("SELECT record_id, source_version, source_updated_at, payload_json FROM source_record WHERE kind = ?").all(kind) as any[]).map((r) => ({
    id: r.record_id,
    version: r.source_version,
    updatedAt: r.source_updated_at,
    payload: JSON.parse(r.payload_json),
  }));
}

function owningProvider(installationDb: DatabaseSync, fileId: string): string | null {
  if (fileId.startsWith('PROV-FILE-')) return `SP-${fileId.slice('PROV-FILE-'.length)}`;
  const idx = recs(installationDb, 'material_index').find((m) => m.payload.fileRef?.fileId === fileId);
  if (!idx) return null;
  const wo = recs(installationDb, 'work_order').find((w) => w.id === idx.payload.installationWorkOrderId);
  return wo?.payload.serviceProviderId ?? null;
}

export function getSourceMaterial(
  fileServiceDb: DatabaseSync,
  installationDb: DatabaseSync,
  filesDir: string,
  auth: Auth,
  sourceSystem: string,
  sourceMaterialId: string,
  sourceVersion: string | undefined
): RouteResult {
  if (sourceSystem !== 'file-service' && sourceSystem !== 'LOCAL_UPLOAD') {
    return { http: 400, body: { code: 40001, msg: `来源未配置：${sourceSystem}`, data: null } };
  }
  if (!sourceVersion) {
    return { http: 400, body: { code: 40001, msg: 'sourceVersion 必填，不允许默认读取最新版本', data: null } };
  }
  const providerId = owningProvider(installationDb, sourceMaterialId);
  if (providerId === null) {
    return { http: 404, body: { code: 40401, msg: '材料不存在或已删除', data: null } };
  }
  if (!hasAction(auth, 'READ_SOURCE_MATERIAL', providerId, ROLE_ACTIONS)) {
    return { http: 403, body: { code: 40301, msg: '当前身份无材料访问权限', data: null } };
  }
  const anyVersion = recs(fileServiceDb, 'file_meta').filter((f) => f.payload.fileId === sourceMaterialId);
  const meta = anyVersion.find((f) => f.payload.sourceVersion === sourceVersion);
  if (!meta) {
    if (anyVersion.length === 0) {
      const materialKnown = recs(installationDb, 'material_index').some((m) => m.payload.fileRef?.fileId === sourceMaterialId) || sourceMaterialId.startsWith('PROV-FILE-');
      if (materialKnown) {
        return { http: 409, body: { code: 40901, msg: '所引用的材料版本已无法取得，请刷新资料后重试', data: null } };
      }
      return { http: 404, body: { code: 40401, msg: '材料不存在或已删除', data: null } };
    }
    return { http: 409, body: { code: 40901, msg: '所引用的材料版本已无法取得，请刷新资料后重试', data: null } };
  }
  if (!SUPPORTED.has(meta.payload.mediaType)) {
    return { http: 415, body: { code: 41501, msg: '当前不支持该格式', data: null } };
  }
  const abs = path.join(filesDir, meta.payload.relativePath ?? '');
  if (!meta.payload.relativePath || !existsSync(abs)) {
    return { http: 409, body: { code: 40902, msg: '无法核实正文属于要求版本', data: null } };
  }
  const bytes = readFileSync(abs);
  if (bytes.length === 0) {
    return { http: 502, body: { code: 50201, msg: '来源返回零字节文件', data: null } };
  }
  if (bytes.length > MAX_BYTES) {
    return { http: 413, body: { code: 41301, msg: '文件超过开发配置上限', data: null } };
  }
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (meta.payload.sha256 && digest !== meta.payload.sha256) {
    return { http: 502, body: { code: 50201, msg: '文件字节与来源登记摘要不一致', data: null } };
  }
  return {
    http: 200,
    body: {
      code: 0,
      msg: 'success',
      data: {
        sourceSystem,
        sourceMaterialId,
        sourceVersion,
        name: meta.payload.name,
        mediaType: meta.payload.mediaType,
        sourceUpdatedAt: meta.updatedAt ?? null,
        retrievedAt: new Date().toISOString(),
        byteLength: bytes.length,
        contentSha256: digest,
        contentBase64: bytes.toString('base64'),
      },
    },
  };
}
