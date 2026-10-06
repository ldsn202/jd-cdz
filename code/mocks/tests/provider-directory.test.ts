import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { ensureProviderDirectory, getServiceProviders } from '../installation/providers.ts';
import { buildBusinessFacts } from '../generator/business-facts.ts';
import { buildProviders } from '../generator/providers.ts';
import { validateConfig } from '../generator/config.ts';
import { PROJECTORS, insertRecords } from '../generator/source-projectors/index.ts';

function database(){
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE source_record(kind TEXT,record_id TEXT,source_version TEXT,source_updated_at TEXT,payload_json TEXT,PRIMARY KEY(kind,record_id))');
 return db;
}
test('new source generation includes exact provider names from business facts',()=>{
 const config=validateConfig(JSON.parse(readFileSync(new URL('../generator/configs/quick.json',import.meta.url),'utf8')));
 const facts=buildBusinessFacts(config,buildProviders(config));
 const providers=PROJECTORS['installation-admin'](facts).filter(p=>p.kind==='service_provider');
 assert.deepEqual(providers.map(p=>[p.recordId,p.payload.displayName]),facts.providers.map(p=>[p.providerId,p.displayName]));
});
test('legacy directory repair is repeatable and never overwrites company master data',()=>{
 const db=database(),idb=database();try{
  insertRecords(idb,[{kind:'account',recordId:'acc-sp-001',sourceVersion:'a1',sourceUpdatedAt:'2026-09-01',payload:{accountId:'acc-sp-001',serviceProviderId:'SP-001',displayName:'安达充电桩安装（001）资料账号'}}]);
  ensureProviderDirectory(db,idb);
  assert.equal(JSON.parse((db.prepare('SELECT payload_json FROM source_record').get() as any).payload_json).displayName,'安达充电桩安装（001）');
  db.prepare("UPDATE source_record SET payload_json=?,source_version='provider-2'").run(JSON.stringify({serviceProviderId:'SP-001',displayName:'已修订公司名'}));
  ensureProviderDirectory(db,idb);
  assert.equal((db.prepare('SELECT count(*) n FROM source_record').get() as any).n,1);
  assert.equal(JSON.parse((db.prepare('SELECT payload_json FROM source_record').get() as any).payload_json).displayName,'已修订公司名');
 }finally{db.close();idb.close();}
});
test('provider directory filters each company before paginating',()=>{
 const db=database();try{
  insertRecords(db,['SP-001','SP-002'].map(id=>({kind:'service_provider',recordId:id,sourceVersion:'provider-1',sourceUpdatedAt:'2026-09-01',payload:{serviceProviderId:id,displayName:id+'公司'}})));
  const auth={account:{accountId:'acc-sp-001',displayName:'服务商',role:'PROVIDER_BUSINESS',serviceProviderId:'SP-001',active:true},grants:[{grantId:'g1',scopeProviderIds:['SP-001']}]};
  const r=getServiceProviders(db,auth,'1','1');const data=r.body.data as any;
  assert.equal(r.http,200);assert.equal(data.total,1);assert.equal(data.list[0].serviceProviderId,'SP-001');
  assert.equal(getServiceProviders(db,auth,'0','50').http,400);
 }finally{db.close();}
});
