-- TC-REV-SEED.sql 安装核查与补充域共用种子数据（自包含，可重复执行）
-- 上游（我引用）：docs/03-foundation/03-05-schema/work-item-schema.md §2—3、§5—6；evidence-schema.md §2；installation-schema.md §2
-- 下游（引用我）：docs/06-testcase/review/sql/TC-REV-01.sql ～ TC-REV-18.sql
-- 前置：已加载 work-item-schema / evidence-schema / installation-schema 候选 DDL（及 identity-schema 的 identity_reference 表）
-- 注意：候选 DDL 的 no_replace / no_delete 触发器与本文件的 INSERT OR REPLACE、各用例清理 DELETE 冲突；
--       本目录全部 SQL 仅在未启用这两个触发器的独立测试库执行（见 tc-review.md 二、前置条件）
-- 时间基准：1789920000000（UTC 毫秒，约 2026-09-19T00:00:00Z），同文件内递增

-- ============ 数据准备 ============

-- 服务商与三个场景工单（source_state 枚举未在 schema 文档展开，取合法默认 UNKNOWN）
INSERT OR REPLACE INTO service_provider (id, source_system, source_id, display_name, source_version, source_state, verified_at, gmt_create, gmt_modified)
VALUES ('sp-hongrun', 'jd-install-oms', 'PRV-HONGRUN-01', '泓润安装服务', 'sp-v2', 'UNKNOWN', 1789920000000, 1789920000000, 1789920000000);

INSERT OR REPLACE INTO installation_work_order (id, source_system, source_id, current_service_provider_id, source_version, source_state, context_snapshot_id, verified_at, gmt_create, gmt_modified) VALUES
('wo-chunheting', 'jd-install-oms', 'WO-CHT-2026-001', 'sp-hongrun', 'wo-v5', 'UNKNOWN', 'ics-cht-v1', 1789920000100, 1789920000100, 1789920000100),
('wo-shanglanfu', 'jd-install-oms', 'WO-SLF-2026-002', 'sp-hongrun', 'wo-v2', 'UNKNOWN', 'ics-slf-v1', 1789920000100, 1789920000100, 1789920000100),
('wo-jinxiuli',  'jd-install-oms', 'WO-JXL-2026-003', 'sp-hongrun', 'wo-v1', 'UNKNOWN', 'ics-jxl-v1', 1789920000100, 1789920000100, 1789920000100);

-- 身份：京东核查人（当前责任人）、另一核查人（非责任人）、服务商资料责任人、无决定权限查看人
INSERT OR REPLACE INTO identity_reference (id, identity_source, subject_id, subject_type, display_name, gmt_create, gmt_modified) VALUES
('idt-reviewer-li',   'jd-sso', 'EMP-LI-001',   'HUMAN', '李核查', 1789920000200, 1789920000200),
('idt-reviewer-chen', 'jd-sso', 'EMP-CHEN-002', 'HUMAN', '陈核查', 1789920000200, 1789920000200),
('idt-provider-wang', 'jd-sso', 'EMP-WANG-003', 'HUMAN', '王资料', 1789920000200, 1789920000200),
('idt-viewer-zhao',   'jd-sso', 'EMP-ZHAO-004', 'HUMAN', '赵查看', 1789920000200, 1789920000200);

-- 春和庭方案/明细身份与完整上下文快照：方案 12 米 vs 明细 18 米（PRD §7#1 输入条件）
INSERT OR REPLACE INTO installation_plan (id, installation_work_order_id, source_system, source_id, gmt_create, gmt_modified)
VALUES ('iplan-cht', 'wo-chunheting', 'jd-install-oms', 'PLAN-CHT-01', 1789920000300, 1789920000300);
INSERT OR REPLACE INTO installation_detail (id, installation_work_order_id, source_system, source_id, gmt_create, gmt_modified)
VALUES ('idtl-cht', 'wo-chunheting', 'jd-install-oms', 'DTL-CHT-01', 1789920000300, 1789920000300);

INSERT OR REPLACE INTO installation_context_snapshot (id, installation_work_order_id, service_provider_id, source_work_order_version, installation_plan_id, source_plan_version, installation_detail_id, source_detail_version, detail_status, completeness, missing_parts_json, context_json, retrieved_at, gmt_create, gmt_modified) VALUES
('ics-cht-v1', 'wo-chunheting', 'sp-hongrun', 'wo-v5', 'iplan-cht', 'plan-v3', 'idtl-cht', 'dtl-v2', 'SUBMITTED', 'COMPLETE', '[]',
 '{"retrievedAt":"2026-09-19T00:00:03+00:00","completeness":"COMPLETE","missingParts":[],"installationWorkOrder":{"sourceSystem":"jd-install-oms","sourceId":"WO-CHT-2026-001","purchaseOrderId":"PO-CHT-1001","sourceVersion":"wo-v5"},"installationPlan":{"sourceId":"PLAN-CHT-01","sourceVersion":"plan-v3","items":[{"installationItem":"充电桩电缆敷设","plannedQuantity":12,"unit":"米","materialSupplier":"服务商","serviceScope":"车位线槽敷设"}]},"installationDetailStatus":"SUBMITTED","installationDetail":{"sourceId":"DTL-CHT-01","sourceVersion":"dtl-v2","items":[{"installationItem":"充电桩电缆敷设","installedQuantity":18,"unit":"米","materialSupplier":"服务商","serviceScope":"车位线槽敷设"}]},"sourceMaterialIndexComplete":true,"sourceMaterials":[{"sourceSystem":"jd-install-oms","sourceMaterialId":"MAT-YS-01","sourceVersion":"ys-v1"}]}',
 1789920000300, 1789920000300, 1789920000300),
