import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

type Check = { id: string; pass: boolean; detail: string };
const checks: Check[] = [];
const check = (id: string, pass: boolean, detail: string) => checks.push({ id, pass, detail });

const BASE = process.env.MOCK_BASE ?? 'http://localhost:8790';
const BASE_B = process.env.MOCK_BASE_B ?? 'http://localhost:8792';
const ENV_DIR = path.join(rootDir, '.data/mock-env-a');

async function http(method: string, p: string, opts: { token?: string; body?: unknown; base?: string } = {}): Promise<{ http: number; json: any; headers: Headers }> {
  const res = await fetch(`${opts.base ?? BASE}${p}`, {
    method,
    headers: { 'content-type': 'application/json', ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  return { http: res.status, json: await res.json(), headers: res.headers };
}

function submissionCount(): number {
  const db = new DatabaseSync(path.join(ENV_DIR, 'sources/installation-admin.db'), { readOnly: true });
  const n = (db.prepare("SELECT COUNT(*) AS n FROM source_record WHERE kind='installation_detail_submission'").get() as any).n;
  db.close();
  return n;
}

function findPendingWo(providerId: string | null): any {
  const db = new DatabaseSync(path.join(ENV_DIR, 'sources/installation-admin.db'), { readOnly: true });
  const wos = (db.prepare("SELECT record_id, source_version, payload_json FROM source_record WHERE kind='work_order'").all() as any[]).map((r) => ({ id: r.record_id, version: r.source_version, ...JSON.parse(r.payload_json) }));
  const details = new Set((db.prepare("SELECT payload_json FROM source_record WHERE kind='installation_detail'").all() as any[]).map((r) => JSON.parse(r.payload_json).installationWorkOrderId));
  const subs = new Set((db.prepare("SELECT payload_json FROM source_record WHERE kind='installation_detail_submission'").all() as any[]).map((r) => JSON.parse(r.payload_json).installationWorkOrderId));
  const target = providerId
    ? wos.find((w) => w.serviceProviderId === providerId && !details.has(w.id) && !subs.has(w.id))
    : wos.find((w) => !details.has(w.id) && !subs.has(w.id));
  const materials = (db.prepare("SELECT payload_json FROM source_record WHERE kind='material_index'").all() as any[])
    .map((r) => JSON.parse(r.payload_json))
    .filter((m) => m.installationWorkOrderId === target?.id)
    .map((m) => ({ sourceSystem: 'file-service', sourceMaterialId: m.sourceMaterialId, sourceVersion: m.fileRef.sourceVersion }));
  const plan = (db.prepare("SELECT payload_json, source_version FROM source_record WHERE kind='installation_plan'").all() as any[])
    .map((r) => ({ ...JSON.parse(r.payload_json), version: r.source_version }))
    .find((p) => p.installationWorkOrderId === target?.id);
  db.close();
  return { ...target, materials, planVersion: plan?.version };
}

async function main(): Promise<void> {
  const run = Date.now().toString(36);
  const sj = await http('POST', '/api/admin/mock/external/identity/sessions', { body: { accountId: 'acc-jd-business' } });
  const tokReview = sj.json.data.token as string;

  const idbClean = new DatabaseSync(path.join(ENV_DIR, 'sources/identity.db'));
  for (const r of idbClean.prepare("SELECT record_id, payload_json FROM source_record WHERE kind='fault_slip'").all() as any[]) {
    const p = JSON.parse(r.payload_json);
    if (p.active) {
      p.active = false;
      p.clearedAt = new Date().toISOString();
      idbClean.prepare("UPDATE source_record SET payload_json=? WHERE kind='fault_slip' AND record_id=?").run(JSON.stringify(p), r.record_id);
    }
  }
  idbClean.close();

  const sessionFor = async (providerId: string): Promise<string> => {
    const r = await http('POST', '/api/admin/mock/external/identity/sessions', { body: { accountId: `acc-${providerId.toLowerCase()}` } });
    return r.json.data.token as string;
  };

  const f1 = `fault-before-${run}`;
  const target1 = findPendingWo(null);
  const tok = await sessionFor(target1.serviceProviderId);
  await http('POST', '/api/admin/mock/control/faults', { token: tok, body: { faultId: f1, route: 'detail-submission-write', phase: 'BEFORE_CALL', times: 1 } });
  const body1 = {
    submissionId: `SUB-T31-A-${run}`,
    humanDecisionId: 'HD-T31-A',
    installationDraftId: 'DRAFT-T31-A',
    confirmedDraftVersion: 'draft-1',
    expectedWorkOrderVersion: target1.version,
    expectedPlanVersion: target1.planVersion,
    expectedDetailVersion: null,
    items: [{ installationItem: '桥架安装', installedQuantity: 10, unit: '米', materialSupplier: '服务商', serviceScope: '供料及安装' }],
    sourceMaterials: target1.materials,
  };
  const countBefore = submissionCount();
  const p1 = await http('POST', `/api/admin/mock/external/installation/work-orders/${target1.id}/installation-detail-submissions`, { token: tok, body: body1 });
  check('FAULT-BEFORE-CALL', p1.http === 503 && p1.json.code === 50301 && submissionCount() === countBefore,
    `调用前失败：50301 且来源写计数不变（${countBefore}）`);
  const p1b = await http('POST', `/api/admin/mock/external/installation/work-orders/${target1.id}/installation-detail-submissions`, { token: tok, body: body1 });
  check('FAULT-BEFORE-CONSUMED', p1b.http === 200 && p1b.json.data.submissionStatus === 'SUCCEEDED', '命中 1 次后解除，同编号真实写入恢复');

  const f2 = `fault-lost-${run}`;
  await http('POST', '/api/admin/mock/control/faults', { token: tok, body: { faultId: f2, route: 'detail-submission-write', phase: 'AFTER_WRITE_LOST_RESPONSE', times: 1 } });
  const target2 = findPendingWo(null);
  const tok2 = await sessionFor(target2.serviceProviderId);
  const body2 = { ...body1, submissionId: `SUB-T31-B-${run}`, expectedWorkOrderVersion: target2.version, expectedPlanVersion: target2.planVersion, sourceMaterials: target2.materials };
  const countBefore2 = submissionCount();
  const p2 = await http('POST', `/api/admin/mock/external/installation/work-orders/${target2.id}/installation-detail-submissions`, { token: tok2, body: body2 });
  const countAfter2 = submissionCount();
  if (!(p2.http === 504 && p2.json.code === 50401)) console.error('DEBUG p2:', JSON.stringify(p2.json).slice(0, 300), 'target2:', target2.id, target2.serviceProviderId, 'versions:', target2.version, target2.planVersion);
  check('FAULT-LOST-RESPONSE', p2.http === 504 && p2.json.code === 50401 && countAfter2 === countBefore2 + 1,
    `写入后丢响应：50401 但来源实际写入（计数 ${countBefore2}→${countAfter2}）`);
  const g2 = await http('GET', `/api/admin/mock/external/installation/work-orders/${target2.id}/installation-detail-submissions/${body2.submissionId}`, { token: tok2 });
  check('FAULT-LOST-RECHECK', g2.http === 200 && g2.json.data.submissionStatus === 'SUCCEEDED', '回查证实成功（没有收到响应≠没有写入）');
  const p2b = await http('POST', `/api/admin/mock/external/installation/work-orders/${target2.id}/installation-detail-submissions`, { token: tok2, body: body2 });
  check('FAULT-LOST-NO-REWRITE', p2b.http === 200 && p2b.json.data.submissionStatus === 'SUCCEEDED' && submissionCount() === countAfter2,
    '恢复请求同编号返回原结果，不二次写入');

  const f3 = `fault-recheck-${run}`;
  await http('POST', '/api/admin/mock/control/faults', { token: tok, body: { faultId: f3, route: 'submission-recheck', phase: 'RECHECK_FAIL', httpOverride: 503, times: 1 } });
  const g3 = await http('GET', `/api/admin/mock/external/installation/work-orders/${target2.id}/installation-detail-submissions/${body2.submissionId}`, { token: tok2 });
  check('FAULT-RECHECK-503', g3.http === 503 && g3.json.code === 50301, '回查失败 50301（故障注入）');
  const g3b = await http('GET', `/api/admin/mock/external/installation/work-orders/${target2.id}/installation-detail-submissions/${body2.submissionId}`, { token: tok2 });
  check('FAULT-RECHECK-RECOVER', g3b.http === 200 && g3b.json.data.submissionStatus === 'SUCCEEDED', '解除后回查恢复读取已保存结果');

  const f4 = `fault-clear-${run}`;
  await http('POST', '/api/admin/mock/control/faults', { token: tok, body: { faultId: f4, route: 'detail-submission-write', phase: 'BEFORE_CALL', times: 5 } });
  const c4 = await http('POST', `/api/admin/mock/control/faults/${f4}/clear`, { token: tok });
  const target4 = findPendingWo(null);
  const tok4 = await sessionFor(target4.serviceProviderId);
  const p4 = await http('POST', `/api/admin/mock/external/installation/work-orders/${target4.id}/installation-detail-submissions`, {
    token: tok4,
    body: { ...body1, submissionId: `SUB-T31-C-${run}`, expectedWorkOrderVersion: target4.version, expectedPlanVersion: target4.planVersion, sourceMaterials: target4.materials },
  });
  check('FAULT-CLEAR', c4.http === 200 && p4.http === 200, '按登记条件解除后真实请求正常');

  const f5 = `fault-persist-${run}`;
  await http('POST', '/api/admin/mock/control/faults', { token: tok, body: { faultId: f5, route: 'detail-submission-write', phase: 'BEFORE_CALL', times: 3 } });
  const target5 = findPendingWo(null);
  const tok5 = await sessionFor(target5.serviceProviderId);
  const body5 = { ...body1, submissionId: `SUB-T31-D-${run}`, expectedWorkOrderVersion: target5.version, expectedPlanVersion: target5.planVersion, sourceMaterials: target5.materials };
  const p5a = await http('POST', `/api/admin/mock/external/installation/work-orders/${target5.id}/installation-detail-submissions`, { token: tok5, body: body5 });
  check('FAULT-PERSIST-BEFORE-RESTART', p5a.http === 503, '重启前命中第 1 次（剩余 2 次已持久化）');

  const fList = await http('GET', '/api/admin/mock/control/faults', { token: tok });
  const slip5 = fList.json.data.find((x: any) => x.faultId === f5);
  check('FAULT-HIT-LOG', slip5 && slip5.remaining === 2 && slip5.hits.length === 1 && typeof slip5.hits[0].requestId === 'string', '命中过程记入测试日志（requestId 留痕，不含答案）');

  const f6 = `fault-cont-${run}`;
  await http('POST', '/api/admin/mock/control/faults', { token: tok, body: { faultId: f6, route: 'review-action-write', phase: 'LOCAL_CONTINUATION', times: 1 } });
  const inst = (() => {
    const db = new DatabaseSync(path.join(ENV_DIR, 'sources/installation-admin.db'), { readOnly: true });
    const wos = (db.prepare("SELECT record_id, source_version, payload_json FROM source_record WHERE kind='work_order'").all() as any[]).map((r) => ({ id: r.record_id, version: r.source_version, ...JSON.parse(r.payload_json) }));
    const details = (db.prepare("SELECT payload_json, source_version FROM source_record WHERE kind='installation_detail'").all() as any[]).map((r) => ({ ...JSON.parse(r.payload_json), version: r.source_version }));
    db.close();
    const d = details[0];
    const w = wos.find((x) => x.id === d.installationWorkOrderId);
    return { w, d };
  })();
  const p6 = await http('POST', `/api/admin/mock/external/installation/work-orders/${inst.w.id}/review-actions`, {
    token: tokReview,
    body: {
      operationId: `OP-T31-${run}`,
      workItemId: 'WI-T31-001',
      expectedWorkItemVersion: 'item-1',
      humanDecisionId: 'HD-T31',
      action: 'APPROVE',
      installationDetailId: inst.d.installationDetailId,
      expectedDetailVersion: inst.d.version,
      expectedWorkOrderVersion: inst.w.version,
      expectedAnalysisVersion: 'analysis-1',
      replyToOperationId: null,
      comment: '',
      sourceMaterials: [],
    },
  });
  const contHeader = p6.headers.get('x-mock-continuation-blocked');
  const opPersisted = (() => {
    const db = new DatabaseSync(path.join(ENV_DIR, 'sources/installation-admin.db'), { readOnly: true });
    const row = db.prepare("SELECT COUNT(*) AS n FROM source_record WHERE kind='review_action' AND record_id=?").get(`OP-T31-${run}`) as any;
    db.close();
    return row.n === 1;
  })();
  check('FAULT-LOCAL-CONTINUATION', p6.http === 200 && p6.json.data.operationStatus === 'SUCCEEDED' && contHeader === f6 && opPersisted,
    '源成功本地接续失败：来源保留成功回执，响应标记接续阻断（本系统恢复时只续本地流程）');

  const f7 = `fault-nocollateral-${run}`;
  await http('POST', '/api/admin/mock/control/faults', { token: tok, body: { faultId: f7, route: 'detail-submission-write', phase: 'BEFORE_CALL', times: 1 } });
  const p7 = await http('GET', '/api/admin/mock/external/identity/current-context', { token: tok });
  check('FAULT-NO-COLLATERAL', p7.http === 200 && typeof p7.json.data.subjectId === 'string', '对照请求无误伤（其他接口正常）');
  await http('POST', `/api/admin/mock/control/faults/${f7}/clear`, { token: tok });

  const revA = await http('POST', '/api/admin/mock/control/revisions', {
    token: tok,
    body: (() => {
      const db = new DatabaseSync(path.join(ENV_DIR, 'sources/provider-receivable.db'), { readOnly: true });
      const revisedIds = new Set((db.prepare("SELECT payload_json FROM source_record WHERE kind='provider_receivable_revision'").all() as any[]).map((r) => JSON.parse(r.payload_json).providerReceivableId));
      const row = (db.prepare("SELECT record_id, source_version FROM source_record WHERE kind='provider_receivable'").all() as any[]).find((r) => !revisedIds.has(r.record_id));
      db.close();
      return { sourceSystem: 'provider-receivable', recordType: 'PROVIDER_RECEIVABLE', recordId: row.record_id, expectedVersion: row.source_version, revisionNote: `ENV-ISO-${run}`, patch: { sourceStatus: `环境A修订-${run}` } };
    })(),
  });
  const isoRecId = revA.json.data?.recordId;
  check('ENV-ISOLATION-SAME-ID', revA.http === 200 && typeof isoRecId === 'string', `A 环境修订 ${isoRecId}（详见 B 库回查）`);
  const bDb = new DatabaseSync(path.join(rootDir, '.data/mock-env-b/sources/provider-receivable.db'), { readOnly: true });
  const bRow = bDb.prepare("SELECT source_version, payload_json FROM source_record WHERE kind='provider_receivable' AND record_id=?").get(isoRecId) as any;
  const bRev = bDb.prepare("SELECT COUNT(*) AS n FROM source_record WHERE kind='provider_receivable_revision' AND record_id LIKE ?").get(`${isoRecId}%`) as any;
  bDb.close();
  check('ENV-B-UNCHANGED', bRow && bRow.source_version === 'receivable-1' && bRev.n === 0 && !bRow.payload_json.includes(`ENV-ISO-${run}`),
    `B 库同编号记录仍为 receivable-1 且无修订（A/B 存储完全隔离）`);

  const restore1 = await http('POST', '/api/admin/mock/control/environments/restore', { token: tok, body: { templateEnvId: 'mock-env-b', newEnvId: `restored-${run}` } });
  check('RESTORE-NO-ADAPTER-REFUSED', restore1.http === 409 && restore1.json.code === 40903 && restore1.json.msg.includes('生命周期'),
    `未配置本系统恢复适配器时完整恢复明确拒绝（${restore1.http}/${restore1.json.code}），不报告恢复成功`);
  const halfBuilt = (await import('node:fs')).existsSync(path.join(rootDir, '.data', `restored-${run}`));
  check('RESTORE-NO-PARTIAL', !halfBuilt, '拒绝后不产生半成品环境目录');

  const late = await http('POST', '/api/admin/mock/control/tasks/complete', { token: tok, body: { taskId: `task-${run}`, envId: 'mock-env-b' } });
  check('TASK-LATE-REJECTED', late.http === 409 && late.json.code === 40901, '旧环境迟到结果拒绝写入新环境 40901');
  const okTask = await http('POST', '/api/admin/mock/control/tasks/complete', { token: tok, body: { taskId: `task-${run}`, envId: 'mock-env-a' } });
  check('TASK-CURRENT-ACCEPTED', okTask.http === 200 && okTask.json.data.accepted === true, '当前环境任务正常交回');

  const mu = await http('POST', '/api/admin/mock/control/environments/mock-env-a/mark-uploads', { token: tok });
  const restore2 = await http('POST', '/api/admin/mock/control/environments/restore', { token: tok, body: { templateEnvId: 'mock-env-a', newEnvId: `restored2-${run}` } });
  check('RESTORE-UPLOADS-PROTECTED', mu.http === 200 && restore2.http === 409 && restore2.json.code === 40901 && restore2.json.msg.includes('上传'),
    '含实际上传环境不可清空恢复（只保留或另建新环境）');

  const idbEnd = new DatabaseSync(path.join(ENV_DIR, 'sources/identity.db'));
  for (const r of idbEnd.prepare("SELECT record_id, payload_json FROM source_record WHERE kind='fault_slip'").all() as any[]) {
    const p = JSON.parse(r.payload_json);
    if (p.active) {
      p.active = false;
      p.clearedAt = new Date().toISOString();
      idbEnd.prepare("UPDATE source_record SET payload_json=? WHERE kind='fault_slip' AND record_id=?").run(JSON.stringify(p), r.record_id);
    }
  }
  idbEnd.close();

  const failed = checks.filter((c) => !c.pass);
  console.log(JSON.stringify({ base: BASE, checks, passed: failed.length === 0, failedCount: failed.length }, null, 2));
  if (failed.length > 0) process.exit(1);
}

main();
