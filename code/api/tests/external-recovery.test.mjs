import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDatabase } from './helpers/sqlite-d1.mjs';
import { loadModule } from './helpers/load-app.mjs';

const { claimJobs, reportResult, dispatchStart } = await loadModule('../../src/services/job-dispatch.ts');
const cfg = { leaseMs: 600000, maxAttempts: 3, retryBackoffMs: 0 };
const identity = { identityId: 'idt-tc-ins-svc1', subjectType: 'SERVICE', grants: [
  { scopeType: 'SERVICE_PROVIDER', resourceIds: ['sp-tc-ins-anjia'], actions: ['PREPARE_ANALYSIS','READ_SOURCE_MATERIAL'] },
] };
function fixture() {
  const db = createDatabase();
  for (const file of ['TC-INS-SEED', 'TC-INS-08']) {
    db.sqlite.exec(readFileSync(new URL(`../../../docs/06-testcase/install/sql/${file}.sql`, import.meta.url), 'utf8'));
  }
  return db;
}
test('unknown write schedules GET recovery, preserves operation id, and adopts eventual receipt once', async () => {
  const db = fixture();
  try {
    const { claims } = await claimJobs(db, identity, cfg, { purposes: ['WRITE_EXTERNAL'], limit: 1 });
    const claim = claims[0];
    assert.ok(claim);
    await reportResult(db, identity, cfg, claim.attemptId, {
      leaseToken: claim.leaseToken, leaseEpoch: claim.leaseEpoch, status: 'UNKNOWN',
      dispatchState: 'RESPONSE_RECEIVED', errorCode: 'RESULT_UNKNOWN',
    });
    const op = db.sqlite.prepare("SELECT status FROM external_write_operation WHERE id='sub-tc-ins-08'").get();
    assert.equal(op.status, 'RESULT_UNKNOWN');
    const next = await claimJobs(db, identity, cfg, { purposes: ['QUERY_EXTERNAL'], limit: 1 });
    assert.equal(next.claims.length, 1, 'unknown results must have an executable recovery job');
    const query = next.claims[0];
    assert.equal(query.target.queryOnly, true);
    assert.equal(query.target.request.submissionId, 'sub-tc-ins-08');
    await dispatchStart(db, identity, query.attemptId, query);
    const result = await reportResult(db, identity, cfg, query.attemptId, {
      ...query, status: 'SUCCEEDED', dispatchState: 'RESPONSE_RECEIVED',
      result: { submissionStatus: 'SUCCEEDED', installationDetail: {
        sourceSystem: 'installation_management', installationDetailId: 'detail-recovery-08', sourceVersion: 'detail-1',
      } },
    });
    assert.equal(result.adopted, true);
    assert.equal(db.sqlite.prepare("SELECT status FROM external_write_operation WHERE id='sub-tc-ins-08'").get().status, 'SUCCEEDED');
    assert.equal(db.sqlite.prepare("SELECT status FROM work_item WHERE id='wi-tc-ins-08'").get().status, 'COMPLETED');
    assert.equal(db.sqlite.prepare("SELECT count(*) n FROM work_item WHERE creation_key='review:sub-tc-ins-08'").get().n, 1);
    assert.equal(db.sqlite.prepare("SELECT count(*) n FROM background_job WHERE purpose='READ_SOURCE'").get().n,1,'submission automatically prepares review without another human action');
    const {buildSourceDiscovery}=await loadModule('../../src/services/source-discovery.ts');
    const originalFetch=globalThis.fetch;
    try{
      const order=db.sqlite.prepare("SELECT wo.* FROM installation_work_order wo JOIN work_item w ON w.installation_work_order_id=wo.id WHERE w.id='wi-tc-ins-08'").get();
      const now=Date.now();
      db.sqlite.prepare("INSERT INTO change_feed VALUES('post-submit-feed',?,'installation-admin',?,?)").run(identity.grants[0].resourceIds[0],now,now);
      db.sqlite.prepare("INSERT INTO source_change VALUES('post-submit-change','post-submit-feed','source-change','INSTALLATION_DETAIL','detail-recovery-08','detail-1','UPSERT','COMPLETE',?,'{}',?,?,?)").run(JSON.stringify([order.source_id]),'a'.repeat(64),now,now);
      globalThis.fetch=async(url)=>Response.json({code:0,data:String(url).endsWith('/identity/sessions')?{token:'test'}:{installationWorkOrder:{installationWorkOrderId:order.source_id,serviceProviderId:identity.grants[0].resourceIds[0],sourceSystem:order.source_system,sourceVersion:order.source_version},installationDetailStatus:'SUBMITTED',installationDetail:{installationDetailId:'detail-recovery-08',sourceSystem:'installation_management',sourceVersion:'detail-1'},installationPlan:null,sourceMaterials:[]}});
      const discovered=await buildSourceDiscovery(db,{EXTERNAL_MODE:'mock',MOCK_BASE_URL:'http://post-submit-recovery',MOCK_ACCOUNT_ID:'service'},{id:'discovery',service_provider_id:identity.grants[0].resourceIds[0],target_json:'{"changeId":"post-submit-change"}'});
      await db.batch(discovered.statements);
      assert.equal(db.sqlite.prepare("SELECT count(*) n FROM work_item WHERE item_kind='INSTALLATION_REVIEW' AND installation_work_order_id=?").get(order.id).n,1,'source echo reuses the review created by successful submission');
    }finally{globalThis.fetch=originalFetch;}
    await assert.rejects(reportResult(db, identity, cfg, query.attemptId, {
      ...query, status: 'SUCCEEDED', result: {},
    }), /失去领取权/);
  } finally { db.close(); }
});

