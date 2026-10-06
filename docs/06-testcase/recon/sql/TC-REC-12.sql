-- TC-REC-12.sql 缺项如实呈现（服务商应收未读到、批准记录未查全）
-- 上游：reconciliation-schema.md §2/§4；数据特征：NEEDS_INFORMATION，仅京东侧入选，服务商金额/差额/币种为 NULL，批准查询不完整
-- 前置：已执行 TC-REC-SEED.sql

-- ============ 数据准备 ============
INSERT INTO analysis_input_item (id,snapshot_id,input_key,input_kind,record_type,source_system,source_record_id,source_version,data_json,parsing_id,retrieved_at,gmt_create,gmt_modified)
SELECT 'ii-rec-12-jd','sn-rec-12','in-rec-12-jd','RECORD','JD_BILL','JD-BILLING','JDBILL-YQ-2026-08','v2026-08-31','{"currency":"CNY","totalAmount":"1280.00","items":[{"billItemId":"JD-L1","name":"基础安装费","quantity":"1","unit":"项","unitPrice":"1000.00","amount":"1000.00"},{"billItemId":"JD-L2","name":"材料搬运费","quantity":"2","unit":"次","unitPrice":"140.00","amount":"280.00"}]}',NULL,1790000100000,1790000100000,1790000100000
WHERE NOT EXISTS (SELECT 1 FROM analysis_input_item WHERE id='ii-rec-12-jd');
INSERT INTO analysis_input_item (id,snapshot_id,input_key,input_kind,record_type,source_system,source_record_id,source_version,data_json,parsing_id,retrieved_at,gmt_create,gmt_modified)
SELECT 'ii-rec-12-term','sn-rec-12','in-rec-12-term','RECORD','BILLING_TERM','BILLING-TERMS','TERM-CN-INSTALL-2026','v2026-01','{"title":"充电桩安装计费条款","scope":"基础安装含 30 米内搬运","effectiveStatus":"APPLICABLE"}',NULL,1790000100000,1790000100000,1790000100000
WHERE NOT EXISTS (SELECT 1 FROM analysis_input_item WHERE id='ii-rec-12-term');
INSERT INTO analysis_input_snapshot (id,analysis_generation,work_item_id,service_provider_id,expected_work_item_version,skill,skill_version,output_schema_version,config_versions_json,required_input_state,input_issues_json,input_item_count,content_sha256,gmt_create,gmt_modified)
SELECT 'sn-rec-12',1,'wi-rec-01','sp-rec-a',1,'RECONCILIATION_EXPLANATION','1.0.0','1.0','[]','INCOMPLETE','[{"issue":"PROVIDER_RECEIVABLE_UNAVAILABLE","description":"服务商应收来源本次未返回"}]',2,'ffffaaaaaaaabbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',1790000100000,1790000100000
WHERE NOT EXISTS (SELECT 1 FROM analysis_input_snapshot WHERE id='sn-rec-12');
INSERT INTO reconciliation_record (id,work_item_id,installation_work_order_id,service_provider_id,snapshot_id,execution_key,comparator_version,status,currency,tax_basis,jd_amount,provider_amount,difference_amount,selected_bills_json,groups_json,basis_inputs_json,basis_lookup_json,checks_json,open_issues_json,gmt_create,gmt_modified)
SELECT 'rr-rec-12','wi-rec-01','wo-rec-01','sp-rec-a','sn-rec-12','exec-rec-12','cmp-1.0.0','NEEDS_INFORMATION',NULL,'UNKNOWN','1280.00',NULL,NULL,
'[{"billingDocumentId":"bd-rec-jd-01","inputItemId":"ii-rec-12-jd"}]',
'[{"groupId":"g1","status":"NEEDS_INFORMATION","mappingBasis":null,"jdAmount":"1280.00","providerAmount":null,"differenceAmount":null,"members":[{"inputItemId":"ii-rec-12-jd","billItemId":"JD-L1"},{"inputItemId":"ii-rec-12-jd","billItemId":"JD-L2"}]}]',
'[{"feeBasisId":"fbr-rec-term-01","inputItemId":"ii-rec-12-term"}]',
'{"lookupScope":"work-order:wo-rec-01","retrievedAt":1790000100000,"installationWorkOrderVersion":"v3","termListComplete":true,"approvalListComplete":false,"missingParts":["FEE_APPROVAL_RECORD"]}',
'{"source_current":false,"scope_confirmed":false,"currency_tax_confirmed":false,"items_complete":false,"mapping_confirmed":false,"total_checks_passed":false,"groups_balanced":false,"issues_resolved":false}',
'[{"issueId":"oi-rec-12-1","kind":"PROVIDER_RECEIVABLE_UNAVAILABLE","groupId":null,"description":"服务商应收尚未取得，不能按零金额处理","relatedItems":[],"requiredEvidence":["PROVIDER_RECEIVABLE"]},{"issueId":"oi-rec-12-2","kind":"APPROVAL_LOOKUP_INCOMPLETE","groupId":null,"description":"费用批准记录查询未覆盖全部范围，批准情况尚未核实","relatedItems":[],"requiredEvidence":["FEE_APPROVAL_RECORD"]}]',
1790000200000,1790000200000
WHERE NOT EXISTS (SELECT 1 FROM reconciliation_record WHERE id='rr-rec-12');
UPDATE work_item SET current_reconciliation_id='rr-rec-12', row_version=row_version+1, gmt_modified=gmt_modified+1000 WHERE id='wi-rec-01';

-- ============ 数据清理 ============
UPDATE work_item SET current_reconciliation_id=NULL, row_version=row_version+1, gmt_modified=gmt_modified+1000 WHERE id='wi-rec-01' AND current_reconciliation_id='rr-rec-12';
-- 历史保护表不可 DELETE，rr-rec-12 命名空间数据保留，整库还原重建测试库。
