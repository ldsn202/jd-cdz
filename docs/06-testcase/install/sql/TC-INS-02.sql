-- TC-INS-02.sql 无草稿读取（API）
-- 数据准备：在 TC-INS-SEED.sql 之后执行。新增同工单下尚无草稿的资料事项 wi-tc-ins-prep-empty。
INSERT OR REPLACE INTO work_item (id,service_provider_id,installation_work_order_id,item_kind,business_key,business_identity_json,creation_key,title,status,assignee_identity_id,responsibility_version,row_version,analysis_generation,current_analysis_result_id,current_reconciliation_id,integration_config_id,current_configuration_version_id,active_supplement_request_id,pending_write_id,blocked_reason,completion_code,completion_basis_json,completion_decision_id,completed_at,gmt_create,gmt_modified)
VALUES ('wi-tc-ins-prep-empty','sp-tc-ins-anjia','wo-tc-ins-gyt','INSTALLATION_PREPARATION','bk-tc-ins-prep-empty','["sp-tc-ins-anjia","INSTALLATION_PREPARATION","INSTALLATION_WORK_ORDER","installation_management","WO-GYT-2026-0188","INSTALLATION_DETAIL","installation_management","WO-GYT-2026-0188","SUBMIT_INSTALLATION"]','ck-tc-ins-prep-empty','桂语庭安装资料整理与提交（待整理）','PREPARING','idt-tc-ins-clerk1',1,1,1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,1789900200000,1789900200000);

-- 数据清理：候选 DDL 全部业务表受 no_delete 触发器保护，不能逐行 DELETE；
--           清理方式为销毁隔离测试库并重新建表后重跑 TC-INS-SEED.sql。
