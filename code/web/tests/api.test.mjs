import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError, apiFetch } from '../src/api.ts';

test('multipart upload leaves Content-Type to the browser boundary', async () => {
  const originalFetch = globalThis.fetch;
  const body = new FormData();
  body.set('purpose', 'INSTALLATION_MATERIAL');
  globalThis.fetch = async (_path, init) => {
    const headers = new Headers(init.headers);
    assert.equal(headers.get('content-type'), null);
    assert.equal(init.body, body);
    return Response.json({ code: 0, msg: 'success', requestId: 'req-1', data: { status: 'RECEIVED' } });
  };
  try {
    const result = await apiFetch('/api/admin/charging/uploads', { method: 'POST', body });
    assert.equal(result.status, 'RECEIVED');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('pending-write error retains the original operation for safe recovery', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    code: 40903,
    msg: '存在未决写入',
    requestId: 'req-2',
    data: null,
    pendingOperation: { operationId: 'op-123', status: 'RESULT_UNKNOWN' },
  }, { status: 409 });
  try {
    await assert.rejects(
      apiFetch('/api/admin/charging/work-items/w-1/installation-submissions', { method: 'POST', body: '{}' }),
      (error) => {
        assert.ok(error instanceof ApiError);
        assert.deepEqual(error.pendingOperation, { operationId: 'op-123', status: 'RESULT_UNKNOWN' });
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('provider picker retrieves all authorized pages instead of silently limiting to first ten', async () => {
  const originalFetch = globalThis.fetch;
  const { getAllProviders } = await import('../src/api.ts');
  const requests = [];
  globalThis.fetch = async path => {
    const url = new URL(path, 'http://local');
    const page = Number(url.searchParams.get('page'));
    requests.push(page);
    const start = (page - 1) * 50;
    return Response.json({ code: 0, data: { list: Array.from({ length: Math.min(50, 101 - start) }, (_, i) => ({ providerId: `p${start + i + 1}`, displayName: `服务商${start + i + 1}` })), total: 101, page, pageSize: 50 } });
  };
  try {
    const list = await getAllProviders();
    assert.equal(list.length, 101);
    assert.equal(list[100].providerId, 'p101');
    assert.deepEqual(requests, [1, 2, 3]);
  } finally { globalThis.fetch = originalFetch; }
});