test('SERVICE cannot claim tasks outside its provider scope', async () => {
  const db = fixture();
  try {
    const result = await claimJobs(db, { ...identity, grants: [] }, cfg, { purposes: ['WRITE_EXTERNAL'], limit: 1 });
    assert.equal(result.claims.length, 0);
    assert.equal(db.sqlite.prepare("SELECT status FROM background_job WHERE id='job-tc-ins-write-08'").get().status, 'READY');
  } finally { db.close(); }
});

test('lease takeover between result validation and transaction prevents all adoption', async () => {
  const db = fixture();
  try {
    const { claims: [claim] } = await claimJobs(db, identity, cfg, { purposes: ['WRITE_EXTERNAL'], limit: 1 });
    const batch = db.batch;
    db.batch = async statements => {
      db.sqlite.prepare(`UPDATE background_job SET lease_epoch=lease_epoch+1,lease_token='new-owner-token',
        row_version=row_version+1,gmt_modified=? WHERE id=?`).run(Date.now(),claim.jobId);
      return batch(statements);
    };
    await assert.rejects(reportResult(db, identity, cfg, claim.attemptId, {
      ...claim, status:'SUCCEEDED',dispatchState:'RESPONSE_RECEIVED',
      result:{submissionStatus:'SUCCEEDED',installationDetail:{sourceSystem:'installation_management',installationDetailId:'detail-race',sourceVersion:'v1'}},
    }), /lease|领取|租约/);
    assert.notEqual(db.sqlite.prepare("SELECT status FROM external_write_operation WHERE id='sub-tc-ins-08'").get().status,'SUCCEEDED');
    assert.equal(db.sqlite.prepare("SELECT count(*) n FROM work_item WHERE creation_key='review:sub-tc-ins-08'").get().n,0);
  } finally { db.close(); }
});

test('source-restricted preparation grant cannot be widened into a cross-source execution lease',async()=>{const db=fixture();try{
 for(const extra of [{sourceSystem:'installation-admin'},{recordType:'INSTALLATION_WORK_ORDER'}]){const grants=identity.grants.map(g=>({...g,...extra}));const result=await claimJobs(db,{...identity,grants},cfg,{purposes:['WRITE_EXTERNAL'],limit:1});assert.equal(result.claims.length,0);}
 const {claims:[claim]}=await claimJobs(db,identity,cfg,{purposes:['WRITE_EXTERNAL'],limit:1});
 await assert.rejects(dispatchStart(db,{...identity,grants:identity.grants.map(g=>({...g,sourceSystem:'installation-admin'}))},claim.attemptId,claim),/权限/);
 }finally{db.close();}});
