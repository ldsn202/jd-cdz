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

function findPendingWo(providerId: string): { id: string; purchaseOrderId: string; materials: any[] } {
  const db = new DatabaseSync(path.join(ENV_DIR, 'sources/installation-admin.db'), { readOnly: true });
  const wos = (db.prepare("SELECT record_id, payload_json FROM source_record WHERE kind='work_order'").all() as any[]).map((r) => ({ id: r.record_id, ...JSON.parse(r.payload_json) }));
  const details = new Set((db.prepare("SELECT payload_json FROM source_record WHERE kind='installation_detail'").all() as any[]).map((r) => JSON.parse(r.payload_json).installationWorkOrderId));
  const submissions = new Set((db.prepare("SELECT payload_json FROM source_record WHERE kind='installation_detail_submission'").all() as any[]).map((r) => JSON.parse(r.payload_json).installationWorkOrderId));
  const target = wos.find((w) => w.serviceProviderId === providerId && !details.has(w.id) && !submissions.has(w.id));
  const materials = (db.prepare("SELECT payload_json FROM source_record WHERE kind='material_index'").all() as any[])
    .map((r) => JSON.parse(r.payload_json))
    .filter((m) => m.installationWorkOrderId === target?.id)
    .map((m) => ({ sourceSystem: 'file-service', sourceMaterialId: m.sourceMaterialId, sourceVersion: m.fileRef.sourceVersion }));
  db.close();
  return { id: target.id, purchaseOrderId: target.purchaseOrderId, materials };
}

