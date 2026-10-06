import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { runOperationsSuite } from './source-suites/operations.ts';
import { buildTcStatus } from './source-suites/tc-map.ts';
import { renderMarkdown, type AcceptanceReport, type PhaseResult } from './report.ts';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(script: string, args: string[]): string {
  return execFileSync('node', [script, ...args], { cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

async function waitHealth(base: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`服务未就绪：${base}`);
}

function startServer(envFile: string): ChildProcess {
  return spawn('node', ['src/server.ts', '--env', envFile], { cwd: rootDir, stdio: ['ignore', 'pipe', 'pipe'] });
}

function sourceDigest(sourcesDir: string): string {
  const h = createHash('sha256');
  for (const f of ['identity', 'installation-admin', 'order-entitlement', 'provider-docs', 'file-service', 'jd-billing', 'provider-receivable', 'billing-terms']) {
    const db = new DatabaseSync(path.join(sourcesDir, `${f}.db`), { readOnly: true });
    const rows = db.prepare("SELECT kind, record_id, source_version, source_updated_at, payload_json FROM source_record WHERE kind != 'session' AND kind != 'fault_slip' ORDER BY kind, record_id").all();
    db.close();
    h.update(JSON.stringify(rows));
  }
  return h.digest('hex');
}

function fileDigests(filesDir: string): string {
  const manifest = JSON.parse(readFileSync(path.join(filesDir, '..', 'delivery', 'standard-v1', 'file-manifest.json'), 'utf8'));
  const entries = manifest.files.map((f: any) => [f.relativePath, f.sha256]);
  return createHash('sha256').update(JSON.stringify(entries)).digest('hex');
}

type RunSeed = Parameters<typeof runOperationsSuite>[1];

function buildSeed(envDir: string, runTag: string): RunSeed {
  const idb = new DatabaseSync(path.join(envDir, 'sources', 'installation-admin.db'), { readOnly: true });
  const wos = (idb.prepare("SELECT record_id, source_version, payload_json FROM source_record WHERE kind='work_order'").all() as any[]).map((r) => ({ id: r.record_id, version: r.source_version, ...JSON.parse(r.payload_json) }));
  const details = new Set((idb.prepare("SELECT payload_json FROM source_record WHERE kind='installation_detail'").all() as any[]).map((r) => JSON.parse(r.payload_json).installationWorkOrderId));
  const plans = (idb.prepare("SELECT source_version, payload_json FROM source_record WHERE kind='installation_plan'").all() as any[]).map((r) => ({ ...JSON.parse(r.payload_json), version: r.source_version }));
  const materials = (idb.prepare("SELECT payload_json FROM source_record WHERE kind='material_index'").all() as any[]).map((r) => JSON.parse(r.payload_json));
  idb.close();
  const pending = wos.filter((w) => !details.has(w.id));
  const anyWo = pending[0];
  const otherWo = pending.find((w) => w.serviceProviderId !== anyWo.serviceProviderId)!;
  const plan = plans.find((p) => p.installationWorkOrderId === anyWo.id)!;

  const manifest = JSON.parse(readFileSync(path.join(envDir, 'delivery/standard-v1/data-manifest.json'), 'utf8'));
  const billGroup = (manifest.billGroupIndex as any[]).find((g) => g.workOrderIds.length === 1);
  const fm = JSON.parse(readFileSync(path.join(envDir, 'delivery/standard-v1/file-manifest.json'), 'utf8'));
  const mat = fm.files.find((f: any) => f.ownerKind === 'work_order_material');

  return {
    anyWorkOrder: {
      id: anyWo.id,
      providerId: anyWo.serviceProviderId,
      purchaseOrderId: anyWo.purchaseOrderId,
      planVersion: plan.version,
      version: anyWo.version,
      materials: materials.filter((m) => m.installationWorkOrderId === anyWo.id).map((m) => ({ sourceMaterialId: m.sourceMaterialId, sourceVersion: m.fileRef.sourceVersion })),
    },
    otherWorkOrderId: otherWo.id,
    billGroup: { jdBillId: billGroup.jdBillId, providerReceivableId: billGroup.providerReceivableId, serviceProviderId: billGroup.serviceProviderId, workOrderId: billGroup.workOrderIds[0] },
    providerRecord: { providerId: 'SP-001', recordId: 'PROV-DOC-001' },
    material: { fileId: mat.fileId, version: mat.sourceVersion, sha256: mat.sha256, byteLength: mat.sizeBytes, providerId: mat.serviceProviderId },
    runTag,
  };
}

function seedServiceAccount(envDir: string): void {
  const db = new DatabaseSync(path.join(envDir, 'sources', 'identity.db'));
  const now = new Date().toISOString();
  const allProviders: string[] = [];
  const pdb = new DatabaseSync(path.join(envDir, 'sources', 'installation-admin.db'), { readOnly: true });
  for (const r of pdb.prepare("SELECT payload_json FROM source_record WHERE kind='work_order'").all() as any[]) {
    const p = JSON.parse(r.payload_json).serviceProviderId;
    if (!allProviders.includes(p)) allProviders.push(p);
  }
  pdb.close();
  db.prepare("INSERT INTO source_record (kind, record_id, source_version, source_updated_at, payload_json) VALUES ('account', 'acc-svc-backend-t41', 'account-1', ?, ?)")
    .run(now, JSON.stringify({ accountId: 'acc-svc-backend-t41', displayName: '后台程序（T4.1 验收）', role: 'SERVICE', serviceProviderId: null, active: true }));
  db.prepare("INSERT INTO source_record (kind, record_id, source_version, source_updated_at, payload_json) VALUES ('grant', 'grant-acc-svc-backend-t41', 'grant-1', ?, ?)")
    .run(now, JSON.stringify({ grantId: 'grant-acc-svc-backend-t41', accountId: 'acc-svc-backend-t41', scopeProviderIds: allProviders, role: 'SERVICE' }));
  db.close();
}

async function runOne(envId: string, port: number, phases: PhaseResult[], opts: { withGolden: boolean }): Promise<{ ops: Awaited<ReturnType<typeof runOperationsSuite>>; envDir: string; recheckAfterRestart: boolean; genDigest: string; genFileDigest: string }> {
  const envDir = path.join(rootDir, '.data', envId);
  const envFile = `environments/${envId}.json`;
  writeFileSync(path.join(rootDir, envFile), JSON.stringify({ envId, port, dataset: 'standard-v1', storageRoot: `.data/${envId}`, appEnvRef: 'jd-charging-local' }, null, 2));

  run('src/env-check.ts', ['--env', envFile]);
  phases.push({ phase: '环境检查', pass: true, detail: `${envId} 清单校验与存储初始化` });
  run('generator/generate.ts', ['--config', 'generator/configs/standard.json', '--env', envFile]);
  phases.push({ phase: '来源生成', pass: true, detail: '100 家/1000 单/3 账期 + 预设负例' });
  run('generator/generate-files.ts', ['--config', 'generator/configs/standard.json', '--env', envFile]);
  phases.push({ phase: '文件生成', pass: true, detail: '997 个真实文件（PDF/XLSX/PNG/JPEG）' });
  run('acceptance/expected/build-expectations.ts', ['--env', envFile, '--dataset', 'standard-v1']);
  phases.push({ phase: '验收预期冻结', pass: true, detail: '九场景八要素 + 5 负例预期' });
  const validatorOut = JSON.parse(run('validation/dataset-validator.ts', ['--env', envFile, '--dataset', 'standard-v1', '--write-report']));
  phases.push({ phase: '独立数据校验', pass: validatorOut.passed, detail: `issues=${validatorOut.issueCount}` });
  const verifyOut = JSON.parse(run('generator/verify.ts', ['--env', envFile, '--dataset', 'standard-v1']));
  phases.push({ phase: '规模与关联核对', pass: verifyOut.passed, detail: `${verifyOut.assertions.length} 项断言` });
  const verifyFilesOut = JSON.parse(run('generator/verify-files.ts', ['--env', envFile, '--dataset', 'standard-v1']));
  phases.push({ phase: '文件独立校验', pass: verifyFilesOut.passed, detail: `${verifyFilesOut.assertions.length} 项断言` });
  const sabotageOut = JSON.parse(run('validation/sabotage-check.ts', ['--env', envFile, '--dataset', 'standard-v1']));
  phases.push({ phase: '破坏注入检查', pass: sabotageOut.allCaught, detail: '坏关联/错金额/摘要不符/错版均抓出' });

  if (opts.withGolden) {
    run('acceptance/golden/load-golden.ts', []);
    JSON.parse(run('validation/dataset-validator.ts', ['--env', 'environments/golden.json', '--dataset', 'golden-v1', '--write-report']));
    const goldenOut = JSON.parse(run('acceptance/golden/verify-golden.ts', []));
    phases.push({ phase: 'golden 固定样本', pass: goldenOut.passed, detail: `${goldenOut.assertions.length} 项断言（算式/情形/破坏探针）` });
  }

  const genDigest = sourceDigest(path.join(envDir, 'sources'));
  const genFileDigest = fileDigests(path.join(envDir, 'files'));

  seedServiceAccount(envDir);
  const server = startServer(envFile);
  const base = `http://localhost:${port}`;
  await waitHealth(base, 15000);
  phases.push({ phase: 'HTTP 启动', pass: true, detail: `${envId} 实跑端口 ${port}` });

  const seed = buildSeed(envDir, `${envId.slice(-4)}`);
  const ops = await runOperationsSuite(base, seed);
  const opFailed = ops.filter((o) => !o.pass);
  phases.push({ phase: '13+1 业务操作正反例', pass: opFailed.length === 0, detail: `${ops.length} 项（失败 ${opFailed.length}）` });

  server.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 800));
  const server2 = startServer(envFile);
  await waitHealth(base, 15000);
  const tokRes = await fetch(`${base}/api/admin/mock/external/identity/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accountId: `acc-${seed.anyWorkOrder.providerId.toLowerCase()}` }) });
  const tok = ((await tokRes.json()) as any).data.token;
  const recheck = await fetch(`${base}/api/admin/mock/external/installation/work-orders/${seed.anyWorkOrder.id}/installation-detail-submissions/SUB-T41-${seed.runTag}`, { headers: { authorization: `Bearer ${tok}` } });
  const recheckJson = (await recheck.json()) as any;
  const recheckOk = recheck.status === 200 && recheckJson.data?.submissionStatus === 'SUCCEEDED';
  phases.push({ phase: '重启后写回结果可查', pass: recheckOk, detail: `回查 ${recheckJson.data?.submissionStatus ?? recheck.status}` });
  server2.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 500));

  return { ops, envDir, recheckAfterRestart: recheckOk, genDigest, genFileDigest };
}

async function main(): Promise<void> {
  const phases: PhaseResult[] = [];
  const run1 = await runOne('acc-run-1', 8795, phases, { withGolden: true });
  const run2 = await runOne('acc-run-2', 8796, phases, { withGolden: false });

  const d1 = run1.genDigest;
  const d2 = run2.genDigest;
  const f1 = run1.genFileDigest;
  const f2 = run2.genFileDigest;
  const repro = { comparedWith: 'acc-run-2', sourceRecordsIdentical: d1 === d2, filesIdentical: f1 === f2 };
  phases.push({ phase: '两次生成可复现', pass: repro.sourceRecordsIdentical && repro.filesIdentical, detail: `记录摘要 ${d1.slice(0, 12)}… / 文件摘要 ${f1.slice(0, 12)}…` });

  const opsPassed = new Set(run1.ops.filter((o) => o.pass).map((o) => o.id));
  const tcStatus = buildTcStatus(opsPassed);
  const report: AcceptanceReport = {
    runAt: new Date().toISOString(),
    envId: 'acc-run-1 / acc-run-2',
    datasetId: 'standard-v1',
    phases,
    operationResults: run1.ops,
    tcStatus,
    tcSummary: {
      total: tcStatus.length,
      generationPass: tcStatus.filter((t) => t.generationStage === 'PASS').length,
      sourcePass: tcStatus.filter((t) => t.sourceStage === 'PASS').length,
      businessBlocked: tcStatus.filter((t) => t.businessStage === 'BLOCKED').length,
    },
    reproducibility: repro,
    conclusion:
      '阶段结论：模拟来源可用（生成、来源接口与持久化恢复均已实证）；该结论与完整业务验收分开，业务联调相关子场景保持 BLOCKED，依赖 T4.2 真实业务应用联调。',
  };

  const outDir = path.resolve(rootDir, '../..', 'docs/08-test-reports/mock/T4.1');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  writeFileSync(path.join(outDir, 'summary.md'), renderMarkdown(report));
  console.log(JSON.stringify({ phasesFailed: phases.filter((p) => !p.pass).length, opsFailed: run1.ops.filter((o) => !o.pass).length, tcSummary: report.tcSummary, reproducibility: repro, outDir }, null, 2));
  if (phases.some((p) => !p.pass) || run1.ops.some((o) => !o.pass)) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
