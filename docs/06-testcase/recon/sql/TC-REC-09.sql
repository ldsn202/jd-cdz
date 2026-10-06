-- TC-REC-09.sql 幂等与版本保护（同键同内容 / 同键不同内容 / 旧 reconciliationId）
-- 上游：reconciliation-schema.md §2；数据特征：当前比较 rr-rec-09（DIFFERENCE）+ 历史旧比较 rr-rec-09-old
-- 前置：已执行 TC-REC-SEED.sql

-- ============ 数据准备 ============
INSERT INTO analysis_input_item (id,snapshot_id,input_key,input_kind,record_type,source_system,source_record_id,source_version,data_json,parsing_id,retrieved_at,gmt_create,gmt_modified)
SELECT 'ii-rec-09-jd','sn-rec-09','in-rec-09-jd','RECORD','JD_BILL','JD-BILLING','JDBILL-YQ-2026-08','v2026-08-31','{"currency":"CNY","totalAmount":"1280.00","items":[{"billItemId":"JD-L1","name":"基础安装费","quantity":"1","unit":"项","unitPrice":"1000.00","amount":"1000.00"},{"billItemId":"JD-L2","name":"材料搬运费","quantity":"2","unit":"次","unitPrice":"140.00","amount":"280.00"}]}',NULL,1790000100000,1790000100000,1790000100000
WHERE NOT EXISTS (SELECT 1 FROM analysis_input_item WHERE id='ii-rec-09-jd');
INSERT INTO analysis_input_item (id,snapshot_id,input_key,input_kind,record_type,source_system,source_record_id,source_version,data_json,parsing_id,retrieved_at,gmt_create,gmt_modified)
SELECT 'ii-rec-09-pv','sn-rec-09','in-rec-09-pv','RECORD','PROVIDER_RECEIVABLE','PROVIDER-AR','AR-CN-2026-08-01','v2026-08-31','{"currency":"CNY","totalAmount":"1360.00","items":[{"billItemId":"PV-L1","name":"基础安装费","quantity":"1","unit":"项","unitPrice":"1000.00","amount":"1000.00"},{"billItemId":"PV-L2","name":"材料搬运费","quantity":"2","unit":"次","unitPrice":"180.00","amount":"360.00"}]}',NULL,1790000100000,1790000100000,1790000100000
WHERE NOT EXISTS (SELECT 1 FROM analysis_input_item WHERE id='ii-rec-09-pv');

INSERT INTO analysis_input_snapshot (id,analysis_generation,work_item_id,service_provider_id,expected_work_item_version,skill,skill_version,output_schema_version,config_versions_json,required_input_state,input_issues_json,input_item_count,content_sha256,gmt_create,gmt_modified)
SELECT 'sn-rec-09',1,'wi-rec-01','sp-rec-a',1,'RECONCILIATION_EXPLANATION','1.0.0','1.0','[]','COMPLETE','[]',2,'ddddeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',1790000100000,1790000100000
WHERE NOT EXISTS (SELECT 1 FROM analysis_input_snapshot WHERE id='sn-rec-09');

-- 历史旧比较（较早已失效，不发布）
INSERT INTO reconciliation_record (id,work_item_id,installation_work_order_id,service_provider_id,snapshot_id,execution_key,comparator_version,status,currency,tax_basis,jd_amount,provider_amount,difference_amount,selected_bills_json,groups_json,basis_inputs_json,basis_lookup_json,checks_json,open_issues_json,gmt_create,gmt_modified)
SELECT 'rr-rec-09-old','wi-rec-01','wo-rec-01','sp-rec-a','sn-rec-09','exec-rec-09-old','cmp-1.0.0','DIFFERENCE','CNY','TAX_INCLUDED','1280.00','1380.00','100.00',
'[{"billingDocumentId":"bd-rec-jd-01","inputItemId":"ii-rec-09-jd"},{"billingDocumentId":"bd-rec-pv-01","inputItemId":"ii-rec-09-pv"}]',
'[{"groupId":"g1","status":"DIFFERENCE","mappingBasis":{"configVersion":"map-cfg-1.0","rule":"NAME_AND_SCOPE"},"jdAmount":"1280.00","providerAmount":"1380.00","differenceAmount":"100.00","members":[{"inputItemId":"ii-rec-09-jd","billItemId":"JD-L1"},{"inputItemId":"ii-rec-09-pv","billItemId":"PV-L1"}]}]',
'[]',
'{"lookupScope":"work-order:wo-rec-01","retrievedAt":1790000100000,"installationWorkOrderVersion":"v3","termListComplete":true,"approvalListComplete":true,"missingParts":[]}',
'{"source_current":false,"scope_confirmed":true,"currency_tax_confirmed":true,"items_complete":true,"mapping_confirmed":true,"total_checks_passed":true,"groups_balanced":false,"issues_resolved":false}',
'[{"issueId":"oi-rec-09-old","kind":"AMOUNT_DIFFERENCE","groupId":"g1","description":"旧比较差额 100.00","relatedItems":[],"requiredEvidence":[]}]',
1790000150000,1790000150000
WHERE NOT EXISTS (SELECT 1 FROM reconciliation_record WHERE id='rr-rec-09-old');

