-- TC-ORD-SEED.sql 工单查询与处理追溯域共用种子数据（SQLite/D1 方言）
-- 上游：docs/03-foundation/03-05-schema/work-item-schema.md §2—7、evidence-schema.md §2—5、installation-schema.md §3、identity-schema.md §2、execution-schema.md §2
-- 重要约定：候选建表 SQL 对历史表装有 no_replace / no_delete 触发器，INSERT OR REPLACE 与 DELETE 会被 ABORT。
-- 故本文件不用 INSERT OR REPLACE，改用 INSERT ... WHERE NOT EXISTS 保证可重复执行且不与触发器冲突；
-- 历史保护表不做行级清理，测试数据统一使用 ord- 命名空间隔离，整体还原通过重建隔离测试库完成。
-- 运行授权由开发登录身份模拟配置发放（common-contract.md §1），本文件 identity/current_identity/business_permission
-- 仅为 human_decision.identity_context_id / matched_grants_json 提供真实可追溯引用，不作为运行时放行依据。

-- ============ 数据准备 ============

-- 服务商：服务商甲（主测）、服务商乙（跨服务商越权对照）
INSERT INTO service_provider (id,source_system,source_id,display_name,source_version,source_state,verified_at,gmt_create,gmt_modified)
SELECT 'sp-ord-a','PROVIDER-CRM','SP-JIA','服务商甲','spv-3','ACTIVE',1791000000000,1791000000000,1791000000000
WHERE NOT EXISTS (SELECT 1 FROM service_provider WHERE id='sp-ord-a');
INSERT INTO service_provider (id,source_system,source_id,display_name,source_version,source_state,verified_at,gmt_create,gmt_modified)
SELECT 'sp-ord-b','PROVIDER-CRM','SP-YI','服务商乙','spv-1','ACTIVE',1791000000000,1791000000000,1791000000000
WHERE NOT EXISTS (SELECT 1 FROM service_provider WHERE id='sp-ord-b');

-- 稳定身份：京东核查张明、服务商甲资料李工
INSERT INTO identity_reference (id,identity_source,subject_id,subject_type,display_name,gmt_create,gmt_modified)
SELECT 'id-ord-jd-01','JD-SSO','u-ord-jd-zhang','HUMAN','张明',1791000000000,1791000000000
WHERE NOT EXISTS (SELECT 1 FROM identity_reference WHERE id='id-ord-jd-01');
INSERT INTO identity_reference (id,identity_source,subject_id,subject_type,display_name,gmt_create,gmt_modified)
SELECT 'id-ord-sp-01','JD-SSO','u-ord-sp-li','HUMAN','李工',1791000000000,1791000000000
WHERE NOT EXISTS (SELECT 1 FROM identity_reference WHERE id='id-ord-sp-01');

-- 一次已封存身份上下文与授权项（供 hd-ord-01 引用；授权项先写、上下文最后封存）
INSERT INTO business_permission (id,context_id,grant_id,business_role,actions_json,scope_type,source_system,record_type,resource_ids_json,gmt_create,gmt_modified)
SELECT 'bp-ord-01','cid-ord-01','grant-ord-1','INSTALLATION_REVIEWER','["READ_WORK_ORDER","READ_WORK_ITEM","READ_SOURCE_MATERIAL"]','SERVICE_PROVIDER',NULL,NULL,'["sp-ord-a"]',1791000000000,1791000000000
WHERE NOT EXISTS (SELECT 1 FROM business_permission WHERE id='bp-ord-01');
INSERT INTO current_identity (id,identity_reference_id,subject_type,verified_at,valid_until,authorization_version,source_identities_json,grant_count,request_key,gmt_create,gmt_modified)
SELECT 'cid-ord-01','id-ord-jd-01','HUMAN',1791000000000,NULL,'authz-v1','[{"sourceSystem":"JD-SSO","subjectId":"u-ord-jd-zhang"}]',1,'rk-cid-ord-01',1791000000000,1791000000000
WHERE NOT EXISTS (SELECT 1 FROM current_identity WHERE id='cid-ord-01');

