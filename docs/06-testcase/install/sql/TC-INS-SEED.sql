-- TC-INS-SEED.sql 安装资料整理与提交域共用种子数据
-- 直接依赖本种子的用例：TC-INS-01/03/09/11/12/13/15；其余用例在各自场景 SQL 中另建独立事项链
-- 前置：已按候选 DDL 建表（依次加载 identity / work-item / evidence / installation / execution 各 schema.sql，
--       最后加载 cross-domain-guards.sql）
-- 执行约定：候选 DDL 全部业务表带 no_replace/no_delete 触发器，本脚本只在重建后的空库执行一次；
--           INSERT OR REPLACE 按 TC 约定书写保证幂等语义，但在已加载触发器且已有数据的库上重跑会被
--           no_replace 触发器拒绝，此时须先重建测试库。

-- 1. 身份与授权（顺序由 tr_business_permission_insert / tr_current_identity_seal 决定：
--    identity_reference → business_permission → current_identity）
INSERT OR REPLACE INTO identity_reference (id,identity_source,subject_id,subject_type,display_name,gmt_create,gmt_modified)
VALUES ('idt-tc-ins-clerk1','dev-idp','tc-ins-clerk-1','HUMAN','安家资料员甲',1789900000000,1789900000000);
INSERT OR REPLACE INTO identity_reference (id,identity_source,subject_id,subject_type,display_name,gmt_create,gmt_modified)
VALUES ('idt-tc-ins-svc1','dev-idp','tc-ins-svc-1','SERVICE','安装后台执行程序',1789900000000,1789900000000);
INSERT OR REPLACE INTO business_permission (id,context_id,grant_id,business_role,actions_json,scope_type,source_system,record_type,resource_ids_json,gmt_create,gmt_modified)
VALUES ('perm-tc-ins-1','ctxi-tc-ins-clerk1','grant-tc-ins-1','PROVIDER_DOCUMENT_CLERK','["READ_WORK_ITEM","READ_SOURCE_MATERIAL","CONFIRM_INSTALLATION_DRAFT","SUBMIT_INSTALLATION_DETAIL"]','SERVICE_PROVIDER',NULL,NULL,'["sp-tc-ins-anjia"]',1789900000000,1789900000000);
INSERT OR REPLACE INTO current_identity (id,identity_reference_id,subject_type,verified_at,valid_until,authorization_version,source_identities_json,grant_count,request_key,gmt_create,gmt_modified)
VALUES ('ctxi-tc-ins-clerk1','idt-tc-ins-clerk1','HUMAN',1789900000000,NULL,'authv-1','[]',1,'rk-tc-ins-ctx-1',1789900000000,1789900000000);

-- 2. 服务商与工单
INSERT OR REPLACE INTO service_provider (id,source_system,source_id,display_name,source_version,source_state,verified_at,gmt_create,gmt_modified)
VALUES ('sp-tc-ins-anjia','installation_management','SP-ANJIA-001','安家安装','spv-2','ACTIVE',1789900000000,1789900000000,1789900000000);
INSERT OR REPLACE INTO installation_work_order (id,source_system,source_id,current_service_provider_id,source_version,source_state,context_snapshot_id,verified_at,gmt_create,gmt_modified)
VALUES ('wo-tc-ins-gyt','installation_management','WO-GYT-2026-0188','sp-tc-ins-anjia','wov-7','ACTIVE','ctxs-tc-ins-001',1789900001000,1789900001000,1789900001000);
INSERT OR REPLACE INTO installation_plan (id,installation_work_order_id,source_system,source_id,gmt_create,gmt_modified)
VALUES ('plan-tc-ins-001','wo-tc-ins-gyt','installation_management','PLAN-GYT-0188',1789900001000,1789900001000);
INSERT OR REPLACE INTO installation_context_snapshot (id,installation_work_order_id,service_provider_id,source_work_order_version,installation_plan_id,source_plan_version,installation_detail_id,source_detail_version,detail_status,completeness,missing_parts_json,context_json,retrieved_at,gmt_create,gmt_modified)
VALUES ('ctxs-tc-ins-001','wo-tc-ins-gyt','sp-tc-ins-anjia','wov-7','plan-tc-ins-001','pv-3',NULL,NULL,'NOT_SUBMITTED','COMPLETE','[]',
'{"retrievedAt":"2026-09-19T16:00:02Z","completeness":"COMPLETE","missingParts":[],"installationWorkOrder":{"installationWorkOrderId":"WO-GYT-2026-0188","serviceProviderId":"SP-ANJIA-001","purchaseOrderId":"PO-GYT-10001","sourceSystem":"installation_management","sourceVersion":"wov-7"},"installationPlan":{"sourceId":"PLAN-GYT-0188","sourceVersion":"pv-3"},"installationDetailStatus":"NOT_SUBMITTED","installationDetail":null,"sourceMaterialIndexComplete":true,"sourceMaterials":[{"sourceSystem":"installation_management","sourceMaterialId":"MAT-GYT-SGD-01","sourceVersion":"mv-1"},{"sourceSystem":"installation_management","sourceMaterialId":"MAT-GYT-MXB-01","sourceVersion":"mv-1"}]}',
1789900002000,1789900002000,1789900002000);

