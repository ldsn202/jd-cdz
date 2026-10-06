-- TC-REC-01.sql 读取对账结果-有差异（DIFFERENT）
-- 上游：reconciliation-schema.md §2/§4；数据特征：京东 1280.00 / 服务商 1360.00 / 差额 80.00，两组（g1 一致、g2 差异），含 Skill 解释关联
-- 前置：已执行 TC-REC-SEED.sql

-- ============ 数据准备 ============
INSERT INTO analysis_input_item (id,snapshot_id,input_key,input_kind,record_type,source_system,source_record_id,source_version,data_json,parsing_id,retrieved_at,gmt_create,gmt_modified)
SELECT 'ii-rec-01-jd','sn-rec-01','in-rec-01-jd','RECORD','JD_BILL','JD-BILLING','JDBILL-YQ-2026-08','v2026-08-31','{"currency":"CNY","totalAmount":"1280.00","items":[{"billItemId":"JD-L1","name":"基础安装费","quantity":"1","unit":"项","unitPrice":"1000.00","amount":"1000.00"},{"billItemId":"JD-L2","name":"材料搬运费","quantity":"2","unit":"次","unitPrice":"140.00","amount":"280.00"}]}',NULL,1790000100000,1790000100000,1790000100000
WHERE NOT EXISTS (SELECT 1 FROM analysis_input_item WHERE id='ii-rec-01-jd');
INSERT INTO analysis_input_item (id,snapshot_id,input_key,input_kind,record_type,source_system,source_record_id,source_version,data_json,parsing_id,retrieved_at,gmt_create,gmt_modified)
SELECT 'ii-rec-01-pv','sn-rec-01','in-rec-01-pv','RECORD','PROVIDER_RECEIVABLE','PROVIDER-AR','AR-CN-2026-08-01','v2026-08-31','{"currency":"CNY","totalAmount":"1360.00","items":[{"billItemId":"PV-L1","name":"基础安装费","quantity":"1","unit":"项","unitPrice":"1000.00","amount":"1000.00"},{"billItemId":"PV-L2","name":"材料搬运费","quantity":"2","unit":"次","unitPrice":"180.00","amount":"360.00"}]}',NULL,1790000100000,1790000100000,1790000100000
WHERE NOT EXISTS (SELECT 1 FROM analysis_input_item WHERE id='ii-rec-01-pv');
INSERT INTO analysis_input_item (id,snapshot_id,input_key,input_kind,record_type,source_system,source_record_id,source_version,data_json,parsing_id,retrieved_at,gmt_create,gmt_modified)
SELECT 'ii-rec-01-term','sn-rec-01','in-rec-01-term','RECORD','BILLING_TERM','BILLING-TERMS','TERM-CN-INSTALL-2026','v2026-01','{"title":"充电桩安装计费条款","scope":"基础安装含 30 米内搬运","effectiveStatus":"APPLICABLE"}',NULL,1790000100000,1790000100000,1790000100000
WHERE NOT EXISTS (SELECT 1 FROM analysis_input_item WHERE id='ii-rec-01-term');
INSERT INTO analysis_input_item (id,snapshot_id,input_key,input_kind,record_type,source_system,source_record_id,source_version,data_json,parsing_id,retrieved_at,gmt_create,gmt_modified)
SELECT 'ii-rec-01-appr','sn-rec-01','in-rec-01-appr','RECORD','FEE_APPROVAL_RECORD','FEE-APPROVAL','APR-YQ-001','v1','{"feeItem":"材料搬运费","decision":"APPROVED","scope":"云栖苑工单","approvedAmount":"280.00"}',NULL,1790000100000,1790000100000,1790000100000
WHERE NOT EXISTS (SELECT 1 FROM analysis_input_item WHERE id='ii-rec-01-appr');

INSERT INTO analysis_input_snapshot (id,analysis_generation,work_item_id,service_provider_id,expected_work_item_version,skill,skill_version,output_schema_version,config_versions_json,required_input_state,input_issues_json,input_item_count,content_sha256,gmt_create,gmt_modified)
SELECT 'sn-rec-01',1,'wi-rec-01','sp-rec-a',1,'RECONCILIATION_EXPLANATION','1.0.0','1.0','[]','COMPLETE','[]',4,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',1790000100000,1790000100000
WHERE NOT EXISTS (SELECT 1 FROM analysis_input_snapshot WHERE id='sn-rec-01');

