-- TC-REC-15.sql 核实往来留痕（一次提问、两次回复、一次事实登记，保留各自所见比较版本）
-- 上游：reconciliation-schema.md §2/§5；数据特征：问题挂旧比较 rr-rec-15a，回复2/事实见新比较 rr-rec-15b，问题被事实关闭
-- 前置：已执行 TC-REC-SEED.sql

-- ============ 数据准备 ============
INSERT INTO analysis_input_item (id,snapshot_id,input_key,input_kind,record_type,source_system,source_record_id,source_version,data_json,parsing_id,retrieved_at,gmt_create,gmt_modified)
SELECT 'ii-rec-15-jd','sn-rec-15','in-rec-15-jd','RECORD','JD_BILL','JD-BILLING','JDBILL-YQ-2026-08','v2026-08-31','{"currency":"CNY","totalAmount":"1280.00","items":[{"billItemId":"JD-L1","name":"基础安装费","quantity":"1","unit":"项","unitPrice":"1000.00","amount":"1000.00"},{"billItemId":"JD-L2","name":"材料搬运费","quantity":"2","unit":"次","unitPrice":"140.00","amount":"280.00"}]}',NULL,1790000100000,1790000100000,1790000100000
WHERE NOT EXISTS (SELECT 1 FROM analysis_input_item WHERE id='ii-rec-15-jd');
INSERT INTO analysis_input_item (id,snapshot_id,input_key,input_kind,record_type,source_system,source_record_id,source_version,data_json,parsing_id,retrieved_at,gmt_create,gmt_modified)
SELECT 'ii-rec-15-pv','sn-rec-15','in-rec-15-pv','RECORD','PROVIDER_RECEIVABLE','PROVIDER-AR','AR-CN-2026-08-01','v2026-08-31','{"currency":"CNY","totalAmount":"1360.00","items":[{"billItemId":"PV-L1","name":"基础安装费","quantity":"1","unit":"项","unitPrice":"1000.00","amount":"1000.00"},{"billItemId":"PV-L2","name":"材料搬运费","quantity":"2","unit":"次","unitPrice":"180.00","amount":"360.00"}]}',NULL,1790000100000,1790000100000,1790000100000
WHERE NOT EXISTS (SELECT 1 FROM analysis_input_item WHERE id='ii-rec-15-pv');

INSERT INTO analysis_input_snapshot (id,analysis_generation,work_item_id,service_provider_id,expected_work_item_version,skill,skill_version,output_schema_version,config_versions_json,required_input_state,input_issues_json,input_item_count,content_sha256,gmt_create,gmt_modified)
SELECT 'sn-rec-15',1,'wi-rec-01','sp-rec-a',1,'RECONCILIATION_EXPLANATION','1.0.0','1.0','[]','COMPLETE','[]',2,'cccceeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',1790000100000,1790000100000
WHERE NOT EXISTS (SELECT 1 FROM analysis_input_snapshot WHERE id='sn-rec-15');