-- 安装工单：wo-ord-01（主测，有上下文与多阶段事项）、wo-ord-02（无事项无上下文工单）、wo-ord-03（服务商乙，越权对照）
INSERT INTO installation_work_order (id,source_system,source_id,current_service_provider_id,source_version,source_state,context_snapshot_id,verified_at,gmt_create,gmt_modified)
SELECT 'wo-ord-01','JD-IWO','WO-2026-0001','sp-ord-a','wv-5','ACTIVE','ctx-ord-01',1791000000000,1791000000000,1791000080000
WHERE NOT EXISTS (SELECT 1 FROM installation_work_order WHERE id='wo-ord-01');
INSERT INTO installation_work_order (id,source_system,source_id,current_service_provider_id,source_version,source_state,context_snapshot_id,verified_at,gmt_create,gmt_modified)
SELECT 'wo-ord-02','JD-IWO','WO-2026-0002','sp-ord-a','wv-2','ACTIVE',NULL,1791000000000,1791000000000,1791000002000
WHERE NOT EXISTS (SELECT 1 FROM installation_work_order WHERE id='wo-ord-02');
INSERT INTO installation_work_order (id,source_system,source_id,current_service_provider_id,source_version,source_state,context_snapshot_id,verified_at,gmt_create,gmt_modified)
SELECT 'wo-ord-03','JD-IWO','WO-2026-1001','sp-ord-b','wv-1','ACTIVE',NULL,1791000000000,1791000000000,1791000002000
WHERE NOT EXISTS (SELECT 1 FROM installation_work_order WHERE id='wo-ord-03');

-- 本地方案身份（上下文快照逻辑引用）
INSERT INTO installation_plan (id,installation_work_order_id,source_system,source_id,gmt_create,gmt_modified)
SELECT 'plan-ord-01','wo-ord-01','JD-IWO','PLAN-2026-0001',1791000000500,1791000000500
WHERE NOT EXISTS (SELECT 1 FROM installation_plan WHERE id='plan-ord-01');

-- wo-ord-01 的当前上下文快照：含购买订单 PO-2026-9001、当前方案与两条材料索引（MAT-ORD-009 未导入本地）
INSERT INTO installation_context_snapshot (id,installation_work_order_id,service_provider_id,source_work_order_version,installation_plan_id,source_plan_version,installation_detail_id,source_detail_version,detail_status,completeness,missing_parts_json,context_json,retrieved_at,gmt_create,gmt_modified)
SELECT 'ctx-ord-01','wo-ord-01','sp-ord-a','wv-5','plan-ord-01','pv-2',NULL,NULL,'NOT_SUBMITTED','COMPLETE','[]',
'{"installationWorkOrder":{"purchaseOrderId":"PO-2026-9001","workOrderSourceVersion":"wv-5"},"installationPlan":{"installationPlanId":"plan-ord-01","sourcePlanVersion":"pv-2","installedQuantity":2,"serviceScope":"家用充电桩基础安装"},"sourceMaterials":[{"sourceSystem":"JD-IWO","sourceMaterialId":"MAT-ORD-001","sourceVersion":"mv-1","name":"安装现场确认单.pdf"},{"sourceSystem":"JD-IWO","sourceMaterialId":"MAT-ORD-009","sourceVersion":"mv-1","name":"补充说明.xlsx"}],"completeness":"COMPLETE","missingParts":[],"retrievedAt":1791000000000}',
1791000000000,1791000001000,1791000001000
WHERE NOT EXISTS (SELECT 1 FROM installation_context_snapshot WHERE id='ctx-ord-01');