-- 3. 资料整理事项（wi-tc-ins-prep-1，READY，row_version=6，responsibility_version=2；
--    新事项插入时分析指针必须为空，见 guard_new_work_item_pointers，本节末尾再补指针）
INSERT OR REPLACE INTO work_item (id,service_provider_id,installation_work_order_id,item_kind,business_key,business_identity_json,creation_key,title,status,assignee_identity_id,responsibility_version,row_version,analysis_generation,current_analysis_result_id,current_reconciliation_id,integration_config_id,current_configuration_version_id,active_supplement_request_id,pending_write_id,blocked_reason,completion_code,completion_basis_json,completion_decision_id,completed_at,gmt_create,gmt_modified)
VALUES ('wi-tc-ins-prep-1','sp-tc-ins-anjia','wo-tc-ins-gyt','INSTALLATION_PREPARATION','bk-tc-ins-prep-1','["sp-tc-ins-anjia","INSTALLATION_PREPARATION","INSTALLATION_WORK_ORDER","installation_management","WO-GYT-2026-0188","INSTALLATION_DETAIL","installation_management","WO-GYT-2026-0188","SUBMIT_INSTALLATION"]','ck-tc-ins-prep-1','桂语庭安装资料整理与提交','READY','idt-tc-ins-clerk1',2,5,1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,1789900003000,1789900003000);

-- 4. 来源材料与已核实版本（施工单 PDF + 安装明细表 XLSX）
INSERT OR REPLACE INTO source_material (id,source_system,source_material_id,gmt_create,gmt_modified)
VALUES ('sm-tc-ins-001','installation_management','MAT-GYT-SGD-01',1789900004000,1789900004000);
INSERT OR REPLACE INTO source_material (id,source_system,source_material_id,gmt_create,gmt_modified)
VALUES ('sm-tc-ins-002','installation_management','MAT-GYT-MXB-01',1789900004000,1789900004000);
INSERT OR REPLACE INTO source_material_version (id,source_material_id,source_version,read_state,name,media_type,byte_length,content_sha256,content_locator,retrieved_at,source_updated_at,gmt_create,gmt_modified)
VALUES ('smv-tc-ins-001','sm-tc-ins-001','mv-1','VERIFIED','桂语庭施工单扫描件.pdf','application/pdf',204857,'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1','filestore://tc-ins/smv-001',1789900004000,1789900004000,1789900004000,1789900004000);
INSERT OR REPLACE INTO source_material_version (id,source_material_id,source_version,read_state,name,media_type,byte_length,content_sha256,content_locator,retrieved_at,source_updated_at,gmt_create,gmt_modified)
VALUES ('smv-tc-ins-002','sm-tc-ins-002','mv-1','VERIFIED','桂语庭安装明细表.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',58312,'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2','filestore://tc-ins/smv-002',1789900004000,1789900004000,1789900004000,1789900004000);

