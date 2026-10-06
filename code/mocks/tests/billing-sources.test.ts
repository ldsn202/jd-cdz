import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { sum, mulQtyPrice } from '../validation/decimal.ts';

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

function noPrejudged(json: unknown): boolean {
  const s = JSON.stringify(json);
  return !/reconciliationSummary|"expected"|"scenario"|预制|差异结论/.test(s);
}

async function main(): Promise<void> {
  const sr = await http('POST', '/api/admin/mock/external/identity/sessions', { body: { accountId: 'acc-jd-business' } });
  const tokRecon = sr.json.data.token as string;
  const sp = await http('POST', '/api/admin/mock/external/identity/sessions', { body: { accountId: 'acc-sp-001' } });
  const tokSp001 = sp.json.data.token as string;

  const jdb = new DatabaseSync(path.join(ENV_DIR, 'sources/jd-billing.db'), { readOnly: true });
  const bills = (jdb.prepare("SELECT record_id, payload_json FROM source_record WHERE kind='jd_bill'").all() as any[]).map((r) => ({ id: r.record_id, ...JSON.parse(r.payload_json) }));
  jdb.close();
  const single = bills.find((b) => b.relatedWorkOrderIds.length === 1 && b.jdBillId !== undefined);
  const multi = bills.find((b) => b.relatedWorkOrderIds.length > 1);

  const manifest = JSON.parse(readFileSync(path.join(ENV_DIR, 'delivery/standard-v1/data-manifest.json'), 'utf8'));
  const neg1Wo = (JSON.parse(readFileSync(path.join(ENV_DIR, 'delivery/standard-v1/negatives.json'), 'utf8')).items as any[]).find((n) => n.kind === 'TOTAL_MISMATCH').installationWorkOrderId;
  const neg1Group = (manifest.billGroupIndex as any[]).find((g) => g.workOrderIds.includes(neg1Wo));

  const b1 = await http('GET', `/api/admin/mock/external/jd-bills/${single.jdBillId}?installationWorkOrderId=${single.relatedWorkOrderIds[0]}`, { token: tokRecon });
  const d1 = b1.json.data;
  const sumOk = sum(d1.items.map((x: any) => x.amount)) === d1.reportedTotalAmount;
  const qtyOk = d1.items.every((x: any) => (x.billedQuantity === null || x.unitPrice === null) || mulQtyPrice(x.billedQuantity, x.unitPrice) === x.amount);
  check('JDBILL-SINGLE', b1.http === 200 && d1.jdBillId === single.jdBillId && d1.targetWorkOrderAmount === d1.reportedTotalAmount
    && d1.currency === 'CNY' && d1.taxBasis === 'TAX_INCLUDED' && d1.completeness === 'COMPLETE' && sumOk && qtyOk,
    `单工单账单：字段齐全，目标金额=原总额 ${d1.reportedTotalAmount}，十进制独立复算一致`);

  if (multi) {
    const bm = await http('GET', `/api/admin/mock/external/jd-bills/${multi.jdBillId}?installationWorkOrderId=${multi.relatedWorkOrderIds[0]}`, { token: tokRecon });
    check('JDBILL-MULTI-WO', bm.http === 200 && bm.json.data.targetWorkOrderAmount === null
      && bm.json.data.missingParts.includes('WORK_ORDER_AMOUNT') && bm.json.data.completeness === 'INCOMPLETE'
      && bm.json.data.relatedWorkOrderIds.length === multi.relatedWorkOrderIds.length,
      `一账单多工单：无分配依据时目标金额 null 并列 WORK_ORDER_AMOUNT，整单 ${multi.relatedWorkOrderIds.length} 工单可见`);
  }

  const otherWo = manifest.scenarioOrderIds.read_only[0];
  const bConflict = await http('GET', `/api/admin/mock/external/jd-bills/${single.jdBillId}?installationWorkOrderId=${otherWo}`, { token: tokRecon });
  check('JDBILL-WO-MISMATCH-409', bConflict.http === 409 && bConflict.json.code === 40901, '账单与工单明确不符 40901');

  const b404 = await http('GET', `/api/admin/mock/external/jd-bills/JD-BILL-XXXX?installationWorkOrderId=${single.relatedWorkOrderIds[0]}`, { token: tokRecon });
  check('JDBILL-NOT-FOUND-404', b404.http === 404 && b404.json.code === 40401, '账单不存在 40401');

  const neg1Bill = await http('GET', `/api/admin/mock/external/jd-bills/${neg1Group.jdBillId}?installationWorkOrderId=${neg1Wo}`, { token: tokRecon });
  const neg1Sum = sum(neg1Bill.json.data.items.map((x: any) => x.amount));
  check('JDBILL-NEG1-PRESERVED', neg1Bill.http === 200 && neg1Sum !== neg1Bill.json.data.reportedTotalAmount,
    `NEG-01 总分不符原样保留：分项合计 ${neg1Sum} vs 原总额 ${neg1Bill.json.data.reportedTotalAmount}，接口不预计算差额结论`);

  const crossBill = await http('GET', `/api/admin/mock/external/jd-bills/${single.jdBillId}?installationWorkOrderId=${single.relatedWorkOrderIds[0]}`, { token: tokSp001 });
  check('JDBILL-CROSS-403', crossBill.http === 403 && crossBill.json.code === 40301 && crossBill.json.data === null, '越权读账单 40301（整单权限）');

  const recId = single.jdBillId.replace('JD-BILL', 'REC');
  const r1 = await http('GET', `/api/admin/mock/external/sources/provider-receivable/service-providers/${single.serviceProviderId}/receivables/${recId}?installationWorkOrderId=${single.relatedWorkOrderIds[0]}`, { token: tokRecon });
  check('RECV-READ', r1.http === 200 && r1.json.data.providerReceivableId === recId && Array.isArray(r1.json.data.items)
    && sum(r1.json.data.items.map((x: any) => x.amount)) === r1.json.data.reportedTotalAmount,
    `应收读取：原分项/原总额 ${r1.json.data.reportedTotalAmount} 独立复算一致`);

  const rdb = new DatabaseSync(path.join(ENV_DIR, 'sources/provider-receivable.db'));
  const recRow = rdb.prepare("SELECT payload_json FROM source_record WHERE kind='provider_receivable' AND record_id=?").get(recId) as any;
  const originalPayload = recRow.payload_json as string;
  const recPayload = JSON.parse(originalPayload);
  recPayload.items[0].amount = '99999.99';
  recPayload.reportedTotalAmount = '99999.99';
  rdb.prepare("UPDATE source_record SET payload_json=? WHERE kind='provider_receivable' AND record_id=?").run(JSON.stringify(recPayload), recId);
  const jdAfter = await http('GET', `/api/admin/mock/external/jd-bills/${single.jdBillId}?installationWorkOrderId=${single.relatedWorkOrderIds[0]}`, { token: tokRecon });
  rdb.prepare("UPDATE source_record SET payload_json=? WHERE kind='provider_receivable' AND record_id=?").run(originalPayload, recId);
  rdb.close();
  check('RECV-EDIT-NOT-AFFECT-JDBILL', jdAfter.http === 200 && jdAfter.json.data.reportedTotalAmount === d1.reportedTotalAmount,
    `应收改为 99999.99 后京东账单仍为 ${d1.reportedTotalAmount}（两侧独立，已恢复来源原值）`);

  const groups = manifest.billGroupIndex as any[];
  const matchedGroup = groups.find((g) => g.approvalId !== null && g.workOrderIds.length === 1);
  const ev1 = await http('GET', `/api/admin/mock/external/installation-work-orders/${matchedGroup.workOrderIds[0]}/fee-evidence?serviceProviderId=${matchedGroup.serviceProviderId}`, { token: tokRecon });
  check('EVIDENCE-COMPLETE', ev1.http === 200 && ev1.json.data.terms.length > 0 && ev1.json.data.approvals.length === 1
    && ev1.json.data.approvals[0].decision === 'APPROVED' && ev1.json.data.terms[0].effectiveStatus === 'EFFECTIVE'
    && ev1.json.data.completeness === 'COMPLETE',
    '费用依据完整：条款 EFFECTIVE + 批准 APPROVED 且适用范围明确');

  const scenarioLists = manifest.scenarioOrderIds;
  const incompleteWo = scenarioLists.billing_evidence_incomplete[0];
  const incompleteGroup = groups.find((g) => g.workOrderIds.includes(incompleteWo));
  const ev2 = await http('GET', `/api/admin/mock/external/installation-work-orders/${incompleteWo}/fee-evidence?serviceProviderId=${incompleteGroup.serviceProviderId}`, { token: tokRecon });
  check('EVIDENCE-NO-APPROVAL-VS-NOT-ALL', ev2.http === 200
    && ((ev2.json.data.approvals.length === 0 && ev2.json.data.approvalListComplete === true) || ev2.json.data.approvals.length > 0)
    && ev2.json.data.lookupScope.includes(incompleteWo),
    `依据不完整场景：批准 ${ev2.json.data.approvals.length} 条、条款 ${ev2.json.data.terms.length} 条；查全为真时无记录不解释为未批准（与未查全区分）`);

  const ev403 = await http('GET', `/api/admin/mock/external/installation-work-orders/${matchedGroup.workOrderIds[0]}/fee-evidence?serviceProviderId=${matchedGroup.serviceProviderId}`, { token: tokSp001 });
  const expected403 = matchedGroup.serviceProviderId !== 'SP-001';
  check('EVIDENCE-SCOPE-403', expected403 ? ev403.http === 403 : ev403.http === 200, `费用依据按服务商范围控制（${ev403.http}）`);

  check('NO-PREJUDGED-FIELDS', [b1, r1, ev1, ev2].every((x) => noPrejudged(x.json)), '返回不夹带 reconciliationSummary/预制判断/场景标签');

  const failed = checks.filter((c) => !c.pass);
  console.log(JSON.stringify({ base: BASE, checks, passed: failed.length === 0, failedCount: failed.length }, null, 2));
  if (failed.length > 0) process.exit(1);
}

main();
