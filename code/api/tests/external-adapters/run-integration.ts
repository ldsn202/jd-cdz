import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTracedExternalClient } from '../../src/adapters/external/index.ts';
import { runAiOperation } from '../../src/adapters/ai/index.ts';
import { ExternalError, type ExternalEnv } from '../../src/services/external/client.ts';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ENV_DIR = path.resolve(rootDir, '../mocks/.data/mock-env-a');

type Check = { id: string; pass: boolean; detail: string };
const checks: Check[] = [];
const check = (id: string, pass: boolean, detail: string) => checks.push({ id, pass, detail });

const env: ExternalEnv = {
  EXTERNAL_MODE: 'mock',
  AI_MODE: 'mock',
  MOCK_BASE_URL: process.env.MOCK_BASE_URL ?? 'http://localhost:8790',
  MOCK_ACCOUNT_ID: 'acc-jd-business',
};
const reconEnv: ExternalEnv = { ...env, MOCK_ACCOUNT_ID: 'acc-jd-business' };

async function expectExternalError(fn: () => Promise<unknown>, code: number): Promise<string> {
  try {
    await fn();
    return `未抛错（期望 ${code}）`;
  } catch (e) {
    if (e instanceof ExternalError && e.code === code) return '';
    return `错误不符：${(e as Error).message}（期望 code=${code}）`;
  }
}