-- 处理事项：已完成资料整理 + 进行中核查（京东责任）+ 进行中业务对账（服务商责任）+ 配置事项（不属于任何工单）+ 服务商乙核查事项
INSERT INTO work_item (id,service_provider_id,installation_work_order_id,item_kind,business_key,business_identity_json,creation_key,title,status,assignee_identity_id,responsibility_version,row_version,analysis_generation,current_analysis_result_id,current_reconciliation_id,integration_config_id,current_configuration_version_id,active_supplement_request_id,pending_write_id,blocked_reason,completion_code,completion_basis_json,completion_decision_id,completed_at,gmt_create,gmt_modified)
SELECT 'wi-ord-prep','sp-ord-a','wo-ord-01','INSTALLATION_PREPARATION','bk-ord-prep','["sp-ord-a","INSTALLATION_PREPARATION","WORK_ORDER","JD-IWO","WO-2026-0001","STAGE","JD-IWO","FIRST_SUBMIT","SUBMIT_INSTALLATION"]','ck-ord-prep','WO-2026-0001 安装资料整理与提交','COMPLETED','id-ord-sp-01',1,2,1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'INSTALLATION_SUBMITTED','{"submissionId":"sub-ord-001","result":"SOURCE_SUCCEEDED"}',NULL,1791000003000,1791000001000,1791000003000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id='wi-ord-prep');
INSERT INTO work_item (id,service_provider_id,installation_work_order_id,item_kind,business_key,business_identity_json,creation_key,title,status,assignee_identity_id,responsibility_version,row_version,analysis_generation,current_analysis_result_id,current_reconciliation_id,integration_config_id,current_configuration_version_id,active_supplement_request_id,pending_write_id,blocked_reason,completion_code,completion_basis_json,completion_decision_id,completed_at,gmt_create,gmt_modified)
SELECT 'wi-ord-rev','sp-ord-a','wo-ord-01','INSTALLATION_REVIEW','bk-ord-rev','["sp-ord-a","INSTALLATION_REVIEW","WORK_ORDER","JD-IWO","WO-2026-0001","STAGE","JD-IWO","FORMAL_REVIEW","DECIDE_REVIEW"]','ck-ord-rev','WO-2026-0001 安装核查','READY','id-ord-jd-01',1,1,1,'ar-ord-seed',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,1791000003000,1791000003000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id='wi-ord-rev');
INSERT INTO work_item (id,service_provider_id,installation_work_order_id,item_kind,business_key,business_identity_json,creation_key,title,status,assignee_identity_id,responsibility_version,row_version,analysis_generation,current_analysis_result_id,current_reconciliation_id,integration_config_id,current_configuration_version_id,active_supplement_request_id,pending_write_id,blocked_reason,completion_code,completion_basis_json,completion_decision_id,completed_at,gmt_create,gmt_modified)
SELECT 'wi-ord-recon','sp-ord-a','wo-ord-01','RECONCILIATION','bk-ord-recon','["sp-ord-a","RECONCILIATION","WORK_ORDER","JD-IWO","WO-2026-0001","STAGE","JD-IWO","ORDER_RECONCILE","RECONCILE"]','ck-ord-recon','WO-2026-0001 业务对账','PROCESSING','id-ord-sp-01',1,1,1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,1791000004000,1791000004000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id='wi-ord-recon');
INSERT INTO work_item (id,service_provider_id,installation_work_order_id,item_kind,business_key,business_identity_json,creation_key,title,status,assignee_identity_id,responsibility_version,row_version,analysis_generation,current_analysis_result_id,current_reconciliation_id,integration_config_id,current_configuration_version_id,active_supplement_request_id,pending_write_id,blocked_reason,completion_code,completion_basis_json,completion_decision_id,completed_at,gmt_create,gmt_modified)
SELECT 'wi-ord-cfg','sp-ord-a',NULL,'CONFIGURATION','bk-ord-cfg','["sp-ord-a","CONFIGURATION","CONFIGURATION","JD-INTCFG","CFG-ORD-001","STAGE","JD-INTCFG","ENABLE","ENABLE_CONFIGURATION"]','ck-ord-cfg','服务商甲接入配置确认','READY','id-ord-jd-01',1,1,1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,1791000004000,1791000004000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id='wi-ord-cfg');
INSERT INTO work_item (id,service_provider_id,installation_work_order_id,item_kind,business_key,business_identity_json,creation_key,title,status,assignee_identity_id,responsibility_version,row_version,analysis_generation,current_analysis_result_id,current_reconciliation_id,integration_config_id,current_configuration_version_id,active_supplement_request_id,pending_write_id,blocked_reason,completion_code,completion_basis_json,completion_decision_id,completed_at,gmt_create,gmt_modified)
SELECT 'wi-ord-b','sp-ord-b','wo-ord-03','INSTALLATION_REVIEW','bk-ord-b','["sp-ord-b","INSTALLATION_REVIEW","WORK_ORDER","JD-IWO","WO-2026-1001","STAGE","JD-IWO","FORMAL_REVIEW","DECIDE_REVIEW"]','ck-ord-b','WO-2026-1001 安装核查','READY','id-ord-jd-01',1,1,1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,1791000004000,1791000004000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id='wi-ord-b');

