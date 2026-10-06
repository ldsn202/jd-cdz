-- TC-REC-18.sql 应收修订后打开旧问题（提示已有新比较、保留草稿、问题不改挂新版）
-- 上游：reconciliation-schema.md §2/§5；数据特征：问题 qa-rec-18 挂旧比较 rr-rec-18a，当前比较已推进到 rr-rec-18b（修订后 MATCHED）
-- 前置：已执行 TC-REC-SEED.sql

-- ============ 数据准备 ============
INSERT INTO analysis_input_item (id,snapshot_id,input_key,input_kind,record_type,source_system,source_record_id,source_version,data_json,parsing_id,retrieved_at,gmt_create,gmt_modified)
SELECT 'ii-rec-18a-jd','sn-rec-18a','in-rec-18a-jd','RECORD','JD_BILL','JD-BILLING','JDBILL-YQ-2026-08','v2026-08-31','{"currency":"CNY","totalAmount":"1280.00","items":[{"billItemId":"JD-L1","name":"基础安装费","quantity":"1","unit":"项","unitPrice":"1000.00","amount":"1000.00"},{"billItemId":"JD-L2","name":"材料搬运费","quantity":"2","unit":"次","unitPrice":"140.00","amount":"280.00"}]}',NULL,1790000100000,1790000100000,1790000100000
WHERE NOT EXISTS (SELECT 1 FROM analysis_input_item WHERE id='ii-rec-18a-jd');
INSERT INTO analysis_input_item (id,snapshot_id,input_key,input_kind,record_type,source_system,source_record_id,source_version,data_json,parsing_id,retrieved_at,gmt_create,gmt_modified)
SELECT 'ii-rec-18a-pv','sn-rec-18a','in-rec-18a-pv','RECORD','PROVIDER_RECEIVABLE','PROVIDER-AR','AR-CN-2026-08-01','v2026-08-31','{"currency":"CNY","totalAmount":"1360.00","items":[{"billItemId":"PV-L1","name":"基础安装费","quantity":"1","unit":"项","unitPrice":"1000.00","amount":"1000.00"},{"billItemId":"PV-L2","name":"材料搬运费","quantity":"2","unit":"次","unitPrice":"180.00","amount":"360.00"}]}',NULL,1790000100000,1790000100000,1790000100000
WHERE NOT EXISTS (SELECT 1 FROM analysis_input_item WHERE id='ii-rec-18a-pv');
INSERT INTO analysis_input_snapshot (id,analysis_generation,work_item_id,service_provider_id,expected_work_item_version,skill,skill_version,output_schema_version,config_versions_json,required_input_state,input_issues_json,input_item_count,content_sha256,gmt_create,gmt_modified)
SELECT 'sn-rec-18a',1,'wi-rec-01','sp-rec-a',1,'RECONCILIATION_EXPLANATION','1.0.0','1.0','[]','COMPLETE','[]',2,'ffffbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',1790000100000,1790000100000
WHERE NOT EXISTS (SELECT 1 FROM analysis_input_snapshot WHERE id='sn-rec-18a');
INSERT INTO reconciliation_record (id,work_item_id,installation_work_order_id,service_provider_id,snapshot_id,execution_key,comparator_version,status,currency,tax_basis,jd_amount,provider_amount,difference_amount,selected_bills_json,groups_json,basis_inputs_json,basis_lookup_json,checks_json,open_issues_json,gmt_create,gmt_modified)
SELECT 'rr-rec-18a','wi-rec-01','wo-rec-01','sp-rec-a','sn-rec-18a','exec-rec-18a','cmp-1.0.0','DIFFERENCE','CNY','TAX_INCLUDED','1280.00','1360.00','80.00',
'[{"billingDocumentId":"bd-rec-jd-01","inputItemId":"ii-rec-18a-jd"},{"billingDocumentId":"bd-rec-pv-01","inputItemId":"ii-rec-18a-pv"}]',
'[{"groupId":"g2","status":"DIFFERENCE","mappingBasis":{"configVersion":"map-cfg-1.0","rule":"NAME_AND_SCOPE"},"jdAmount":"280.00","providerAmount":"360.00","differenceAmount":"80.00","members":[{"inputItemId":"ii-rec-18a-jd","billItemId":"JD-L2"},{"inputItemId":"ii-rec-18a-pv","billItemId":"PV-L2"}]}]',
'[]',
'{"lookupScope":"work-order:wo-rec-01","retrievedAt":1790000100000,"installationWorkOrderVersion":"v3","termListComplete":true,"approvalListComplete":true,"missingParts":[]}',
'{"source_current":true,"scope_confirmed":true,"currency_tax_confirmed":true,"items_complete":true,"mapping_confirmed":true,"total_checks_passed":true,"groups_balanced":false,"issues_resolved":false}',
'[{"issueId":"oi-rec-18-1","kind":"AMOUNT_DIFFERENCE","groupId":"g2","description":"材料搬运费相差 80.00","relatedItems":["JD-L2","PV-L2"],"requiredEvidence":[]}]',
1790000200000,1790000200000
WHERE NOT EXISTS (SELECT 1 FROM reconciliation_record WHERE id='rr-rec-18a');

