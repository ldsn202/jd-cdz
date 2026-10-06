import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDatabase } from './helpers/sqlite-d1.mjs';
import { loadModule } from './helpers/load-app.mjs';

const { default: app } = await loadModule('../../src/index.ts');
function fixture() {
  const db = createDatabase();
  for (const name of ['dev-identity', 'dev-work-items']) {
    db.sqlite.exec(readFileSync(new URL(`../../db/seeds/${name}.sql`, import.meta.url), 'utf8'));
  }
  const env = { DB: db, DEV_IDENTITY_TOKENS: JSON.stringify({ test: 'jd-review-1' }) };
  const get = async path => (await app.request(`http://localhost/api/admin/charging${path}`, {
    headers: { authorization: 'Bearer test' },
  }, env)).json();
  return { db, get };
}

test('overview status groups filter before pagination and agree with summary', async () => {
  const { db, get } = fixture();
  try {
    for (const [status, expected] of [['READY', 1], ['WAITING_SUPPLEMENT,WAITING_REPLY', 0], ['PREPARING,PROCESSING', 0], ['EXCEPTION,BLOCKED', 2]]) {
      const query = `responsibility=MINE&status=${encodeURIComponent(status)}`;
      const list = await get(`/work-items?${query}&pageSize=1`);
      const summary = await get(`/work-items/summary?${query}`);
      assert.equal(list.code, 0);
      assert.equal(summary.code, 0);
      assert.equal(list.data.total, expected);
      assert.equal(summary.data.total, expected);
      assert.ok(list.data.list.every(row => status.split(',').includes(row.status)));
    }
    const page2 = await get('/work-items?status=EXCEPTION,BLOCKED&page=2&pageSize=1');
    assert.equal(page2.data.total, 2);
    assert.deepEqual(page2.data.list.map(row => row.workItemId), ['w-dev-3']);
    const duplicate = await get('/work-items?status=BLOCKED,BLOCKED');
    assert.equal(duplicate.data.total, 1);
  } finally { db.close(); }
});

test('multi-status filtering keeps provider authorization and responsibility restrictions', async () => {
  const { db, get } = fixture();
  try {
    const hidden = await get('/work-items?responsibility=VISIBLE&status=PREPARING,READY&providerId=provider-dev-b');
    assert.equal(hidden.data.total, 0);
    db.sqlite.prepare("UPDATE work_item SET assignee_identity_id='ir-dev-provider-clerk',responsibility_version=responsibility_version+1,row_version=row_version+1 WHERE id='w-dev-4'").run();
    assert.equal((await get('/work-items?responsibility=MINE&status=EXCEPTION,BLOCKED')).data.total, 1);
    assert.equal((await get('/work-items?responsibility=VISIBLE&status=EXCEPTION,BLOCKED')).data.total, 2);
  } finally { db.close(); }
});

test('unknown or empty members in multi-status filters are rejected for lists and summaries', async () => {
  const { db, get } = fixture();
  try {
    for (const status of ['READY,UNKNOWN', 'READY,', ',BLOCKED', "READY') OR 1=1 --"]) {
      for (const endpoint of ['/work-items', '/work-items/summary']) {
        const result = await get(`${endpoint}?status=${encodeURIComponent(status)}`);
        assert.notEqual(result.code, 0);
        assert.match(result.msg, /status/);
      }
    }
  } finally { db.close(); }
});

test('ready review exposes authorized exception action without granting unrelated actions', async () => {
  const { db, get } = fixture();
  try {
    const item = db.sqlite.prepare("SELECT id FROM work_item WHERE item_kind='INSTALLATION_REVIEW' AND assignee_identity_id='ir-dev-jd-review' AND status='READY'").get();
    assert.ok(item);
    const result = await get(`/work-items/${item.id}`);
    assert.equal(result.code, 0);
    assert.ok(result.data.allowedActions.includes('RECORD_EXCEPTION_RESULT'));
    assert.ok(!result.data.allowedActions.includes('SUBMIT_INSTALLATION_DETAIL'));
  } finally { db.close(); }
});

test('pending operation disables new decisions and returns original operation entry', async () => {
  const { db, get } = fixture();
  try {
    const item = db.sqlite.prepare("SELECT id FROM work_item WHERE assignee_identity_id='ir-dev-jd-review' AND status='READY'").get();
    // The row state is used here to test the read policy, without inventing an external terminal result.
    db.sqlite.prepare("UPDATE work_item SET status='PROCESSING',row_version=row_version+1,gmt_modified=? WHERE id=?").run(Date.now(), item.id);
    const result = await get(`/work-items/${item.id}`);
    assert.deepEqual(result.data.allowedActions, []);
  } finally { db.close(); }
});

test('analysis exposes exact material versions for evidence links', async () => {
  const db = createDatabase();
  try {
    db.sqlite.exec(readFileSync(new URL('../../../docs/06-testcase/install/sql/TC-INS-SEED.sql', import.meta.url), 'utf8'));
    const result = await (await app.request('http://localhost/api/admin/charging/work-items/wi-tc-ins-prep-1', {
      headers: { authorization: 'Bearer test' },
    }, { DB: db, DEV_IDENTITY_TOKENS: JSON.stringify({ test: 'tc-ins-clerk-1' }) })).json();
    assert.equal(result.code, 0);
    assert.equal(result.data.analysis.evidenceMaterials.length, 2);
    assert.ok(result.data.analysis.evidenceMaterials.every(x => x.inputId && x.materialVersionId));
    assert.ok(Array.isArray(result.data.analysis.contextRecords));
  } finally { db.close(); }
});

test('draft read exposes persisted authorship instead of making UI guess AI versus human',async()=>{
 const db=createDatabase();try{
 db.sqlite.exec(readFileSync(new URL('../../../docs/06-testcase/install/sql/TC-INS-SEED.sql',import.meta.url),'utf8'));
 const response=await app.request('http://localhost/api/admin/charging/work-items/wi-tc-ins-prep-1/installation-draft',{headers:{authorization:'Bearer clerk'}},{DB:db,DEV_IDENTITY_TOKENS:JSON.stringify({clerk:'tc-ins-clerk-1'})});
 const body=await response.json();assert.equal(body.code,0);assert.equal(body.data.origin,'AI');assert.equal(body.data.editorIdentityId,null);
 }finally{db.close();}
});
