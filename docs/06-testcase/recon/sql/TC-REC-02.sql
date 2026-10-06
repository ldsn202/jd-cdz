-- TC-REC-02.sql 应收修订产生新版本且不改对方账单（含旧指针失效 PREPARING 中间态）
-- 上游：reconciliation-schema.md §2/§3/§4；数据特征：旧比较 1280.00/1360.00 差异 80.00 → 服务商修订后新版 1280.00/1280.00 一致
-- 前置：已执行 TC-REC-SEED.sql。本文件按用例步骤分三段执行：准备阶段A → 步骤2后执行阶段B1 → 步骤3后执行阶段B2。

-- ============ 数据准备（阶段 A：旧版应收 v2026-08-31 与旧比较 DIFFERENCE，发布为当前比较） ============
INSERT INTO analysis_input_item (id,snapshot_id,input_key,input_kind,record_type,source_system,source_record_id,source_version,data_json,parsing_id,retrieved_at,gmt_create,gmt_modified)
SELECT 'ii-rec-02a-jd','sn-rec-02a','in-rec-02a-jd','RECORD','JD_BILL','JD-BILLING','JDBILL-YQ-2026-08','v2026-08-31','{"currency":"CNY","totalAmount":"1280.00","items":[{"billItemId":"JD-L1","name":"基础安装费","quantity":"1","unit":"项","unitPrice":"1000.00","amount":"1000.00"},{"billItemId":"JD-L2","name":"材料搬运费","quantity":"2","unit":"次","unitPrice":"140.00","amount":"280.00"}]}',NULL,1790000100000,1790000100000,1790000100000
WHERE NOT EXISTS (SELECT 1 FROM analysis_input_item WHERE id='ii-rec-02a-jd');
INSERT INTO analysis_input_item (id,snapshot_id,input_key,input_kind,record_type,source_system,source_record_id,source_version,data_json,parsing_id,retrieved_at,gmt_create,gmt_modified)
SELECT 'ii-rec-02a-pv','sn-rec-02a','in-rec-02a-pv','RECORD','PROVIDER_RECEIVABLE','PROVIDER-AR','AR-CN-2026-08-01','v2026-08-31','{"currency":"CNY","totalAmount":"1360.00","items":[{"billItemId":"PV-L1","name":"基础安装费","quantity":"1","unit":"项","unitPrice":"1000.00","amount":"1000.00"},{"billItemId":"PV-L2","name":"材料搬运费","quantity":"2","unit":"次","unitPrice":"180.00","amount":"360.00"}]}',NULL,1790000100000,1790000100000,1790000100000
WHERE NOT EXISTS (SELECT 1 FROM analysis_input_item WHERE id='ii-rec-02a-pv');
INSERT INTO analysis_input_snapshot (id,analysis_generation,work_item_id,service_provider_id,expected_work_item_version,skill,skill_version,output_schema_version,config_versions_json,required_input_state,input_issues_json,input_item_count,content_sha256,gmt_create,gmt_modified)
SELECT 'sn-rec-02a',1,'wi-rec-01','sp-rec-a',1,'RECONCILIATION_EXPLANATION','1.0.0','1.0','[]','COMPLETE','[]',2,'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',1790000100000,1790000100000
WHERE NOT EXISTS (SELECT 1 FROM analysis_input_snapshot WHERE id='sn-rec-02a');
INSERT INTO reconciliation_record (id,work_item_id,installation_work_order_id,service_provider_id,snapshot_id,execution_key,comparator_version,status,currency,tax_basis,jd_amount,provider_amount,difference_amount,selected_bills_json,groups_json,basis_inputs_json,basis_lookup_json,checks_json,open_issues_json,gmt_create,gmt_modified)
SELECT 'rr-rec-02a','wi-rec-01','wo-rec-01','sp-rec-a','sn-rec-02a','exec-rec-02a','cmp-1.0.0','DIFFERENCE','CNY','TAX_INCLUDED','1280.00','1360.00','80.00',
'[{"billingDocumentId":"bd-rec-jd-01","inputItemId":"ii-rec-02a-jd"},{"billingDocumentId":"bd-rec-pv-01","inputItemId":"ii-rec-02a-pv"}]',
'[{"groupId":"g1","status":"MATCHED","mappingBasis":{"configVersion":"map-cfg-1.0","rule":"NAME_AND_SCOPE"},"jdAmount":"1000.00","providerAmount":"1000.00","differenceAmount":"0","members":[{"inputItemId":"ii-rec-02a-jd","billItemId":"JD-L1"},{"inputItemId":"ii-rec-02a-pv","billItemId":"PV-L1"}]},{"groupId":"g2","status":"DIFFERENCE","mappingBasis":{"configVersion":"map-cfg-1.0","rule":"NAME_AND_SCOPE"},"jdAmount":"280.00","providerAmount":"360.00","differenceAmount":"80.00","members":[{"inputItemId":"ii-rec-02a-jd","billItemId":"JD-L2"},{"inputItemId":"ii-rec-02a-pv","billItemId":"PV-L2"}]}]',
'[]',
'{"lookupScope":"work-order:wo-rec-01","retrievedAt":1790000100000,"installationWorkOrderVersion":"v3","termListComplete":true,"approvalListComplete":true,"missingParts":[]}',
'{"source_current":true,"scope_confirmed":true,"currency_tax_confirmed":true,"items_complete":true,"mapping_confirmed":true,"total_checks_passed":true,"groups_balanced":false,"issues_resolved":false}',
'[{"issueId":"oi-rec-02-1","kind":"AMOUNT_DIFFERENCE","groupId":"g2","description":"材料搬运费相差 80.00","relatedItems":["JD-L2","PV-L2"],"requiredEvidence":[]}]',
1790000200000,1790000200000
WHERE NOT EXISTS (SELECT 1 FROM reconciliation_record WHERE id='rr-rec-02a');
UPDATE work_item SET current_reconciliation_id='rr-rec-02a', row_version=row_version+1, gmt_modified=gmt_modified+1000 WHERE id='wi-rec-01';