-- 尚澜府费用场景上下文：明细含增量施工 6 米，材料索引指向同一份施工验收单
('ics-slf-v1', 'wo-shanglanfu', 'sp-hongrun', 'wo-v2', NULL, 'plan-v1', NULL, 'dtl-v1', 'SUBMITTED', 'COMPLETE', '[]',
 '{"retrievedAt":"2026-09-19T00:00:03+00:00","completeness":"COMPLETE","missingParts":[],"installationWorkOrder":{"sourceSystem":"jd-install-oms","sourceId":"WO-SLF-2026-002","purchaseOrderId":"PO-SLF-2001","sourceVersion":"wo-v2"},"installationPlan":{"sourceId":"PLAN-SLF-01","sourceVersion":"plan-v1","items":[{"installationItem":"充电桩电缆敷设","plannedQuantity":12,"unit":"米","materialSupplier":"服务商","serviceScope":"车位线槽敷设"}]},"installationDetailStatus":"SUBMITTED","installationDetail":{"sourceId":"DTL-SLF-01","sourceVersion":"dtl-v1","items":[{"installationItem":"充电桩电缆敷设","installedQuantity":18,"unit":"米","materialSupplier":"服务商","serviceScope":"车位线槽敷设"}]},"sourceMaterialIndexComplete":true,"sourceMaterials":[{"sourceSystem":"jd-install-oms","sourceMaterialId":"MAT-YS-01","sourceVersion":"ys-v1"}]}',
 1789920000300, 1789920000300, 1789920000300),
-- 锦绣里失败场景上下文：材料索引不完整（现场照片正文未取得）
('ics-jxl-v1', 'wo-jinxiuli', 'sp-hongrun', 'wo-v1', NULL, 'plan-v1', NULL, 'dtl-v1', 'SUBMITTED', 'INCOMPLETE', '["现场照片 MAT-PH-01 正文未取得"]',
 '{"retrievedAt":"2026-09-19T00:00:03+00:00","completeness":"INCOMPLETE","missingParts":["现场照片 MAT-PH-01 正文未取得"],"installationWorkOrder":{"sourceSystem":"jd-install-oms","sourceId":"WO-JXL-2026-003","purchaseOrderId":"PO-JXL-3001","sourceVersion":"wo-v1"},"installationPlan":{"sourceId":"PLAN-JXL-01","sourceVersion":"plan-v1","items":[{"installationItem":"充电桩电缆敷设","plannedQuantity":12,"unit":"米","materialSupplier":"服务商","serviceScope":"车位线槽敷设"}]},"installationDetailStatus":"SUBMITTED","installationDetail":{"sourceId":"DTL-JXL-01","sourceVersion":"dtl-v1","items":[{"installationItem":"充电桩电缆敷设","installedQuantity":12,"unit":"米","materialSupplier":"服务商","serviceScope":"车位线槽敷设"}]},"sourceMaterialIndexComplete":false,"sourceMaterials":[{"sourceSystem":"jd-install-oms","sourceMaterialId":"MAT-PH-01","sourceVersion":"ph-v1"}]}',
 1789920000300, 1789920000300, 1789920000300);

-- 材料：施工验收单（VERIFIED，可取原文）、现场照片（REFERENCED，未取得正文，用于 42201）
INSERT OR REPLACE INTO source_material (id, source_system, source_material_id, gmt_create, gmt_modified) VALUES
('sm-yanshou', 'jd-install-oms', 'MAT-YS-01', 1789920000400, 1789920000400),
('sm-photo',   'jd-install-oms', 'MAT-PH-01', 1789920000400, 1789920000400);

INSERT OR REPLACE INTO source_material_version (id, source_material_id, source_version, read_state, name, media_type, byte_length, content_sha256, content_locator, retrieved_at, source_updated_at, gmt_create, gmt_modified) VALUES
('smv-yanshou-v1', 'sm-yanshou', 'ys-v1', 'VERIFIED', '施工验收单.pdf', 'application/pdf', 102400, '2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae', 'testfs://charging/yanshou-ys-v1.pdf', 1789920000400, NULL, 1789920000400, 1789920000400),
('smv-photo-v1',   'sm-photo',   'ph-v1', 'REFERENCED', '现场照片.jpg', NULL, NULL, NULL, NULL, NULL, NULL, 1789920000400, 1789920000400);

