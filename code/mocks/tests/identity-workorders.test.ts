import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

type Check = { id: string; pass: boolean; detail: string };
const checks: Check[] = [];
const check = (id: string, pass: boolean, detail: string) => checks.push({ id, pass, detail });

const BASE = process.env.MOCK_BASE ?? 'http://localhost:8790';
const ENV_SOURCES = path.join(rootDir, '.data/mock-env-a/sources');

async function http(method: string, p: string, opts: { token?: string; body?: unknown } = {}): Promise<{ http: number; json: any }> {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  return { http: res.status, json: await res.json() };
}

function seed(sql: string, params: (string | number)[] = []) {
  const db = new DatabaseSync(path.join(ENV_SOURCES, 'identity.db'));
  db.prepare(sql).run(...params);
  db.close();
}

function queryPayload(kind: string, id: string): any | null {
  const db = new DatabaseSync(path.join(ENV_SOURCES, 'identity.db'), { readOnly: true });
  const row = db.prepare('SELECT payload_json FROM source_record WHERE kind = ? AND record_id = ?').get(kind, id) as any;
  db.close();
  return row ? JSON.parse(row.payload_json) : null;
}

function queryOne(dbName: string, kind: string, where: string): any | null {
  const db = new DatabaseSync(path.join(ENV_SOURCES, `${dbName}.db`), { readOnly: true });
  const rows = db.prepare(`SELECT record_id, payload_json FROM source_record WHERE kind = ?`).all(kind) as any[];
  db.close();
  for (const r of rows) {
    const p = JSON.parse(r.payload_json);
    if (where === 'pending' && p.installationWorkOrderId) {
      // handled by caller filter
    }
    void p;
  }
  return null;
}
void queryOne;