async function main(): Promise<void> {
  const client = createTracedExternalClient(env);

  const ctx = await createTracedExternalClient(reconEnv).identityContext.getCurrentContext();
  check('TRACE-IDENTITY', ctx.data.subjectId === 'acc-jd-business' && ctx.trace.requestId !== null && ctx.trace.mode === 'mock'
    && ctx.trace.recordId === 'acc-jd-business', `身份上下文：trace 含 requestId/recordId（${ctx.trace.requestId?.slice(0, 18)}…）`);

  const manifest = JSON.parse(readFileSync(path.join(ENV_DIR, 'delivery/standard-v1/data-manifest.json'), 'utf8'));
  const woId = manifest.scenarioOrderIds.evidence_consistent[0];
  const providerAccount = manifest.scenarioOrderIds.evidence_consistent ? 'acc-jd-business' : 'acc-jd-business';
  void providerAccount;

  const wo = await client.workOrderContext.getContext(woId);
  check('TRACE-WO-CONTEXT', wo.data.installationWorkOrder.installationWorkOrderId === woId
    && wo.trace.sourceVersion === wo.data.installationWorkOrder.sourceVersion && wo.trace.sourceSystem === 'installation_management',
    `工单上下文：trace 版本 ${wo.trace.sourceVersion} 与返回一致`);

  const fm = JSON.parse(readFileSync(path.join(ENV_DIR, 'delivery/standard-v1/file-manifest.json'), 'utf8'));
  const jdReconAll = fm.files.find((f: any) => f.ownerKind === 'work_order_material');
  void jdReconAll;

  const idbManifest = manifest;
  void idbManifest;

  const matTarget = fm.files.find((f: any) => {
    if (f.ownerKind !== 'work_order_material') return false;
    return true;
  });
  const diskBytes = readFileSync(path.join(ENV_DIR, 'files', matTarget.relativePath));
  const matEnv: ExternalEnv = { ...env, MOCK_ACCOUNT_ID: `acc-${matTarget.serviceProviderId.toLowerCase()}` };
  const matClient = createTracedExternalClient(matEnv);
  const mat = await matClient.sourceMaterial.getMaterial('file-service', matTarget.fileId, matTarget.sourceVersion);
  const gotBytes = Buffer.from(mat.data.contentBase64, 'base64');
  check('TRACE-MATERIAL-BYTES', mat.trace.digestVerified === true && mat.trace.byteLength === diskBytes.length && gotBytes.equals(diskBytes)
    && mat.trace.contentSha256 === matTarget.sha256,
    `文件实际字节传递：${matTarget.fileId} 逐字节一致，摘要经适配器复验（digestVerified）`);

  const billGroup = (manifest.billGroupIndex as any[]).find((g) => g.workOrderIds.length === 1);
  const bill = await createTracedExternalClient(reconEnv).jdBill.getBill(billGroup.jdBillId, billGroup.workOrderIds[0]);
  check('TRACE-JDBILL', bill.data.jdBillId === billGroup.jdBillId && bill.trace.sourceVersion === 'bill-1' && bill.trace.requestId !== null,
    `京东账单：trace 版本 bill-1、requestId 留痕`);

  const rec = await createTracedExternalClient(reconEnv).providerReceivable.getReceivable('provider-receivable', billGroup.serviceProviderId, billGroup.providerReceivableId, billGroup.workOrderIds[0]);
  check('TRACE-RECEIVABLE', rec.data.providerReceivableId === billGroup.providerReceivableId && rec.trace.sourceSystem === 'provider-receivable', '应收：trace 来源与编号可追溯');

  const ev = await createTracedExternalClient(reconEnv).billingTerms.getFeeEvidence(billGroup.workOrderIds[0], billGroup.serviceProviderId);
  check('TRACE-FEE-EVIDENCE', ev.data.lookupScope.includes(billGroup.workOrderIds[0]), `费用依据：lookupScope 含目标工单（条款 ${ev.data.terms.length} 条）`);

  const missingVersion = await expectExternalError(
    () => matClient.sourceMaterial.getMaterial('file-service', matTarget.fileId, 'material-99'),
    40901
  );
  check('TRACE-VERSION-ERROR-MAPPED', missingVersion === '', `版本不可取得映射为 40901，不补造记录${missingVersion ? `（${missingVersion}）` : ''}`);

  const unreachableEnv: ExternalEnv = { ...env, MOCK_BASE_URL: 'http://localhost:9999' };
  const unreachable = await expectExternalError(() => createTracedExternalClient(unreachableEnv).workOrderContext.getContext(woId), 50301);
  check('TRACE-NO-BYPASS', unreachable === '', '来源不可达时 50301，无文件/数据库旁路');

  const realEnv: ExternalEnv = { EXTERNAL_MODE: 'real', MOCK_BASE_URL: env.MOCK_BASE_URL };
  const realErr = await expectExternalError(() => createTracedExternalClient(realEnv).workOrderContext.getContext(woId), 50301);
  check('TRACE-REAL-NO-DOWNGRADE', realErr === '', 'EXTERNAL_MODE=real 未配置真实地址时 50301，不降级 mock');

  const ai = await runAiOperation(env, {
    runId: `ai-t32-${Date.now().toString(36)}`,
    operation: 'PARSE_MATERIAL',
    profileId: 'mock-ai-profile',
    parseInput: {
      sourceSystem: 'file-service',
      sourceMaterialId: matTarget.fileId,
      sourceVersion: matTarget.sourceVersion,
      mediaType: matTarget.mediaType,
      byteLength: matTarget.sizeBytes,
      contentSha256: matTarget.sha256,
      contentBase64: mat.data.contentBase64,
    },
    analysisInput: null,
  });
  check('AI-MOCK-MARKED', ai.aiMode === 'mock' && (ai.data as any).mock === true && typeof (ai.data as any).mockNotice === 'string'
    && ai.trace.recordId !== null, `AI mock 结果带明确标记（mockNotice）且留痕 runId`);

  const aiRealEnv: ExternalEnv = { AI_MODE: 'real', MOCK_BASE_URL: env.MOCK_BASE_URL };
  const aiRealErr = await expectExternalError(() => runAiOperation(aiRealEnv, { runId: 'x', operation: 'PARSE_MATERIAL', profileId: 'p', parseInput: null, analysisInput: null }), 50301);
  check('AI-REAL-NO-FALLBACK', aiRealErr === '', 'AI_MODE=real 未配置时不回退模拟答案 50301');

  const failed = checks.filter((c) => !c.pass);
  console.log(JSON.stringify({ checks, passed: failed.length === 0, failedCount: failed.length }, null, 2));
  if (failed.length > 0) process.exit(1);
}

main();