-- 旧比较 rr-rec-15a（提问时所见）
INSERT INTO reconciliation_record (id,work_item_id,installation_work_order_id,service_provider_id,snapshot_id,execution_key,comparator_version,status,currency,tax_basis,jd_amount,provider_amount,difference_amount,selected_bills_json,groups_json,basis_inputs_json,basis_lookup_json,checks_json,open_issues_json,gmt_create,gmt_modified)
SELECT 'rr-rec-15a','wi-rec-01','wo-rec-01','sp-rec-a','sn-rec-15','exec-rec-15a','cmp-1.0.0','DIFFERENCE','CNY','TAX_INCLUDED','1280.00','1360.00','80.00',
'[{"billingDocumentId":"bd-rec-jd-01","inputItemId":"ii-rec-15-jd"},{"billingDocumentId":"bd-rec-pv-01","inputItemId":"ii-rec-15-pv"}]',
'[{"groupId":"g2","status":"DIFFERENCE","mappingBasis":{"configVersion":"map-cfg-1.0","rule":"NAME_AND_SCOPE"},"jdAmount":"280.00","providerAmount":"360.00","differenceAmount":"80.00","members":[{"inputItemId":"ii-rec-15-jd","billItemId":"JD-L2"},{"inputItemId":"ii-rec-15-pv","billItemId":"PV-L2"}]}]',
'[]',
'{"lookupScope":"work-order:wo-rec-01","retrievedAt":1790000100000,"installationWorkOrderVersion":"v3","termListComplete":true,"approvalListComplete":true,"missingParts":[]}',
'{"source_current":true,"scope_confirmed":true,"currency_tax_confirmed":true,"items_complete":true,"mapping_confirmed":true,"total_checks_passed":true,"groups_balanced":false,"issues_resolved":false}',
'[{"issueId":"oi-rec-15-1","kind":"AMOUNT_DIFFERENCE","groupId":"g2","description":"材料搬运费相差 80.00","relatedItems":["JD-L2","PV-L2"],"requiredEvidence":[]}]',
1790000150000,1790000150000
WHERE NOT EXISTS (SELECT 1 FROM reconciliation_record WHERE id='rr-rec-15a');
-- 新比较 rr-rec-15b（第二次回复与事实登记时所见，当前有效）
INSERT INTO reconciliation_record (id,work_item_id,installation_work_order_id,service_provider_id,snapshot_id,execution_key,comparator_version,status,currency,tax_basis,jd_amount,provider_amount,difference_amount,selected_bills_json,groups_json,basis_inputs_json,basis_lookup_json,checks_json,open_issues_json,gmt_create,gmt_modified)
SELECT 'rr-rec-15b','wi-rec-01','wo-rec-01','sp-rec-a','sn-rec-15','exec-rec-15b','cmp-1.0.0','DIFFERENCE','CNY','TAX_INCLUDED','1280.00','1360.00','80.00',
'[{"billingDocumentId":"bd-rec-jd-01","inputItemId":"ii-rec-15-jd"},{"billingDocumentId":"bd-rec-pv-01","inputItemId":"ii-rec-15-pv"}]',
'[{"groupId":"g2","status":"DIFFERENCE","mappingBasis":{"configVersion":"map-cfg-1.0","rule":"NAME_AND_SCOPE"},"jdAmount":"280.00","providerAmount":"360.00","differenceAmount":"80.00","members":[{"inputItemId":"ii-rec-15-jd","billItemId":"JD-L2"},{"inputItemId":"ii-rec-15-pv","billItemId":"PV-L2"}]}]',
'[]',
'{"lookupScope":"work-order:wo-rec-01","retrievedAt":1790000200000,"installationWorkOrderVersion":"v3","termListComplete":true,"approvalListComplete":true,"missingParts":[]}',
'{"source_current":true,"scope_confirmed":true,"currency_tax_confirmed":true,"items_complete":true,"mapping_confirmed":true,"total_checks_passed":true,"groups_balanced":false,"issues_resolved":false}',
'[{"issueId":"oi-rec-15-1","kind":"AMOUNT_DIFFERENCE","groupId":"g2","description":"材料搬运费相差 80.00","relatedItems":["JD-L2","PV-L2"],"requiredEvidence":[]}]',
1790000200000,1790000200000
WHERE NOT EXISTS (SELECT 1 FROM reconciliation_record WHERE id='rr-rec-15b');