-- 施工验收单解析：b1 为验收正文 TEXT 块，b2 为图片描述块（IMAGE_DESCRIPTION，证据 quote 必须为 null）
INSERT OR REPLACE INTO material_parsing (id, run_id, source_material_version_id, content_sha256, profile_id, implementation_version, completeness, units_json, blocks_json, issues_json, gmt_create, gmt_modified)
VALUES ('mp-yanshou-v1', 'run-parse-yanshou-v1', 'smv-yanshou-v1', '2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae', 'profile-parse-pdf-1', 'parse-impl-1.0.0', 'COMPLETE',
 '[{"unitId":"u1","kind":"PDF_PAGE","index":1,"name":null,"status":"COMPLETE"}]',
 '[{"blockId":"b1","unitId":"u1","kind":"TEXT","text":"施工验收：电缆敷设 18 米，施工方签字确认","cellRange":null,"formula":null,"cachedValue":null},{"blockId":"b2","unitId":"u1","kind":"IMAGE_DESCRIPTION","text":"疑似签字照片，文字不可辨识","cellRange":null,"formula":null,"cachedValue":null}]',
 '[]', 1789920000500, 1789920000500);

-- 三个核查事项：春和庭 READY（差异核查）、尚澜府 READY（费用依据核查）、锦绣里 BLOCKED（材料读取失败）
INSERT OR REPLACE INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, responsibility_version, row_version, analysis_generation, current_analysis_result_id, current_reconciliation_id, integration_config_id, current_configuration_version_id, active_supplement_request_id, pending_write_id, blocked_reason, completion_code, completion_basis_json, completion_decision_id, completed_at, gmt_create, gmt_modified) VALUES
('wi-rev-cht', 'sp-hongrun', 'wo-chunheting', 'INSTALLATION_REVIEW', 'bk-rev-cht-001', '["sp-hongrun","INSTALLATION_REVIEW","INSTALLATION_WORK_ORDER","jd-install-oms","WO-CHT-2026-001","INSTALLATION_DETAIL","jd-install-oms","DTL-CHT-01","REVIEW"]', 'ck-rev-cht-001', '春和庭安装差异核查', 'READY', 'idt-reviewer-li', 1, 1, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1789920000600, 1789920000600),
('wi-rev-slf', 'sp-hongrun', 'wo-shanglanfu', 'INSTALLATION_REVIEW', 'bk-rev-slf-001', '["sp-hongrun","INSTALLATION_REVIEW","INSTALLATION_WORK_ORDER","jd-install-oms","WO-SLF-2026-002","INSTALLATION_DETAIL","jd-install-oms","DTL-SLF-01","REVIEW"]', 'ck-rev-slf-001', '尚澜府费用依据核查', 'READY', 'idt-reviewer-li', 1, 1, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1789920000600, 1789920000600),
('wi-rev-jxl', 'sp-hongrun', 'wo-jinxiuli', 'INSTALLATION_REVIEW', 'bk-rev-jxl-001', '["sp-hongrun","INSTALLATION_REVIEW","INSTALLATION_WORK_ORDER","jd-install-oms","WO-JXL-2026-003","INSTALLATION_DETAIL","jd-install-oms","DTL-JXL-01","REVIEW"]', 'ck-rev-jxl-001', '锦绣里分析失败恢复', 'BLOCKED', 'idt-reviewer-li', 1, 1, 1, NULL, NULL, NULL, NULL, NULL, NULL, '材料读取失败：现场照片 MAT-PH-01 版本 ph-v1 未取得正文', NULL, NULL, NULL, NULL, 1789920000600, 1789920000600);

-- ============ 数据清理（需要重建基线时执行） ============
-- DELETE FROM work_item WHERE id IN ('wi-rev-cht','wi-rev-slf','wi-rev-jxl');
-- DELETE FROM material_parsing WHERE id='mp-yanshou-v1';
-- DELETE FROM source_material_version WHERE id IN ('smv-yanshou-v1','smv-photo-v1');
-- DELETE FROM source_material WHERE id IN ('sm-yanshou','sm-photo');
-- DELETE FROM installation_context_snapshot WHERE id IN ('ics-cht-v1','ics-slf-v1','ics-jxl-v1');
-- DELETE FROM installation_detail WHERE id='idtl-cht';
-- DELETE FROM installation_plan WHERE id='iplan-cht';
-- DELETE FROM identity_reference WHERE id IN ('idt-reviewer-li','idt-reviewer-chen','idt-provider-wang','idt-viewer-zhao');
-- DELETE FROM installation_work_order WHERE id IN ('wo-chunheting','wo-shanglanfu','wo-jinxiuli');
-- DELETE FROM service_provider WHERE id='sp-hongrun';