-- 人员确认与外部写入操作（供处理记录事实引用与 operations 结果块）
INSERT INTO human_decision (id,work_item_id,service_provider_id,origin,action_type,request_key,actor_identity_id,identity_context_id,matched_grants_json,expected_work_item_version,expected_responsibility_version,analysis_result_id,confirmed_at,content_json,source_system,source_record_type,source_record_id,source_actor_ref_json,gmt_create,gmt_modified)
SELECT 'hd-ord-01','wi-ord-rev','sp-ord-a','LOCAL','APPROVE','rk-ord-01','id-ord-jd-01','cid-ord-01','["grant-ord-1"]',1,1,'ar-ord-seed',1791000060000,'{"decision":"APPROVE","comment":"资料与现场一致"}',NULL,NULL,NULL,NULL,1791000060000,1791000060000
WHERE NOT EXISTS (SELECT 1 FROM human_decision WHERE id='hd-ord-01');
INSERT INTO external_write_operation (id,human_decision_id,work_item_id,service_provider_id,installation_work_order_id,source_system,interface_kind,action,request_json,content_sha256,status,receipt_json,verified_at,row_version,gmt_create,gmt_modified)
SELECT 'op-ord-01','hd-ord-01','wi-ord-rev','sp-ord-a','wo-ord-01','JD-IWO','REVIEW_SYNC','APPROVE','{"operationId":"op-ord-01","action":"APPROVE"}','abababababababababababababababababababababababababababababababab','REGISTERED',NULL,NULL,1,1791000060000,1791000060000
WHERE NOT EXISTS (SELECT 1 FROM external_write_operation WHERE id='op-ord-01');
UPDATE external_write_operation SET status='SUCCEEDED',receipt_json='{"receiptId":"rcpt-ord-001","finalState":"ACCEPTED"}',verified_at=1791000070000,row_version=2,gmt_modified=1791000070000
WHERE id='op-ord-01' AND status='REGISTERED';

-- 原始材料与版本：MAT-ORD-001 两个已核实版本（版本切换）；MAT-ORD-002 仅登记引用（原文未取得）；MAT-ORD-003 真实空白文件；MAT-ORD-004 解析不全
INSERT INTO source_material (id,source_system,source_material_id,gmt_create,gmt_modified)
SELECT 'sm-ord-001','JD-IWO','MAT-ORD-001',1791000010000,1791000010000
WHERE NOT EXISTS (SELECT 1 FROM source_material WHERE id='sm-ord-001');
INSERT INTO source_material (id,source_system,source_material_id,gmt_create,gmt_modified)
SELECT 'sm-ord-002','JD-IWO','MAT-ORD-002',1791000010000,1791000010000
WHERE NOT EXISTS (SELECT 1 FROM source_material WHERE id='sm-ord-002');
INSERT INTO source_material (id,source_system,source_material_id,gmt_create,gmt_modified)
SELECT 'sm-ord-003','JD-IWO','MAT-ORD-003',1791000010000,1791000010000
WHERE NOT EXISTS (SELECT 1 FROM source_material WHERE id='sm-ord-003');
INSERT INTO source_material (id,source_system,source_material_id,gmt_create,gmt_modified)
SELECT 'sm-ord-004','JD-IWO','MAT-ORD-004',1791000010000,1791000010000
WHERE NOT EXISTS (SELECT 1 FROM source_material WHERE id='sm-ord-004');