-- 当前比较
INSERT INTO reconciliation_record (id,work_item_id,installation_work_order_id,service_provider_id,snapshot_id,execution_key,comparator_version,status,currency,tax_basis,jd_amount,provider_amount,difference_amount,selected_bills_json,groups_json,basis_inputs_json,basis_lookup_json,checks_json,open_issues_json,gmt_create,gmt_modified)
SELECT 'rr-rec-09','wi-rec-01','wo-rec-01','sp-rec-a','sn-rec-09','exec-rec-09','cmp-1.0.0','DIFFERENCE','CNY','TAX_INCLUDED','1280.00','1360.00','80.00',
'[{"billingDocumentId":"bd-rec-jd-01","inputItemId":"ii-rec-09-jd"},{"billingDocumentId":"bd-rec-pv-01","inputItemId":"ii-rec-09-pv"}]',
'[{"groupId":"g1","status":"MATCHED","mappingBasis":{"configVersion":"map-cfg-1.0","rule":"NAME_AND_SCOPE"},"jdAmount":"1000.00","providerAmount":"1000.00","differenceAmount":"0","members":[{"inputItemId":"ii-rec-09-jd","billItemId":"JD-L1"},{"inputItemId":"ii-rec-09-pv","billItemId":"PV-L1"}]},{"groupId":"g2","status":"DIFFERENCE","mappingBasis":{"configVersion":"map-cfg-1.0","rule":"NAME_AND_SCOPE"},"jdAmount":"280.00","providerAmount":"360.00","differenceAmount":"80.00","members":[{"inputItemId":"ii-rec-09-jd","billItemId":"JD-L2"},{"inputItemId":"ii-rec-09-pv","billItemId":"PV-L2"}]}]',
'[]',
'{"lookupScope":"work-order:wo-rec-01","retrievedAt":1790000100000,"installationWorkOrderVersion":"v3","termListComplete":true,"approvalListComplete":true,"missingParts":[]}',
'{"source_current":true,"scope_confirmed":true,"currency_tax_confirmed":true,"items_complete":true,"mapping_confirmed":true,"total_checks_passed":true,"groups_balanced":false,"issues_resolved":false}',
'[{"issueId":"oi-rec-09-1","kind":"AMOUNT_DIFFERENCE","groupId":"g2","description":"材料搬运费相差 80.00","relatedItems":["JD-L2","PV-L2"],"requiredEvidence":[]}]',
1790000200000,1790000200000
WHERE NOT EXISTS (SELECT 1 FROM reconciliation_record WHERE id='rr-rec-09');
UPDATE work_item SET current_reconciliation_id='rr-rec-09', row_version=row_version+1, gmt_modified=gmt_modified+1000 WHERE id='wi-rec-01';

-- ============ 数据清理 ============
UPDATE work_item SET current_reconciliation_id=NULL, row_version=row_version+1, gmt_modified=gmt_modified+1000 WHERE id='wi-rec-01' AND current_reconciliation_id='rr-rec-09';
-- 历史保护表不可 DELETE，rr-rec-09 命名空间数据保留，整库还原重建测试库。