-- 5. 解析调用与结果（guard_parsing_call 要求 material_parsing.run_id 对应 PARSE_MATERIAL capability_call；
--    PDF 第 1 页含图片描述块 b3；XLSX sheet 安装明细含表格块 c1）
INSERT OR REPLACE INTO background_job (id,purpose,service_provider_id,work_item_id,external_write_id,target_json,dedupe_key,status,available_at,lease_epoch,lease_token,lease_owner,lease_until,row_version,outcome_json,gmt_create,gmt_modified)
VALUES ('job-tc-ins-parse-001','PARSE_MATERIAL','sp-tc-ins-anjia',NULL,NULL,'{"materialVersionId":"smv-tc-ins-001"}','dk-tc-ins-parse-001','READY',NULL,0,NULL,NULL,NULL,1,NULL,1789900005000,1789900005000);
INSERT OR REPLACE INTO capability_call (id,job_id,operation,source_material_version_id,input_snapshot_id,profile_id,implementation_version,config_json,input_sha256,gmt_create,gmt_modified)
VALUES ('run-tc-ins-parse-001','job-tc-ins-parse-001','PARSE_MATERIAL','smv-tc-ins-001',NULL,'profile-parse-pdf-1','parse-impl-1.0.0','{}','a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1',1789900005000,1789900005000);
INSERT OR REPLACE INTO material_parsing (id,run_id,source_material_version_id,content_sha256,profile_id,implementation_version,completeness,units_json,blocks_json,issues_json,gmt_create,gmt_modified)
VALUES ('parse-tc-ins-001','run-tc-ins-parse-001','smv-tc-ins-001','a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1','profile-parse-pdf-1','parse-impl-1.0.0','COMPLETE',
'[{"unitId":"u1","kind":"PDF_PAGE","index":1,"name":null,"status":"COMPLETE"}]',
'[{"blockId":"b1","unitId":"u1","kind":"TEXT","text":"交流充电桩（7kW）安装 2 台，京东采购供料，车位立柱安装及接线调试","cellRange":null,"formula":null,"cachedValue":null},{"blockId":"b2","unitId":"u1","kind":"TEXT","text":"漏电保护开关安装 2 个，配电箱内","cellRange":null,"formula":null,"cachedValue":null},{"blockId":"b3","unitId":"u1","kind":"IMAGE_DESCRIPTION","text":"施工现场照片，可见充电桩立柱与车位，疑似有签字","cellRange":null,"formula":null,"cachedValue":null}]',
'[]',1789900005000,1789900005000);
INSERT OR REPLACE INTO background_job (id,purpose,service_provider_id,work_item_id,external_write_id,target_json,dedupe_key,status,available_at,lease_epoch,lease_token,lease_owner,lease_until,row_version,outcome_json,gmt_create,gmt_modified)
VALUES ('job-tc-ins-parse-002','PARSE_MATERIAL','sp-tc-ins-anjia',NULL,NULL,'{"materialVersionId":"smv-tc-ins-002"}','dk-tc-ins-parse-002','READY',NULL,0,NULL,NULL,NULL,1,NULL,1789900005000,1789900005000);
INSERT OR REPLACE INTO capability_call (id,job_id,operation,source_material_version_id,input_snapshot_id,profile_id,implementation_version,config_json,input_sha256,gmt_create,gmt_modified)
VALUES ('run-tc-ins-parse-002','job-tc-ins-parse-002','PARSE_MATERIAL','smv-tc-ins-002',NULL,'profile-parse-xlsx-1','parse-impl-1.0.0','{}','b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2',1789900005000,1789900005000);
INSERT OR REPLACE INTO material_parsing (id,run_id,source_material_version_id,content_sha256,profile_id,implementation_version,completeness,units_json,blocks_json,issues_json,gmt_create,gmt_modified)
VALUES ('parse-tc-ins-002','run-tc-ins-parse-002','smv-tc-ins-002','b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2','profile-parse-xlsx-1','parse-impl-1.0.0','COMPLETE',
'[{"unitId":"s1","kind":"SHEET","index":1,"name":"安装明细","status":"COMPLETE"}]',
'[{"blockId":"c1","unitId":"s1","kind":"TABLE_CELL","text":"电缆敷设 52米 服务商供料 配电箱至车位","cellRange":"B5:F5","formula":null,"cachedValue":null}]',
'[]',1789900005000,1789900005000);