INSERT INTO source_material_version (id,source_material_id,source_version,read_state,name,media_type,byte_length,content_sha256,content_locator,retrieved_at,source_updated_at,gmt_create,gmt_modified)
SELECT 'smv-ord-001-v1','sm-ord-001','mv-1','VERIFIED','安装现场确认单.pdf','application/pdf',102400,'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1','files/ord/mat-001/mv-1.pdf',1791000010000,1791000009000,1791000010000,1791000010000
WHERE NOT EXISTS (SELECT 1 FROM source_material_version WHERE id='smv-ord-001-v1');
INSERT INTO source_material_version (id,source_material_id,source_version,read_state,name,media_type,byte_length,content_sha256,content_locator,retrieved_at,source_updated_at,gmt_create,gmt_modified)
SELECT 'smv-ord-001-v2','sm-ord-001','mv-2','VERIFIED','安装现场确认单.pdf','application/pdf',118784,'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2','files/ord/mat-001/mv-2.pdf',1791000010000,1791000009500,1791000010000,1791000010000
WHERE NOT EXISTS (SELECT 1 FROM source_material_version WHERE id='smv-ord-001-v2');
INSERT INTO source_material_version (id,source_material_id,source_version,read_state,name,media_type,byte_length,content_sha256,content_locator,retrieved_at,source_updated_at,gmt_create,gmt_modified)
SELECT 'smv-ord-002','sm-ord-002','mv-1','REFERENCED',NULL,NULL,NULL,NULL,NULL,NULL,NULL,1791000010000,1791000010000
WHERE NOT EXISTS (SELECT 1 FROM source_material_version WHERE id='smv-ord-002');
INSERT INTO source_material_version (id,source_material_id,source_version,read_state,name,media_type,byte_length,content_sha256,content_locator,retrieved_at,source_updated_at,gmt_create,gmt_modified)
SELECT 'smv-ord-003','sm-ord-003','mv-1','VERIFIED','空白确认页.pdf','application/pdf',2048,'c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3','files/ord/mat-003/mv-1.pdf',1791000010000,NULL,1791000010000,1791000010000
WHERE NOT EXISTS (SELECT 1 FROM source_material_version WHERE id='smv-ord-003');
INSERT INTO source_material_version (id,source_material_id,source_version,read_state,name,media_type,byte_length,content_sha256,content_locator,retrieved_at,source_updated_at,gmt_create,gmt_modified)
SELECT 'smv-ord-004','sm-ord-004','mv-1','VERIFIED','现场照片汇总.pdf','application/pdf',87654,'d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4','files/ord/mat-004/mv-1.pdf',1791000010000,NULL,1791000010000,1791000010000
WHERE NOT EXISTS (SELECT 1 FROM source_material_version WHERE id='smv-ord-004');

-- 材料解析：v1 完整（blk-ord-1 为证据引用定位目标）、v2 完整（内容不同）、空白文件 blocks=[]、解析不全 INCOMPLETE 带 issues
INSERT INTO material_parsing (id,run_id,source_material_version_id,content_sha256,profile_id,implementation_version,completeness,units_json,blocks_json,issues_json,gmt_create,gmt_modified)
SELECT 'mp-ord-001-v1','run-ord-p1','smv-ord-001-v1','a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1','profile-ord-parse','impl-1.0.0','COMPLETE',
'[{"unitId":"unit-1","kind":"PDF_PAGE","index":1,"name":null,"status":"COMPLETE"},{"unitId":"unit-2","kind":"PDF_PAGE","index":2,"name":null,"status":"COMPLETE"}]',
'[{"blockId":"blk-ord-1","unitId":"unit-1","kind":"TEXT","text":"现场已具备 380V 供电条件，配电箱距车位 12 米。","cellRange":null,"formula":null,"cachedValue":null},{"blockId":"blk-ord-2","unitId":"unit-2","kind":"TEXT","text":"施工完成后由物业验收签字。","cellRange":null,"formula":null,"cachedValue":null}]',
'[]',1791000020000,1791000020000
WHERE NOT EXISTS (SELECT 1 FROM material_parsing WHERE id='mp-ord-001-v1');
INSERT INTO material_parsing (id,run_id,source_material_version_id,content_sha256,profile_id,implementation_version,completeness,units_json,blocks_json,issues_json,gmt_create,gmt_modified)
SELECT 'mp-ord-001-v2','run-ord-p2','smv-ord-001-v2','b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2','profile-ord-parse','impl-1.0.0','COMPLETE',
'[{"unitId":"unit-1","kind":"PDF_PAGE","index":1,"name":null,"status":"COMPLETE"},{"unitId":"unit-2","kind":"PDF_PAGE","index":2,"name":null,"status":"COMPLETE"},{"unitId":"unit-3","kind":"PDF_PAGE","index":3,"name":null,"status":"COMPLETE"}]',
'[{"blockId":"blk-ord-v2-1","unitId":"unit-3","kind":"TEXT","text":"v2 新增车位照片说明。","cellRange":null,"formula":null,"cachedValue":null}]',
'[]',1791000020000,1791000020000
WHERE NOT EXISTS (SELECT 1 FROM material_parsing WHERE id='mp-ord-001-v2');
INSERT INTO material_parsing (id,run_id,source_material_version_id,content_sha256,profile_id,implementation_version,completeness,units_json,blocks_json,issues_json,gmt_create,gmt_modified)
SELECT 'mp-ord-003','run-ord-p3','smv-ord-003','c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3','profile-ord-parse','impl-1.0.0','COMPLETE',
'[{"unitId":"unit-1","kind":"PDF_PAGE","index":1,"name":null,"status":"COMPLETE"}]','[]','[]',1791000020000,1791000020000
WHERE NOT EXISTS (SELECT 1 FROM material_parsing WHERE id='mp-ord-003');
INSERT INTO material_parsing (id,run_id,source_material_version_id,content_sha256,profile_id,implementation_version,completeness,units_json,blocks_json,issues_json,gmt_create,gmt_modified)
SELECT 'mp-ord-004','run-ord-p4','smv-ord-004','d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4','profile-ord-parse','impl-1.0.0','INCOMPLETE',
'[{"unitId":"unit-1","kind":"PDF_PAGE","index":1,"name":null,"status":"COMPLETE"},{"unitId":"unit-2","kind":"PDF_PAGE","index":2,"name":null,"status":"UNREADABLE"}]',
'[{"blockId":"blk-ord-4-1","unitId":"unit-1","kind":"TEXT","text":"车位东侧已预留桥架。","cellRange":null,"formula":null,"cachedValue":null}]',
'[{"code":"PAGE_UNREADABLE","description":"第 2 页扫描件无法识别"}]',1791000020000,1791000020000
WHERE NOT EXISTS (SELECT 1 FROM material_parsing WHERE id='mp-ord-004');

