import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { bootRuntime, parseEnvArg } from './bootstrap.ts';
import { isSourceSystem, SOURCE_SYSTEMS } from './sources/systems.ts';
import { DuplicateOperationError } from './storage/source-store.ts';
import { createSession, resolveAuth } from '../identity/sessions.ts';
import { buildCurrentContext } from '../identity/current-context.ts';
import { getWorkOrderContext } from '../installation/context.ts';
import { getServiceProviders } from '../installation/providers.ts';
import { getInstallationEntitlements } from '../purchase-orders/entitlements.ts';
import { getProviderDocuments } from '../providers/documents.ts';
import { getSourceMaterial } from '../materials/read.ts';
import {registerUploadedMaterial} from '../materials/upload.ts';
import { getJdBill } from '../jd-bills/read.ts';
import { getProviderReceivable } from '../provider-receivables/read.ts';
import { getFeeEvidence } from '../billing-evidence/read.ts';
import { getInstallationDetailSubmission, postInstallationDetailSubmission } from '../installation/submit.ts';
import { getReviewAction, postReviewAction } from '../installation/review-actions.ts';
import { postSourceRevision } from '../control/revise-source.ts';
import { getFeedChanges, registerFeed } from '../change-feeds/feeds.ts';
import { postAiRun } from '../ai/ai-runs.ts';
import { clearFault, listFaults, matchFault, registerFault, type FaultPhase } from '../control/faults.ts';
import { completeTask, listEnvironments, markUploads, registerSelf, restoreEnvironment } from '../control/environment-manager.ts';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SELF_REPORT_PARAMS = ['subjectId', 'businessRole', 'scope', 'sourceUserId'];

function sendContract(res: ServerResponse, http: number, code: number, msg: string, data: unknown, requestId: string): void {
  res.writeHead(http, { 'content-type': 'application/json; charset=utf-8', 'x-request-id': requestId });
  res.end(JSON.stringify({ code, msg, requestId, data }));
}

function sendJson(res: ServerResponse, status: number, body: unknown, requestId: string): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'x-request-id': requestId });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage, limit=1024*1024): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('请求体超过 1MB'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve(undefined);
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('请求体不是合法 JSON'));
      }
    });
    req.on('error', reject);
  });
}

