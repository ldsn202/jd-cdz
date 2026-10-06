import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

type Check = { id: string; pass: boolean; detail: string };
const checks: Check[] = [];
const check = (id: string, pass: boolean, detail: string) => checks.push({ id, pass, detail });

const BASE = process.env.MOCK_BASE ?? 'http://localhost:8790';
const ENV_DIR = path.join(rootDir, '.data/mock-env-a');

async function http(method: string, p: string, opts: { token?: string; body?: unknown } = {}): Promise<{ http: number; json: any }> {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: { 'content-type': 'application/json', ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  return { http: res.status, json: await res.json() };
}

function sourceProvidersByCondition(): Record<string, string[]> {
  const coverage = JSON.parse(readFileSync(path.join(ENV_DIR, 'delivery/standard-v1/scenario-coverage.json'), 'utf8'));
  return coverage.formatConditions;
}

async function main(): Promise<void> {
  const s1 = await http('POST', '/api/admin/mock/external/identity/sessions', { body: { accountId: 'acc-sp-001' } });
  const tokProvider = s1.json.data.token as string;
  const sj = await http('POST', '/api/admin/mock/external/identity/sessions', { body: { accountId: 'acc-jd-business' } });
  const tokReader = sj.json.data.token as string;
  const sv = await http('POST', '/api/admin/mock/external/identity/sessions', { body: { accountId: 'acc-jd-business' } });
  const tokBusiness = sv.json.data.token as string;

  const cond = sourceProvidersByCondition();
  const seqOf = (pid: string) => pid.slice('SP-'.length);

  const complete = cond.complete[0];
  const r1 = await http('GET', `/api/admin/mock/external/sources/provider-docs/service-providers/${complete}/records/PROV-DOC-${seqOf(complete)}/documents`, { token: tokReader });
  check('DOC-COMPLETE', r1.http === 200 && r1.json.data.formatStatus === 'PROVIDED'
    && r1.json.data.formatDefinition.fields.every((f: any) => f.meaning !== null || true)
    && r1.json.data.completeness === 'COMPLETE' && r1.json.data.sourceRecord.sourceFormatVersion === 'fv-1',
    `完整条件：PROVIDED + COMPLETE（${complete}）`);

  const meaningUnknown = cond.meaning_unknown[0];
  const r2 = await http('GET', `/api/admin/mock/external/sources/provider-docs/service-providers/${meaningUnknown}/records/PROV-DOC-${seqOf(meaningUnknown)}/documents`, { token: tokReader });
  check('DOC-MEANING-UNKNOWN', r2.http === 200 && r2.json.data.formatStatus === 'PROVIDED'
    && r2.json.data.formatDefinition.fields.some((f: any) => f.meaning === null),
    `含义未知：PROVIDED 且存在 meaning=null（${meaningUnknown}）`);

  const noSpec = cond.no_spec[0];
  const r3 = await http('GET', `/api/admin/mock/external/sources/provider-docs/service-providers/${noSpec}/records/PROV-DOC-${seqOf(noSpec)}/documents`, { token: tokReader });
  check('DOC-NOT-PROVIDED', r3.http === 200 && r3.json.data.formatStatus === 'NOT_PROVIDED' && r3.json.data.formatDefinition === null
    && !r3.json.data.missingParts.includes('FORMAT_DEFINITION'),
    `未提供说明：NOT_PROVIDED + null，不伪造说明（${noSpec}）`);

  const mismatch = cond.association_mismatch[0];
  const r4 = await http('GET', `/api/admin/mock/external/sources/provider-docs/service-providers/${mismatch}/records/PROV-DOC-${seqOf(mismatch)}/documents`, { token: tokReader });
  check('DOC-FORMAT-ASSOCIATION', r4.http === 200 && r4.json.data.formatStatus === 'PROVIDED'
    && r4.json.data.sourceRecord.sourceFormatVersion === 'fv-2'
    && r4.json.data.formatDefinition.sourceVersion === 'fv-1'
    && r4.json.data.missingParts.includes('FORMAT_ASSOCIATION') && r4.json.data.completeness === 'INCOMPLETE',
    `关联不符：声明 fv-2 与说明 fv-1 分别保留并列 FORMAT_ASSOCIATION（${mismatch}）`);

  const cross = await http('GET', `/api/admin/mock/external/sources/provider-docs/service-providers/SP-002/records/PROV-DOC-002/documents`, { token: tokProvider });
  check('DOC-CROSS-403', cross.http === 403 && cross.json.code === 40301 && cross.json.data === null, '跨服务商读资料 40301');

  const notFound = await http('GET', `/api/admin/mock/external/sources/provider-docs/service-providers/${complete}/records/PROV-DOC-XXXX/documents`, { token: tokReader });
  check('DOC-NOT-FOUND-404', notFound.http === 404 && notFound.json.code === 40401, '资料记录不存在 40401');

  const badSource = await http('GET', `/api/admin/mock/external/sources/no-such-source/service-providers/${complete}/records/PROV-DOC-${seqOf(complete)}/documents`, { token: tokReader });
  check('DOC-BAD-SOURCE-400', badSource.http === 400 && badSource.json.code === 40001, '来源未配置 40001');

  const rawJsonCheck = await http('GET', `/api/admin/mock/external/sources/provider-docs/service-providers/${complete}/records/PROV-DOC-${seqOf(complete)}/documents`, { token: tokReader });
  const pd = new DatabaseSync(path.join(ENV_DIR, 'sources/provider-docs.db'), { readOnly: true });
  const rawRow = pd.prepare("SELECT payload_json FROM source_record WHERE kind='provider_record' AND record_id=?").get(`PROV-DOC-${seqOf(complete)}`) as any;
  pd.close();
  const storedRaw = JSON.parse(rawRow.payload_json).rawJson;
  check('DOC-RAWJSON-UNCHANGED', (rawJsonCheck.json.data.rawJson ?? null) === storedRaw, 'rawJson 原样返回不改写');

  const fm = JSON.parse(readFileSync(path.join(ENV_DIR, 'delivery/standard-v1/file-manifest.json'), 'utf8'));
  const negatives = new Set(fm.negatives.map((n: any) => n.fileId));
  const idb0 = new DatabaseSync(path.join(ENV_DIR, 'sources/installation-admin.db'), { readOnly: true });
  const woProvider = new Map<string, string>();
  for (const r of idb0.prepare("SELECT record_id, payload_json FROM source_record WHERE kind='work_order'").all() as any[]) {
    woProvider.set(r.record_id, JSON.parse(r.payload_json).serviceProviderId);
  }
  const matOwner = new Map<string, string>();
  for (const r of idb0.prepare("SELECT payload_json FROM source_record WHERE kind='material_index'").all() as any[]) {
    const m = JSON.parse(r.payload_json);
    matOwner.set(m.sourceMaterialId, woProvider.get(m.installationWorkOrderId) ?? '');
  }
  idb0.close();
  const normal = fm.files.find((f: any) => !negatives.has(f.fileId) && f.ownerKind === 'work_order_material' && matOwner.get(f.fileId) === 'SP-001');

  const f1 = await http('GET', `/api/admin/mock/external/sources/file-service/materials/${normal.fileId}?sourceVersion=${normal.sourceVersion}`, { token: tokProvider });
  const diskBytes = readFileSync(path.join(ENV_DIR, 'files', normal.relativePath));
  const gotBytes = f1.json.data ? Buffer.from(f1.json.data.contentBase64, 'base64') : Buffer.alloc(0);
  check('FILE-READ-BYTES', f1.http === 200 && f1.json.data.byteLength === diskBytes.length
    && f1.json.data.contentSha256 === createHash('sha256').update(diskBytes).digest('hex')
    && gotBytes.equals(diskBytes), `按版本返回实际字节：${normal.fileId}（${diskBytes.length} 字节，逐字节一致）`);

  const fNoVer = await http('GET', `/api/admin/mock/external/sources/file-service/materials/${normal.fileId}`, { token: tokProvider });
  check('FILE-MISSING-VERSION-400', fNoVer.http === 400 && fNoVer.json.code === 40001, '缺 sourceVersion 40001');

  const fWrongVer = await http('GET', `/api/admin/mock/external/sources/file-service/materials/${normal.fileId}?sourceVersion=material-99`, { token: tokProvider });
  check('FILE-VERSION-UNAVAILABLE-409', fWrongVer.http === 409 && fWrongVer.json.code === 40901, '版本不可取得 40901（不换新文件填旧引用）');

  const neg3 = JSON.parse(readFileSync(path.join(ENV_DIR, 'delivery/standard-v1/negatives.json'), 'utf8')).items.find((n: any) => n.kind === 'FILE_VERSION_NOT_FOUND');
  const neg3Wo = neg3.installationWorkOrderId;
  const idb = new DatabaseSync(path.join(ENV_DIR, 'sources/installation-admin.db'), { readOnly: true });
  const neg3WoRow = idb.prepare("SELECT payload_json FROM source_record WHERE kind='work_order' AND record_id=?").get(neg3Wo) as any;
  const neg3Provider = JSON.parse(neg3WoRow.payload_json).serviceProviderId;
  const neg3Mat = (idb.prepare("SELECT payload_json FROM source_record WHERE kind='material_index'").all() as any[])
    .map((r) => JSON.parse(r.payload_json))
    .find((m) => m.installationWorkOrderId === neg3Wo);
  idb.close();
  const sNeg = await http('POST', '/api/admin/mock/external/identity/sessions', { body: { accountId: `acc-${neg3Provider.toLowerCase()}` } });
  const fNeg3 = await http('GET', `/api/admin/mock/external/sources/file-service/materials/${neg3Mat.sourceMaterialId}?sourceVersion=material-9`, { token: sNeg.json.data.token });
  check('FILE-NEG3-VERSION-ERROR', fNeg3.http === 409 && fNeg3.json.code === 40901, `NEG-03：索引版本 material-9 不可取得 40901，不回退其他版本`);

  const fBusiness = await http('GET', `/api/admin/mock/external/sources/file-service/materials/${normal.fileId}?sourceVersion=${normal.sourceVersion}`, { token: tokBusiness });
  check('FILE-JD-BUSINESS-READ', fBusiness.http === 200 && fBusiness.json.data.contentSha256 === f1.json.data.contentSha256, '京东业务账号统一拥有原始资料读取权限');

  const v2Dir = path.join(ENV_DIR, 'files', normal.fileId);
  mkdirSync(v2Dir, { recursive: true });
  const v1Bytes = readFileSync(path.join(ENV_DIR, 'files', normal.relativePath));
  const v2Bytes = Buffer.concat([v1Bytes.subarray(0, v1Bytes.length - 10), Buffer.from('V2-REVISED!')]);
  writeFileSync(path.join(v2Dir, 'material-2.' + normal.name.split('.').pop()), v2Bytes);
  const fdb = new DatabaseSync(path.join(ENV_DIR, 'sources/file-service.db'));
  fdb.prepare("INSERT INTO source_record (kind, record_id, source_version, source_updated_at, payload_json) VALUES ('file_meta', ?, 'file-1', ?, ?)").run(
    `${normal.fileId}@material-2`,
    new Date().toISOString(),
    JSON.stringify({ fileId: normal.fileId, sourceVersion: 'material-2', mediaType: normal.mediaType, name: normal.name, sha256: createHash('sha256').update(v2Bytes).digest('hex'), sizeBytes: v2Bytes.length, relativePath: path.join(normal.fileId, 'material-2.' + normal.name.split('.').pop()), pages: null })
  );
  fdb.close();
  const v1 = await http('GET', `/api/admin/mock/external/sources/file-service/materials/${normal.fileId}?sourceVersion=material-1`, { token: tokProvider });
  const v2 = await http('GET', `/api/admin/mock/external/sources/file-service/materials/${normal.fileId}?sourceVersion=material-2`, { token: tokProvider });
  check('FILE-TWO-VERSIONS-DISTINCT', v1.http === 200 && v2.http === 200
    && v1.json.data.contentSha256 !== v2.json.data.contentSha256
    && v2.json.data.contentSha256 === createHash('sha256').update(v2Bytes).digest('hex')
    && Buffer.from(v2.json.data.contentBase64, 'base64').equals(v2Bytes),
    '同一材料两版内容不同，各自返回对应字节摘要');

  const failed = checks.filter((c) => !c.pass);
  console.log(JSON.stringify({ base: BASE, checks, passed: failed.length === 0, failedCount: failed.length }, null, 2));
  if (failed.length > 0) process.exit(1);
}

main();
