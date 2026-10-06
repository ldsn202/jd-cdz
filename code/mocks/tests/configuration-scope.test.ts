import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {buildProviders} from '../generator/providers.ts';
import {buildBusinessFacts} from '../generator/business-facts.ts';
import {validateConfig} from '../generator/config.ts';
import {PROJECTORS,insertRecords} from '../generator/source-projectors/index.ts';
import {getProviderDocuments} from '../providers/documents.ts';
test('source configuration scope is generated as business fact and read verbatim; legacy absence stays unknown',()=>{
 const config=validateConfig(JSON.parse(readFileSync(new URL('../generator/configs/quick.json',import.meta.url),'utf8'))),providers=buildProviders(config),facts=buildBusinessFacts(config,providers);
 assert.ok(providers.every(p=>p.configurationPurpose==='INSTALLATION'&&p.businessScopeKey==='installation-materials'));
 const rows=PROJECTORS['provider-docs'](facts),db=new DatabaseSync(':memory:'),files=new DatabaseSync(':memory:');
 try{for(const d of [db,files])d.exec('CREATE TABLE source_record(kind TEXT,record_id TEXT,source_version TEXT,source_updated_at TEXT,payload_json TEXT)');insertRecords(db,rows);
 const p=providers[0],r=rows.find(r=>r.kind==='provider_record'&&r.payload.serviceProviderId===p.providerId)!;
 const auth={account:{accountId:'service',displayName:'service',role:'SERVICE',serviceProviderId:null,active:true},grants:[{grantId:'g',scopeProviderIds:[p.providerId]}]};
 const actual=getProviderDocuments(db,files,auth,'provider-docs',p.providerId,r.recordId).body.data as any;assert.equal(actual.sourceRecord.configurationPurpose,'INSTALLATION');assert.equal(actual.sourceRecord.businessScopeKey,'installation-materials');
 const legacy={...r.payload};delete legacy.configurationPurpose;delete legacy.businessScopeKey;db.prepare('UPDATE source_record SET payload_json=? WHERE record_id=?').run(JSON.stringify(legacy),r.recordId);
 const unknown=getProviderDocuments(db,files,auth,'provider-docs',p.providerId,r.recordId).body.data as any;assert.equal(unknown.sourceRecord.configurationPurpose,null);assert.equal(unknown.sourceRecord.businessScopeKey,null);assert.ok(unknown.missingParts.includes('CONFIGURATION_SCOPE'));
 }finally{db.close();files.close();}
});
test('clear table format describes its real original keys, while unknown-meaning scenario stays unknown',()=>{
 const config=validateConfig(JSON.parse(readFileSync(new URL('../generator/configs/standard.json',import.meta.url),'utf8'))),providers=buildProviders(config),rows=PROJECTORS['provider-docs'](buildBusinessFacts(config,providers));
 for(const provider of providers.filter(p=>p.form==='clear_table'&&p.formatCondition!=='no_spec')){const record=rows.find(r=>r.kind==='provider_record'&&r.payload.serviceProviderId===provider.providerId)!,format=rows.find(r=>r.kind==='format_spec'&&r.payload.serviceProviderId===provider.providerId)!;const fields=format.payload.fields as {fieldKey:string;meaning:string|null}[];assert.deepEqual(fields.map(f=>f.fieldKey).sort(),Object.keys(JSON.parse(record.payload.rawJson as string)).sort());if(provider.formatCondition==='meaning_unknown')assert.ok(fields.some(f=>f.meaning===null));else assert.ok(fields.every(f=>typeof f.meaning==='string'&&f.meaning.length>0));}
});
