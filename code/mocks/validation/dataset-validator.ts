import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { loadEnvironment } from '../src/environment/registry.ts';
import { checkDeliverables } from '../generator/manifest.ts';
import { mulQtyPrice, sum } from './decimal.ts';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

type Row = { kind: string; record_id: string; source_version: string; source_updated_at: string; payload_json: string };
type Rec = { kind: string; id: string; version: string; updatedAt: string; payload: any };

export type ValidationIssue = { check: string; objectId: string; detail: string };

function arg(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
}

function readSource(sourcesDir: string, system: string): Rec[] {
  const db = new DatabaseSync(path.join(sourcesDir, `${system}.db`), { readOnly: true });
  let rows: Row[] = [];
  try {
    rows = db.prepare('SELECT kind, record_id, source_version, source_updated_at, payload_json FROM source_record').all() as Row[];
  } catch {
    rows = [];
  }
  db.close();
  return rows.map((r) => ({ kind: r.kind, id: r.record_id, version: r.source_version, updatedAt: r.source_updated_at, payload: JSON.parse(r.payload_json) }));
}

export function validateDataset(envDir: { sourcesDir: string; filesDir: string; storageDir: string }, datasetId: string): { issues: ValidationIssue[]; rawCounts: Record<string, number> } {
  const issues: ValidationIssue[] = [];
  const bad = (check: string, objectId: string, detail: string) => issues.push({ check, objectId, detail });

  const identity = readSource(envDir.sourcesDir, 'identity');
  const installation = readSource(envDir.sourcesDir, 'installation-admin');
  const entitlement = readSource(envDir.sourcesDir, 'order-entitlement');
  const providerDocs = readSource(envDir.sourcesDir, 'provider-docs');
  const fileService = readSource(envDir.sourcesDir, 'file-service');
  const jdBilling = readSource(envDir.sourcesDir, 'jd-billing');
  const receivable = readSource(envDir.sourcesDir, 'provider-receivable');
  const terms = readSource(envDir.sourcesDir, 'billing-terms');
  const all = [...identity, ...installation, ...entitlement, ...providerDocs, ...fileService, ...jdBilling, ...receivable, ...terms];

  const deliveryDir = path.join(envDir.storageDir, 'delivery', datasetId);
  const manifest = JSON.parse(readFileSync(path.join(deliveryDir, 'data-manifest.json'), 'utf8'));
  const t0 = Date.parse(manifest.initialBusinessTime);

  for (const r of all) {
    if (!r.version || typeof r.version !== 'string') bad('VERSION', r.id, '来源版本缺失');
    const t = Date.parse(r.updatedAt);
    if (Number.isNaN(t)) bad('TIME', r.id, `更新时间不可解析：${r.updatedAt}`);
    else if (t < t0) bad('TIME', r.id, `更新时间早于初始业务时间：${r.updatedAt}`);
  }

  const payloadLeak = all.filter((r) => /"scenario"|"expected"|"expectation"|NEG-\d|NEG-F\d/.test(JSON.stringify(r.payload)));
  for (const r of payloadLeak) bad('ANSWER-ISOLATION', r.id, '来源载荷含场景标签/预期/负例编号');

  const workOrders = installation.filter((r) => r.kind === 'work_order');
  const plans = installation.filter((r) => r.kind === 'installation_plan');
  const details = installation.filter((r) => r.kind === 'installation_detail');
  const materialIndex = installation.filter((r) => r.kind === 'material_index');
  const woIds = new Set(workOrders.map((w) => w.id));

  for (const p of plans) if (!woIds.has(p.payload.installationWorkOrderId)) bad('ASSOCIATION', p.id, `方案指向不存在工单 ${p.payload.installationWorkOrderId}`);
  for (const d of details) if (!woIds.has(d.payload.installationWorkOrderId)) bad('ASSOCIATION', d.id, `明细指向不存在工单 ${d.payload.installationWorkOrderId}`);
  for (const m of materialIndex) if (!woIds.has(m.payload.installationWorkOrderId)) bad('ASSOCIATION', m.id, `材料索引指向不存在工单 ${m.payload.installationWorkOrderId}`);
  for (const e of entitlement.filter((r) => r.kind === 'installation_entitlement')) {
    if (!woIds.has(e.payload.installationWorkOrderId)) bad('ASSOCIATION', e.id, `权益指向不存在工单 ${e.payload.installationWorkOrderId}`);
  }

  const fileMetas = fileService.filter((r) => r.kind === 'file_meta');
  const fileById = new Map(fileMetas.map((f) => [f.id, f]));
  for (const m of materialIndex) {
    const key = `${m.payload.fileRef.fileId}@${m.payload.fileRef.sourceVersion}`;
    const meta = fileById.get(key);
    if (!meta) continue;
    const rel = meta.payload.relativePath;
    if (!rel) {
      bad('FILE', key, 'file_meta 缺 relativePath');
      continue;
    }
    const abs = path.join(envDir.filesDir, rel);
    if (!existsSync(abs)) {
      bad('FILE', key, `文件不存在：${rel}`);
      continue;
    }
    const digest = createHash('sha256').update(readFileSync(abs)).digest('hex');
    if (digest !== meta.payload.sha256) bad('FILE', key, `文件字节摘要与 file_meta 不符（实际 ${digest.slice(0, 12)}… 登记 ${String(meta.payload.sha256).slice(0, 12)}…）`);
  }

  const bills = jdBilling.filter((r) => r.kind === 'jd_bill');
  const recs = receivable.filter((r) => r.kind === 'provider_receivable');
  let recomputedBills = 0;
  for (const b of bills) {
    let hasUnknownAmount = false;
    for (const it of b.payload.items) {
      if (it.amount === null) {
        hasUnknownAmount = true;
        continue;
      }
      if (it.billedQuantity !== null && it.unitPrice !== null) {
        const expect = mulQtyPrice(it.billedQuantity, it.unitPrice);
        if (expect !== it.amount) bad('AMOUNT', `${b.id}/${it.billItemId}`, `数量×单价=${expect} 与原分项金额 ${it.amount} 不符`);
      }
      if (it.installationWorkOrderId !== null && !woIds.has(it.installationWorkOrderId)) bad('ASSOCIATION', `${b.id}/${it.billItemId}`, `分项指向范围外工单 ${it.installationWorkOrderId}`);
    }
    const neg1 = (JSON.parse(readFileSync(path.join(deliveryDir, 'negatives.json'), 'utf8')).items as any[]).find((n) => n.kind === 'TOTAL_MISMATCH');
    const isNeg1 = neg1 && b.payload.relatedWorkOrderIds.includes(neg1.installationWorkOrderId);
    if (!hasUnknownAmount && b.payload.reportedTotalAmount !== null) {
      const itemsSum = sum(b.payload.items.map((x: any) => x.amount));
      if (!isNeg1 && itemsSum !== b.payload.reportedTotalAmount) {
        bad('AMOUNT', b.id, `分项合计 ${itemsSum} 与原总额 ${b.payload.reportedTotalAmount} 不符（未登记负例）`);
      }
      if (isNeg1 && itemsSum === b.payload.reportedTotalAmount) bad('AMOUNT', b.id, '已登记总分不符负例未体现');
    }
    recomputedBills += 1;
  }
  for (const r of recs) {
    if (r.payload.reportedTotalAmount === null) continue;
    if (r.payload.items.some((x: any) => x.amount === null)) continue;
    const itemsSum = sum(r.payload.items.map((x: any) => x.amount));
    if (itemsSum !== r.payload.reportedTotalAmount) bad('AMOUNT', r.id, `应收分项合计 ${itemsSum} 与原总额 ${r.payload.reportedTotalAmount} 不符`);
  }

  const scenarioLists = manifest.scenarioOrderIds as Record<string, string[]>;
  const matchedSet = new Set(scenarioLists.billing_matched ?? []);
  const diffSet = new Set(scenarioLists.billing_diff ?? []);
  for (const b of bills) {
    const wo = b.payload.relatedWorkOrderIds[0] as string;
    const rec = recs.find((r) => r.payload.billingPeriod === b.payload.billingPeriod && r.payload.serviceProviderId === b.payload.serviceProviderId
      && JSON.stringify(r.payload.relatedWorkOrderIds) === JSON.stringify(b.payload.relatedWorkOrderIds));
    if (!rec) continue;
    if (b.payload.reportedTotalAmount === null || rec.payload.reportedTotalAmount === null) continue;
    if (matchedSet.has(wo) && rec.payload.reportedTotalAmount !== b.payload.reportedTotalAmount) {
      bad('AMOUNT', b.id, `账目一致场景双方总额不符：京东 ${b.payload.reportedTotalAmount} / 应收 ${rec.payload.reportedTotalAmount}`);
    }
    if (diffSet.has(wo) && rec.payload.reportedTotalAmount === b.payload.reportedTotalAmount) {
      bad('AMOUNT', b.id, '账目差异场景双方总额却一致');
    }
  }

  const formatSpecs = new Map(providerDocs.filter((r) => r.kind === 'format_spec').map((r) => [`${r.payload.formatId}@${r.payload.sourceVersion}`, r]));
  const coverage = JSON.parse(readFileSync(path.join(deliveryDir, 'scenario-coverage.json'), 'utf8'));
  const registeredMismatch = new Set<string>((coverage.formatConditions?.association_mismatch ?? []) as string[]);
  for (const r of providerDocs.filter((x) => x.kind === 'provider_record')) {
    if (registeredMismatch.has(r.payload.serviceProviderId)) continue;
    const key = `${r.payload.sourceFormatId}@${r.payload.sourceFormatVersion}`;
    const anyVersion = providerDocs.some((x) => x.kind === 'format_spec' && x.payload.formatId === r.payload.sourceFormatId);
    if (formatSpecs.has(key)) continue;
    if (!anyVersion) continue;
    bad('FORMAT-ASSOCIATION', r.id, `声明格式 ${key} 与已有说明版本不一致（未按关联不符条件登记时不应出现于完整/含义未知条件服务商）`);
  }

  const writingReport = process.argv.includes('--write-report');
  const deliverableChecks = checkDeliverables(deliveryDir, (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null));
  for (const d of deliverableChecks) {
    if (!d.exists) {
      if (writingReport && d.file === 'validation-report.json') continue;
      bad('DELIVERABLE', d.file, `${d.name}缺失`);
    } else if (d.missingKeys.length > 0) {
      if (writingReport && d.file === 'validation-report.json') continue;
      bad('DELIVERABLE', d.file, `${d.name}缺字段：${d.missingKeys.join(',')}`);
    }
  }

  const rawCounts: Record<string, number> = {
    records: all.length,
    workOrders: workOrders.length,
    plans: plans.length,
    details: details.length,
    materialIndex: materialIndex.length,
    fileMetas: fileMetas.length,
    jdBills: bills.length,
    receivables: recs.length,
    recomputedBills,
  };
  return { issues, rawCounts };
}