-- ============ 阶段 B1（用例步骤 2 验证后执行）：来源输入变更使旧指针失效 ============
UPDATE work_item SET current_reconciliation_id=NULL, row_version=row_version+1, gmt_modified=gmt_modified+1000 WHERE id='wi-rec-01';

-- ============ 阶段 B2（用例步骤 3 验证后执行）：修订版应收 v2026-09-05（1280.00）可靠取得，新比较 MATCHED 并发布 ============
INSERT INTO analysis_input_item (id,snapshot_id,input_key,input_kind,record_type,source_system,source_record_id,source_version,data_json,parsing_id,retrieved_at,gmt_create,gmt_modified)
SELECT 'ii-rec-02b-jd','sn-rec-02b','in-rec-02b-jd','RECORD','JD_BILL','JD-BILLING','JDBILL-YQ-2026-08','v2026-08-31','{"currency":"CNY","totalAmount":"1280.00","items":[{"billItemId":"JD-L1","name":"基础安装费","quantity":"1","unit":"项","unitPrice":"1000.00","amount":"1000.00"},{"billItemId":"JD-L2","name":"材料搬运费","quantity":"2","unit":"次","unitPrice":"140.00","amount":"280.00"}]}',NULL,1790000500000,1790000500000,1790000500000
WHERE NOT EXISTS (SELECT 1 FROM analysis_input_item WHERE id='ii-rec-02b-jd');
INSERT INTO analysis_input_item (id,snapshot_id,input_key,input_kind,record_type,source_system,source_record_id,source_version,data_json,parsing_id,retrieved_at,gmt_create,gmt_modified)
SELECT 'ii-rec-02b-pv','sn-rec-02b','in-rec-02b-pv','RECORD','PROVIDER_RECEIVABLE','PROVIDER-AR','AR-CN-2026-08-01','v2026-09-05','{"currency":"CNY","totalAmount":"1280.00","items":[{"billItemId":"PV-L1","name":"基础安装费","quantity":"1","unit":"项","unitPrice":"1000.00","amount":"1000.00"},{"billItemId":"PV-L2","name":"材料搬运费","quantity":"2","unit":"次","unitPrice":"140.00","amount":"280.00"}]}',NULL,1790000500000,1790000500000,1790000500000
WHERE NOT EXISTS (SELECT 1 FROM analysis_input_item WHERE id='ii-rec-02b-pv');
INSERT INTO analysis_input_snapshot (id,analysis_generation,work_item_id,service_provider_id,expected_work_item_version,skill,skill_version,output_schema_version,config_versions_json,required_input_state,input_issues_json,input_item_count,content_sha256,gmt_create,gmt_modified)
SELECT 'sn-rec-02b',1,'wi-rec-01','sp-rec-a',1,'RECONCILIATION_EXPLANATION','1.0.0','1.0','[]','COMPLETE','[]',2,'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',1790000500000,1790000500000
WHERE NOT EXISTS (SELECT 1 FROM analysis_input_snapshot WHERE id='sn-rec-02b');
INSERT INTO reconciliation_record (id,work_item_id,installation_work_order_id,service_provider_id,snapshot_id,execution_key,comparator_version,status,currency,tax_basis,jd_amount,provider_amount,difference_amount,selected_bills_json,groups_json,basis_inputs_json,basis_lookup_json,checks_json,open_issues_json,gmt_create,gmt_modified)
SELECT 'rr-rec-02b','wi-rec-01','wo-rec-01','sp-rec-a','sn-rec-02b','exec-rec-02b','cmp-1.0.0','MATCHED','CNY','TAX_INCLUDED','1280.00','1280.00','0',
'[{"billingDocumentId":"bd-rec-jd-01","inputItemId":"ii-rec-02b-jd"},{"billingDocumentId":"bd-rec-pv-01","inputItemId":"ii-rec-02b-pv"}]',
'[{"groupId":"g1","status":"MATCHED","mappingBasis":{"configVersion":"map-cfg-1.0","rule":"NAME_AND_SCOPE"},"jdAmount":"1000.00","providerAmount":"1000.00","differenceAmount":"0","members":[{"inputItemId":"ii-rec-02b-jd","billItemId":"JD-L1"},{"inputItemId":"ii-rec-02b-pv","billItemId":"PV-L1"}]},{"groupId":"g2","status":"MATCHED","mappingBasis":{"configVersion":"map-cfg-1.0","rule":"NAME_AND_SCOPE"},"jdAmount":"280.00","providerAmount":"280.00","differenceAmount":"0","members":[{"inputItemId":"ii-rec-02b-jd","billItemId":"JD-L2"},{"inputItemId":"ii-rec-02b-pv","billItemId":"PV-L2"}]}]',
'[]',
'{"lookupScope":"work-order:wo-rec-01","retrievedAt":1790000500000,"installationWorkOrderVersion":"v3","termListComplete":true,"approvalListComplete":true,"missingParts":[]}',
'{"source_current":true,"scope_confirmed":true,"currency_tax_confirmed":true,"items_complete":true,"mapping_confirmed":true,"total_checks_passed":true,"groups_balanced":true,"issues_resolved":true}',
'[]',
1790000600000,1790000600000
WHERE NOT EXISTS (SELECT 1 FROM reconciliation_record WHERE id='rr-rec-02b');
UPDATE work_item SET current_reconciliation_id='rr-rec-02b', row_version=row_version+1, gmt_modified=gmt_modified+1000 WHERE id='wi-rec-01';

-- ============ 数据清理 ============
UPDATE work_item SET current_reconciliation_id=NULL, row_version=row_version+1, gmt_modified=gmt_modified+1000 WHERE id='wi-rec-01' AND current_reconciliation_id IN ('rr-rec-02a','rr-rec-02b');
-- 历史保护表不可 DELETE；京东账单身份 bd-rec-jd-01 与旧版应收输入 ii-rec-02a-pv 全程未被修改，符合"修订不改对方账单"。
