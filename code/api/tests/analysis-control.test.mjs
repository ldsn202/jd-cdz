import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDatabase } from './helpers/sqlite-d1.mjs';
import { loadModule } from './helpers/load-app.mjs';
const { default: app } = await loadModule('../../src/index.ts');
function fixture() {
  const db = createDatabase();
  for (const name of ['dev-identity', 'dev-work-items']) db.sqlite.exec(readFileSync(new URL(`../../db/seeds/${name}.sql`, import.meta.url),'utf8'));
  const item = db.sqlite.prepare("SELECT * FROM work_item WHERE item_kind='INSTALLATION_REVIEW' AND assignee_identity_id='ir-dev-jd-review' AND status='READY'").get();
  const env = { DB: db, AI_MODE: 'real', DEV_IDENTITY_TOKENS: JSON.stringify({ test: 'jd-review-1' }) };
  const call = async (key, version=item.row_version) => {
    const response = await app.request(`http://localhost/api/admin/charging/work-items/${item.id}/analysis`, { method:'POST', headers:{ authorization:'Bearer test','content-type':'application/json','Idempotency-Key':key }, body:JSON.stringify({expectedVersion:version}) },env);
    return { status:response.status, body:await response.json() };
  };
  return { db,item,env,call };
}
test('manual analysis creates one new generation, preserves retry identity and rejects stale clicks',async()=>{
  const f=fixture();try{
    const result=await f.call('request-1');assert.equal(result.status,200);assert.equal(result.body.data.analysisGeneration,f.item.analysis_generation+1);
    assert.equal(f.db.sqlite.prepare("SELECT count(*) n FROM background_job WHERE purpose='READ_SOURCE' AND work_item_id=?").get(f.item.id).n,1);
    const replay=await f.call('request-1');assert.deepEqual(replay.body.data,result.body.data);
    assert.equal((await f.call('request-2')).status,409);
    const active=await f.call('request-3',f.item.row_version+1);assert.equal(active.body.data.status,'ALREADY_QUEUED');
    assert.equal(f.db.sqlite.prepare('SELECT analysis_generation FROM work_item WHERE id=?').get(f.item.id).analysis_generation,f.item.analysis_generation+1);
  }finally{f.db.close();}
});
test('configuration and ownership failures do not enqueue or mutate work',async()=>{
  const f=fixture();try{
    f.env.ANALYSIS_RUNTIME_ERROR='模型凭证尚未配置';assert.equal((await f.call('config')).status,503);
    delete f.env.ANALYSIS_RUNTIME_ERROR;
    f.db.sqlite.prepare("UPDATE work_item SET assignee_identity_id=NULL,responsibility_version=responsibility_version+1,row_version=row_version+1 WHERE id=?").run(f.item.id);
    assert.equal((await f.call('permission',f.item.row_version+1)).status,403);
    assert.equal(f.db.sqlite.prepare("SELECT count(*) n FROM background_job WHERE purpose='READ_SOURCE' AND work_item_id=?").get(f.item.id).n,0);
  }finally{f.db.close();}
});
