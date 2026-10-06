import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from './helpers/sqlite-d1.mjs';
import { loadModule } from './helpers/load-app.mjs';
const { linkedProviderIds, materialVisible } = await loadModule('../../src/services/material-read.ts');
test('source material access is limited to the exact version linked to a provider',async()=>{
 const db=createDatabase();try{
  const now=Date.now();
  db.sqlite.prepare("INSERT INTO service_provider(id,source_system,source_id,gmt_create,gmt_modified) VALUES('sp','test','sp',?,?)").run(now,now);
  db.sqlite.prepare("INSERT INTO installation_work_order(id,source_system,source_id,gmt_create,gmt_modified) VALUES('wo','test','wo',?,?)").run(now,now);
  const context={sourceMaterials:[{sourceSystem:'test',sourceMaterialId:'document',sourceVersion:'v1'}]};
  db.sqlite.prepare("INSERT INTO installation_context_snapshot(id,installation_work_order_id,service_provider_id,source_work_order_version,detail_status,completeness,missing_parts_json,context_json,retrieved_at,gmt_create,gmt_modified) VALUES('ctx','wo','sp','w1','NOT_SUBMITTED','INCOMPLETE','[\"缺少计划\"]',?,?,?,?)").run(JSON.stringify(context),now,now,now);
  const row={id:'version',source_system:'test',source_material_source_id:'document',source_version:'v1'};
  const identity={grants:[{scopeType:'SERVICE_PROVIDER',resourceIds:['sp'],actions:['READ_SOURCE_MATERIAL']}]};
  assert.deepEqual(await linkedProviderIds(db,row),['sp']);
  assert.equal(await materialVisible(db,identity,row),true);
  assert.deepEqual(await linkedProviderIds(db,{...row,source_version:'v2'}),[]);
  assert.equal(await materialVisible(db,identity,{...row,source_version:'v2'}),false);
 }finally{db.close();}
});
