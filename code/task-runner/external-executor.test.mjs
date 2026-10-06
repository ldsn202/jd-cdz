import test from 'node:test';
import assert from 'node:assert/strict';
import { executeExternal } from './external-executor.mjs';

test('mock write executes as the confirmed actor and transfers exact local attachments before submitting',async()=>{
 const original=globalThis.fetch,hits=[];
 globalThis.fetch=async(url,init={})=>{hits.push({url,method:init.method??'GET',body:init.body?JSON.parse(init.body):null});return Response.json({code:0,data:url.endsWith('/sessions')?{token:'actor-session'}:{operationStatus:'SUCCEEDED'}});};
 try{
 const request={operationId:'rv-upload',action:'SUBMIT_SUPPLEMENT',sourceMaterials:[{sourceSystem:'LOCAL_UPLOAD',sourceMaterialId:'up-test',sourceVersion:'local:up-test'}]};
 await executeExternal({operationId:'rv-upload',installationWorkOrderId:'WO-1',interfaceKind:'REVIEW_SYNC',actorAccountId:'acc-sp-001',queryOnly:false,request,
 localMaterials:[{materialVersionId:'v-test',sourceMaterialId:'up-test',sourceVersion:'local:up-test',contentSha256:'fixed'}]},
 {EXTERNAL_MODE:'mock',MOCK_BASE_URL:'http://transfer.test',MOCK_ACCOUNT_ID:'acc-svc-backend'},async id=>{assert.equal(id,'v-test');return Buffer.from('actual');});
 assert.equal(hits[0].body.accountId,'acc-sp-001');
 assert.equal(hits[1].body.contentBase64,Buffer.from('actual').toString('base64'));
 assert.deepEqual(hits[2].body,request);
 }finally{globalThis.fetch=original;}
});


test('unknown write recovery issues only a GET with the original operation id', async () => {
  const original = globalThis.fetch;
  const hits = [];
  globalThis.fetch = async (url, init = {}) => {
    hits.push({ url, method: init.method ?? 'GET', body: init.body });
    return Response.json({ code: 0, data: url.endsWith('/identity/sessions') ? { token: 'test-only' } : { submissionStatus: 'SUCCEEDED' } });
  };
  try {
    const result = await executeExternal({ installationWorkOrderId: 'order 1', operationId: 'op-1',
      request: { submissionId: 'op-1' }, queryOnly: true, interfaceKind: 'INSTALLATION_SUBMIT' },
    { EXTERNAL_MODE: 'mock', MOCK_BASE_URL: 'http://source.test', MOCK_ACCOUNT_ID: 'test-executor' });
    assert.equal(result.submissionStatus, 'SUCCEEDED');
    assert.deepEqual(hits.filter(x => !x.url.endsWith('/identity/sessions')).map(x => [x.method,x.url]), [
      ['GET', 'http://source.test/api/admin/mock/external/installation/work-orders/order%201/installation-detail-submissions/op-1'],
    ]);
  } finally { globalThis.fetch = original; }
});

test('write dispatch preserves exact confirmed request', async () => {
  const original = globalThis.fetch;
  let written;
  const request = { operationId: 'review-2', action: 'REQUEST_SUPPLEMENT', comment: '请补施工照片' };
  globalThis.fetch = async (url, init = {}) => {
    if (url.endsWith('/identity/sessions')) return Response.json({ code: 0, data: { token: 'test-only' } });
    written = init;
    return Response.json({ code: 0, data: { operationStatus: 'SUCCEEDED' } });
  };
  try {
    await executeExternal({ installationWorkOrderId: 'order-2', operationId: 'review-2', request,
      queryOnly: false, interfaceKind: 'REVIEW_SYNC' },
    { EXTERNAL_MODE: 'mock', MOCK_BASE_URL: 'http://source.test', MOCK_ACCOUNT_ID: 'test-executor' });
    assert.equal(written.method, 'POST');
    assert.deepEqual(JSON.parse(written.body), request);
    await assert.rejects(executeExternal({ operationId: 'changed', request }, {}), /缺少/);
  } finally { globalThis.fetch = original; }
});
