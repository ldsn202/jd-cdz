import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvironment } from '../../src/environment/registry.ts';
import { applyMigrations, openSourceDatabase } from '../../src/storage/database.ts';
import { SOURCE_SYSTEMS } from '../../src/sources/systems.ts';
import { writePdf } from '../../generator/files/pdf.ts';
import { writeXlsx } from '../../generator/files/xlsx.ts';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function main(): void {
  const facts = JSON.parse(readFileSync(path.join(rootDir, 'acceptance/golden/golden-facts.json'), 'utf8'));
  const expected = JSON.parse(readFileSync(path.join(rootDir, 'acceptance/golden/golden-expected.json'), 'utf8'));
  const envFile = 'environments/golden.json';
  const env = loadEnvironment(rootDir, envFile);
  mkdirSync(env.sourcesDir, { recursive: true });
  mkdirSync(env.filesDir, { recursive: true });
  mkdirSync(env.tasksDir, { recursive: true });

  const t0 = facts.initialBusinessTime;
  type Row = { kind: string; record_id: string; source_version: string; source_updated_at: string; payload: any };
  const rowsBySystem: Record<string, Row[]> = Object.fromEntries(SOURCE_SYSTEMS.map((s) => [s.id, []]));
  const add = (system: string, kind: string, id: string, version: string, payload: any) =>
    rowsBySystem[system].push({ kind, record_id: id, source_version: version, source_updated_at: t0, payload });

  for (const a of facts.accounts) {
    add('identity', 'account', a.accountId, 'account-1', { accountId: a.accountId, displayName: a.displayName, role: a.role, serviceProviderId: a.serviceProviderId, active: true });
    add('identity', 'grant', `grant-${a.accountId}`, 'grant-1', { grantId: `grant-${a.accountId}`, accountId: a.accountId, scopeProviderIds: a.scopeProviderIds, role: a.role });
  }

  for (const w of facts.workOrders) {
    const seq = w.id.slice('WO-G-'.length);
    add('installation-admin', 'work_order', w.id, 'work-order-1', {
      installationWorkOrderId: w.id, serviceProviderId: w.providerId, purchaseOrderId: w.purchaseOrderId, status: 'OPEN', coordinationNote: null,
    });
    add('installation-admin', 'installation_plan', `PLAN-G-${seq}`, 'plan-1', {
      installationPlanId: `PLAN-G-${seq}`, installationWorkOrderId: w.id,
      items: w.planItems.map((p: any) => ({ installationItem: p.installationItem, plannedQuantity: p.quantity, unit: p.unit, materialSupplier: p.materialSupplier, serviceScope: p.serviceScope })),
    });
    add('installation-admin', 'installation_detail', `DTL-G-${seq}`, 'detail-1', {
      installationDetailId: `DTL-G-${seq}`, installationWorkOrderId: w.id,
      items: w.detailItems.map((d: any) => ({ installationItem: d.installationItem, installedQuantity: d.quantity, unit: d.unit, materialSupplier: d.materialSupplier, serviceScope: d.serviceScope })),
    });
    add('order-entitlement', 'purchase_order', w.purchaseOrderId, 'order-1', {
      purchaseOrderId: w.purchaseOrderId, serviceProviderId: w.providerId, installationWorkOrderId: w.id, status: 'EFFECTIVE',
    });
    add('order-entitlement', 'installation_entitlement', w.entitlementId, 'ent-1', {
      entitlementId: w.entitlementId, purchaseOrderId: w.purchaseOrderId, installationWorkOrderId: w.id, serviceScope: '充电桩安装', quantityUpperLimit: 1, effective: true, applicableBasis: `购买订单 ${w.purchaseOrderId} 所含安装权益`,
    });
    for (const m of w.materials) {
      add('installation-admin', 'material_index', m.sourceMaterialId, m.sourceVersion, {
        sourceMaterialId: m.sourceMaterialId, installationWorkOrderId: w.id, name: m.name, mediaType: m.mediaType,
        fileRef: { sourceSystem: 'file-service', fileId: m.sourceMaterialId, sourceVersion: m.sourceVersion },
      });
    }
  }

  for (const p of facts.providers) {
    const seq = p.providerId.slice('G-SP-'.length);
    add('provider-docs', 'provider_record', `PROV-DOC-G${seq}`, 'doc-1', {
      sourceRecordId: `PROV-DOC-G${seq}`, serviceProviderId: p.providerId, purpose: 'CONFIGURATION', installationWorkOrderId: null,
      sourceFormatId: p.formatId, sourceFormatVersion: p.formatVersion, materialForm: p.form, rawJson: null, fileMaterialId: null,
    });
  }
  for (const f of facts.formatSpecs) {
    add('provider-docs', 'format_spec', `${f.formatId}@${f.sourceVersion}`, 'format-1', f);
  }

  for (const b of facts.bills) {
    add('jd-billing', 'jd_bill', b.jdBillId, 'bill-1', {
      jdBillId: b.jdBillId, billingPeriod: b.billingPeriod, serviceProviderId: b.serviceProviderId,
      relatedWorkOrderIds: b.workOrderIds, currency: 'CNY', taxBasis: 'TAX_INCLUDED', sourceStatus: '已出账',
      effectiveStatus: 'EFFECTIVE', reportedTotalAmount: b.jdReportedTotal,
      targetWorkOrderAmounts: { [b.workOrderIds[0]]: b.jdReportedTotal }, items: b.jdItems,
    });
    add('provider-receivable', 'provider_receivable', b.providerReceivableId, 'receivable-1', {
      providerReceivableId: b.providerReceivableId, serviceProviderId: b.serviceProviderId, billingPeriod: b.billingPeriod,
      relatedWorkOrderIds: b.workOrderIds, currency: 'CNY', taxBasis: 'TAX_INCLUDED', sourceStatus: '应收确认中',
      effectiveStatus: 'EFFECTIVE', reportedTotalAmount: b.receivableReportedTotal,
      targetWorkOrderAmounts: { [b.workOrderIds[0]]: b.receivableReportedTotal },
      previousSourceVersion: null, sourceRevisionNote: null, items: b.receivableItems,
    });
  }

  for (const t of facts.terms) {
    add('billing-terms', 'billing_terms', t.termsId, 'terms-1', {
      termsId: t.termsId, serviceProviderId: t.serviceProviderId, billingPeriod: t.billingPeriod,
      coveredItems: t.coveredItems, effectiveRange: `${t.billingPeriod}-01 至 ${t.billingPeriod} 月末`,
      text: `按已确认计费条款执行：${Object.entries(t.unitPrices).map(([k, v]) => `${k} 单价 ${v}`).join('；')}。`,
    });
  }
  for (const a of facts.approvals) {
    add('billing-terms', 'fee_approval', a.approvalId, 'approval-1', {
      approvalId: a.approvalId, jdBillId: a.jdBillId, serviceProviderId: a.serviceProviderId,
      approvedWorkOrderIds: a.approvedWorkOrderIds, approver: '京东费用审批（golden 开发数据）', approvedAt: t0,
    });
  }

  const fileEntries: any[] = [];
  const writeFile = (materialId: string, version: string, name: string, mediaType: string, bytes: Buffer, pages: number | null, sheets: string[] | null) => {
    const rel = path.join(materialId, `${version}.${name.split('.').pop()}`);
    const abs = path.join(env.filesDir, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, bytes);
    add('file-service', 'file_meta', `${materialId}@${version}`, 'file-1', {
      fileId: materialId, sourceVersion: version, mediaType, name,
      sha256: sha256(bytes), sizeBytes: bytes.length, relativePath: rel, pages,
    });
    const wo = facts.workOrders.find((w: any) => w.materials.some((m: any) => m.sourceMaterialId === materialId));
    fileEntries.push({
      fileId: materialId, sourceVersion: version, name, mediaType, ownerKind: 'work_order_material', ownerId: materialId,
      installationWorkOrderId: wo?.id ?? null, serviceProviderId: wo?.providerId ?? null,
      relativePath: rel, sizeBytes: bytes.length, sha256: sha256(bytes), pages, sheets,
      contentPositions: [], descriptionText: null, extractedText: null,
    });
  };

  writeFile('MAT-G-001', 'material-1', '现场施工记录-G001.pdf', 'application/pdf',
    writePdf('现场施工记录-G001.pdf', [
      { lines: ['现场施工记录', '安装工单：WO-G-001', '服务商：华测安装（golden）', '记录日期：2026-09-01', '项目明细：'] },
      { lines: ['桥架安装 12米 供料方：服务商 范围：供料及安装', '电缆敷设 10米 供料方：服务商 范围：供料及安装'] },
    ]), 2, null);
  writeFile('MAT-G-002', 'material-1', '现场施工记录-G002.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    writeXlsx([{ name: '记录', rows: [['安装工单', 'WO-G-002'], ['项目', '计量表达', '折算数量', '单位'], ['桥架安装', '2段×4米', '8', '米']] }]), null, ['记录']);
  writeFile('MAT-G-003', 'material-1', '现场施工记录-G003.pdf', 'application/pdf',
    writePdf('现场施工记录-G003.pdf', [
      { lines: ['现场施工记录', '安装工单：WO-G-003', '服务商：华测安装（golden）', '记录日期：2026-09-01', '项目明细：'] },
      { lines: ['临时设施 1项 供料方：服务商 范围：供料及安装'] },
    ]), 2, null);

  for (const system of SOURCE_SYSTEMS) {
    const db = openSourceDatabase(path.join(env.sourcesDir, `${system.id}.db`));
    applyMigrations(db, path.join(rootDir, 'migrations'));
    const existing = db.prepare('SELECT COUNT(*) AS n FROM source_record').get() as { n: number };
    if (existing.n > 0) {
      db.close();
      throw new Error(`golden 来源库 ${system.id} 非空（${existing.n} 条），拒绝覆盖；先删除 .data/golden 再装载`);
    }
    const stmt = db.prepare('INSERT INTO source_record (kind, record_id, source_version, source_updated_at, payload_json) VALUES (?, ?, ?, ?, ?)');
    db.exec('BEGIN');
    for (const r of rowsBySystem[system.id]) stmt.run(r.kind, r.record_id, r.source_version, r.source_updated_at, JSON.stringify(r.payload));
    db.exec('COMMIT');
    db.close();
  }

  const deliveryDir = path.join(env.storageDir, 'delivery', facts.datasetId);
  mkdirSync(deliveryDir, { recursive: true });
  const perSourceCounts = Object.fromEntries(SOURCE_SYSTEMS.map((s) => [s.id, { total: rowsBySystem[s.id].length }]));
  writeFileSync(path.join(deliveryDir, 'data-manifest.json'), JSON.stringify({
    datasetId: facts.datasetId, setType: 'golden', generatorVersion: 'golden-1.0.0', seed: 0,
    initialBusinessTime: t0, generatedAt: new Date().toISOString(),
    totals: { providers: facts.providers.length, workOrders: facts.workOrders.length, billingPeriods: ['2026-08'], billGroups: facts.bills.length, accounts: facts.accounts.length, preregisteredNegatives: facts.negatives.length },
    perSourceCounts,
    scenarioOrderIds: {
      pending_materials: [], evidence_consistent: [], quantity_diff: [], material_lacking: ['WO-G-004'],
      billing_matched: ['WO-G-001', 'WO-G-002'], billing_diff: ['WO-G-003', 'WO-G-004'],
      billing_evidence_incomplete: [], coordination: [], read_only: [],
    },
    billGroupIndex: facts.bills.map((b: any) => ({ jdBillId: b.jdBillId, providerReceivableId: b.providerReceivableId, serviceProviderId: b.serviceProviderId, billingPeriod: b.billingPeriod, workOrderIds: b.workOrderIds, termsId: null, approvalId: facts.approvals.find((a: any) => a.jdBillId === b.jdBillId)?.approvalId ?? null })),
  }, null, 2));
  writeFileSync(path.join(deliveryDir, 'file-manifest.json'), JSON.stringify({
    datasetId: facts.datasetId, generatorVersion: 'golden-1.0.0', generatedAt: new Date().toISOString(),
    note: 'golden 固定样本文件清单', files: fileEntries, negatives: [],
  }, null, 2));
  writeFileSync(path.join(deliveryDir, 'scenario-coverage.json'), JSON.stringify({
    datasetId: facts.datasetId, scenarios: {},
    formatConditions: { complete: facts.providers.map((p: any) => p.providerId), meaning_unknown: [], no_spec: [], association_mismatch: [] },
    materialForms: { clear_table: ['G-SP-001'], restructured_table: [], alt_unit_table: ['G-SP-002'], pdf_record: [], image_record: [] },
    multiWorkOrderBills: [], providerOrderCounts: { 'G-SP-001': 2, 'G-SP-002': 2 },
  }, null, 2));
  writeFileSync(path.join(deliveryDir, 'negatives.json'), JSON.stringify({ datasetId: facts.datasetId, note: 'golden 预设负例', items: facts.negatives }, null, 2));
  writeFileSync(path.join(deliveryDir, 'scenario-expectations.json'), JSON.stringify({
    datasetId: facts.datasetId, frozenAt: expected.frozenAt, expectations: expected.expectations,
    note: 'golden 冻结预期，全文见 acceptance/golden/golden-expected.json',
  }, null, 2));

  console.log(JSON.stringify({ datasetId: facts.datasetId, envId: env.manifest.envId, records: Object.values(rowsBySystem).flat().length, files: fileEntries.length, deliveryDir }, null, 2));
}

main();
