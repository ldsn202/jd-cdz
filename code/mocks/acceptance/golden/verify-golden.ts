import { createHash } from 'node:crypto';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { loadEnvironment } from '../../src/environment/registry.ts';
import { validateDataset } from '../../validation/dataset-validator.ts';
import { mulQtyPrice, sum } from '../../validation/decimal.ts';
import { pdfPagesViaTool } from './pdf-tool.ts';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

type Assertion = { id: string; pass: boolean; detail: string };

function readSource(sourcesDir: string, system: string) {
  const db = new DatabaseSync(path.join(sourcesDir, `${system}.db`), { readOnly: true });
  const rows = db.prepare('SELECT kind, record_id, source_version, source_updated_at, payload_json FROM source_record').all() as any[];
  db.close();
  return rows.map((r) => ({ kind: r.kind, id: r.record_id, version: r.source_version, updatedAt: r.source_updated_at, payload: JSON.parse(r.payload_json) }));
}

function main(): void {
  const env = loadEnvironment(rootDir, 'environments/golden.json');
  const facts = JSON.parse(readFileSync(path.join(rootDir, 'acceptance/golden/golden-facts.json'), 'utf8'));
  const expected = JSON.parse(readFileSync(path.join(rootDir, 'acceptance/golden/golden-expected.json'), 'utf8'));

  const A: Assertion[] = [];
  const assert = (id: string, pass: boolean, detail: string) => A.push({ id, pass, detail });

  for (const exp of expected.expectations) {
    for (const f of exp.formulas) {
      if (f.quantity && f.unitPrice) {
        assert(`FORMULA-${exp.workOrderId}-${f.expression}`, mulQtyPrice(f.quantity, f.unitPrice) === f.amount, `${f.expression} 复算=${mulQtyPrice(f.quantity, f.unitPrice)}`);
      } else if (f.sumOf) {
        assert(`FORMULA-${exp.workOrderId}-${f.expression}`, sum(f.sumOf) === f.total, `${f.expression} 复算=${sum(f.sumOf)}`);
      } else if (f.segments !== undefined) {
        assert(`FORMULA-${exp.workOrderId}-${f.expression}`, f.segments * f.metersPerSegment === f.meters, `${f.expression} 复算=${f.segments * f.metersPerSegment}米`);
      }
    }
  }

  const jdBilling = readSource(env.sourcesDir, 'jd-billing');
  const receivable = readSource(env.sourcesDir, 'provider-receivable');
  const installation = readSource(env.sourcesDir, 'installation-admin');
  const providerDocs = readSource(env.sourcesDir, 'provider-docs');
  const bills = new Map(jdBilling.filter((r) => r.kind === 'jd_bill').map((r) => [r.id, r]));
  const recs = new Map(receivable.filter((r) => r.kind === 'provider_receivable').map((r) => [r.id, r]));

  const b1 = bills.get('JD-BILL-G-001')!;
  const r1 = recs.get('REC-G-001')!;
  assert('PHYS-G001-SPLIT-MERGE', b1.payload.items.length === 2 && r1.payload.items.length === 1 && r1.payload.items[0].amount === '810.00', `拆合项：京东 2 分项 / 应收 1 合并分项 810.00；总额一致但结构不同（不得仅凭总额判一致）`);

  const b2 = bills.get('JD-BILL-G-002')!;
  const fixed = b2.payload.items.find((x: any) => x.itemName === '入场搬运')!;
  assert('PHYS-G002-FIXED-FEE', fixed.amount === '60.00' && fixed.billedQuantity === null && fixed.unitPrice === null, '固定收费数量/单价为 null 且不倒算');

  const b3 = bills.get('JD-BILL-G-003')!;
  const r3 = recs.get('REC-G-003')!;
  assert('PHYS-G003-UNKNOWN-ZERO-NEGATIVE',
    b3.payload.items[0].amount === null && b3.payload.reportedTotalAmount === null
    && r3.payload.items.some((x: any) => x.amount === '0.00') && r3.payload.items.some((x: any) => x.amount === '-30.00')
    && r3.payload.reportedTotalAmount === '-30.00',
    '未知金额保持 null、零值 0.00 保留、负向调整 -30.00 参与合计不丢弃');

  const b4 = bills.get('JD-BILL-G-004')!;
  const g4Materials = installation.filter((r) => r.kind === 'material_index' && r.payload.installationWorkOrderId === 'WO-G-004');
  assert('PHYS-G004-NEGATIVES',
    b4.payload.items.some((x: any) => x.installationWorkOrderId === null)
    && sum(b4.payload.items.map((x: any) => x.amount)) !== b4.payload.reportedTotalAmount
    && g4Materials.length === 0,
    `范围不一致分项保留（null）、总分 ${sum(b4.payload.items.map((x: any) => x.amount))}≠${b4.payload.reportedTotalAmount}、WO-G-004 无材料索引（材料不足保持）`);

  const specs = providerDocs.filter((r) => r.kind === 'format_spec');
  const m1 = specs.find((r) => r.payload.formatId === 'G-FMT-1')!.payload.fields.find((f: any) => f.fieldKey === '数量').meaning;
  const m2 = specs.find((r) => r.payload.formatId === 'G-FMT-2')!.payload.fields.find((f: any) => f.fieldKey === '数量').meaning;
  assert('PHYS-SAME-NAME-DIFF-MEANING', m1 === expected.sameNameDifferentMeaning.meanings['G-FMT-1'] && m2 === expected.sameNameDifferentMeaning.meanings['G-FMT-2'] && m1 !== m2, `同名异义：G-FMT-1.数量=${m1}；G-FMT-2.数量=${m2}`);

  const { issues } = validateDataset(env, facts.datasetId);
  assert('GOLDEN-VALIDATOR-CLEAN', issues.length === 0, issues.length === 0 ? '独立校验 0 未解释错误（设计内情形均被正确豁免/保留）' : `${issues.length} 个问题：${issues.slice(0, 3).map((i) => i.objectId).join(',')}`);

  const fileManifest = JSON.parse(readFileSync(path.join(env.storageDir, 'delivery', facts.datasetId, 'file-manifest.json'), 'utf8'));
  let fileOk = true;
  for (const f of fileManifest.files) {
    const buf = readFileSync(path.join(env.filesDir, f.relativePath));
    if (createHash('sha256').update(buf).digest('hex') !== f.sha256) fileOk = false;
  }
  const g1Pages = pdfPagesViaTool(path.join(env.filesDir, fileManifest.files.find((f: any) => f.fileId === 'MAT-G-001').relativePath));
  assert('GOLDEN-FILES', fileOk && g1Pages === 2, `3 个文件摘要一致；MAT-G-001 为 ${g1Pages} 页（清单 2 页）`);

  const tmp = path.join(env.storageDir, '.golden-probe');
  rmSync(tmp, { recursive: true, force: true });
  for (const sub of ['sources', 'files', 'delivery']) cpSync(path.join(env.storageDir, sub), path.join(tmp, sub), { recursive: true });

  const timeDb = new DatabaseSync(path.join(tmp, 'sources', 'provider-receivable.db'));
  timeDb.prepare('INSERT INTO source_record (kind, record_id, source_version, source_updated_at, payload_json) VALUES (?, ?, ?, ?, ?)').run(
    'provider_receivable_revision', 'REC-G-001#receivable-2', 'receivable-2',
    new Date(Date.parse(facts.initialBusinessTime) + 7 * 86400000).toISOString(),
    JSON.stringify({ providerReceivableId: 'REC-G-001', sourceVersion: 'receivable-2', previousSourceVersion: 'receivable-1', note: '时间推进演示：+7 天修订' })
  );
  timeDb.close();
  const timeResult = validateDataset({ sourcesDir: path.join(tmp, 'sources'), filesDir: path.join(tmp, 'files'), storageDir: tmp }, facts.datasetId);
  const origDb = new DatabaseSync(path.join(env.sourcesDir, 'provider-receivable.db'), { readOnly: true });
  const origRevision = origDb.prepare("SELECT COUNT(*) AS n FROM source_record WHERE kind = 'provider_receivable_revision'").get() as { n: number };
  origDb.close();
  assert('TIME-ADVANCE', timeResult.issues.length === 0 && origRevision.n === 0, '测试时间可推进：+7 天新版本记录通过校验，原环境未被写入（版本不被种子冻结）');

  const probes: { description: string; expectCheck: string; expectObject: string }[] = expected.sabotageProbes;
  const probeResults: string[] = [];
  for (const p of probes) {
    rmSync(tmp, { recursive: true, force: true });
    for (const sub of ['sources', 'files', 'delivery']) cpSync(path.join(env.storageDir, sub), path.join(tmp, sub), { recursive: true });
    if (p.expectCheck === 'AMOUNT') {
      const db = new DatabaseSync(path.join(tmp, 'sources', 'provider-receivable.db'));
      const row = db.prepare("SELECT payload_json FROM source_record WHERE kind='provider_receivable' AND record_id='REC-G-001'").get() as any;
      const payload = JSON.parse(row.payload_json);
      payload.items[0].amount = '811.00';
      db.prepare("UPDATE source_record SET payload_json=? WHERE kind='provider_receivable' AND record_id='REC-G-001'").run(JSON.stringify(payload));
      db.close();
    } else {
      const fm = JSON.parse(readFileSync(path.join(tmp, 'delivery', facts.datasetId, 'file-manifest.json'), 'utf8'));
      const target = fm.files.find((f: any) => f.fileId === 'MAT-G-002');
      const abs = path.join(tmp, 'files', target.relativePath);
      const buf = readFileSync(abs);
      buf[100] = (buf[100]! + 1) & 0xff;
      writeFileSync(abs, buf);
    }
    const res = validateDataset({ sourcesDir: path.join(tmp, 'sources'), filesDir: path.join(tmp, 'files'), storageDir: tmp }, facts.datasetId);
    const hit = res.issues.some((i) => i.check === p.expectCheck && i.objectId.includes(p.expectObject.split('@')[0]));
    probeResults.push(`${p.description} → ${hit ? '抓出' : '未抓出'}（${p.expectCheck}）`);
    if (!hit) assert(`SABOTAGE-${p.expectCheck}`, false, p.description);
  }
  rmSync(tmp, { recursive: true, force: true });
  assert('SABOTAGE-PROBES', probeResults.every((r) => r.includes('抓出')), probeResults.join('；'));

  const failed = A.filter((x) => !x.pass);
  console.log(JSON.stringify({ datasetId: facts.datasetId, assertions: A, passed: failed.length === 0, failedCount: failed.length }, null, 2));
  if (failed.length > 0) process.exit(1);
}

main();