async function main(): Promise<void> {
  const runtime = bootRuntime(rootDir, parseEnvArg(process.argv));
  const { env } = runtime;
  registerSelf(runtime.dbs.get('identity')!, {
    envId: env.manifest.envId,
    datasetId: env.manifest.dataset,
    storageRoot: env.manifest.storageRoot,
    status: 'ACTIVE',
    containsUploads: false,
    generation: 1,
  });
  const applyFault = (route: string, phase: FaultPhase, requestId: string, path: string) =>
    matchFault(runtime.dbs.get('identity')!, route, phase, requestId, path);

  const server = createServer(async (req, res) => {
    const requestId = `mreq-${crypto.randomUUID()}`;
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const segments = url.pathname.split('/').filter(Boolean);

    try {
      if (url.pathname.startsWith('/api/admin/mock/external/')) {
        const sub = url.pathname.slice('/api/admin/mock/external'.length);
        const segs = sub.split('/').filter(Boolean);
        const identityDb = runtime.dbs.get('identity')!;

        if (req.method === 'POST' && sub === '/identity/sessions') {
          const body = (await readBody(req)) as Record<string, unknown> | undefined;
          if (!body || typeof body.accountId !== 'string' || body.accountId.trim() === '') {
            return sendContract(res, 400, 40001, 'body 须含 accountId', null, requestId);
          }
          const ttl = typeof body.ttlSeconds === 'number' ? body.ttlSeconds : null;
          const result = createSession(identityDb, body.accountId, ttl);
          if ('http' in result) return sendContract(res, result.http, result.code, result.msg, null, requestId);
          return sendContract(res, 201, 0, 'success', { token: result.token, accountId: result.accountId, validUntil: result.validUntil, note: '受控测试会话（开发入口）' }, requestId);
        }

        for (const p of SELF_REPORT_PARAMS) {
          if (url.searchParams.has(p)) {
            return sendContract(res, 400, 40001, `不接受自报身份或范围参数：${p}`, null, requestId);
          }
        }
        const auth = resolveAuth(identityDb, req.headers.authorization);
        if (!auth.ok) return sendContract(res, auth.failure.http, auth.failure.code, auth.failure.msg, null, requestId);

        if (req.method === 'GET' && sub === '/identity/current-context') {
          return sendContract(res, 200, 0, 'success', buildCurrentContext(identityDb, auth.account, auth.grants), requestId);
        }

        if(req.method==='POST'&&segs[0]==='installation'&&segs[1]==='work-orders'&&segs[3]==='uploaded-materials'&&segs.length===4){
          const body=await readBody(req,15*1024*1024);
          const r=registerUploadedMaterial(runtime.dbs.get('file-service')!,runtime.dbs.get('installation-admin')!,runtime.env.filesDir,auth,decodeURIComponent(segs[2]!),body);
          return sendContract(res,r.http,r.body.code,r.body.msg,r.body.data,requestId);
        }

        if (req.method === 'GET' && segs[0] === 'installation' && segs[1] === 'work-orders' && segs[3] === 'context' && segs.length === 4) {
          const r = getWorkOrderContext(runtime.dbs.get('installation-admin')!, auth, decodeURIComponent(segs[2]!));
          return sendContract(res, r.http, r.body.code, r.body.msg, r.body.data, requestId);
        }

        if (req.method === 'GET' && sub === '/installation/service-providers') {
          const r = getServiceProviders(runtime.dbs.get('installation-admin')!, auth, url.searchParams.get('page'), url.searchParams.get('pageSize'));
          return sendContract(res, r.http, r.body.code, r.body.msg, r.body.data, requestId);
        }

        if (req.method === 'GET' && segs[0] === 'purchase-orders' && segs[2] === 'installation-entitlements' && segs.length === 3) {
          const r = getInstallationEntitlements(
            runtime.dbs.get('order-entitlement')!,
            runtime.dbs.get('installation-admin')!,
            auth,
            decodeURIComponent(segs[1]!),
            url.searchParams.get('installationWorkOrderId') ?? undefined
          );
          return sendContract(res, r.http, r.body.code, r.body.msg, r.body.data, requestId);
        }

        if (req.method === 'GET' && segs[0] === 'sources' && segs[2] === 'service-providers' && segs[4] === 'records' && segs[6] === 'documents' && segs.length === 7) {
          const r = getProviderDocuments(
            runtime.dbs.get('provider-docs')!,
            runtime.dbs.get('file-service')!,
            auth,
            decodeURIComponent(segs[1]!),
            decodeURIComponent(segs[3]!),
            decodeURIComponent(segs[5]!)
          );
          return sendContract(res, r.http, r.body.code, r.body.msg, r.body.data, requestId);
        }

        if (req.method === 'GET' && segs[0] === 'sources' && segs[2] === 'materials' && segs.length === 4) {
          const r = getSourceMaterial(
            runtime.dbs.get('file-service')!,
            runtime.dbs.get('installation-admin')!,
            runtime.env.filesDir,
            auth,
            decodeURIComponent(segs[1]!),
            decodeURIComponent(segs[3]!),
            url.searchParams.get('sourceVersion') ?? undefined
          );
          return sendContract(res, r.http, r.body.code, r.body.msg, r.body.data, requestId);
        }

        if (req.method === 'GET' && segs[0] === 'jd-bills' && segs.length === 2) {
          const r = getJdBill(runtime.dbs.get('jd-billing')!, runtime.dbs.get('installation-admin')!, auth, decodeURIComponent(segs[1]!), url.searchParams.get('installationWorkOrderId') ?? undefined);
          return sendContract(res, r.http, r.body.code, r.body.msg, r.body.data, requestId);
        }

        if (req.method === 'GET' && segs[0] === 'sources' && segs[2] === 'service-providers' && segs[4] === 'receivables' && segs.length === 6) {
          const r = getProviderReceivable(
            runtime.dbs.get('provider-receivable')!,
            runtime.dbs.get('installation-admin')!,
            auth,
            decodeURIComponent(segs[1]!),
            decodeURIComponent(segs[3]!),
            decodeURIComponent(segs[5]!),
            url.searchParams.get('installationWorkOrderId') ?? undefined
          );
          return sendContract(res, r.http, r.body.code, r.body.msg, r.body.data, requestId);
        }

        if (req.method === 'GET' && segs[0] === 'installation-work-orders' && segs[2] === 'fee-evidence' && segs.length === 3) {
          const r = getFeeEvidence(
            runtime.dbs.get('billing-terms')!,
            runtime.dbs.get('installation-admin')!,
            runtime.dbs.get('jd-billing')!,
            auth,
            decodeURIComponent(segs[1]!),
            url.searchParams.get('serviceProviderId') ?? undefined
          );
          return sendContract(res, r.http, r.body.code, r.body.msg, r.body.data, requestId);
        }

        if (segs[0] === 'installation' && segs[1] === 'work-orders' && segs[3] === 'installation-detail-submissions' && segs.length === 4 && req.method === 'POST') {
          const before = applyFault('detail-submission-write', 'BEFORE_CALL', requestId, url.pathname);
          if (before) return sendContract(res, 503, 50301, '来源调用前不可用（故障注入）', null, requestId);
          const body = (await readBody(req)) as Record<string, unknown> | undefined;
          if (!body) return sendContract(res, 400, 40001, '请求体不是合法 JSON', null, requestId);
          const r = postInstallationDetailSubmission(runtime.dbs.get('installation-admin')!, auth, decodeURIComponent(segs[2]!), body);
          if (r.http === 200 && r.body.data && (r.body.data as any).submissionStatus === 'SUCCEEDED') {
            if (applyFault('detail-submission-write', 'AFTER_WRITE_LOST_RESPONSE', requestId, url.pathname)) {
              return sendContract(res, 504, 50401, '来源写入后响应丢失（故障注入），请按原编号回查', null, requestId);
            }
            const cont = applyFault('detail-submission-write', 'LOCAL_CONTINUATION', requestId, url.pathname);
            if (cont) res.setHeader('x-mock-continuation-blocked', cont.faultId);
          }
          return sendContract(res, r.http, r.body.code, r.body.msg, r.body.data, requestId);
        }

        if (segs[0] === 'installation' && segs[1] === 'work-orders' && segs[3] === 'installation-detail-submissions' && segs.length === 5 && req.method === 'GET') {
          const rf = applyFault('submission-recheck', 'RECHECK_FAIL', requestId, url.pathname);
          if (rf) {
            const code = rf.httpOverride === 404 ? 40401 : rf.httpOverride === 504 ? 50401 : 50301;
            return sendContract(res, rf.httpOverride!, code, '回查失败（故障注入）', null, requestId);
          }
          const r = getInstallationDetailSubmission(runtime.dbs.get('installation-admin')!, auth, decodeURIComponent(segs[2]!), decodeURIComponent(segs[4]!));
          return sendContract(res, r.http, r.body.code, r.body.msg, r.body.data, requestId);
        }

        if (segs[0] === 'installation' && segs[1] === 'work-orders' && segs[3] === 'review-actions' && segs.length === 4 && req.method === 'POST') {
          const before = applyFault('review-action-write', 'BEFORE_CALL', requestId, url.pathname);
          if (before) return sendContract(res, 503, 50301, '来源调用前不可用（故障注入）', null, requestId);
          const body = (await readBody(req)) as Record<string, unknown> | undefined;
          if (!body) return sendContract(res, 400, 40001, '请求体不是合法 JSON', null, requestId);
          const r = postReviewAction(runtime.dbs.get('installation-admin')!, auth, decodeURIComponent(segs[2]!), body);
          if (r.http === 200 && r.body.data && (r.body.data as any).operationStatus === 'SUCCEEDED') {
            if (applyFault('review-action-write', 'AFTER_WRITE_LOST_RESPONSE', requestId, url.pathname)) {
              return sendContract(res, 504, 50401, '来源写入后响应丢失（故障注入），请按原编号回查', null, requestId);
            }
            const cont = applyFault('review-action-write', 'LOCAL_CONTINUATION', requestId, url.pathname);
            if (cont) res.setHeader('x-mock-continuation-blocked', cont.faultId);
          }
          return sendContract(res, r.http, r.body.code, r.body.msg, r.body.data, requestId);
        }

        if (segs[0] === 'installation' && segs[1] === 'work-orders' && segs[3] === 'review-actions' && segs.length === 5 && req.method === 'GET') {
          const rf = applyFault('review-recheck', 'RECHECK_FAIL', requestId, url.pathname);
          if (rf) {
            const code = rf.httpOverride === 404 ? 40401 : rf.httpOverride === 504 ? 50401 : 50301;
            return sendContract(res, rf.httpOverride!, code, '回查失败（故障注入）', null, requestId);
          }
          const r = getReviewAction(runtime.dbs.get('installation-admin')!, auth, decodeURIComponent(segs[2]!), decodeURIComponent(segs[4]!));
          return sendContract(res, r.http, r.body.code, r.body.msg, r.body.data, requestId);
        }

        if (req.method === 'POST' && segs[0] === 'ai-runs' && segs.length === 1) {
          const body = (await readBody(req)) as Record<string, unknown> | undefined;
          if (!body) return sendContract(res, 400, 40001, '请求体不是合法 JSON', null, requestId);
          const r = postAiRun(runtime.dbs.get('identity')!, body);
          return sendContract(res, r.http, r.body.code, r.body.msg, r.body.data, requestId);
        }

        if (req.method === 'GET' && segs[0] === 'change-feeds' && segs[2] === 'changes' && segs.length === 3) {
          const feedId = decodeURIComponent(segs[1]!);
          const feedRow = runtime.dbs.get('identity')!.prepare("SELECT payload_json FROM source_record WHERE kind='change_feed' AND record_id=?").get(feedId) as { payload_json: string } | undefined;
          if (!feedRow) return sendContract(res, 404, 40401, '已授权范围内配置不存在', null, requestId);
          const feed = JSON.parse(feedRow.payload_json);
          if (auth.account.role !== 'SERVICE' || !auth.grants.some((g) => g.scopeProviderIds.includes(feed.serviceProviderId))) {
            return sendContract(res, 403, 40301, '变化发现仅供已授权的后台处理身份使用', null, requestId);
          }
          const sourceDb = runtime.dbs.get(feed.sourceSystem as never);
          if (!sourceDb) return sendContract(res, 400, 40001, `来源未配置：${feed.sourceSystem}`, null, requestId);
          const r = getFeedChanges(runtime.dbs.get('identity')!, sourceDb, feedId, url.searchParams.get('cursor') ?? undefined, url.searchParams.get('pageSize'));
          return sendContract(res, r.http, r.body.code, r.body.msg, r.body.data, requestId);
        }

        return sendContract(res, 404, 40401, '外部接口路径不存在或尚未实现', null, requestId);
      }

      if (url.pathname.startsWith('/api/admin/mock/control/')) {
        const sub = url.pathname.slice('/api/admin/mock/control'.length);
        const identityDb = runtime.dbs.get('identity')!;
        const auth = resolveAuth(identityDb, req.headers.authorization);
        if (!auth.ok) return sendContract(res, auth.failure.http, auth.failure.code, auth.failure.msg, null, requestId);

        if (req.method === 'POST' && sub === '/revisions') {
          const body = (await readBody(req)) as Record<string, unknown> | undefined;
          if (!body) return sendContract(res, 400, 40001, '请求体不是合法 JSON', null, requestId);
          const dbs = new Map([...runtime.dbs.entries()].map(([k, v]) => [k as string, v]));
          const r = postSourceRevision(dbs, runtime.env.filesDir, auth.account.accountId, body);
          return sendContract(res, r.http, r.body.code, r.body.msg, r.body.data, requestId);
        }

        if (req.method === 'POST' && sub === '/change-feeds') {
          const body = (await readBody(req)) as Record<string, unknown> | undefined;
          if (!body || typeof body.feedId !== 'string' || typeof body.sourceSystem !== 'string' || typeof body.serviceProviderId !== 'string') {
            return sendContract(res, 400, 40001, 'feedId/sourceSystem/serviceProviderId 必填', null, requestId);
          }
          const sourceDb = runtime.dbs.get(body.sourceSystem as never);
          if (!sourceDb) return sendContract(res, 400, 40001, `来源未配置：${body.sourceSystem}`, null, requestId);
          const r = registerFeed(identityDb, sourceDb, body.feedId, body.sourceSystem, body.serviceProviderId);
          return sendContract(res, r.http, r.body.code, r.body.msg, r.body.data, requestId);
        }

        if (req.method === 'POST' && sub === '/faults') {
          const body = (await readBody(req)) as Record<string, unknown> | undefined;
          if (!body) return sendContract(res, 400, 40001, '请求体不是合法 JSON', null, requestId);
          const r = registerFault(identityDb, body);
          return sendContract(res, r.http, r.body.code, r.body.msg, r.body.data, requestId);
        }
        if (req.method === 'GET' && sub === '/faults') {
          const r = listFaults(identityDb);
          return sendContract(res, r.http, r.body.code, r.body.msg, r.body.data, requestId);
        }
        if (req.method === 'POST' && sub.startsWith('/faults/') && sub.endsWith('/clear')) {
          const faultId = decodeURIComponent(sub.slice('/faults/'.length, -'/clear'.length));
          const r = clearFault(identityDb, faultId);
          return sendContract(res, r.http, r.body.code, r.body.msg, r.body.data, requestId);
        }
        if (req.method === 'GET' && sub === '/environments') {
          const r = listEnvironments(identityDb);
          return sendContract(res, r.http, r.body.code, r.body.msg, r.body.data, requestId);
        }
        if (req.method === 'POST' && sub.startsWith('/environments/') && sub.endsWith('/mark-uploads')) {
          const envId = decodeURIComponent(sub.slice('/environments/'.length, -'/mark-uploads'.length));
          const r = markUploads(identityDb, envId);
          return sendContract(res, r.http, r.body.code, r.body.msg, r.body.data, requestId);
        }
        if (req.method === 'POST' && sub === '/environments/restore') {
          const body = (await readBody(req)) as Record<string, unknown> | undefined;
          if (!body) return sendContract(res, 400, 40001, '请求体不是合法 JSON', null, requestId);
          const r = await restoreEnvironment(identityDb, rootDir, body);
          return sendContract(res, r.http, r.body.code, r.body.msg, r.body.data, requestId);
        }
        if (req.method === 'POST' && sub === '/tasks/complete') {
          const body = (await readBody(req)) as Record<string, unknown> | undefined;
          if (!body) return sendContract(res, 400, 40001, '请求体不是合法 JSON', null, requestId);
          const r = completeTask(identityDb, env.manifest.envId, body);
          return sendContract(res, r.http, r.body.code, r.body.msg, r.body.data, requestId);
        }

        return sendContract(res, 404, 40401, '控制入口路径不存在', null, requestId);
      }

      if (req.method === 'GET' && url.pathname === '/health') {        return sendJson(res, 200, {
          ok: true,
          service: 'jd-charging-mock',
          envId: env.manifest.envId,
          dataset: env.manifest.dataset,
          sources: SOURCE_SYSTEMS.map((s) => s.id),
        }, requestId);
      }

      if (req.method === 'GET' && url.pathname === '/environment') {
        return sendJson(res, 200, {
          envId: env.manifest.envId,
          port: env.manifest.port,
          dataset: env.manifest.dataset,
          storageRoot: env.manifest.storageRoot,
          appEnvRef: env.manifest.appEnvRef,
          appEnvRefNote: '本系统环境引用仅登记，不代表应用已实现',
        }, requestId);
      }

      if (segments[0] === 'sources' && segments[2] === 'smoke-records' && segments.length === 4) {
        const systemId = segments[1];
        const recordId = segments[3];
        if (!isSourceSystem(systemId)) {
          return sendJson(res, 404, { ok: false, error: { code: 'SOURCE_NOT_FOUND', message: `未知来源系统：${systemId}` } }, requestId);
        }
        const store = runtime.stores.get(systemId)!;

        if (req.method === 'GET') {
          const record = store.getSmokeRecord(recordId);
          if (!record) {
            return sendJson(res, 404, { ok: false, error: { code: 'RECORD_NOT_FOUND', message: '记录不存在' } }, requestId);
          }
          return sendJson(res, 200, { ok: true, data: record }, requestId);
        }

        if (req.method === 'PUT') {
          const body = (await readBody(req)) as Record<string, unknown> | undefined;
          if (!body || typeof body.sourceVersion !== 'string' || body.sourceVersion.trim() === ''
            || typeof body.operationId !== 'string' || body.operationId.trim() === ''
            || !('payload' in body)) {
            return sendJson(res, 400, { ok: false, error: { code: 'FIELD_INVALID', message: 'body 须含 payload、sourceVersion、operationId（字符串非空）' } }, requestId);
          }
          const record = store.putSmokeRecord({
            recordId,
            payload: body.payload,
            sourceVersion: body.sourceVersion,
            operationId: body.operationId,
          });
          return sendJson(res, 201, { ok: true, data: record }, requestId);
        }

        return sendJson(res, 405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: '仅支持 GET / PUT' } }, requestId);
      }

      return sendJson(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: '路径不存在或来源接口尚未实现' } }, requestId);
    } catch (e) {
      if (e instanceof DuplicateOperationError) {
        return sendJson(res, 409, { ok: false, error: { code: 'DUPLICATE_OPERATION', message: e.message } }, requestId);
      }
      if (e instanceof Error && (e.message === '请求体不是合法 JSON' || e.message === '请求体超过 1MB')) {
        return sendJson(res, 400, { ok: false, error: { code: 'BODY_INVALID', message: e.message } }, requestId);
      }
      console.error('unhandled', e);
      return sendJson(res, 500, { ok: false, error: { code: 'INTERNAL', message: '模拟服务内部失败' } }, requestId);
    }
  });

  server.listen(env.manifest.port, '127.0.0.1', () => {
    console.log(
      `[jd-charging-mock] env=${env.manifest.envId} dataset=${env.manifest.dataset} port=${env.manifest.port} storage=${env.manifest.storageRoot} sources=${SOURCE_SYSTEMS.length}`
    );
  });

  const shutdown = () => {
    server.close(() => {
      runtime.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
