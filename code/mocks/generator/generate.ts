import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateConfig, ConfigError, SCENARIO_KEYS, SCENARIO_NAMES, MATERIAL_FORMS, FORMAT_CONDITIONS, BILLING_SCENARIOS } from './config.ts';
import { buildProviders } from './providers.ts';
import { buildBusinessFacts, type BusinessFacts } from './business-facts.ts';
import { PROJECTORS, insertRecords } from './source-projectors/index.ts';
import { loadEnvironment } from '../src/environment/registry.ts';
import { applyMigrations, openSourceDatabase } from '../src/storage/database.ts';
import { SOURCE_SYSTEMS } from '../src/sources/systems.ts';
import { sumAmounts } from './random.ts';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function arg(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
}

function buildDelivery(facts: BusinessFacts, inserted: Record<string, Record<string, number>>) {
  const { config } = facts;
  const manifest = {
    datasetId: config.datasetId,
    setType: config.setType,
    generatorVersion: config.generatorVersion,
    seed: config.seed,
    initialBusinessTime: config.initialBusinessTime,
    generatedAt: new Date().toISOString(),
    declaredDataIsDevelopmentFixture: true,
    totals: {
      providers: facts.providers.length,
      workOrders: facts.workOrders.length,
      billingPeriods: config.billingPeriods,
      billGroups: facts.billGroups.length,
      accounts: facts.accounts.length,
      preregisteredNegatives: facts.negatives.length,
    },
    perSourceCounts: inserted,
    scenarioOrderIds: Object.fromEntries(
      SCENARIO_KEYS.map((k) => [k, facts.workOrders.filter((w) => w.scenario === k).map((w) => w.installationWorkOrderId)])
    ),
    billGroupIndex: facts.billGroups.map((g) => ({
      jdBillId: g.jdBillId,
      providerReceivableId: g.providerReceivableId,
      serviceProviderId: g.serviceProviderId,
      billingPeriod: g.billingPeriod,
      workOrderIds: g.workOrderIds,
      termsId: g.termsId,
      approvalId: g.approvalId,
    })),
  };

  const coverage = {
    datasetId: config.datasetId,
    scenarios: Object.fromEntries(
      SCENARIO_KEYS.map((k) => {
        const orders = facts.workOrders.filter((w) => w.scenario === k);
        const providerIds = [...new Set(orders.map((w) => w.serviceProviderId))];
        const forms = [...new Set(providerIds.map((id) => facts.providers.find((p) => p.providerId === id)!.form))];
        const periods = [...new Set(orders.map((w) => w.billingPeriod).filter((x) => x !== null))];
        return [k, {
          name: SCENARIO_NAMES[k],
          workOrderCount: orders.length,
          distinctProviders: providerIds.length,
          providerIds,
          materialFormsInvolved: forms,
          billingPeriods: periods,
        }];
      })
    ),
    formatConditions: Object.fromEntries(
      FORMAT_CONDITIONS.map((c) => [c, facts.providers.filter((p) => p.formatCondition === c).map((p) => p.providerId)])
    ),
    materialForms: Object.fromEntries(
      MATERIAL_FORMS.map((f) => [f, facts.providers.filter((p) => p.form === f).map((p) => p.providerId)])
    ),
    multiWorkOrderBills: facts.billGroups.filter((g) => g.workOrderIds.length > 1).map((g) => ({ jdBillId: g.jdBillId, workOrderIds: g.workOrderIds })),
    providerOrderCounts: Object.fromEntries(
      facts.providers.map((p) => [p.providerId, facts.workOrders.filter((w) => w.serviceProviderId === p.providerId).length])
    ),
  };

  const negatives = {
    datasetId: config.datasetId,
    note: '预设负例在生成前登记，预期只留验收空间；正常数据与负例显式分开，未登记的错误不得静默转为负例。',
    items: facts.negatives,
  };

  const generationReport = {
    datasetId: config.datasetId,
    checks: [
      { item: '九场景合计等于声明工单数', pass: SCENARIO_KEYS.reduce((a, k) => a + config.scenarios[k], 0) === config.workOrders },
      { item: '每家服务商有业务记录', pass: facts.providers.every((p) => facts.workOrders.some((w) => w.serviceProviderId === p.providerId)) },
      { item: '工单分布存在差异', pass: new Set(facts.providers.map((p) => facts.workOrders.filter((w) => w.serviceProviderId === p.providerId).length)).size > 1 },
      {
        item: '账单组分项合计与原总额一致（预设负例除外）',
        pass: facts.billGroups.every((g) =>
          (g.totalMismatchNegative || sumAmounts(g.jdItems.map((x) => x.amount ?? '0.00')) === g.jdReportedTotal) &&
          sumAmounts(g.receivableItems.map((x) => x.amount ?? '0.00')) === g.receivableReportedTotal
        ),
      },
      {
        item: '账单场景均有账期与双方账单编号',
        pass: facts.workOrders.every((w) => !(BILLING_SCENARIOS as string[]).includes(w.scenario) || (w.billingPeriod !== null && w.jdBillId !== null && w.providerReceivableId !== null)),
      },
      {
        item: '对账依据不完整场景缺项已登记',
        pass: facts.billGroups.every((g) => g.evidenceComplete || g.evidenceMissingParts.length > 0),
      },
    ],
  };
  return { manifest, coverage, negatives, generationReport };
}

