import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {buildBusinessFacts} from '../generator/business-facts.ts';
import {buildProviders} from '../generator/providers.ts';
import {validateConfig} from '../generator/config.ts';
import {PROJECTORS} from '../generator/source-projectors/index.ts';
import {buildCurrentContext} from '../identity/current-context.ts';
import {hasAction} from '../identity/sessions.ts';
import {ROLE_ACTIONS} from '../identity/roles.ts';
for(const configName of ['quick','standard'])test(`${configName} generator SERVICE scope is exactly generated providers with no human actions`,()=>{
 const config=validateConfig(JSON.parse(readFileSync(new URL(`../generator/configs/${configName}.json`,import.meta.url),'utf8')));
 const providers=buildProviders(config);const facts=buildBusinessFacts(config,providers);
 const services=facts.accounts.filter(a=>a.role==='SERVICE');assert.equal(services.length,1);
 const service=services[0];assert.equal(service.accountId,'acc-svc-backend');assert.equal(service.serviceProviderId,null);
 assert.deepEqual(service.scopeProviderIds,providers.map(p=>p.providerId));
 const rows=PROJECTORS.identity(facts);
 const account=rows.find(r=>r.kind==='account'&&r.recordId===service.accountId)!.payload as any;
 const grant=rows.find(r=>r.kind==='grant'&&r.recordId===`grant-${service.accountId}`)!.payload as any;
 const db=new DatabaseSync(':memory:');try{
  const context=buildCurrentContext(db,account,[grant]);
  assert.equal(context.subjectType,'SERVICE');assert.equal(context.grants[0].businessRole,null);assert.deepEqual(context.sourceIdentities,[]);
  assert.deepEqual(context.grants[0].scope.resourceIds,providers.map(p=>p.providerId));
  assert.ok(context.grants[0].actions.includes('READ_SOURCE_CHANGES'));assert.ok(!context.grants[0].actions.includes('CONFIRM_INSTALLATION_DRAFT'));
  assert.equal(hasAction({account,grants:[grant]},'READ_WORK_ORDER',providers[0].providerId,ROLE_ACTIONS),true);
  assert.equal(hasAction({account,grants:[grant]},'READ_WORK_ORDER','SP-OUTSIDE-ACTUAL-SCOPE',ROLE_ACTIONS),false);
 }finally{db.close();}
});
