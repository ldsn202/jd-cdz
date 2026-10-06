// 适配层真实 HTTP 验证：本地 stub 模拟 mock 服务端点，逐条核对路径、封装与模式切换。
// 运行：node --test code/api/test/external-adapter.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createExternalClient, ExternalError } from '../src/services/external/index.ts';

let server;
let base;
const hits = [];

const ctxData = {
  retrievedAt: '2026-09-20T00:00:00Z',
  completeness: 'COMPLETE',
  missingParts: [],
  installationWorkOrder: {
    installationWorkOrderId: 'AZ-1',
    serviceProviderId: 'provider-mock',
    purchaseOrderId: 'PO-1',
    sourceSystem: 'MOCK',
    sourceVersion: 'v1',
    sourceUpdatedAt: null,
  },
  installationPlan: null,
  installationDetailStatus: 'NOT_SUBMITTED',
  installationDetail: null,
  sourceMaterialIndexComplete: true,
  sourceMaterials: [],
};

const changesData = {
  feedId: 'feed-1',
  sourceSystem: 'MOCK',
  serviceProviderId: 'provider-mock',
  discoveryMode: 'SOURCE_FEED',
  retrievedAt: '2026-09-20T00:00:00Z',
  sourceCheckedAt: '2026-09-20T00:00:00Z',
  coverageThrough: 'c1',
  cursor: 'c0',
  nextCursor: 'c1',
  hasMore: false,
  list: [],
};

const aiData = {
  runId: 'run-1',
  operation: 'PARSE_MATERIAL',
  profileId: 'p1',
  implementationVersion: '1.0.0',
  inputSnapshotId: null,
  parsing: null,
  analysis: null,
};

before(async () => {
  server = http.createServer((req, res) => {
    hits.push({ method: req.method, url: req.url });
    const reply = (data, code = 0, msg = 'success', status = 200) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ code, msg, requestId: 'stub-req-1', data }));
    };
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/api/admin/mock/external/installation/work-orders/AZ-1/context') return reply(ctxData);
    if (u.pathname === '/api/admin/mock/external/change-feeds/feed-1/changes') return reply(changesData);
    if (u.pathname === '/api/admin/mock/external/ai-runs') return reply(aiData);
    if (u.pathname === '/api/admin/mock/external/jd-bills/JD-1') {
      return reply(null, 40404, '资源不存在或不可见', 404);
    }
    return reply(null, 40404, 'not found', 404);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

test('mock 模式：上下文读取路径与封装正确', async () => {
  const client = createExternalClient({ EXTERNAL_MODE: 'mock', MOCK_BASE_URL: base });
  const data = await client.workOrderContext.getContext('AZ-1');
  assert.equal(data.installationWorkOrder.installationWorkOrderId, 'AZ-1');
  assert.equal(data.completeness, 'COMPLETE');
});

test('mock 模式：变化发现 query 参数正确', async () => {
  const client = createExternalClient({ EXTERNAL_MODE: 'mock', MOCK_BASE_URL: base });
  const data = await client.changes.getChanges('feed-1', 'c0', 10);
  assert.equal(data.nextCursor, 'c1');
  const hit = hits.find((h) => h.url.includes('change-feeds'));
  assert.ok(hit.url.includes('cursor=c0'));
  assert.ok(hit.url.includes('pageSize=10'));
});

test('依赖业务错误码透传为 ExternalError（不静默）', async () => {
  const client = createExternalClient({ EXTERNAL_MODE: 'mock', MOCK_BASE_URL: base });
  await assert.rejects(
    () => client.jdBill.getBill('JD-1', 'AZ-1'),
    (e) => e instanceof ExternalError && e.code === 40404 && e.httpStatus === 404
  );
});

test('EXTERNAL_MODE=real 未配置时受控报错，不降级 mock', async () => {
  const client = createExternalClient({ EXTERNAL_MODE: 'real', MOCK_BASE_URL: base });
  await assert.rejects(
    () => client.workOrderContext.getContext('AZ-1'),
    (e) => e instanceof ExternalError && e.code === 50301 && e.message.includes('EXTERNAL_REAL_BASE_URL')
  );
});

test('EXTERNAL_MODE=mock 但 MOCK_BASE_URL 缺失时受控报错', async () => {
  const client = createExternalClient({ EXTERNAL_MODE: 'mock' });
  await assert.rejects(
    () => client.changes.getChanges('feed-1', 'c0'),
    (e) => e instanceof ExternalError && e.code === 50301
  );
});

test('AI_MODE=mock 走模拟 AI 端点；AI_MODE=real 走 TASK_RUNNER_BASE_URL', async () => {
  const clientMock = createExternalClient({ AI_MODE: 'mock', MOCK_BASE_URL: base });
  const data = await clientMock.ai.postRun({ runId: 'run-1', operation: 'PARSE_MATERIAL', profileId: 'p1', parseInput: null, analysisInput: null });
  assert.equal(data.runId, 'run-1');
  const clientReal = createExternalClient({ AI_MODE: 'real', TASK_RUNNER_BASE_URL: base });
  const data2 = await clientReal.ai.postRun({ runId: 'run-1', operation: 'PARSE_MATERIAL', profileId: 'p1', parseInput: null, analysisInput: null });
  assert.equal(data2.runId, 'run-1');
  const clientRealMissing = createExternalClient({ AI_MODE: 'real' });
  await assert.rejects(
    () => clientRealMissing.ai.postRun({ runId: 'r', operation: 'PARSE_MATERIAL', profileId: 'p', parseInput: null, analysisInput: null }),
    (e) => e instanceof ExternalError && e.code === 50301 && e.message.includes('TASK_RUNNER_BASE_URL')
  );
});
