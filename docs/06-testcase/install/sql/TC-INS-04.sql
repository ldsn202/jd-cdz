-- TC-INS-04.sql 草稿版本保护 40901（API）
-- 数据准备：在 TC-INS-SEED.sql 之后执行。新建事项 wi-tc-ins-04，其草稿已推进到 HUMAN v2，
--           用例用旧版本 dv-tc-ins-04-1 作为 expectedDraftVersionId 发起保存，预期 40901。

-- 1. 事项（新事项插入时分析指针必须为空，见 guard_new_work_item_pointers）与整理起点
INSERT OR REPLACE INTO work_item (id,service_provider_id,installation_work_order_id,item_kind,business_key,business_identity_json,creation_key,title,status,assignee_identity_id,responsibility_version,row_version,analysis_generation,current_analysis_result_id,current_reconciliation_id,integration_config_id,current_configuration_version_id,active_supplement_request_id,pending_write_id,blocked_reason,completion_code,completion_basis_json,completion_decision_id,completed_at,gmt_create,gmt_modified)
VALUES ('wi-tc-ins-04','sp-tc-ins-anjia','wo-tc-ins-gyt','INSTALLATION_PREPARATION','bk-tc-ins-04','["sp-tc-ins-anjia","INSTALLATION_PREPARATION","INSTALLATION_WORK_ORDER","installation_management","WO-GYT-2026-0188","INSTALLATION_DETAIL","installation_management","WO-GYT-2026-0188","SUBMIT_INSTALLATION"]','ck-tc-ins-04','桂语庭安装资料整理与提交（用例04）','READY','idt-tc-ins-clerk1',1,2,1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,1789900400000,1789900400000);
INSERT OR REPLACE INTO analysis_input_snapshot (analysis_generation,id,work_item_id,service_provider_id,expected_work_item_version,skill,skill_version,output_schema_version,config_versions_json,required_input_state,input_issues_json,input_item_count,content_sha256,gmt_create,gmt_modified)
VALUES (1,'ais-tc-ins-04','wi-tc-ins-04','sp-tc-ins-anjia',2,'INSTALLATION_EXTRACTION','1.0.0','1.0.0','[]','COMPLETE','[]',0,'c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4',1789900401000,1789900401000);
INSERT OR REPLACE INTO background_job (id,purpose,service_provider_id,work_item_id,external_write_id,target_json,dedupe_key,status,available_at,lease_epoch,lease_token,lease_owner,lease_until,row_version,outcome_json,gmt_create,gmt_modified)
VALUES ('job-tc-ins-an-04','ANALYZE_SKILL','sp-tc-ins-anjia','wi-tc-ins-04',NULL,'{"inputSnapshotId":"ais-tc-ins-04"}','dk-tc-ins-an-04','READY',NULL,0,NULL,NULL,NULL,1,NULL,1789900402000,1789900402000);
INSERT OR REPLACE INTO capability_call (id,job_id,operation,source_material_version_id,input_snapshot_id,profile_id,implementation_version,config_json,input_sha256,gmt_create,gmt_modified)
VALUES ('run-tc-ins-an-04','job-tc-ins-an-04','ANALYZE_SKILL',NULL,'ais-tc-ins-04','profile-extract-1','skill-impl-1.0.0','{}','c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4',1789900402000,1789900402000);
INSERT OR REPLACE INTO analysis_result (id,run_id,work_item_id,snapshot_id,profile_id,implementation_version,status,summary,findings_json,open_questions_json,validated_at,gmt_create,gmt_modified)
VALUES ('ar-tc-ins-04','run-tc-ins-an-04','wi-tc-ins-04','ais-tc-ins-04','profile-extract-1','skill-impl-1.0.0','ANALYZED','用例04整理结果','[]','[]',1789900402000,1789900402000,1789900402000);
UPDATE work_item SET current_analysis_result_id='ar-tc-ins-04', row_version=3, gmt_modified=1789900402000 WHERE id='wi-tc-ins-04' AND row_version=2;

-- 2. 草稿 v1（AI）与草稿指针
INSERT OR REPLACE INTO installation_draft_version (id,installation_draft_id,work_item_id,version_no,parent_version_id,analysis_result_id,context_snapshot_id,origin,editor_identity_id,items_json,source_materials_json,open_questions_json,edit_notes_json,save_key,gmt_create,gmt_modified)
VALUES ('dv-tc-ins-04-1','draft-tc-ins-04','wi-tc-ins-04',1,NULL,'ar-tc-ins-04','ctxs-tc-ins-001','AI',NULL,'[{"installationItem":"电缆敷设","installedQuantity":52,"unit":"米","materialSupplier":"服务商供料","serviceScope":"配电箱至车位"}]','[{"sourceSystem":"installation_management","sourceMaterialId":"MAT-GYT-MXB-01","sourceVersion":"mv-1"}]','[]','[]','sk-tc-ins-04-1',1789900403000,1789900403000);
INSERT OR REPLACE INTO installation_draft (id,work_item_id,current_version_id,row_version,gmt_create,gmt_modified)
VALUES ('draft-tc-ins-04','wi-tc-ins-04','dv-tc-ins-04-1',1,1789900403000,1789900403000);

-- 3. 人员已保存过 v2（HUMAN），草稿当前版本推进为 dv-tc-ins-04-2
INSERT OR REPLACE INTO installation_draft_version (id,installation_draft_id,work_item_id,version_no,parent_version_id,analysis_result_id,context_snapshot_id,origin,editor_identity_id,items_json,source_materials_json,open_questions_json,edit_notes_json,save_key,gmt_create,gmt_modified)
VALUES ('dv-tc-ins-04-2','draft-tc-ins-04','wi-tc-ins-04',2,'dv-tc-ins-04-1','ar-tc-ins-04','ctxs-tc-ins-001','HUMAN','idt-tc-ins-clerk1','[{"installationItem":"电缆敷设","installedQuantity":50,"unit":"米","materialSupplier":"服务商供料","serviceScope":"配电箱至车位"}]','[{"sourceSystem":"installation_management","sourceMaterialId":"MAT-GYT-MXB-01","sourceVersion":"mv-1"}]','[]','[{"itemIndex":0,"field":"installedQuantity","reason":"与服务商核对确认为 50 米"}]','sk-tc-ins-04-2',1789900404000,1789900404000);
UPDATE installation_draft SET current_version_id='dv-tc-ins-04-2', row_version=2, gmt_modified=1789900404000 WHERE id='draft-tc-ins-04' AND row_version=1;

-- 数据清理：草稿历史表受 no_delete/no_update 保护，不能逐行 DELETE；
--           清理方式为销毁隔离测试库并重新建表后重跑 TC-INS-SEED.sql。
