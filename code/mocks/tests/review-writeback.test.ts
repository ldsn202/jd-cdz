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

function loadInstallation() {
  const db = new DatabaseSync(path.join(ENV_DIR, 'sources/installation-admin.db'), { readOnly: true });
  const all = (kind: string) => (db.prepare('SELECT record_id, source_version, payload_json FROM source_record WHERE kind = ?').all(kind) as any[]).map((r) => ({ id: r.record_id, version: r.source_version, ...JSON.parse(r.payload_json) }));
  const out = {
    wos: all('work_order'),
    details: all('installation_detail'),
    materials: all('material_index'),
    reviewActions: all('review_action'),
  };
  db.close();
  return out;
}

async function main(): Promise<void> {
  const run = Date.now().toString(36);
  const sRev = await http('POST', '/api/admin/mock/external/identity/sessions', { body: { accountId: 'acc-jd-business' } });
  const tokReview = sRev.json.data.token as string;
  const sCompany = await http('POST', '/api/admin/mock/external/identity/sessions', { body: { accountId: 'acc-sp-001' } });
  const tokCompany = sCompany.json.data.token as string;

  const inst = loadInstallation();
  const detailWoIds = new Set(inst.details.map((d) => d.installationWorkOrderId));
  const actedWoIds = new Set(inst.reviewActions.map((r) => r.installationWorkOrderId));
  const targetWo = inst.wos.find((w) => detailWoIds.has(w.id) && !actedWoIds.has(w.id))!;
  const targetDetail = inst.details.find((d) => d.installationWorkOrderId === targetWo.id)!;
  const providerId = targetWo.serviceProviderId;
  const sProv = await http('POST', '/api/admin/mock/external/identity/sessions', { body: { accountId: `acc-${providerId.toLowerCase()}` } });
  const tokProvider = sProv.json.data.token as string;
  const woMaterials = inst.materials.filter((m) => m.installationWorkOrderId === targetWo.id)
    .map((m) => ({ sourceSystem: 'file-service', sourceMaterialId: m.sourceMaterialId, sourceVersion: m.fileRef.sourceVersion }));

  const approveBody = {
    operationId: `OP-T25-AP-${run}`,
    workItemId: 'WI-T25-001',
    expectedWorkItemVersion: 'item-1',
    humanDecisionId: 'HD-T25-AP',
    action: 'APPROVE',
    installationDetailId: targetDetail.installationDetailId,
    expectedDetailVersion: targetDetail.version,
    expectedWorkOrderVersion: targetWo.version,
    expectedAnalysisVersion: 'analysis-1',
    replyToOperationId: null,
    comment: '',
    sourceMaterials: woMaterials,
  };

  const a1 = await http('POST', `/api/admin/mock/external/installation/work-orders/${targetWo.id}/review-actions`, { token: tokReview, body: approveBody });
  check('APPROVE-SUCCEEDED', a1.http === 200 && a1.json.data.operationStatus === 'SUCCEEDED'
    && a1.json.data.sourceRecord.sourceVersion === 'review-1' && a1.json.data.sourceRecord.workOrderSourceVersion === 'work-order-2',
    `审核通过 SUCCEEDED，回执工单版本 work-order-2（目标 ${targetWo.id}）`);

  const g1 = await http('GET', `/api/admin/mock/external/installation/work-orders/${targetWo.id}/review-actions/${approveBody.operationId}`, { token: tokReview });
  check('APPROVE-RECHECK', g1.http === 200 && g1.json.data.operationStatus === 'SUCCEEDED' && g1.json.data.sourceRecord.sourceRecordId === a1.json.data.sourceRecord.sourceRecordId, '回查返回同一份审核回执');

  const aReplay = await http('POST', `/api/admin/mock/external/installation/work-orders/${targetWo.id}/review-actions`, { token: tokReview, body: approveBody });
  check('APPROVE-REPLAY', aReplay.http === 200 && aReplay.json.data.operationStatus === 'SUCCEEDED', '同编号同内容重放返回原结果（不因版本已变误报冲突）');

  const a2 = await http('POST', `/api/admin/mock/external/installation/work-orders/${targetWo.id}/review-actions`, { token: tokReview, body: { ...approveBody, comment: '改' } });
  check('SAME-ID-DIFF-409', a2.http === 409 && a2.json.code === 40902, '同 operationId 改内容 40902');

  const returnBody = {
    ...approveBody,
    operationId: `OP-T25-RS-${run}`,
    action: 'REQUEST_SUPPLEMENT',
    expectedWorkOrderVersion: 'work-order-2',
    comment: '桥架安装数量与方案不符，请提供变更依据。',
    sourceMaterials: [],
  };
  const r1 = await http('POST', `/api/admin/mock/external/installation/work-orders/${targetWo.id}/review-actions`, { token: tokReview, body: returnBody });
  check('REQUEST-SUPPLEMENT', r1.http === 200 && r1.json.data.operationStatus === 'SUCCEEDED', '退回补充 SUCCEEDED（具体问题非空）');

  const replyBody = {
    ...returnBody,
    operationId: `OP-T25-SS-${run}`,
    action: 'SUBMIT_SUPPLEMENT',
    expectedAnalysisVersion: null,
    replyToOperationId: returnBody.operationId,
    expectedWorkOrderVersion: 'work-order-3',
    comment: '变更确认单已关联本工单，请复核。',
    sourceMaterials: woMaterials,
  };
  const s1 = await http('POST', `/api/admin/mock/external/installation/work-orders/${targetWo.id}/review-actions`, { token: tokProvider, body: replyBody });
  check('SUBMIT-SUPPLEMENT', s1.http === 200 && s1.json.data.operationStatus === 'SUCCEEDED'
    && s1.json.data.resultDescription.includes('补充回复已保存'), '服务商补充回复 SUCCEEDED 并接续原退回');

  const s2 = await http('POST', `/api/admin/mock/external/installation/work-orders/${targetWo.id}/review-actions`, {
    token: tokProvider,
    body: { ...replyBody, operationId: `OP-T25-SS2-${run}`, expectedWorkOrderVersion: 'work-order-4' },
  });
  check('REPLY-CLOSED-409', s2.http === 409 && s2.json.code === 40903, '重复回复同一退回 40903（已不在待回复状态）');

  const s3 = await http('POST', `/api/admin/mock/external/installation/work-orders/${targetWo.id}/review-actions`, {
    token: tokProvider,
    body: { ...replyBody, operationId: `OP-T25-NR-${run}`, replyToOperationId: null },
  });
  check('SUPPLEMENT-NO-REPLYTO-400', s3.http === 400 && s3.json.code === 40001, '补充缺 replyToOperationId 40001');

  const a3 = await http('POST', `/api/admin/mock/external/installation/work-orders/${targetWo.id}/review-actions`, {
    token: tokReview,
    body: { ...returnBody, operationId: `OP-T25-WR-${run}`, replyToOperationId: returnBody.operationId },
  });
  check('APPROVE-WITH-REPLYTO-400', a3.http === 400 && a3.json.code === 40001, '非补充动作携带 replyToOperationId 40001');

  const a4 = await http('POST', `/api/admin/mock/external/installation/work-orders/${targetWo.id}/review-actions`, {
    token: tokReview,
    body: { ...returnBody, operationId: `OP-T25-EC-${run}`, comment: '   ' },
  });
  check('RETURN-EMPTY-COMMENT-400', a4.http === 400 && a4.json.code === 40001, '退回意见为空 40001');

  const a5 = await http('POST', `/api/admin/mock/external/installation/work-orders/${targetWo.id}/review-actions`, {
    token: tokReview,
    body: { ...returnBody, operationId: `OP-T25-DV-${run}`, expectedDetailVersion: 'detail-99' },
  });
  check('DETAIL-VERSION-409', a5.http === 409 && a5.json.code === 40901, '明细版本已变 40901');

  const a6 = await http('POST', `/api/admin/mock/external/installation/work-orders/${targetWo.id}/review-actions`, {
    token: tokProvider,
    body: { ...returnBody, operationId: `OP-T25-PA-${run}` },
  });
  check('PROVIDER-APPROVE-403', a6.http === 403 && a6.json.code === 40301, '服务商越权审核 40301');

  const a7 = await http('POST', `/api/admin/mock/external/installation/work-orders/${targetWo.id}/review-actions`, {
    token: tokCompany,
    body: { ...returnBody, operationId: `OP-T25-RA-${run}` },
  });
  check('PROVIDER-REVIEW-403', a7.http === 403 && a7.json.code === 40301, '服务商账号无京东核查动作 40301');

  const pendingWo = inst.wos.find((w) => !detailWoIds.has(w.id) && w.serviceProviderId === providerId);
  if (pendingWo) {
    const a8 = await http('POST', `/api/admin/mock/external/installation/work-orders/${pendingWo.id}/review-actions`, {
      token: tokReview,
      body: { ...approveBody, operationId: `OP-T25-ND-${run}`, expectedWorkOrderVersion: pendingWo.version },
    });
    check('APPROVE-NO-DETAIL', a8.http === 404 && a8.json.code === 40401, `明细未提交不可批准（${a8.http}/${a8.json.code}）`);
  }

  const stale = await http('POST', `/api/admin/mock/external/installation/work-orders/${targetWo.id}/review-actions`, {
    token: tokReview,
    body: { ...returnBody, operationId: `OP-T25-ST-${run}`, expectedWorkOrderVersion: 'work-order-1' },
  });
  check('WO-VERSION-STALE-409', stale.http === 409 && stale.json.code === 40901, '工单版本过期 40901（版本随动作前进）');

  const failed = checks.filter((c) => !c.pass);
  console.log(JSON.stringify({ base: BASE, checks, passed: failed.length === 0, failedCount: failed.length }, null, 2));
  if (failed.length > 0) process.exit(1);
}

main();