-- 提问（见 rr-rec-15a）
INSERT INTO human_decision (id,work_item_id,service_provider_id,origin,action_type,request_key,actor_identity_id,identity_context_id,matched_grants_json,expected_work_item_version,expected_responsibility_version,analysis_result_id,confirmed_at,content_json,source_system,source_record_type,source_record_id,source_actor_ref_json,gmt_create,gmt_modified)
SELECT 'hd-rec-15-q','wi-rec-01','sp-rec-a','LOCAL','REQUEST_FEE_VERIFICATION','rk-rec-15-q','id-jd-recon-01','ict-rec-01','["grant-req-billing-verification"]',1,1,NULL,1790000210000,'{"reconciliationId":"rr-rec-15a","questions":[{"itemId":"q1","groupId":"g2","question":"材料搬运费 80.00 差额的计费依据是什么？","evidenceRefs":["fbr-rec-term-01"]}]}',NULL,NULL,NULL,NULL,1790000210000,1790000210000
WHERE NOT EXISTS (SELECT 1 FROM human_decision WHERE id='hd-rec-15-q');
INSERT INTO fee_verification_action (id,human_decision_id,reconciliation_id,action_kind,question_action_id,is_closed,closed_by_kind,closed_by_id,close_basis_json,closed_at,gmt_create,gmt_modified)
SELECT 'qa-rec-15','hd-rec-15-q','rr-rec-15a','QUESTION',NULL,0,NULL,NULL,NULL,NULL,1790000220000,1790000220000
WHERE NOT EXISTS (SELECT 1 FROM fee_verification_action WHERE id='qa-rec-15');
-- 第一次回复（见 rr-rec-15a）
INSERT INTO human_decision (id,work_item_id,service_provider_id,origin,action_type,request_key,actor_identity_id,identity_context_id,matched_grants_json,expected_work_item_version,expected_responsibility_version,analysis_result_id,confirmed_at,content_json,source_system,source_record_type,source_record_id,source_actor_ref_json,gmt_create,gmt_modified)
SELECT 'hd-rec-15-r1','wi-rec-01','sp-rec-a','LOCAL','REPLY_FEE_VERIFICATION','rk-rec-15-r1','id-pv-recon-01','ict-rec-02','["grant-reply-billing-verification"]',1,1,NULL,1790000300000,'{"requestDecisionId":"hd-rec-15-q","replyText":"搬运超出 30 米，按次另计 180.00，稍后补里程依据。","materialVersionIds":[]}',NULL,NULL,NULL,NULL,1790000300000,1790000300000
WHERE NOT EXISTS (SELECT 1 FROM human_decision WHERE id='hd-rec-15-r1');
INSERT INTO fee_verification_action (id,human_decision_id,reconciliation_id,action_kind,question_action_id,is_closed,closed_by_kind,closed_by_id,close_basis_json,closed_at,gmt_create,gmt_modified)
SELECT 'ra-rec-15-r1','hd-rec-15-r1','rr-rec-15a','REPLY','qa-rec-15',0,NULL,NULL,NULL,NULL,1790000310000,1790000310000
WHERE NOT EXISTS (SELECT 1 FROM fee_verification_action WHERE id='ra-rec-15-r1');
-- 第二次回复（见 rr-rec-15b）
INSERT INTO human_decision (id,work_item_id,service_provider_id,origin,action_type,request_key,actor_identity_id,identity_context_id,matched_grants_json,expected_work_item_version,expected_responsibility_version,analysis_result_id,confirmed_at,content_json,source_system,source_record_type,source_record_id,source_actor_ref_json,gmt_create,gmt_modified)
SELECT 'hd-rec-15-r2','wi-rec-01','sp-rec-a','LOCAL','REPLY_FEE_VERIFICATION','rk-rec-15-r2','id-pv-recon-01','ict-rec-02','["grant-reply-billing-verification"]',1,1,NULL,1790000400000,'{"requestDecisionId":"hd-rec-15-q","replyText":"补充里程单 45 公里，已在原系统准备修订应收。","materialVersionIds":["mv-rec-15-01"]}',NULL,NULL,NULL,NULL,1790000400000,1790000400000
WHERE NOT EXISTS (SELECT 1 FROM human_decision WHERE id='hd-rec-15-r2');
INSERT INTO fee_verification_action (id,human_decision_id,reconciliation_id,action_kind,question_action_id,is_closed,closed_by_kind,closed_by_id,close_basis_json,closed_at,gmt_create,gmt_modified)
SELECT 'ra-rec-15-r2','hd-rec-15-r2','rr-rec-15b','REPLY','qa-rec-15',0,NULL,NULL,NULL,NULL,1790000410000,1790000410000
WHERE NOT EXISTS (SELECT 1 FROM fee_verification_action WHERE id='ra-rec-15-r2');
-- 事实登记（见 rr-rec-15b，针对 qa-rec-15）
INSERT INTO human_decision (id,work_item_id,service_provider_id,origin,action_type,request_key,actor_identity_id,identity_context_id,matched_grants_json,expected_work_item_version,expected_responsibility_version,analysis_result_id,confirmed_at,content_json,source_system,source_record_type,source_record_id,source_actor_ref_json,gmt_create,gmt_modified)
SELECT 'hd-rec-15-f','wi-rec-01','sp-rec-a','LOCAL','RECORD_FEE_FACTS','rk-rec-15-f','id-jd-recon-01','ict-rec-01','["grant-req-billing-verification"]',1,1,NULL,1790000500000,'{"reconciliationId":"rr-rec-15b","facts":[{"groupId":"g2","description":"条款确认基础安装含 30 米内搬运，超出部分按批准记录 APR-YQ-001 仅批准 280.00","evidenceRefs":["fbr-rec-term-01","fbr-rec-appr-01"]}],"questionActionId":"qa-rec-15"}',NULL,NULL,NULL,NULL,1790000500000,1790000500000
WHERE NOT EXISTS (SELECT 1 FROM human_decision WHERE id='hd-rec-15-f');
INSERT INTO fee_verification_action (id,human_decision_id,reconciliation_id,action_kind,question_action_id,is_closed,closed_by_kind,closed_by_id,close_basis_json,closed_at,gmt_create,gmt_modified)
SELECT 'fa-rec-15-f','hd-rec-15-f','rr-rec-15b','FACT','qa-rec-15',0,NULL,NULL,NULL,NULL,1790000510000,1790000510000
WHERE NOT EXISTS (SELECT 1 FROM fee_verification_action WHERE id='fa-rec-15-f');
-- 按事实关闭问题组（schema §5 允许 QUESTION 一次补写关闭依据）
UPDATE fee_verification_action SET is_closed=1, closed_by_kind='HUMAN_FACT', closed_by_id='fa-rec-15-f',
close_basis_json='{"factActionId":"fa-rec-15-f","summary":"搬运费范围与批准金额已由条款与批准记录核实"}',
closed_at=1790000600000, gmt_modified=1790000600000
WHERE id='qa-rec-15' AND is_closed=0;
UPDATE work_item SET current_reconciliation_id='rr-rec-15b', row_version=row_version+1, gmt_modified=gmt_modified+1000 WHERE id='wi-rec-01';

-- ============ 数据清理 ============
UPDATE work_item SET current_reconciliation_id=NULL, row_version=row_version+1, gmt_modified=gmt_modified+1000 WHERE id='wi-rec-01' AND current_reconciliation_id='rr-rec-15b';
-- 历史保护表（含问题/回复/事实/关闭依据）不可 DELETE，rr-rec-15 命名空间数据保留，整库还原重建测试库。