-- 6. 分析输入封存（先输入项后快照）
INSERT OR REPLACE INTO analysis_input_item (id,snapshot_id,input_key,input_kind,record_type,source_system,source_record_id,source_version,data_json,parsing_id,retrieved_at,gmt_create,gmt_modified)
VALUES ('aii-tc-ins-001','ais-tc-ins-001','parse-tc-ins-001','PARSED_MATERIAL',NULL,NULL,NULL,NULL,NULL,'parse-tc-ins-001',1789900006000,1789900006000,1789900006000);
INSERT OR REPLACE INTO analysis_input_item (id,snapshot_id,input_key,input_kind,record_type,source_system,source_record_id,source_version,data_json,parsing_id,retrieved_at,gmt_create,gmt_modified)
VALUES ('aii-tc-ins-002','ais-tc-ins-001','parse-tc-ins-002','PARSED_MATERIAL',NULL,NULL,NULL,NULL,NULL,'parse-tc-ins-002',1789900006000,1789900006000,1789900006000);
INSERT OR REPLACE INTO analysis_input_snapshot (analysis_generation,id,work_item_id,service_provider_id,expected_work_item_version,skill,skill_version,output_schema_version,config_versions_json,required_input_state,input_issues_json,input_item_count,content_sha256,gmt_create,gmt_modified)
VALUES (1,'ais-tc-ins-001','wi-tc-ins-prep-1','sp-tc-ins-anjia',5,'INSTALLATION_EXTRACTION','1.0.0','1.0.0','[]','COMPLETE','[]',2,'c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3',1789900006000,1789900006000);

-- 7. 分析调用与结果（guard_analysis_call 要求 run_id 对应 ANALYZE_SKILL capability_call；
--    NEEDS_INFORMATION：电缆数量冲突 + 缺批准记录；f1 的第二条证据为图片描述 b3，quote=null）
INSERT OR REPLACE INTO background_job (id,purpose,service_provider_id,work_item_id,external_write_id,target_json,dedupe_key,status,available_at,lease_epoch,lease_token,lease_owner,lease_until,row_version,outcome_json,gmt_create,gmt_modified)
VALUES ('job-tc-ins-an-001','ANALYZE_SKILL','sp-tc-ins-anjia','wi-tc-ins-prep-1',NULL,'{"inputSnapshotId":"ais-tc-ins-001"}','dk-tc-ins-an-001','READY',NULL,0,NULL,NULL,NULL,1,NULL,1789900007000,1789900007000);
INSERT OR REPLACE INTO capability_call (id,job_id,operation,source_material_version_id,input_snapshot_id,profile_id,implementation_version,config_json,input_sha256,gmt_create,gmt_modified)
VALUES ('run-tc-ins-an-001','job-tc-ins-an-001','ANALYZE_SKILL',NULL,'ais-tc-ins-001','profile-extract-1','skill-impl-1.0.0','{}','c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3',1789900007000,1789900007000);
INSERT OR REPLACE INTO analysis_result (id,run_id,work_item_id,snapshot_id,profile_id,implementation_version,status,summary,findings_json,open_questions_json,validated_at,gmt_create,gmt_modified)
VALUES ('ar-tc-ins-001','run-tc-ins-an-001','wi-tc-ins-prep-1','ais-tc-ins-001','profile-extract-1','skill-impl-1.0.0','NEEDS_INFORMATION','已整理 3 项安装明细；电缆敷设数量在施工单与明细表之间冲突，另缺配电箱改造批准记录',
'[{"findingId":"f1","type":"INSTALLATION_FACT","content":{"installationItem":"交流充电桩（7kW）安装","installedQuantity":2,"unit":"台","materialSupplier":"京东采购供料","serviceScope":"车位立柱安装及接线调试"},"evidenceRefs":[{"inputId":"parse-tc-ins-001","blockId":"b1","jsonPointer":null,"quote":"交流充电桩（7kW）安装 2 台"},{"inputId":"parse-tc-ins-001","blockId":"b3","jsonPointer":null,"quote":null}]},{"findingId":"f2","type":"INSTALLATION_FACT","content":{"installationItem":"电缆敷设","installedQuantity":null,"unit":"米","materialSupplier":"服务商供料","serviceScope":"配电箱至车位"},"evidenceRefs":[{"inputId":"parse-tc-ins-002","blockId":"c1","jsonPointer":null,"quote":"电缆敷设 52米"}]},{"findingId":"f3","type":"INSTALLATION_FACT","content":{"installationItem":"漏电保护开关安装","installedQuantity":2,"unit":"个","materialSupplier":"服务商供料","serviceScope":"配电箱内"},"evidenceRefs":[{"inputId":"parse-tc-ins-001","blockId":"b2","jsonPointer":null,"quote":"漏电保护开关安装 2 个"}]}]',
'[{"questionId":"q1","description":"电缆敷设数量在施工单（45米）与明细表（52米）之间冲突，需确认实际敷设长度"},{"questionId":"q2","description":"缺少配电箱改造批准记录，需补充批准单"}]',
1789900007000,1789900007000,1789900007000);