async function main(): Promise<void> {
  const now = Date.now();
  const testSuffix = `t${now.toString(36)}`;

  seed("INSERT INTO source_record (kind, record_id, source_version, source_updated_at, payload_json) VALUES ('account', ?, 'account-1', ?, ?)",
    [`acc-test-disabled-${testSuffix}`, new Date(now).toISOString(), JSON.stringify({ accountId: `acc-test-disabled-${testSuffix}`, displayName: '停用测试账号', role: 'PROVIDER_DATA', serviceProviderId: 'SP-001', active: false })]);
  seed("INSERT INTO source_record (kind, record_id, source_version, source_updated_at, payload_json) VALUES ('account', ?, 'account-1', ?, ?)",
    [`acc-test-nogrants-${testSuffix}`, new Date(now).toISOString(), JSON.stringify({ accountId: `acc-test-nogrants-${testSuffix}`, displayName: '无授权测试账号', role: 'PROVIDER_DATA', serviceProviderId: 'SP-002', active: true })]);
  seed("INSERT INTO source_record (kind, record_id, source_version, source_updated_at, payload_json) VALUES ('account', ?, 'account-1', ?, ?)",
    [`acc-test-jd-viewer-${testSuffix}`, new Date(now).toISOString(), JSON.stringify({ accountId: `acc-test-jd-viewer-${testSuffix}`, displayName: '京东只读测试账号', role: 'JD_COORDINATION', serviceProviderId: null, active: true })]);
  seed("INSERT INTO source_record (kind, record_id, source_version, source_updated_at, payload_json) VALUES ('grant', ?, 'grant-1', ?, ?)",
    [`grant-acc-test-jd-viewer-${testSuffix}`, new Date(now).toISOString(), JSON.stringify({ grantId: `grant-acc-test-jd-viewer-${testSuffix}`, accountId: `acc-test-jd-viewer-${testSuffix}`, scopeProviderIds: ['SP-001'], role: 'JD_COORDINATION' })]);
  seed("INSERT INTO source_record (kind, record_id, source_version, source_updated_at, payload_json) VALUES ('account', ?, 'account-1', ?, ?)",
    [`acc-svc-backend-${testSuffix}`, new Date(now).toISOString(), JSON.stringify({ accountId: `acc-svc-backend-${testSuffix}`, displayName: '后台程序测试账号', role: 'SERVICE', serviceProviderId: null, active: true })]);
  seed("INSERT INTO source_record (kind, record_id, source_version, source_updated_at, payload_json) VALUES ('grant', ?, 'grant-1', ?, ?)",
    [`grant-acc-svc-backend-${testSuffix}`, new Date(now).toISOString(), JSON.stringify({ grantId: `grant-acc-svc-backend-${testSuffix}`, accountId: `acc-svc-backend-${testSuffix}`, scopeProviderIds: ['SP-001'], role: 'SERVICE' })]);
  seed("INSERT INTO source_record (kind, record_id, source_version, source_updated_at, payload_json) VALUES ('account', ?, 'account-1', ?, ?)",
    [`acc-test-dupname-${testSuffix}`, new Date(now).toISOString(), JSON.stringify({ accountId: `acc-test-dupname-${testSuffix}`, displayName: queryPayload('account', 'acc-sp-001')?.displayName ?? '同名账号', role: 'PROVIDER_DATA', serviceProviderId: 'SP-003', active: true })]);
  seed("INSERT INTO source_record (kind, record_id, source_version, source_updated_at, payload_json) VALUES ('grant', ?, 'grant-1', ?, ?)",
    [`grant-acc-test-dupname-${testSuffix}`, new Date(now).toISOString(), JSON.stringify({ grantId: `grant-acc-test-dupname-${testSuffix}`, accountId: `acc-test-dupname-${testSuffix}`, scopeProviderIds: ['SP-003'], role: 'PROVIDER_DATA' })]);
  seed("INSERT INTO source_record (kind, record_id, source_version, source_updated_at, payload_json) VALUES ('session', ?, 'session-1', ?, ?)",
    [`msess-expired-${testSuffix}`, new Date(now - 7200000).toISOString(), JSON.stringify({ token: `msess-expired-${testSuffix}`, accountId: 'acc-sp-001', createdAt: new Date(now - 7200000).toISOString(), validUntil: new Date(now - 3600000).toISOString() })]);

  const s1 = await http('POST', '/api/admin/mock/external/identity/sessions', { body: { accountId: 'acc-sp-001' } });
  check('SESSION-CREATE', s1.http === 201 && typeof s1.json.data?.token === 'string', `创建会话 ${s1.http}`);
  const tokProvider = s1.json.data.token as string;

  const s2 = await http('POST', '/api/admin/mock/external/identity/sessions', { body: { accountId: `acc-test-jd-viewer-${testSuffix}` } });
  const tokJdViewer = s2.json.data.token as string;
  const s3 = await http('POST', '/api/admin/mock/external/identity/sessions', { body: { accountId: `acc-svc-backend-${testSuffix}` } });
  const tokService = s3.json.data.token as string;
  const s4 = await http('POST', '/api/admin/mock/external/identity/sessions', { body: { accountId: `acc-test-nogrants-${testSuffix}` } });
  const tokNoGrants = s4.json.data.token as string;
  const s5 = await http('POST', '/api/admin/mock/external/identity/sessions', { body: { accountId: `acc-test-dupname-${testSuffix}` } });
  const tokDup = s5.json.data.token as string;
  const s6 = await http('POST', '/api/admin/mock/external/identity/sessions', { body: { accountId: `acc-test-disabled-${testSuffix}` } });
  check('SESSION-DISABLED-403', s6.http === 403 && s6.json.code === 40301, `停用身份开会话被拒 ${s6.http}/${s6.json.code}`);

  const ctx = await http('GET', '/api/admin/mock/external/identity/current-context', { token: tokProvider });
  const d = ctx.json.data;
  check('CTX-PROVIDER', ctx.http === 200 && d.subjectId === 'acc-sp-001' && d.subjectType === 'HUMAN'
    && d.grants.length === 3 && d.grants.every((g: any) => g.scope.resourceIds.join(',') === 'SP-001')
    && d.grants[0].actions.includes('CONFIRM_INSTALLATION_DRAFT') && d.sourceIdentities.length === 1,
    `服务商上下文：subjectId=${d.subjectId}，范围=${d.grants[0]?.scope.resourceIds}，动作含确认草稿`);

  const selfReport = await http('GET', '/api/admin/mock/external/identity/current-context?subjectId=acc-sp-002', { token: tokProvider });
  check('CTX-SELF-REPORT-400', selfReport.http === 400 && selfReport.json.code === 40001, `自报身份参数 ${selfReport.http}/${selfReport.json.code}`);

  const noTok = await http('GET', '/api/admin/mock/external/identity/current-context');
  check('CTX-NO-TOKEN-401', noTok.http === 401 && noTok.json.code === 40101, `无凭据 ${noTok.http}`);
  const badTok = await http('GET', '/api/admin/mock/external/identity/current-context', { token: 'msess-garbage' });
  check('CTX-BAD-TOKEN-401', badTok.http === 401 && badTok.json.code === 40101, `错误凭据 ${badTok.http}`);
  const expired = await http('GET', '/api/admin/mock/external/identity/current-context', { token: `msess-expired-${testSuffix}` });
  check('CTX-EXPIRED-401', expired.http === 401 && expired.json.code === 40101, `失效会话 ${expired.http}`);

  const noGrants = await http('GET', '/api/admin/mock/external/identity/current-context', { token: tokNoGrants });
  check('CTX-EMPTY-GRANTS', noGrants.http === 200 && Array.isArray(noGrants.json.data.grants) && noGrants.json.data.grants.length === 0, '有效身份无授权返回 grants=[]');

  const svc = await http('GET', '/api/admin/mock/external/identity/current-context', { token: tokService });
  check('CTX-SERVICE', svc.http === 200 && svc.json.data.subjectType === 'SERVICE' && svc.json.data.sourceIdentities.length === 0 && svc.json.data.grants[0].businessRole === null
    && svc.json.data.grants[0].actions.includes('READ_SOURCE_CHANGES') && !svc.json.data.grants[0].actions.includes('CONFIRM_INSTALLATION_DRAFT'),
    'SERVICE 上下文：无人员映射、businessRole=null、不带人员动作');

  const dup = await http('GET', '/api/admin/mock/external/identity/current-context', { token: tokDup });
  check('CTX-SAME-NAME-DIFF-ID', dup.http === 200 && dup.json.data.subjectId === `acc-test-dupname-${testSuffix}` && dup.json.data.grants[0].scope.resourceIds.join(',') === 'SP-003',
    '同名不同 ID 不混归属（范围 SP-003 而非 SP-001）');

  const idb = new DatabaseSync(path.join(ENV_SOURCES, 'installation-admin.db'), { readOnly: true });
  const woRows = idb.prepare("SELECT record_id, payload_json FROM source_record WHERE kind = 'work_order'").all() as any[];
  const woOfSp001 = woRows.map((r) => ({ id: r.record_id, ...JSON.parse(r.payload_json) })).find((w) => w.serviceProviderId === 'SP-001');
  const woNotSp001 = woRows.map((r) => ({ id: r.record_id, ...JSON.parse(r.payload_json) })).find((w) => w.serviceProviderId !== 'SP-001');
  const detailIds = new Set((idb.prepare("SELECT payload_json FROM source_record WHERE kind = 'installation_detail'").all() as any[]).map((r) => JSON.parse(r.payload_json).installationWorkOrderId));
  const pendingWo = woRows.map((r) => ({ id: r.record_id, ...JSON.parse(r.payload_json) })).find((w) => w.serviceProviderId === 'SP-001' && !detailIds.has(w.record_id ?? w.installationWorkOrderId));
  idb.close();

  const ctxWo = await http('GET', `/api/admin/mock/external/installation/work-orders/${woOfSp001.installationWorkOrderId}/context`, { token: tokProvider });
  const cw = ctxWo.json.data;
  check('WO-CONTEXT-OWN', ctxWo.http === 200 && cw.installationWorkOrder.installationWorkOrderId === woOfSp001.installationWorkOrderId
    && cw.installationPlan && Array.isArray(cw.sourceMaterials) && cw.sourceMaterialIndexComplete === true,
    `本服务商工单上下文：方案 ${cw.installationPlan?.installationPlanId}，明细状态 ${cw.installationDetailStatus}，材料 ${cw.sourceMaterials.length} 份`);

  const cross = await http('GET', `/api/admin/mock/external/installation/work-orders/${woNotSp001.installationWorkOrderId}/context`, { token: tokProvider });
  check('WO-CROSS-PROVIDER-403', cross.http === 403 && cross.json.code === 40301 && cross.json.data === null, `跨服务商读取 ${cross.http}，不泄露字段`);

  const notFound = await http('GET', '/api/admin/mock/external/installation/work-orders/WO-9999-XXXX/context', { token: tokProvider });
  check('WO-NOT-FOUND-404', notFound.http === 404 && notFound.json.code === 40401, `工单不存在 ${notFound.http}`);

  if (pendingWo) {
    const pend = await http('GET', `/api/admin/mock/external/installation/work-orders/${pendingWo.installationWorkOrderId}/context`, { token: tokProvider });
    check('WO-NOT-SUBMITTED-NORMAL', pend.http === 200 && pend.json.data.installationDetailStatus === 'NOT_SUBMITTED' && pend.json.data.installationDetail === null
      && !pend.json.data.missingParts.includes('INSTALLATION_DETAIL'), '未提交为正常阶段：detail=null 且不列缺失');
  }

  const jdWo = await http('GET', `/api/admin/mock/external/installation/work-orders/${woOfSp001.installationWorkOrderId}/context`, { token: tokJdViewer });
  check('WO-MATERIAL-SEPARATE-PERMISSION', jdWo.http === 200 && jdWo.json.data.sourceMaterialIndexComplete === false
    && jdWo.json.data.missingParts.includes('SOURCE_MATERIAL_INDEX') && jdWo.json.data.sourceMaterials.length === 0,
    '工单可见不自动放行材料：无 READ_SOURCE_MATERIAL 时索引未取全并列缺失');

  const ent = await http('GET', `/api/admin/mock/external/purchase-orders/${woOfSp001.purchaseOrderId}/installation-entitlements?installationWorkOrderId=${woOfSp001.installationWorkOrderId}`, { token: tokProvider });
  const en = ent.json.data;
  check('ENT-READ', ent.http === 200 && en.purchaseOrder.purchaseOrderId === woOfSp001.purchaseOrderId
    && en.entitlements.length === 1 && en.entitlements[0].applicability === 'APPLICABLE'
    && en.entitlements[0].quantityType === 'LIMITED' && en.entitlements[0].includedQuantity === 1,
    `权益读取：适用本工单，LIMITED 上限 1（上限不冒充实际安装量）`);

  const mismatch = await http('GET', `/api/admin/mock/external/purchase-orders/${woNotSp001.purchaseOrderId}/installation-entitlements?installationWorkOrderId=${woOfSp001.installationWorkOrderId}`, { token: tokProvider });
  check('ENT-MISMATCH-409', mismatch.http === 409 && mismatch.json.code === 40901, `订单工单不符 ${mismatch.http}/${mismatch.json.code}`);

  const ent404 = await http('GET', `/api/admin/mock/external/purchase-orders/PO-9999-XXXX/installation-entitlements?installationWorkOrderId=${woOfSp001.installationWorkOrderId}`, { token: tokProvider });
  check('ENT-PO-NOT-FOUND-404', ent404.http === 404 && ent404.json.code === 40401, `订单不存在 ${ent404.http}`);

  const failed = checks.filter((c) => !c.pass);
  console.log(JSON.stringify({ base: BASE, checks, passed: failed.length === 0, failedCount: failed.length }, null, 2));
  if (failed.length > 0) process.exit(1);
}

main();