function main(): void {
  const configFile = arg('--config');
  const envFile = arg('--env');
  if (!configFile || !envFile) throw new Error('用法：node generator/generate.ts --config <配置.json> --env <环境清单.json>');

  const config = validateConfig(JSON.parse(readFileSync(path.resolve(rootDir, configFile), 'utf8')));
  const env = loadEnvironment(rootDir, envFile);

  const providers = buildProviders(config);
  const facts = buildBusinessFacts(config, providers);

  const migrationsDir = path.join(rootDir, 'migrations');
  const inserted: Record<string, Record<string, number>> = {};
  for (const system of SOURCE_SYSTEMS) {
    const db = openSourceDatabase(path.join(env.sourcesDir, `${system.id}.db`));
    applyMigrations(db, migrationsDir);
    const existing = db.prepare('SELECT COUNT(*) AS n FROM source_record').get() as { n: number };
    if (existing.n > 0) {
      db.close();
      throw new Error(`来源库 ${system.id} 已有 ${existing.n} 条记录，拒绝覆盖生成；需新环境或先恢复初始状态（PRD §6.2）`);
    }
    const rows = PROJECTORS[system.id](facts);
    const n = insertRecords(db, rows);
    const byKind: Record<string, number> = {};
    for (const r of rows) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
    inserted[system.id] = { total: n, ...byKind };
    db.close();
  }

  const deliveryDir = path.join(env.storageDir, 'delivery', config.datasetId);
  mkdirSync(deliveryDir, { recursive: true });
  const { manifest, coverage, negatives, generationReport } = buildDelivery(facts, inserted);
  writeFileSync(path.join(deliveryDir, 'data-manifest.json'), JSON.stringify(manifest, null, 2));
  writeFileSync(path.join(deliveryDir, 'scenario-coverage.json'), JSON.stringify(coverage, null, 2));
  writeFileSync(path.join(deliveryDir, 'negatives.json'), JSON.stringify(negatives, null, 2));
  writeFileSync(path.join(deliveryDir, 'generation-report.json'), JSON.stringify(generationReport, null, 2));

  const failedChecks = generationReport.checks.filter((c) => !c.pass);
  console.log(JSON.stringify({
    datasetId: config.datasetId,
    envId: env.manifest.envId,
    totals: manifest.totals,
    deliveryDir,
    generationChecksPassed: failedChecks.length === 0,
    failedChecks,
  }, null, 2));
  if (failedChecks.length > 0) process.exit(1);
}

try {
  main();
} catch (e) {
  if (e instanceof ConfigError) {
    console.error(e.message);
    process.exit(2);
  }
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