-- 旧比较上的开放问题
INSERT INTO human_decision (id,work_item_id,service_provider_id,origin,action_type,request_key,actor_identity_id,identity_context_id,matched_grants_json,expected_work_item_version,expected_responsibility_version,analysis_result_id,confirmed_at,content_json,source_system,source_record_type,source_record_id,source_actor_ref_json,gmt_create,gmt_modified)
SELECT 'hd-rec-18-q','wi-rec-01','sp-rec-a','LOCAL','REQUEST_FEE_VERIFICATION','rk-rec-18-q','id-jd-recon-01','ict-rec-01','["grant-req-billing-verification"]',1,1,NULL,1790000300000,'{"reconciliationId":"rr-rec-18a","questions":[{"itemId":"q1","groupId":"g2","question":"材料搬运费 80.00 差额的计费依据是什么？","evidenceRefs":[]}]}',NULL,NULL,NULL,NULL,1790000300000,1790000300000
WHERE NOT EXISTS (SELECT 1 FROM human_decision WHERE id='hd-rec-18-q');
INSERT INTO fee_verification_action (id,human_decision_id,reconciliation_id,action_kind,question_action_id,is_closed,closed_by_kind,closed_by_id,close_basis_json,closed_at,gmt_create,gmt_modified)
SELECT 'qa-rec-18','hd-rec-18-q','rr-rec-18a','QUESTION',NULL,0,NULL,NULL,NULL,NULL,1790000310000,1790000310000
WHERE NOT EXISTS (SELECT 1 FROM fee_verification_action WHERE id='qa-rec-18');