INSERT INTO reconciliation_record (id,work_item_id,installation_work_order_id,service_provider_id,snapshot_id,execution_key,comparator_version,status,currency,tax_basis,jd_amount,provider_amount,difference_amount,selected_bills_json,groups_json,basis_inputs_json,basis_lookup_json,checks_json,open_issues_json,gmt_create,gmt_modified)
SELECT 'rr-rec-01','wi-rec-01','wo-rec-01','sp-rec-a','sn-rec-01','exec-rec-01','cmp-1.0.0','DIFFERENCE','CNY','TAX_INCLUDED','1280.00','1360.00','80.00',
'[{"billingDocumentId":"bd-rec-jd-01","inputItemId":"ii-rec-01-jd"},{"billingDocumentId":"bd-rec-pv-01","inputItemId":"ii-rec-01-pv"}]',
'[{"groupId":"g1","status":"MATCHED","mappingBasis":{"configVersion":"map-cfg-1.0","rule":"NAME_AND_SCOPE"},"jdAmount":"1000.00","providerAmount":"1000.00","differenceAmount":"0","members":[{"inputItemId":"ii-rec-01-jd","billItemId":"JD-L1"},{"inputItemId":"ii-rec-01-pv","billItemId":"PV-L1"}]},{"groupId":"g2","status":"DIFFERENCE","mappingBasis":{"configVersion":"map-cfg-1.0","rule":"NAME_AND_SCOPE"},"jdAmount":"280.00","providerAmount":"360.00","differenceAmount":"80.00","members":[{"inputItemId":"ii-rec-01-jd","billItemId":"JD-L2"},{"inputItemId":"ii-rec-01-pv","billItemId":"PV-L2"}]}]',
'[{"feeBasisId":"fbr-rec-term-01","inputItemId":"ii-rec-01-term"},{"feeBasisId":"fbr-rec-appr-01","inputItemId":"ii-rec-01-appr"}]',
'{"lookupScope":"work-order:wo-rec-01","retrievedAt":1790000100000,"installationWorkOrderVersion":"v3","termListComplete":true,"approvalListComplete":true,"missingParts":[]}',
'{"source_current":true,"scope_confirmed":true,"currency_tax_confirmed":true,"items_complete":true,"mapping_confirmed":true,"total_checks_passed":true,"groups_balanced":false,"issues_resolved":false}',
'[{"issueId":"oi-rec-01-1","kind":"AMOUNT_DIFFERENCE","groupId":"g2","description":"材料搬运费服务商 360.00 与京东 280.00 相差 80.00","relatedItems":["JD-L2","PV-L2"],"requiredEvidence":["FEE_APPROVAL_RECORD"]}]',
1790000200000,1790000200000
WHERE NOT EXISTS (SELECT 1 FROM reconciliation_record WHERE id='rr-rec-01');

INSERT INTO analysis_result (id,run_id,work_item_id,snapshot_id,profile_id,implementation_version,status,summary,findings_json,open_questions_json,validated_at,gmt_create,gmt_modified)
SELECT 'ar-rec-01','run-rec-01','wi-rec-01','sn-rec-01','profile-rec-01','impl-1.0.0','ANALYZED','搬运费差额 80.00：条款显示基础安装含 30 米内搬运，批准记录 APR-YQ-001 仅批准 280.00。','[{"topic":"材料搬运费差额","explanation":"条款 TERM-CN-INSTALL-2026 基础安装含 30 米内搬运；批准记录 APR-YQ-001 批准 280.00，服务商另列 360.00，超出 80.00 无对应批准。","evidenceRefs":["fbr-rec-term-01","fbr-rec-appr-01"]}]','[]',1790000250000,1790000250000,1790000250000
WHERE NOT EXISTS (SELECT 1 FROM analysis_result WHERE id='ar-rec-01');
INSERT INTO reconciliation_analysis_link (id,reconciliation_id,analysis_result_id,gmt_create,gmt_modified)
SELECT 'ral-rec-01','rr-rec-01','ar-rec-01',1790000260000,1790000260000
WHERE NOT EXISTS (SELECT 1 FROM reconciliation_analysis_link WHERE id='ral-rec-01');

UPDATE work_item SET current_reconciliation_id='rr-rec-01', row_version=row_version+1, gmt_modified=gmt_modified+1000 WHERE id='wi-rec-01';

-- ============ 数据清理 ============
UPDATE work_item SET current_reconciliation_id=NULL, row_version=row_version+1, gmt_modified=gmt_modified+1000 WHERE id='wi-rec-01' AND current_reconciliation_id='rr-rec-01';
-- 历史保护表（snapshot/item/reconciliation/analysis/link）不可 DELETE，rr-rec-01 命名空间数据保留，整库还原重建测试库。
