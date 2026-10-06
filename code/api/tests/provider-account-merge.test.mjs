import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createDatabase } from './helpers/sqlite-d1.mjs';
import { loadModule } from './helpers/load-app.mjs';
import { ensureUnifiedProviderAccounts } from '../../mocks/identity/unified-provider-accounts.ts';
import { buildCurrentContext } from '../../mocks/identity/current-context.ts';
import { createSession, resolveAuth, hasAction } from '../../mocks/identity/sessions.ts';
import { ROLE_ACTIONS, PROVIDER_BUSINESS_ROLES } from '../../mocks/identity/roles.ts';
import { identitySql } from '../../scripts/local-identity.mjs';
import { mergeProviderIdentitiesSql } from '../../scripts/merge-provider-identities.mjs';
import { resolveResponsibility } from '../src/services/responsibility.ts';

const { default: app } = await loadModule('../../src/index.ts');
function sourceFixture(crossScope = false) {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE source_record(kind TEXT,record_id TEXT,source_version TEXT,source_updated_at TEXT,payload_json TEXT,PRIMARY KEY(kind,record_id))');
  const insert = db.prepare('INSERT INTO source_record VALUES(?,?,?,?,?)');
  for (const [id, provider, role] of [['acc-sp-001','SP-001','PROVIDER_DATA'],['acc-sp-002','SP-002','PROVIDER_DATA'],['acc-jd-config',null,'PROVIDER_INTEGRATION']]) {
    insert.run('account',id,'v1','2026-09-01',JSON.stringify({accountId:id,displayName:id+'资料账号',serviceProviderId:provider,role,active:true}));
    insert.run('grant','g-'+id,'v1','2026-09-01',JSON.stringify({accountId:id,grantId:'g-'+id,role,scopeProviderIds:provider ? (crossScope&&provider==='SP-001'?['SP-001','SP-002']:[provider]):['SP-001','SP-002']}));
  }
  return db;
}
function auth(db,id) {
  const session=createSession(db,id,null); assert.ok(session.token);
  const a=resolveAuth(db,'Bearer '+session.token);assert.equal(a.ok,true);return a;
}
function context(db,id) { const a=auth(db,id);return buildCurrentContext(db,a.account,a.grants); }

test('one provider account receives all company actions and never another company or JD actions',()=>{
  const db=sourceFixture();try {
    ensureUnifiedProviderAccounts(db);
    const before=db.prepare('SELECT * FROM source_record').all();ensureUnifiedProviderAccounts(db);
    assert.deepEqual(db.prepare('SELECT * FROM source_record').all(),before);
    for(const [id,own,other] of [['acc-sp-001','SP-001','SP-002'],['acc-sp-002','SP-002','SP-001']]) {
      const a=auth(db,id);assert.equal(a.account.role,'PROVIDER_BUSINESS');assert.ok(!a.account.displayName.includes('资料账号'));
      assert.deepEqual(buildCurrentContext(db,a.account,a.grants).grants.map(g=>g.businessRole),PROVIDER_BUSINESS_ROLES);
      for(const action of ROLE_ACTIONS.PROVIDER_BUSINESS) {
        assert.equal(hasAction(a,action,own,ROLE_ACTIONS),true);
        assert.equal(hasAction(a,action,other,ROLE_ACTIONS),false);
      }
      for(const action of ['DECIDE_INSTALLATION_REVIEW','REQUEST_BILLING_VERIFICATION','COMPLETE_FULFILLMENT_COORDINATION','PREPARE_ANALYSIS']) assert.equal(hasAction(a,action,own,ROLE_ACTIONS),false);
    }
    assert.equal(createSession(db,'acc-jd-config',null).http,403);
  }finally{db.close();}
});

test('invalid provider scope prevents the whole source upgrade',()=>{
  const db=sourceFixture(true);try {
    const before=db.prepare('SELECT * FROM source_record').all();
    assert.throws(()=>ensureUnifiedProviderAccounts(db),/仅包含本公司/);
    assert.deepEqual(db.prepare('SELECT * FROM source_record').all(),before);
  }finally{db.close();}
});