function main(): void {
  const envFile = arg('--env');
  const datasetId = arg('--dataset');
  if (!envFile || !datasetId) throw new Error('用法：node validation/dataset-validator.ts --env <环境清单.json> --dataset <datasetId> [--write-report]');
  const env = loadEnvironment(rootDir, envFile);
  const { issues, rawCounts } = validateDataset(env, datasetId);

  const report = {
    datasetId,
    envId: env.manifest.envId,
    generatedAt: new Date().toISOString(),
    note: '独立校验：不复用生成器金额与映射算法；金额按数量×单价与分项合计独立复算（精确十进制），文件按字节重算摘要，关联/版本/时间逐项遍历。',
    rawCounts,
    checks: [
      { item: '版本与更新时间为正', failed: issues.filter((i) => i.check === 'VERSION' || i.check === 'TIME').length },
      { item: '答案隔离（来源载荷无场景/预期/负例标签）', failed: issues.filter((i) => i.check === 'ANSWER-ISOLATION').length },
      { item: '跨记录关联（方案/明细/材料/权益/账单分项）', failed: issues.filter((i) => i.check === 'ASSOCIATION').length },
      { item: '文件字节摘要与登记一致', failed: issues.filter((i) => i.check === 'FILE').length },
      { item: '金额独立复算（分项×单价、总分、双方对照）', failed: issues.filter((i) => i.check === 'AMOUNT').length },
      { item: '格式版本关联（未登记不符不出现）', failed: issues.filter((i) => i.check === 'FORMAT-ASSOCIATION').length },
      { item: '五类交付文件齐备且字段完整', failed: issues.filter((i) => i.check === 'DELIVERABLE').length },
    ],
    issues,
    passed: issues.length === 0,
  };

  if (arg('--write-report') || process.argv.includes('--write-report')) {
    const dir = path.join(env.storageDir, 'delivery', datasetId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'validation-report.json'), JSON.stringify(report, null, 2));
  }
  console.log(JSON.stringify({ datasetId, envId: env.manifest.envId, passed: report.passed, issueCount: issues.length, rawCounts, sampleIssues: issues.slice(0, 10) }, null, 2));
  if (issues.length > 0) process.exit(1);
}

if (process.argv[1] && process.argv[1].endsWith('dataset-validator.ts')) main();
