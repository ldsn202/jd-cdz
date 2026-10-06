-- TC-REC-08.sql 跨服务商越权被拒（城南应收负责人操作远程机电事项 wi-rec-02）
-- 上游：reconciliation-schema.md §2/§5；数据特征：wi-rec-02 属于 sp-rec-b（远程机电），有当前比较 rr-rec-08 与开放问题 qa-rec-08
-- 前置：已执行 TC-REC-SEED.sql

-- ============ 数据准备 ============
INSERT INTO analysis_input_item (id,snapshot_id,input_key,input_kind,record_type,source_system,source_record_id,source_version,data_json,parsing_id,retrieved_at,gmt_create,gmt_modified)
SELECT 'ii-rec-08-jd','sn-rec-08','in-rec-08-jd','RECORD','JD_BILL','JD-BILLING','JDBILL-JP-2026-08','v2026-08-31','{"currency":"CNY","totalAmount":"980.00","items":[{"billItemId":"JD-L1","name":"基础安装费","quantity":"1","unit":"项","unitPrice":"980.00","amount":"980.00"}]}',NULL,1790000100000,1790000100000,1790000100000
WHERE NOT EXISTS (SELECT 1 FROM analysis_input_item WHERE id='ii-rec-08-jd');
INSERT INTO analysis_input_item (id,snapshot_id,input_key,input_kind,record_type,source_system,source_record_id,source_version,data_json,parsing_id,retrieved_at,gmt_create,gmt_modified)
SELECT 'ii-rec-08-pv','sn-rec-08','in-rec-08-pv','RECORD','PROVIDER_RECEIVABLE','PROVIDER-AR','AR-YC-2026-08-01','v2026-08-31','{"currency":"CNY","totalAmount":"1030.00","items":[{"billItemId":"PV-L1","name":"基础安装费","quantity":"1","unit":"项","unitPrice":"1030.00","amount":"1030.00"}]}',NULL,1790000100000,1790000100000,1790000100000
WHERE NOT EXISTS (SELECT 1 FROM analysis_input_item WHERE id='ii-rec-08-pv');
INSERT INTO analysis_input_snapshot (id,analysis_generation,work_item_id,service_provider_id,expected_work_item_version,skill,skill_version,output_schema_version,config_versions_json,required_input_state,input_issues_json,input_item_count,content_sha256,gmt_create,gmt_modified)
SELECT 'sn-rec-08',1,'wi-rec-02','sp-rec-b',1,'RECONCILIATION_EXPLANATION','1.0.0','1.0','[]','COMPLETE','[]',2,'ccccdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',1790000100000,1790000100000
WHERE NOT EXISTS (SELECT 1 FROM analysis_input_snapshot WHERE id='sn-rec-08');
INSERT INTO reconciliation_record (id,work_item_id,installation_work_order_id,service_provider_id,snapshot_id,execution_key,comparator_version,status,currency,tax_basis,jd_amount,provider_amount,difference_amount,selected_bills_json,groups_json,basis_inputs_json,basis_lookup_json,checks_json,open_issues_json,gmt_create,gmt_modified)
SELECT 'rr-rec-08','wi-rec-02','wo-rec-02','sp-rec-b','sn-rec-08','exec-rec-08','cmp-1.0.0','DIFFERENCE','CNY','TAX_INCLUDED','980.00','1030.00','50.00',
'[{"billingDocumentId":"bd-rec-jd-02","inputItemId":"ii-rec-08-jd"},{"billingDocumentId":"bd-rec-pv-02","inputItemId":"ii-rec-08-pv"}]',
'[{"groupId":"g1","status":"DIFFERENCE","mappingBasis":{"configVersion":"map-cfg-1.0","rule":"NAME_AND_SCOPE"},"jdAmount":"980.00","providerAmount":"1030.00","differenceAmount":"50.00","members":[{"inputItemId":"ii-rec-08-jd","billItemId":"JD-L1"},{"inputItemId":"ii-rec-08-pv","billItemId":"PV-L1"}]}]',
'[]',
'{"lookupScope":"work-order:wo-rec-02","retrievedAt":1790000100000,"installationWorkOrderVersion":"v2","termListComplete":true,"approvalListComplete":true,"missingParts":[]}',
'{"source_current":true,"scope_confirmed":true,"currency_tax_confirmed":true,"items_complete":true,"mapping_confirmed":true,"total_checks_passed":true,"groups_balanced":false,"issues_resolved":false}',
'[{"issueId":"oi-rec-08-1","kind":"AMOUNT_DIFFERENCE","groupId":"g1","description":"基础安装费相差 50.00","relatedItems":["JD-L1","PV-L1"],"requiredEvidence":[]}]',
1790000200000,1790000200000
WHERE NOT EXISTS (SELECT 1 FROM reconciliation_record WHERE id='rr-rec-08');

INSERT INTO human_decision (id,work_item_id,service_provider_id,origin,action_type,request_key,actor_identity_id,identity_context_id,matched_grants_json,expected_work_item_version,expected_responsibility_version,analysis_result_id,confirmed_at,content_json,source_system,source_record_type,source_record_id,source_actor_ref_json,gmt_create,gmt_modified)
SELECT 'hd-rec-08-q','wi-rec-02','sp-rec-b','LOCAL','REQUEST_FEE_VERIFICATION','rk-rec-08-q','id-jd-recon-01','ict-rec-01','["grant-req-billing-verification"]',1,1,NULL,1790000300000,'{"reconciliationId":"rr-rec-08","questions":[{"itemId":"q1","groupId":"g1","question":"基础安装费 50.00 差额的计费依据是什么？","evidenceRefs":[]}]}',NULL,NULL,NULL,NULL,1790000300000,1790000300000
WHERE NOT EXISTS (SELECT 1 FROM human_decision WHERE id='hd-rec-08-q');
INSERT INTO fee_verification_action (id,human_decision_id,reconciliation_id,action_kind,question_action_id,is_closed,closed_by_kind,closed_by_id,close_basis_json,closed_at,gmt_create,gmt_modified)
SELECT 'qa-rec-08','hd-rec-08-q','rr-rec-08','QUESTION',NULL,0,NULL,NULL,NULL,NULL,1790000310000,1790000310000
WHERE NOT EXISTS (SELECT 1 FROM fee_verification_action WHERE id='qa-rec-08');
UPDATE work_item SET current_reconciliation_id='rr-rec-08', row_version=row_version+1, gmt_modified=gmt_modified+1000 WHERE id='wi-rec-02';

-- ============ 数据清理 ============
UPDATE work_item SET current_reconciliation_id=NULL, row_version=row_version+1, gmt_modified=gmt_modified+1000 WHERE id='wi-rec-02' AND current_reconciliation_id='rr-rec-08';
-- 历史保护表不可 DELETE，rr-rec-08 命名空间数据保留，整库还原重建测试库。
