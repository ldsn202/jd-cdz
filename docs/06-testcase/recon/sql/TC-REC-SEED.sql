-- TC-REC-SEED.sql 业务对账域共用种子数据（SQLite/D1 方言）
-- 上游：docs/03-foundation/03-05-schema/reconciliation-schema.md §1—7、work-item-schema.md §2—5、evidence-schema.md §2
-- 重要偏离说明：reconciliation-schema.md §1 明令"各表禁止普通 DELETE、历史 UPDATE 和替换式 INSERT"，
-- 且建表 SQL 对全部历史表装有 no_replace / no_delete 触发器，INSERT OR REPLACE 与 DELETE 会被 ABORT。
-- 故本文件不用 INSERT OR REPLACE，改用 INSERT ... WHERE NOT EXISTS 保证可重复执行且不与触发器冲突；
-- 历史保护表不做行级清理，测试数据统一使用 rec- 命名空间隔离，整体还原通过重建隔离测试库完成。
-- 金额一律 TEXT 十进制字符串（reconciliation-schema.md §3），SQL 不做金额加减。

-- ============ 数据准备 ============

-- 服务商：城南安装（主测）、远程机电（跨服务商越权对照）
INSERT INTO service_provider (id,source_system,source_id,display_name,source_version,source_state,verified_at,gmt_create,gmt_modified)
SELECT 'sp-rec-a','PROVIDER-CRM','SP-CHENGNAN','城南安装','v2026-09','ACTIVE',1790000000000,1790000000000,1790000000000
WHERE NOT EXISTS (SELECT 1 FROM service_provider WHERE id='sp-rec-a');
INSERT INTO service_provider (id,source_system,source_id,display_name,source_version,source_state,verified_at,gmt_create,gmt_modified)
SELECT 'sp-rec-b','PROVIDER-CRM','SP-YUANCHENG','远程机电','v2026-09','ACTIVE',1790000000000,1790000000000,1790000000000
WHERE NOT EXISTS (SELECT 1 FROM service_provider WHERE id='sp-rec-b');

-- 安装工单：云栖苑（城南）、江畔里（远程）
INSERT INTO installation_work_order (id,source_system,source_id,current_service_provider_id,source_version,source_state,context_snapshot_id,verified_at,gmt_create,gmt_modified)
SELECT 'wo-rec-01','JD-IWO','IWO-YUNQI-001','sp-rec-a','v3','ACTIVE',NULL,1790000000000,1790000000000,1790000000000
WHERE NOT EXISTS (SELECT 1 FROM installation_work_order WHERE id='wo-rec-01');
INSERT INTO installation_work_order (id,source_system,source_id,current_service_provider_id,source_version,source_state,context_snapshot_id,verified_at,gmt_create,gmt_modified)
SELECT 'wo-rec-02','JD-IWO','IWO-JIANGPAN-001','sp-rec-b','v2','ACTIVE',NULL,1790000000000,1790000000000,1790000000000
WHERE NOT EXISTS (SELECT 1 FROM installation_work_order WHERE id='wo-rec-02');

-- 对账事项：wi-rec-01（城南，主测）、wi-rec-02（远程，越权对照）
INSERT INTO work_item (id,service_provider_id,installation_work_order_id,item_kind,business_key,business_identity_json,creation_key,title,status,assignee_identity_id,responsibility_version,row_version,analysis_generation,current_analysis_result_id,current_reconciliation_id,integration_config_id,current_configuration_version_id,active_supplement_request_id,pending_write_id,blocked_reason,completion_code,completion_basis_json,completion_decision_id,completed_at,gmt_create,gmt_modified)
SELECT 'wi-rec-01','sp-rec-a','wo-rec-01','RECONCILIATION','RECON-wo-rec-01','[{"installationWorkOrderId":"wo-rec-01"}]','ck-rec-01','云栖苑 · 城南安装 业务对账','PROCESSING','id-jd-recon-01',1,1,1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,1790000000000,1790000000000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id='wi-rec-01');
INSERT INTO work_item (id,service_provider_id,installation_work_order_id,item_kind,business_key,business_identity_json,creation_key,title,status,assignee_identity_id,responsibility_version,row_version,analysis_generation,current_analysis_result_id,current_reconciliation_id,integration_config_id,current_configuration_version_id,active_supplement_request_id,pending_write_id,blocked_reason,completion_code,completion_basis_json,completion_decision_id,completed_at,gmt_create,gmt_modified)
SELECT 'wi-rec-02','sp-rec-b','wo-rec-02','RECONCILIATION','RECON-wo-rec-02','[{"installationWorkOrderId":"wo-rec-02"}]','ck-rec-02','江畔里 · 远程机电 业务对账','PROCESSING','id-jd-recon-01',1,1,1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,1790000000000,1790000000000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id='wi-rec-02');

-- 账单身份：京东账单与服务商原应收（身份固定，版本内容保存在 analysis_input_item.data_json）
INSERT INTO billing_document (id,side,source_system,source_id,service_provider_id,gmt_create,gmt_modified)
SELECT 'bd-rec-jd-01','JD','JD-BILLING','JDBILL-YQ-2026-08','sp-rec-a',1790000000000,1790000000000
WHERE NOT EXISTS (SELECT 1 FROM billing_document WHERE id='bd-rec-jd-01');
INSERT INTO billing_document (id,side,source_system,source_id,service_provider_id,gmt_create,gmt_modified)
SELECT 'bd-rec-pv-01','PROVIDER','PROVIDER-AR','AR-CN-2026-08-01','sp-rec-a',1790000000000,1790000000000
WHERE NOT EXISTS (SELECT 1 FROM billing_document WHERE id='bd-rec-pv-01');
INSERT INTO billing_document (id,side,source_system,source_id,service_provider_id,gmt_create,gmt_modified)
SELECT 'bd-rec-jd-02','JD','JD-BILLING','JDBILL-JP-2026-08','sp-rec-b',1790000000000,1790000000000
WHERE NOT EXISTS (SELECT 1 FROM billing_document WHERE id='bd-rec-jd-02');
INSERT INTO billing_document (id,side,source_system,source_id,service_provider_id,gmt_create,gmt_modified)
SELECT 'bd-rec-pv-02','PROVIDER','PROVIDER-AR','AR-YC-2026-08-01','sp-rec-b',1790000000000,1790000000000
WHERE NOT EXISTS (SELECT 1 FROM billing_document WHERE id='bd-rec-pv-02');

-- 计费条款与费用批准记录来源身份
INSERT INTO fee_basis_record (id,record_kind,source_system,source_id,gmt_create,gmt_modified)
SELECT 'fbr-rec-term-01','TERM','BILLING-TERMS','TERM-CN-INSTALL-2026',1790000000000,1790000000000
WHERE NOT EXISTS (SELECT 1 FROM fee_basis_record WHERE id='fbr-rec-term-01');
INSERT INTO fee_basis_record (id,record_kind,source_system,source_id,gmt_create,gmt_modified)
SELECT 'fbr-rec-appr-01','APPROVAL','FEE-APPROVAL','APR-YQ-001',1790000000000,1790000000000
WHERE NOT EXISTS (SELECT 1 FROM fee_basis_record WHERE id='fbr-rec-appr-01');

-- ============ 数据清理 ============
-- 本 SEED 涉及的全部表均受历史保护触发器约束（no_delete/no_update/no_replace），不允许行级清理。
-- 种子行使用 rec- 固定命名空间且幂等可重入；如需彻底还原，重建隔离测试库后重跑本文件。