function businessFixture() {
  const source=sourceFixture(),db=createDatabase();
  for(const id of ['acc-sp-001','acc-sp-002','acc-jd-config']) db.sqlite.exec(identitySql(context(source,id)));
  ensureUnifiedProviderAccounts(source);
  for(const id of ['acc-sp-001','acc-sp-002']) db.sqlite.exec(identitySql(context(source,id)));
  for(const [pid,id] of [['SP-001','one'],['SP-002','two']]) {
    db.sqlite.prepare('INSERT INTO service_provider(id,source_system,source_id,display_name,gmt_create,gmt_modified) VALUES(?,?,?,?,1,1)').run(pid,'test',pid,pid);
    db.sqlite.prepare('INSERT INTO installation_work_order(id,source_system,source_id,current_service_provider_id,gmt_create,gmt_modified) VALUES(?,?,?,?,1,1)').run('WO-'+id,'test','WO-'+id,pid);
    db.sqlite.prepare(`INSERT INTO work_item(id,service_provider_id,item_kind,business_key,business_identity_json,creation_key,title,assignee_identity_id,gmt_create,gmt_modified)
      VALUES(?,?,'CONFIGURATION',?,'["test"]',?,'配置','local:acc-jd-config',1,1)`).run(id,pid,id,id);
  }
  db.sqlite.exec(`INSERT INTO work_item(id,service_provider_id,item_kind,business_key,business_identity_json,creation_key,title,status,assignee_identity_id,completion_code,completion_basis_json,completed_at,gmt_create,gmt_modified)
    VALUES('done','SP-001','CONFIGURATION','done','["test"]','done','完成','COMPLETED','local:acc-jd-config','CONFIGURATION_ENABLED','{}',1,1,1)`);
  return {source,db,close(){source.close();db.close();}};
}

test('configurations move to their own company once, histories stay, all new provider duties resolve correctly',async()=>{
  const f=businessFixture();try {
    const completed=f.db.sqlite.prepare("SELECT * FROM work_item WHERE id='done'").get();
    f.db.sqlite.exec(`BEGIN;${mergeProviderIdentitiesSql()}COMMIT;`);
    const rows=f.db.sqlite.prepare("SELECT * FROM work_item WHERE status<>'COMPLETED' ORDER BY id").all();
    assert.deepEqual(rows.map(r=>r.assignee_identity_id),['local:acc-sp-001','local:acc-sp-002']);
    assert.ok(rows.every(r=>r.row_version===2&&r.responsibility_version===2));
    assert.deepEqual(f.db.sqlite.prepare("SELECT * FROM work_item WHERE id='done'").get(),completed);
    const events=f.db.sqlite.prepare('SELECT * FROM activity_record').all();assert.equal(events.length,2);
    f.db.sqlite.exec(`BEGIN;${mergeProviderIdentitiesSql()}COMMIT;`);
    assert.deepEqual(f.db.sqlite.prepare("SELECT * FROM work_item WHERE status<>'COMPLETED' ORDER BY id").all(),rows);
    assert.deepEqual(f.db.sqlite.prepare('SELECT * FROM activity_record').all(),events);
    for(const pid of ['SP-001','SP-002']) for(const action of ['ENABLE_INTEGRATION_CONFIG','CONFIRM_INSTALLATION_DRAFT','SUBMIT_SUPPLEMENT','REPLY_BILLING_VERIFICATION']) assert.equal(await resolveResponsibility(f.db,pid,action),'local:acc-'+pid.toLowerCase());
    assert.equal(await resolveResponsibility(f.db,'SP-003','ENABLE_INTEGRATION_CONFIG'),null);
    assert.equal(f.db.sqlite.prepare("SELECT grant_count FROM current_identity WHERE identity_reference_id='local:acc-jd-config' ORDER BY verified_at DESC,id DESC LIMIT 1").get().grant_count,0);
  }finally{f.close();}
});

test('API lists only own company data and rejects cross-company configuration reads and writes',async()=>{
  const f=businessFixture();try {
    f.db.sqlite.exec(`BEGIN;${mergeProviderIdentitiesSql()}COMMIT;`);
    const env={DB:f.db,EXTERNAL_MODE:'mock',LOCAL_ACCOUNT_SWITCHING:'true',LOCAL_UI_ORIGIN:'http://127.0.0.1:5174',DEV_IDENTITY_TOKENS:JSON.stringify({p1:'acc-sp-001',p2:'acc-sp-002'})};
    const call=(path,opts={})=>app.request('http://127.0.0.1/api/admin/charging'+path,{...opts,headers:{authorization:'Bearer p1','content-type':'application/json',...opts.headers}},env);
    for(const path of ['/providers','/work-orders','/work-items?responsibility=MINE']) {
      const r=await call(path);assert.equal(r.status,200);const b=await r.json();assert.equal(b.data.total,1);
    }
    const session=await (await call('/session')).json();assert.equal(session.data.businessRoles.length,3);assert.equal(session.data.displayName,'acc-sp-001账号');
    const accounts=await (await call('/session/accounts')).json();assert.equal(accounts.data.list.length,2);
    assert.equal((await call('/work-items/two/configuration')).status,404);
    assert.equal((await call('/work-items/two/configuration-draft',{method:'PUT',headers:{'Idempotency-Key':'cross-company-test'},body:'{}'})).status,404);
    assert.equal((await call('/work-orders/WO-two')).status,404);
  }finally{f.close();}
});
