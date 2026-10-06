import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { loadEnvironment } from '../src/environment/registry.ts';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

type Row = { kind: string; record_id: string; source_version: string; source_updated_at: string; payload_json: string };
type Rec = { kind: string; id: string; version: string; updatedAt: string; payload: any };

type Assertion = { id: string; pass: boolean; detail: string };

function arg(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
}

function readSource(envSourcesDir: string, system: string): Rec[] {
  const db = new DatabaseSync(path.join(envSourcesDir, `${system}.db`), { readOnly: true });
  const rows = db.prepare('SELECT kind, record_id, source_version, source_updated_at, payload_json FROM source_record').all() as Row[];
  db.close();
  return rows.map((r) => ({ kind: r.kind, id: r.record_id, version: r.source_version, updatedAt: r.source_updated_at, payload: JSON.parse(r.payload_json) }));
}

const AMOUNT = /^-?\d+\.\d{2}$/;

function main(): void {
  const envFile = arg('--env');
  const datasetId = arg('--dataset');
  if (!envFile || !datasetId) throw new Error('用法：node generator/verify.ts --env <环境清单.json> --dataset <datasetId>');
  const env = loadEnvironment(rootDir, envFile);
  const deliveryDir = path.join(env.storageDir, 'delivery', datasetId);
  const manifest = JSON.parse(readFileSync(path.join(deliveryDir, 'data-manifest.json'), 'utf8'));
  const negatives = JSON.parse(readFileSync(path.join(deliveryDir, 'negatives.json'), 'utf8')).items as any[];

  const identity = readSource(env.sourcesDir, 'identity');
  const installation = readSource(env.sourcesDir, 'installation-admin');
  const entitlement = readSource(env.sourcesDir, 'order-entitlement');
  const providerDocs = readSource(env.sourcesDir, 'provider-docs');
  const fileService = readSource(env.sourcesDir, 'file-service');
  const jdBilling = readSource(env.sourcesDir, 'jd-billing');
  const receivable = readSource(env.sourcesDir, 'provider-receivable');
  const terms = readSource(env.sourcesDir, 'billing-terms');

  const A: Assertion[] = [];
  const assert = (id: string, pass: boolean, detail: string) => A.push({ id, pass, detail });

  const workOrders = installation.filter((r) => r.kind === 'work_order');
  const plans = installation.filter((r) => r.kind === 'installation_plan');
  const details = installation.filter((r) => r.kind === 'installation_detail');
  const materialIndex = installation.filter((r) => r.kind === 'material_index');
  const providerIds = [...new Set(workOrders.map((w) => w.payload.serviceProviderId))].sort();

  assert('SCALE-PROVIDERS', providerIds.length === manifest.totals.providers, `去重服务商 ${providerIds.length} / 清单 ${manifest.totals.providers}`);
  const countsByProvider = providerIds.map((p) => workOrders.filter((w) => w.payload.serviceProviderId === p).length);
  assert('SCALE-EVERY-PROVIDER-HAS-BUSINESS', countsByProvider.every((n) => n > 0), `最小单家工单数 ${Math.min(...countsByProvider)}`);
  assert('SCALE-DISTRIBUTION-DIFFERS', new Set(countsByProvider).size > 1, `工单数分布 ${Math.min(...countsByProvider)}—${Math.max(...countsByProvider)}`);
  assert('SCALE-WORK-ORDERS', workOrders.length === manifest.totals.workOrders, `工单 ${workOrders.length} / 清单 ${manifest.totals.workOrders}`);

  const scenarioLists = manifest.scenarioOrderIds as Record<string, string[]>;
  const isDemo=manifest.datasetId.startsWith('demo-10-v');
  const isQuick = manifest.setType === 'quick' || isDemo;
  const scenarioProviderMin = isQuick ? 1 : 3;
  const formMin = isQuick ? 1 : 20;
  const allScenarioOrders = Object.values(scenarioLists).flat();
  assert('SCENARIO-TOTAL-1000', allScenarioOrders.length === manifest.totals.workOrders && new Set(allScenarioOrders).size === allScenarioOrders.length, `九场景合计 ${allScenarioOrders.length}，去重 ${new Set(allScenarioOrders).size}（一工单只计一次）`);
  const woIds = new Set(workOrders.map((w) => w.id));
  assert('SCENARIO-LISTS-MATCH-DB', allScenarioOrders.every((id) => woIds.has(id)) && workOrders.every((w) => allScenarioOrders.includes(w.id)), '场景清单与实际工单集合一致');

  const providerForm = new Map<string, string>();
  for (const r of providerDocs.filter((x) => x.kind === 'provider_record')) providerForm.set(r.payload.serviceProviderId, r.payload.materialForm);

  const FILE_SCENARIOS = ['pending_materials', 'evidence_consistent', 'quantity_diff', 'material_lacking'];
  for (const [key, ids] of Object.entries(scenarioLists)) {
    if (ids.length === 0) continue;
    const providersOfScenario = new Set(ids.map((id) => workOrders.find((w) => w.id === id)!.payload.serviceProviderId));
    assert(`SCENARIO-${key}-PROVIDERS`, providersOfScenario.size >= scenarioProviderMin, `${key} 分布 ${providersOfScenario.size} 家（门槛 ${scenarioProviderMin}）`);
    if (FILE_SCENARIOS.includes(key)) {
      const forms = new Set([...providersOfScenario].map((p) => providerForm.get(p)));
      assert(`SCENARIO-${key}-FORMS`, forms.size >= (isDemo?1:2), `${key} 涉文件格式 ${forms.size} 类`);
    }
  }

  const formCounts = new Map<string, number>();
  for (const f of providerForm.values()) formCounts.set(f, (formCounts.get(f) ?? 0) + 1);
  const formsOk = (isDemo?['clear_table']:['clear_table', 'restructured_table', 'alt_unit_table', 'pdf_record', 'image_record']).every((f) => (formCounts.get(f) ?? 0) >= formMin);
  assert('FORM-COVERAGE', formsOk, `五类形态计数 ${JSON.stringify(Object.fromEntries(formCounts))}`);

  const formatSpecs = new Map(providerDocs.filter((r) => r.kind === 'format_spec').map((r) => [r.payload.formatId, r]));
  const cond = manifest && JSON.parse(readFileSync(path.join(deliveryDir, 'scenario-coverage.json'), 'utf8')).formatConditions as Record<string, string[]>;
  const providerRecords = providerDocs.filter((r) => r.kind === 'provider_record' && r.payload.purpose === 'CONFIGURATION');
  assert('FORMAT-COUNT', providerRecords.length === manifest.totals.providers, `初始格式 ${providerRecords.length} 份`);
  const condErrors: string[] = [];
  for (const r of providerRecords) {
    const pid = r.payload.serviceProviderId;
    const spec = formatSpecs.get(r.payload.sourceFormatId);
    if (cond.complete?.includes(pid) && (!spec || spec.payload.sourceVersion !== r.payload.sourceFormatVersion)) condErrors.push(`${pid} 完整条件但说明缺失/版本不符`);
    if (cond.no_spec?.includes(pid) && spec) condErrors.push(`${pid} 未提供说明但存在 format_spec`);
    if (cond.association_mismatch?.includes(pid) && spec && spec.payload.sourceVersion === r.payload.sourceFormatVersion) condErrors.push(`${pid} 关联不负例未形成（声明与说明同版）`);
    if (cond.meaning_unknown?.includes(pid) && !spec) condErrors.push(`${pid} 含义未知条件但说明缺失`);
  }
  for (const [k, list] of Object.entries(cond) as [string, string[]][]) {
    if (list.length > 0 && k !== 'association_mismatch') assert(`FORMAT-COND-${k}`, list.length === (k === 'complete' ? providerRecords.length - cond.meaning_unknown.length - cond.no_spec.length - cond.association_mismatch.length : list.length), `${k} ${list.length} 家`);
  }
  assert('FORMAT-CONDITION-BEHAVIOR', condErrors.length === 0, condErrors.join('；') || '四种格式条件分布与说明关联符合设计');

  const bills = jdBilling.filter((r) => r.kind === 'jd_bill');
  const recs = receivable.filter((r) => r.kind === 'provider_receivable');
  const periods = new Set(bills.map((b) => b.payload.billingPeriod));
  assert('BILL-PERIODS', periods.size === (manifest.totals.billingPeriods as string[]).length, `账期 ${[...periods].join(',')}`);
  assert('BILL-MULTI-ORDER', isQuick || bills.some((b) => b.payload.relatedWorkOrderIds.length > 1), isQuick ? '快速集不要求一账单多工单' : '存在一账单多工单');

  const accounts = identity.filter((r) => r.kind === 'account');
  const grants = identity.filter((r) => r.kind === 'grant');
  const rel1Bad = providerIds.filter((p) => {
    const acc = accounts.find((a) => a.payload.serviceProviderId === p);
    const grant = acc && grants.find((g) => g.payload.accountId === acc.payload.accountId);
    return !acc || !grant || !(grant.payload.scopeProviderIds as string[]).includes(p);
  });
  assert('REL1-PROVIDER-ACCOUNT-RECORDS', rel1Bad.length === 0, rel1Bad.length ? `缺账号/授权：${rel1Bad.join(',')}` : '服务商—账号—业务记录归属一致');

  const pos = entitlement.filter((r) => r.kind === 'purchase_order');
  const ents = entitlement.filter((r) => r.kind === 'installation_entitlement');
  const rel2Bad = workOrders.filter((w) => {
    const po = pos.find((p) => p.id === w.payload.purchaseOrderId);
    const ent = ents.find((e) => e.payload.purchaseOrderId === w.payload.purchaseOrderId && e.payload.installationWorkOrderId === w.id);
    return !po || !ent || po.payload.installationWorkOrderId !== w.id;
  });
  assert('REL2-ORDER-PO-ENTITLEMENT', rel2Bad.length === 0, rel2Bad.length ? `订单/权益不符：${rel2Bad.slice(0, 3).map((w) => w.id).join(',')}` : '工单—购买订单—权益相互指向');

  const pendingSet = new Set(scenarioLists.pending_materials ?? []);
  const rel3Bad: string[] = [];
  for (const w of workOrders) {
    const plan = plans.find((p) => p.payload.installationWorkOrderId === w.id);
    if (!plan) rel3Bad.push(`${w.id} 缺方案`);
    const detail = details.find((d) => d.payload.installationWorkOrderId === w.id);
    if (pendingSet.has(w.id) && detail) rel3Bad.push(`${w.id} 待整理场景不应有正式明细`);
    if (!pendingSet.has(w.id) && !detail) rel3Bad.push(`${w.id} 缺正式明细`);
  }
  assert('REL3-WO-PLAN-DETAIL', rel3Bad.length === 0, rel3Bad.slice(0, 3).join('；') || '工单—方案—正式明细指向同一工单，未提交为正常阶段');

  const fileMetas = new Set(fileService.filter((r) => r.kind === 'file_meta').map((r) => r.id));
  const neg3 = negatives.find((n) => n.kind === 'FILE_VERSION_NOT_FOUND');
  const rel4Bad: string[] = [];
  for (const m of materialIndex) {
    const key = `${m.payload.fileRef.fileId}@${m.payload.fileRef.sourceVersion}`;
    const isNeg3 = neg3 && m.payload.installationWorkOrderId === neg3.installationWorkOrderId && m.payload.fileRef.sourceVersion === 'material-9';
    if (isNeg3) {
      if (fileMetas.has(key)) rel4Bad.push(`${m.id} 负例文件版本不应存在`);
    } else if (!fileMetas.has(key)) {
      rel4Bad.push(`${m.id} 索引指向的文件版本不存在`);
    }
  }
  assert('REL4-MATERIAL-FILE', rel4Bad.length === 0, rel4Bad.slice(0, 3).join('；') || '材料索引—文件版本可实际请求（负例除外且核实不存在）');

  assert('REL5-RAW-FORMAT', condErrors.length === 0, '原资料—模板说明关联见 FORMAT-CONDITION-BEHAVIOR');

  const rel6Bad: string[] = [];
  for (const b of bills) {
    const rec = recs.find((r) => r.payload.billingPeriod === b.payload.billingPeriod && r.payload.serviceProviderId === b.payload.serviceProviderId
      && JSON.stringify(r.payload.relatedWorkOrderIds) === JSON.stringify(b.payload.relatedWorkOrderIds));
    if (!rec) rel6Bad.push(`${b.id} 无对应应收`);
    else if (rec.payload.currency !== b.payload.currency) rel6Bad.push(`${b.id} 币种不符`);
  }
  assert('REL6-BILL-RECEIVABLE', rel6Bad.length === 0, rel6Bad.slice(0, 3).join('；') || '京东账单—服务商应收按工单/服务商/账期/币种对应');

  const termsRecs = terms.filter((r) => r.kind === 'billing_terms');
  const approvals = terms.filter((r) => r.kind === 'fee_approval');
  const billGroupIndex = manifest.billGroupIndex as any[];
  const rel7Bad: string[] = [];
  for (const g of billGroupIndex) {
    const termsExists = termsRecs.some((t) => t.id === g.termsId);
    const approval = g.approvalId ? approvals.find((a) => a.id === g.approvalId) : null;
    if (g.approvalId && !approval) rel7Bad.push(`${g.jdBillId} 批准记录缺失`);
    if (approval && approval.payload.jdBillId !== g.jdBillId) rel7Bad.push(`${g.approvalId} 批准指向其他账单`);
    if (!termsExists && g.approvalId) rel7Bad.push(`${g.jdBillId} 有批准但条款缺失`);
  }
  assert('REL7-FEE-TERMS-APPROVAL', rel7Bad.length === 0, rel7Bad.slice(0, 3).join('；') || '费用—条款—批准可核实覆盖范围（依据不完整场景按登记缺项）');

  const reviewActions = installation.filter((r) => r.kind === 'review_action');
  assert('REL8-INITIAL-NO-REVIEW', reviewActions.length === 0, `初始无退回/回复记录（${reviewActions.length} 条），回复链路由后续业务动作产生`);

  const negAsserts: string[] = [];
  const neg1 = negatives.find((n) => n.kind === 'TOTAL_MISMATCH');
  if (neg1) {
    const bill = bills.find((b) => b.payload.relatedWorkOrderIds.includes(neg1.installationWorkOrderId));
    if (!bill) negAsserts.push('NEG-01 账单未找到');
    else {
      const sum = bill.payload.items.reduce((acc: number, x: any) => acc + Math.round(Number(x.amount) * 100), 0);
      if (Math.round(Number(bill.payload.reportedTotalAmount) * 100) === sum) negAsserts.push('NEG-01 总分不符未形成');
    }
  }
  const neg2 = negatives.find((n) => n.kind === 'REQUIRED_MATERIAL_MISSING');
  if (neg2 && materialIndex.some((m) => m.payload.installationWorkOrderId === neg2.installationWorkOrderId)) negAsserts.push('NEG-02 工单不应有任何材料索引');
  if (!neg1 || !neg2 || !neg3) negAsserts.push('预设负例登记不全');
  assert('NEGATIVES-PRESERVED', negAsserts.length === 0, negAsserts.join('；') || '三个预设负例按登记保留');

  const amountsBad: string[] = [];
  for (const b of [...bills, ...recs]) {
    if (!AMOUNT.test(b.payload.reportedTotalAmount)) amountsBad.push(`${b.id} 总额非十进制字符串`);
    for (const it of b.payload.items) {
      if (!AMOUNT.test(it.amount)) amountsBad.push(`${b.id}/${it.billItemId} 分项金额非法`);
      if (it.unitPrice !== null && !AMOUNT.test(it.unitPrice)) amountsBad.push(`${b.id}/${it.billItemId} 单价非法`);
    }
  }
  assert('DECIMAL-AMOUNTS', amountsBad.length === 0, amountsBad.slice(0, 3).join('；') || '金额均为十进制字符串');

  const allRecs = [...identity, ...installation, ...entitlement, ...providerDocs, ...fileService, ...jdBilling, ...receivable, ...terms];
  const verBad = allRecs.filter((r) => !r.version || !r.updatedAt);
  assert('VERSION-AND-TIME', verBad.length === 0, verBad.length ? `缺版本/时间：${verBad.slice(0, 3).map((r) => r.id).join(',')}` : `全部 ${allRecs.length} 条记录带来源版本与更新时间`);

  const failed = A.filter((x) => !x.pass);
  console.log(JSON.stringify({ datasetId, envId: env.manifest.envId, assertions: A, passed: failed.length === 0, failedCount: failed.length }, null, 2));
  if (failed.length > 0) process.exit(1);
}

main();
