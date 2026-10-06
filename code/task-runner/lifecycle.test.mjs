import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LifecycleRegistry,validateEnvironmentId,identityBootstrapSql} from './lifecycle-state.mjs';

test('environment identities cannot select existing files or escape the managed root',()=>{
 for(const id of ['../old','/tmp/old','a','a/b','x'.repeat(33)])assert.throws(()=>validateEnvironmentId(id));
 assert.equal(validateEnvironmentId('life-20260921'),'life-20260921');
});
test('unfinished environments cannot activate or be reused; restart does not activate unfinished work',async()=>{
 const root=await mkdtemp(join(tmpdir(),'lifecycle-state-'));
 try{const registry=new LifecycleRegistry(root);await registry.load();await registry.reserve('first-env',{});assert.throws(()=>registry.assertVerified('first-env'));await assert.rejects(()=>registry.reserve('first-env',{}));await registry.update('first-env',{status:'VERIFIED'});await registry.activate('first-env');await registry.reserve('second-env',{});
 const reopened=new LifecycleRegistry(root);await reopened.load();assert.equal(reopened.state.activeEnvId,'first-env');assert.equal(reopened.get('second-env').status,'FAILED');assert.throws(()=>reopened.assertVerified('second-env'));assert.equal(reopened.get('first-env').status,'STOPPED');
 }finally{await rm(root,{recursive:true,force:true});}
});
test('bootstrap uses exact HTTP identity scope and never fabricates service permissions',()=>{
 const context={identitySource:'mock',subjectId:'svc',subjectType:'SERVICE',displayName:'Service',verifiedAt:new Date().toISOString(),validUntil:null,authorizationVersion:'v1',sourceIdentities:[],grants:[{grantId:'g',businessRole:null,actions:['READ_SOURCE_CHANGES'],scope:{scopeType:'SERVICE_PROVIDER',sourceSystem:null,recordType:null,resourceIds:['sp-a']}}]};
 const sql=identityBootstrapSql(context,'e1');assert.ok(sql.includes('sp-a'));assert.ok(!sql.includes('PREPARE_ANALYSIS'));assert.throws(()=>identityBootstrapSql({...context,subjectType:'HUMAN'},'e1'));
});