-- 修订版应收（v2026-09-05，1280.00）与新比较 MATCHED，发布为当前比较
INSERT INTO analysis_input_item (id,snapshot_id,input_key,input_kind,record_type,source_system,source_record_id,source_version,data_json,parsing_id,retrieved_at,gmt_create,gmt_modified)
SELECT 'ii-rec-18b-jd','sn-rec-18b','in-rec-18b-jd','RECORD','JD_BILL','JD-BILLING','JDBILL-YQ-2026-08','v2026-08-31','{"currency":"CNY","totalAmount":"1280.00","items":[{"billItemId":"JD-L1","name":"基础安装费","quantity":"1","unit":"项","unitPrice":"1000.00","amount":"1000.00"},{"billItemId":"JD-L2","name":"材料搬运费","quantity":"2","unit":"次","unitPrice":"140.00","amount":"280.00"}]}',NULL,1790000400000,1790000400000,1790000400000
WHERE NOT EXISTS (SELECT 1 FROM analysis_input_item WHERE id='ii-rec-18b-jd');
INSERT INTO analysis_input_item (id,snapshot_id,input_key,input_kind,record_type,source_system,source_record_id,source_version,data_json,parsing_id,retrieved_at,gmt_create,gmt_modified)
SELECT 'ii-rec-18b-pv','sn-rec-18b','in-rec-18b-pv','RECORD','PROVIDER_RECEIVABLE','PROVIDER-AR','AR-CN-2026-08-01','v2026-09-05','{"currency":"CNY","totalAmount":"1280.00","items":[{"billItemId":"PV-L1","name":"基础安装费","quantity":"1","unit":"项","unitPrice":"1000.00","amount":"1000.00"},{"billItemId":"PV-L2","name":"材料搬运费","quantity":"2","unit":"次","unitPrice":"140.00","amount":"280.00"}]}',NULL,1790000400000,1790000400000,1790000400000
WHERE NOT EXISTS (SELECT 1 FROM analysis_input_item WHERE id='ii-rec-18b-pv');
INSERT INTO analysis_input_snapshot (id,analysis_generation,work_item_id,service_provider_id,expected_work_item_version,skill,skill_version,output_schema_version,config_versions_json,required_input_state,input_issues_json,input_item_count,content_sha256,gmt_create,gmt_modified)
SELECT 'sn-rec-18b',1,'wi-rec-01','sp-rec-a',1,'RECONCILIATION_EXPLANATION','1.0.0','1.0','[]','COMPLETE','[]',2,'aaaadddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',1790000400000,1790000400000
WHERE NOT EXISTS (SELECT 1 FROM analysis_input_snapshot WHERE id='sn-rec-18b');
INSERT INTO reconciliation_record (id,work_item_id,installation_work_order_id,service_provider_id,snapshot_id,execution_key,comparator_version,status,currency,tax_basis,jd_amount,provider_amount,difference_amount,selected_bills_json,groups_json,basis_inputs_json,basis_lookup_json,checks_json,open_issues_json,gmt_create,gmt_modified)
SELECT 'rr-rec-18b','wi-rec-01','wo-rec-01','sp-rec-a','sn-rec-18b','exec-rec-18b','cmp-1.0.0','MATCHED','CNY','TAX_INCLUDED','1280.00','1280.00','0',
'[{"billingDocumentId":"bd-rec-jd-01","inputItemId":"ii-rec-18b-jd"},{"billingDocumentId":"bd-rec-pv-01","inputItemId":"ii-rec-18b-pv"}]',
'[{"groupId":"g1","status":"MATCHED","mappingBasis":{"configVersion":"map-cfg-1.0","rule":"NAME_AND_SCOPE"},"jdAmount":"1280.00","providerAmount":"1280.00","differenceAmount":"0","members":[{"inputItemId":"ii-rec-18b-jd","billItemId":"JD-L1"},{"inputItemId":"ii-rec-18b-pv","billItemId":"PV-L1"},{"inputItemId":"ii-rec-18b-jd","billItemId":"JD-L2"},{"inputItemId":"ii-rec-18b-pv","billItemId":"PV-L2"}]}]',
'[]',
'{"lookupScope":"work-order:wo-rec-01","retrievedAt":1790000400000,"installationWorkOrderVersion":"v3","termListComplete":true,"approvalListComplete":true,"missingParts":[]}',
'{"source_current":true,"scope_confirmed":true,"currency_tax_confirmed":true,"items_complete":true,"mapping_confirmed":true,"total_checks_passed":true,"groups_balanced":true,"issues_resolved":true}',
'[]',
1790000500000,1790000500000
WHERE NOT EXISTS (SELECT 1 FROM reconciliation_record WHERE id='rr-rec-18b');
UPDATE work_item SET current_reconciliation_id='rr-rec-18b', row_version=row_version+1, gmt_modified=gmt_modified+1000 WHERE id='wi-rec-01';

-- ============ 数据清理 ============
UPDATE work_item SET current_reconciliation_id=NULL, row_version=row_version+1, gmt_modified=gmt_modified+1000 WHERE id='wi-rec-01' AND current_reconciliation_id='rr-rec-18b';
-- 历史保护表不可 DELETE；问题 qa-rec-18 始终挂旧比较 rr-rec-18a，未被改挂新版。