async function main(): Promise<void> {
  const s = await http('POST', '/api/admin/mock/external/identity/sessions', { body: { accountId: 'acc-sp-001' } });
  const tok = s.json.data.token as string;
  const sj = await http('POST', '/api/admin/mock/external/identity/sessions', { body: { accountId: 'acc-jd-business' } });
  const tokRecon = sj.json.data.token as string;

  const target = findPendingWo('SP-001');
  const ctx = await http('GET', `/api/admin/mock/external/installation/work-orders/${target.id}/context`, { token: tok });
  const planVersion = ctx.json.data.installationPlan.sourceVersion;
  const woVersion = ctx.json.data.installationWorkOrder.sourceVersion;

  const items = [
    { installationItem: '桥架安装', installedQuantity: 15, unit: '米', materialSupplier: '服务商', serviceScope: '供料及安装' },
    { installationItem: '电缆敷设', installedQuantity: 40, unit: '米', materialSupplier: '服务商', serviceScope: '供料及安装' },
  ];
  const body = {
    submissionId: `SUB-T24-${Date.now().toString(36)}`,
    humanDecisionId: 'HD-T24-001',
    installationDraftId: 'DRAFT-T24-001',
    confirmedDraftVersion: 'draft-1',
    expectedWorkOrderVersion: woVersion,
    expectedPlanVersion: planVersion,
    expectedDetailVersion: null,
    items,
    sourceMaterials: target.materials,
  };

  const p1 = await http('POST', `/api/admin/mock/external/installation/work-orders/${target.id}/installation-detail-submissions`, { token: tok, body });
  check('SUBMIT-FIRST', p1.http === 200 && p1.json.data.submissionStatus === 'SUCCEEDED'
    && p1.json.data.installationDetail.sourceVersion === 'detail-1' && p1.json.data.verifiedAt !== null,
    `首次提交 SUCCEEDED，明细版本 detail-1（目标工单 ${target.id}）`);

  const g1 = await http('GET', `/api/admin/mock/external/installation/work-orders/${target.id}/installation-detail-submissions/${body.submissionId}`, { token: tok });
  check('SUBMIT-RECHECK', g1.http === 200 && g1.json.data.submissionStatus === 'SUCCEEDED'
    && g1.json.data.installationDetail.installationDetailId === p1.json.data.installationDetail.installationDetailId,
    '按原编号回查返回同一份结果（不二次写入）');

  const ctxAfter = await http('GET', `/api/admin/mock/external/installation/work-orders/${target.id}/context`, { token: tok });
  check('SUBMIT-CONTEXT-CONSISTENT', ctxAfter.http === 200 && ctxAfter.json.data.installationDetailStatus === 'SUBMITTED'
    && JSON.stringify(ctxAfter.json.data.installationDetail.items) === JSON.stringify(items)
    && ctxAfter.json.data.installationDetail.sourceVersion === 'detail-1',
    '工单上下文与提交结果对应同一份内容（items 逐项一致）');

  const p2 = await http('POST', `/api/admin/mock/external/installation/work-orders/${target.id}/installation-detail-submissions`, { token: tok, body });
  check('SUBMIT-REPLAY', p2.http === 200 && p2.json.data.submissionStatus === 'SUCCEEDED'
    && p2.json.data.installationDetail.sourceVersion === 'detail-1',
    '同编号同内容重放返回原结果（版本未因重放改变）');

  const subCount = new DatabaseSync(path.join(ENV_DIR, 'sources/installation-admin.db'), { readOnly: true })
    .prepare("SELECT COUNT(*) AS n FROM source_record WHERE kind='installation_detail_submission' AND record_id=?").get(body.submissionId) as any;
  check('SUBMIT-REPLAY-NO-DUP', subCount.n === 1, `提交记录仍 1 条（count=${subCount.n}）`);

  const p3 = await http('POST', `/api/admin/mock/external/installation/work-orders/${target.id}/installation-detail-submissions`, {
    token: tok,
    body: { ...body, items: [{ ...items[0], installedQuantity: 99 }] },
  });
  check('SUBMIT-SAME-ID-DIFF-CONTENT-409', p3.http === 409 && p3.json.code === 40902, '同编号改内容 40902');

  const p4 = await http('POST', `/api/admin/mock/external/installation/work-orders/${target.id}/installation-detail-submissions`, {
    token: tok,
    body: { ...body, submissionId: `SUB-T24-R${Date.now().toString(36)}`, expectedPlanVersion: 'plan-99' },
  });
  check('SUBMIT-PLAN-VERSION-409', p4.http === 409 && p4.json.code === 40901, '方案预期版本不符 40901');

  const p5 = await http('POST', `/api/admin/mock/external/installation/work-orders/${target.id}/installation-detail-submissions`, {
    token: tok,
    body: { ...body, submissionId: `SUB-T24-R2${Date.now().toString(36)}`, expectedDetailVersion: 'detail-9' },
  });
  check('SUBMIT-DETAIL-VERSION-409', p5.http === 409 && p5.json.code === 40901, '修订预期明细版本不符 40901');

  const p6 = await http('POST', `/api/admin/mock/external/installation/work-orders/${target.id}/installation-detail-submissions`, {
    token: tok,
    body: { ...body, submissionId: `SUB-T24-REV${Date.now().toString(36)}`, expectedDetailVersion: 'detail-1', items: [{ ...items[0], installedQuantity: 18 }] },
  });
  check('SUBMIT-REVISION', p6.http === 200 && p6.json.data.submissionStatus === 'SUCCEEDED'
    && p6.json.data.installationDetail.sourceVersion === 'detail-2',
    '修订提交生成 detail-2（历史版本不覆盖）');

  const p7 = await http('POST', `/api/admin/mock/external/installation/work-orders/${target.id}/installation-detail-submissions`, {
    token: tok,
    body: { ...body, submissionId: `SUB-T24-BAD${Date.now().toString(36)}`, items: [] },
  });
  check('SUBMIT-EMPTY-ITEMS-400', p7.http === 400 && p7.json.code === 40001, '空项目列表受理前拒绝 40001');

  const p8 = await http('POST', `/api/admin/mock/external/installation/work-orders/${target.id}/installation-detail-submissions`, {
    token: tok,
    body: { ...body, submissionId: `SUB-T24-BADM${Date.now().toString(36)}`, expectedDetailVersion: 'detail-2', sourceMaterials: [{ sourceSystem: 'file-service', sourceMaterialId: 'MAT-XXXXX', sourceVersion: 'material-1' }] },
  });
  check('SUBMIT-BAD-MATERIAL-400', p8.http === 400 && p8.json.code === 40001, '材料引用不可核实 40001');

  const woOther = (() => {
    const db = new DatabaseSync(path.join(ENV_DIR, 'sources/installation-admin.db'), { readOnly: true });
    const w = (db.prepare("SELECT record_id, payload_json FROM source_record WHERE kind='work_order'").all() as any[])
      .map((r) => ({ id: r.record_id, ...JSON.parse(r.payload_json) }))
      .find((w) => w.serviceProviderId !== 'SP-001');
    db.close();
    return w;
  })();
  const p9 = await http('POST', `/api/admin/mock/external/installation/work-orders/${woOther.id}/installation-detail-submissions`, { token: tok, body: { ...body, submissionId: `SUB-T24-X${Date.now().toString(36)}` } });
  check('SUBMIT-CROSS-403', p9.http === 403 && p9.json.code === 40301, '跨服务商提交 40301');

  const p10 = await http('POST', `/api/admin/mock/external/installation/work-orders/WO-9999-XXXX/installation-detail-submissions`, { token: tok, body: { ...body, submissionId: `SUB-T24-NF${Date.now().toString(36)}` } });
  check('SUBMIT-WO-NOT-FOUND-404', p10.http === 404 && p10.json.code === 40401, '工单不存在 40401');

  const p11 = await http('POST', `/api/admin/mock/external/installation/work-orders/${target.id}/installation-detail-submissions`, {
    token: tokRecon,
    body: { ...body, submissionId: `SUB-T24-JD${Date.now().toString(36)}`, expectedDetailVersion: 'detail-2' },
  });
  check('SUBMIT-JD-NO-ACTION-403', p11.http === 403 && p11.json.code === 40301, '无 SUBMIT_INSTALLATION_DETAIL 动作 40301（京东业务账号不代服务商提交）');

  const g404 = await http('GET', `/api/admin/mock/external/installation/work-orders/${target.id}/installation-detail-submissions/SUB-XXXX`, { token: tok });
  check('RECHECK-NOT-FOUND-404', g404.http === 404 && g404.json.code === 40401, '回查不存在 40401');

  const failed = checks.filter((c) => !c.pass);
  console.log(JSON.stringify({ base: BASE, checks, passed: failed.length === 0, failedCount: failed.length }, null, 2));
  if (failed.length > 0) process.exit(1);
}

main();
