import test from 'node:test';import assert from 'node:assert/strict';import {createDatabase} from './helpers/sqlite-d1.mjs';import {loadModule} from './helpers/load-app.mjs';
const {Hono}=await import('hono');const {default:routes}=await loadModule('../../src/routes/work-orders.ts');
test('1000-order list uses bounded SQL calls and supports 100 scoped providers',async()=>{
 const db=createDatabase(),now=Date.now(),ids=Array.from({length:100},(_,i)=>'sp-'+i);try{
 for(const id of ids)db.sqlite.prepare('INSERT INTO service_provider(id,source_system,source_id,gmt_create,gmt_modified) VALUES(?,\'test\',?,?,?)').run(id,id,now,now);
 for(let i=0;i<1000;i++)db.sqlite.prepare('INSERT INTO installation_work_order(id,source_system,source_id,current_service_provider_id,gmt_create,gmt_modified) VALUES(?,\'test\',?,?,?,?)').run('wo-'+i,'wo-'+i,ids[i%100],now,now);
 const identity={grants:[{scopeType:'SERVICE_PROVIDER',resourceIds:ids,actions:['READ_WORK_ORDER','READ_WORK_ITEM']}]};
 let queries=0;const prepare=db.prepare.bind(db);db.prepare=sql=>{if(++queries>4)throw Error('unbounded N+1 queries');assert.ok((sql.match(/\?/g)??[]).length<=100);return prepare(sql);};
 const app=new Hono();app.use('*',async(c,next)=>{c.set('identity',identity);await next();});app.route('/api/admin/charging',routes);
 const response=await app.request('/api/admin/charging/work-orders?page=1&pageSize=20',{}, {DB:db});assert.equal(response.status,200);const json=await response.json();assert.equal(json.data.total,1000);assert.equal(json.data.list.length,20);assert.ok(queries<=4);
 }finally{db.close();}
});
