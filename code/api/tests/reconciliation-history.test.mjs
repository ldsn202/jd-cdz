import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDatabase } from './helpers/sqlite-d1.mjs';
import { loadModule } from './helpers/load-app.mjs';

const { loadSummaries } = await loadModule('../../src/services/reconciliation-summary.ts');
const { readReconciliation } = await loadModule('../../src/services/reconciliation-read.ts');
test('new matched comparison retains old open questions and cannot claim reconciliation', async () => {
  const db = createDatabase();
  try {
    // The TC seed explicitly relies on externally provisioned test identities.
    db.sqlite.exec(`INSERT INTO identity_reference VALUES ('id-jd-recon-01','TEST','test-recon','HUMAN','对账测试员',1790000000000,1790000000000);
      INSERT INTO business_permission VALUES ('bp-test-rec','ict-rec-01','grant-req-billing-verification','BUSINESS_RECONCILER',
      '["READ_WORK_ITEM","READ_BILLING_RECORD","REQUEST_BILLING_VERIFICATION"]','SERVICE_PROVIDER',NULL,NULL,'["sp-rec-a","sp-rec-b"]',1790000000000,1790000000000);
      INSERT INTO current_identity VALUES ('ict-rec-01','id-jd-recon-01','HUMAN',1790000000000,NULL,'v1','[]',1,'test-rec',1790000000000,1790000000000);`);
    for (const file of ['TC-REC-SEED', 'TC-REC-18']) {
      const sql = readFileSync(new URL(`../../../docs/06-testcase/recon/sql/${file}.sql`, import.meta.url), 'utf8');
      db.sqlite.exec(sql.split('-- ============ 数据清理')[0]);
    }
    const view = await readReconciliation(db, 'wi-rec-01', 'rr-rec-18b', 2);
    assert.equal(view.questions.length, 1);
    assert.equal(view.questions[0].reconciliationId, 'rr-rec-18a');
    assert.equal(view.questions[0].requestDecisionId, 'hd-rec-18-q');
    assert.equal(view.status, 'NEEDS_INFORMATION');
    const row = db.sqlite.prepare("SELECT * FROM work_item WHERE id='wi-rec-01'").get();
    const summary = (await loadSummaries(db,[row])).get(row.id);
    assert.equal(summary.status, 'NEEDS_INFORMATION');
    const preparing = await readReconciliation(db,'wi-rec-01',null,3);
    assert.equal(preparing.questions.length,1);
  } finally { db.close(); }
});