-- 8. 草稿初版（origin=AI，3 行明细，行 2 数量 null，2 条待核实问题）与草稿指针
INSERT OR REPLACE INTO installation_draft_version (id,installation_draft_id,work_item_id,version_no,parent_version_id,analysis_result_id,context_snapshot_id,origin,editor_identity_id,items_json,source_materials_json,open_questions_json,edit_notes_json,save_key,gmt_create,gmt_modified)
VALUES ('dv-tc-ins-001','draft-tc-ins-001','wi-tc-ins-prep-1',1,NULL,'ar-tc-ins-001','ctxs-tc-ins-001','AI',NULL,
'[{"installationItem":"交流充电桩（7kW）安装","installedQuantity":2,"unit":"台","materialSupplier":"京东采购供料","serviceScope":"车位立柱安装及接线调试"},{"installationItem":"电缆敷设","installedQuantity":null,"unit":"米","materialSupplier":"服务商供料","serviceScope":"配电箱至车位"},{"installationItem":"漏电保护开关安装","installedQuantity":2,"unit":"个","materialSupplier":"服务商供料","serviceScope":"配电箱内"}]',
'[{"sourceSystem":"installation_management","sourceMaterialId":"MAT-GYT-SGD-01","sourceVersion":"mv-1"},{"sourceSystem":"installation_management","sourceMaterialId":"MAT-GYT-MXB-01","sourceVersion":"mv-1"}]',
'[{"questionId":"q1","description":"电缆敷设数量在施工单（45米）与明细表（52米）之间冲突，需确认实际敷设长度"},{"questionId":"q2","description":"缺少配电箱改造批准记录，需补充批准单"}]',
'[]','sk-tc-ins-dv-001',1789900008000,1789900008000);
INSERT OR REPLACE INTO installation_draft (id,work_item_id,current_version_id,row_version,gmt_create,gmt_modified)
VALUES ('draft-tc-ins-001','wi-tc-ins-prep-1','dv-tc-ins-001',1,1789900008000,1789900008000);

-- 9. 发布当前分析指针（guard_current_analysis 校验结果、快照与事项一致）
UPDATE work_item SET current_analysis_result_id='ar-tc-ins-001', row_version=6, gmt_modified=1789900008000 WHERE id='wi-tc-ins-prep-1' AND row_version=5;

-- 数据清理：候选 DDL 全部业务表受 no_delete 触发器保护，不能逐行 DELETE；
-- 清理方式为销毁隔离测试库并重新建表（之后如需再次执行本 SEED，在空库上重跑即可）。