-- 分析输入封存链（PARSED_MATERIAL → mp-ord-001-v1）与已采用分析结果（含 evidenceRefs 定位 blk-ord-1）
INSERT INTO analysis_input_item (id,snapshot_id,input_key,input_kind,record_type,source_system,source_record_id,source_version,data_json,parsing_id,retrieved_at,gmt_create,gmt_modified)
SELECT 'ii-ord-seed','sn-ord-seed','mp-ord-001-v1','PARSED_MATERIAL',NULL,NULL,NULL,NULL,NULL,'mp-ord-001-v1',1791000030000,1791000030000,1791000030000
WHERE NOT EXISTS (SELECT 1 FROM analysis_input_item WHERE id='ii-ord-seed');
INSERT INTO analysis_input_snapshot (id,analysis_generation,work_item_id,service_provider_id,expected_work_item_version,skill,skill_version,output_schema_version,config_versions_json,required_input_state,input_issues_json,input_item_count,content_sha256,gmt_create,gmt_modified)
SELECT 'sn-ord-seed',1,'wi-ord-rev','sp-ord-a',1,'INSTALLATION_EVIDENCE','1.0.0','1.0','[]','COMPLETE','[]',1,'e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5',1791000040000,1791000040000
WHERE NOT EXISTS (SELECT 1 FROM analysis_input_snapshot WHERE id='sn-ord-seed');
INSERT INTO analysis_result (id,run_id,work_item_id,snapshot_id,profile_id,implementation_version,status,summary,findings_json,open_questions_json,validated_at,gmt_create,gmt_modified)
SELECT 'ar-ord-seed','run-ord-a1','wi-ord-rev','sn-ord-seed','profile-ord-analysis','impl-1.0.0','ANALYZED','供电条件与现场确认单一致，无待核实问题。',
'[{"findingId":"f-ord-1","type":"EVIDENCE_CHECK","content":{"topic":"供电条件","explanation":"现场确认单第 1 页记载已具备 380V 供电条件。","assessment":"SUPPORTED"},"evidenceRefs":[{"inputId":"mp-ord-001-v1","blockId":"blk-ord-1","jsonPointer":null,"quote":"现场已具备 380V 供电条件，配电箱距车位 12 米。"}]}]',
'[]',1791000050000,1791000050000,1791000050000
WHERE NOT EXISTS (SELECT 1 FROM analysis_result WHERE id='ar-ord-seed');

-- ============ 数据清理 ============
-- 本 SEED 涉及的全部表均受历史保护触发器约束（no_delete/no_update/no_replace），不允许行级清理。
-- 种子行使用 ord- 固定命名空间且幂等可重入；如需彻底还原，重建隔离测试库后按
-- identity-schema.sql → work-item-schema.sql → evidence-schema.sql → installation-schema.sql → execution-schema.sql
-- 顺序重载候选 DDL，再重跑本文件。
