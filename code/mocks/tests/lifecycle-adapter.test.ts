import test from 'node:test';
import assert from 'node:assert/strict';
import {probeApplicationLifecycle,callLifecycle} from '../control/application-lifecycle.ts';

test('HTTP 200 without a verified lifecycle contract is not readiness or provisioning', async()=>{
 const oldFetch=globalThis.fetch,oldBase=process.env.APP_LIFECYCLE_BASE_URL;
 process.env.APP_LIFECYCLE_BASE_URL='http://127.0.0.1:19999';
 globalThis.fetch=async()=>Response.json({});
 try {assert.equal((await probeApplicationLifecycle()).ready,false);assert.equal((await callLifecycle('/lifecycle/provision',{envId:'new-env'})).ok,false);}
 finally {globalThis.fetch=oldFetch;if(oldBase===undefined)delete process.env.APP_LIFECYCLE_BASE_URL;else process.env.APP_LIFECYCLE_BASE_URL=oldBase;}
});
test('adapter rejects remote lifecycle URLs before making a request',async()=>{
 const oldFetch=globalThis.fetch,oldBase=process.env.APP_LIFECYCLE_BASE_URL;let called=false;
 process.env.APP_LIFECYCLE_BASE_URL='http://example.com';globalThis.fetch=async()=>{called=true;return Response.json({});};
 try{assert.equal((await probeApplicationLifecycle()).ready,false);assert.equal(called,false);}
 finally{globalThis.fetch=oldFetch;if(oldBase===undefined)delete process.env.APP_LIFECYCLE_BASE_URL;else process.env.APP_LIFECYCLE_BASE_URL=oldBase;}
});
