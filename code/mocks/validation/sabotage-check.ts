import { cpSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { loadEnvironment } from '../src/environment/registry.ts';
import { validateDataset } from './dataset-validator.ts';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function arg(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
}

type Sabotage = { id: string; description: string; expectCheck: string; apply: (dir: string) => string };

function updatePayload(dbFile: string, kind: string, recordId: string, mutate: (p: any) => void): void {
  const db = new DatabaseSync(dbFile);
  const row = db.prepare('SELECT payload_json FROM source_record WHERE kind = ? AND record_id = ?').get(kind, recordId) as { payload_json: string };
  const p = JSON.parse(row.payload_json);
  mutate(p);
  db.prepare('UPDATE source_record SET payload_json = ? WHERE kind = ? AND record_id = ?').run(JSON.stringify(p), kind, recordId);
  db.close();
}

function main(): void {
  const envFile = arg('--env');
  const datasetId = arg('--dataset');
  if (!envFile || !datasetId) throw new Error('用法：node validation/sabotage-check.ts --env <环境清单.json> --dataset <datasetId>');
  const env = loadEnvironment(rootDir, envFile);

  const sabotages: Sabotage[] = [
    {
      id: 'SAB-ASSOCIATION',
      description: '把一张方案指向另一张不存在的工单（坏关联）',
      expectCheck: 'ASSOCIATION',
      apply: (dir) => {
        const dbFile = path.join(dir, 'sources', 'installation-admin.db');
        const db = new DatabaseSync(dbFile);
        const row = db.prepare("SELECT record_id FROM source_record WHERE kind = 'installation_plan' LIMIT 1").get() as { record_id: string };
        db.close();
        updatePayload(dbFile, 'installation_plan', row.record_id, (p) => { p.installationWorkOrderId = 'WO-9999-XXXX'; });
        return row.record_id;
      },
    },
    {
      id: 'SAB-AMOUNT',
      description: '把一个应收分项金额改大 10.00（错误金额）',
      expectCheck: 'AMOUNT',
      apply: (dir) => {
        const dbFile = path.join(dir, 'sources', 'provider-receivable.db');
        const db = new DatabaseSync(dbFile);
        const row = db.prepare("SELECT record_id FROM source_record WHERE kind = 'provider_receivable' LIMIT 1").get() as { record_id: string };
        db.close();
        updatePayload(dbFile, 'provider_receivable', row.record_id, (p) => {
          const cents = Math.round(Number(p.items[0].amount) * 100) + 1000;
          p.items[0].amount = `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
        });
        return row.record_id;
      },
    },
    {
      id: 'SAB-FILE-DIGEST',
      description: '改动一个正常文件的一个字节（摘要不符）',
      expectCheck: 'FILE',
      apply: (dir) => {
        const manifest = JSON.parse(readFileSync(path.join(dir, 'delivery', datasetId, 'file-manifest.json'), 'utf8'));
        const negatives = new Set(manifest.negatives.map((n: any) => n.fileId));
        const target = manifest.files.find((f: any) => !negatives.has(f.fileId));
        const abs = path.join(dir, 'files', target.relativePath);
        const buf = readFileSync(abs);
        buf[Math.floor(buf.length / 2)] = (buf[Math.floor(buf.length / 2)]! + 1) & 0xff;
        writeFileSync(abs, buf);
        return target.fileId;
      },
    },
    {
      id: 'SAB-FORMAT-VERSION',
      description: '把完整条件服务商的资料声明版本改成与说明不符（未登记错关联）',
      expectCheck: 'FORMAT-ASSOCIATION',
      apply: (dir) => {
        const coverage = JSON.parse(readFileSync(path.join(dir, 'delivery', datasetId, 'scenario-coverage.json'), 'utf8'));
        const pid = coverage.formatConditions.complete[0];
        const seq = pid.slice('SP-'.length);
        const dbFile = path.join(dir, 'sources', 'provider-docs.db');
        updatePayload(dbFile, 'provider_record', `PROV-DOC-${seq}`, (p) => { p.sourceFormatVersion = 'fv-9'; });
        return `PROV-DOC-${seq}`;
      },
    },
  ];

  const results: { id: string; target: string; caught: boolean; issues: number; sample: string }[] = [];
  for (const s of sabotages) {
    const tmp = path.join(env.storageDir, '.sabotage', s.id);
    rmSync(tmp, { recursive: true, force: true });
    for (const sub of ['sources', 'files', 'delivery']) {
      cpSync(path.join(env.storageDir, sub), path.join(tmp, sub), { recursive: true });
    }
    const target = s.apply(tmp);
    const { issues } = validateDataset({ sourcesDir: path.join(tmp, 'sources'), filesDir: path.join(tmp, 'files'), storageDir: tmp }, datasetId);
    const hits = issues.filter((i) => i.check === s.expectCheck);
    const hitTarget = hits.some((i) => i.objectId.includes(target) || i.detail.includes(target));
    results.push({
      id: s.id,
      target,
      caught: hits.length > 0 && hitTarget,
      issues: issues.length,
      sample: hits.slice(0, 2).map((h) => `${h.objectId}: ${h.detail}`).join('；'),
    });
    rmSync(tmp, { recursive: true, force: true });
  }
  rmSync(path.join(env.storageDir, '.sabotage'), { recursive: true, force: true });

  const { issues: baseIssues } = validateDataset(env, datasetId);
  const allCaught = results.every((r) => r.caught);
  console.log(JSON.stringify({
    datasetId,
    baselineClean: baseIssues.length === 0,
    sabotages: results,
    allCaught,
    note: '每种破坏均被独立校验器按对象点名抓出；未预期错误阻止装载，不能静默登记成合法负例',
  }, null, 2));
  if (!allCaught || baseIssues.length !== 0) process.exit(1);
}

main();
