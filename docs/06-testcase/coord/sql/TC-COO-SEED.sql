-- TC-COO-SEED.sql 履约协同与异常域共用种子数据
-- 上游（我引用）：docs/03-foundation/03-05-schema/work-item-schema.md §2—3、identity-schema.md §2；docs/05-prd/07-subprd-coordination.md §4
-- 下游（引用我）：docs/06-testcase/coord/sql/TC-COO-NN.sql 全部场景文件
-- 约定：测试库按候选 DDL 建表但不含历史保护触发器（tr_*_no_delete / guard_*_no_replace / *_immutable），
-- 因此本文件可用 INSERT OR REPLACE 保证自包含、可重复执行。
-- 时间基准 t0 = 1789948800000（UTC 毫秒整数）。

-- 服务商与工单（澜山府基线）
INSERT OR REPLACE INTO service_provider
 (id, source_system, source_id, display_name, source_version, source_state, verified_at, gmt_create, gmt_modified)
VALUES
 ('sp-lanshan-dev', 'JD-INSTALL', 'SP-LANSHAN-001', '澜山府安装服务商', 'sp-v-20260918', 'ACTIVE', 1789948800000, 1789948800000, 1789948800000);

INSERT OR REPLACE INTO installation_work_order
 (id, source_system, source_id, current_service_provider_id, source_version, source_state, context_snapshot_id, verified_at, gmt_create, gmt_modified)
VALUES
 ('wo-lanshan-001', 'JD-INSTALL', 'WO-LANSHAN-001', 'sp-lanshan-dev', 'wo-v-20260918', 'ACTIVE', NULL, 1789948800000, 1789948800000, 1789948800000),
 ('wo-lanshan-002', 'JD-INSTALL', 'WO-LANSHAN-002', 'sp-lanshan-dev', 'wo-v-20260918', 'ACTIVE', NULL, 1789948800000, 1789948800000, 1789948800000);

-- 稳定身份：履约协同人员 / 核查人员 / 对账人员 / 无异常权限人员
INSERT OR REPLACE INTO identity_reference
 (id, identity_source, subject_id, subject_type, display_name, gmt_create, gmt_modified)
VALUES
 ('id-coord-zhang', 'JD-ERP', 'zhangxt', 'HUMAN', '张协同', 1789948800000, 1789948800000),
 ('id-review-li', 'JD-ERP', 'lihc', 'HUMAN', '李核查', 1789948800000, 1789948800000),
 ('id-recon-wang', 'JD-ERP', 'wangdz', 'HUMAN', '王对账', 1789948800000, 1789948800000),
 ('id-noperm-zhao', 'JD-ERP', 'zhaowq', 'HUMAN', '赵无权', 1789948800000, 1789948800000);

-- 授权上下文与授权项
-- 张协同：READ_WORK_ITEM + COMPLETE_FULFILLMENT_COORDINATION + RECORD_EXCEPTION_RESULT（澜山府服务商范围）
INSERT OR REPLACE INTO current_identity
 (id, identity_reference_id, subject_type, verified_at, valid_until, authorization_version, source_identities_json, grant_count, request_key, gmt_create, gmt_modified)
VALUES
 ('ci-coord-zhang', 'id-coord-zhang', 'HUMAN', 1789948800000, NULL, 'auth-v-1', '[{"source":"JD-ERP","account":"zhangxt"}]', 2, 'ci-req-coord-zhang-001', 1789948800000, 1789948800000),
 ('ci-review-li', 'id-review-li', 'HUMAN', 1789948800000, NULL, 'auth-v-1', '[{"source":"JD-ERP","account":"lihc"}]', 2, 'ci-req-review-li-001', 1789948800000, 1789948800000),
 ('ci-noperm-zhao', 'id-noperm-zhao', 'HUMAN', 1789948800000, NULL, 'auth-v-1', '[{"source":"JD-ERP","account":"zhaowq"}]', 1, 'ci-req-noperm-zhao-001', 1789948800000, 1789948800000);

INSERT OR REPLACE INTO business_permission
 (id, context_id, grant_id, business_role, actions_json, scope_type, source_system, record_type, resource_ids_json, gmt_create, gmt_modified)
VALUES
 ('bp-coord-1', 'ci-coord-zhang', 'grant-coord-1', 'FULFILLMENT_COORDINATOR', '["READ_WORK_ITEM","COMPLETE_FULFILLMENT_COORDINATION"]', 'SERVICE_PROVIDER', NULL, NULL, '["sp-lanshan-dev"]', 1789948800000, 1789948800000),
 ('bp-coord-2', 'ci-coord-zhang', 'grant-coord-2', 'FULFILLMENT_COORDINATOR', '["RECORD_EXCEPTION_RESULT"]', 'SERVICE_PROVIDER', NULL, NULL, '["sp-lanshan-dev"]', 1789948800000, 1789948800000),
 ('bp-review-1', 'ci-review-li', 'grant-review-1', 'INSTALLATION_REVIEWER', '["READ_WORK_ITEM","DECIDE_INSTALLATION_REVIEW"]', 'SERVICE_PROVIDER', NULL, NULL, '["sp-lanshan-dev"]', 1789948800000, 1789948800000),
 ('bp-review-2', 'ci-review-li', 'grant-review-2', 'INSTALLATION_REVIEWER', '["RECORD_EXCEPTION_RESULT"]', 'SERVICE_PROVIDER', NULL, NULL, '["sp-lanshan-dev"]', 1789948800000, 1789948800000),
 ('bp-noperm-1', 'ci-noperm-zhao', 'grant-noperm-1', 'FULFILLMENT_COORDINATOR', '["READ_WORK_ITEM"]', 'SERVICE_PROVIDER', NULL, NULL, '["sp-lanshan-dev"]', 1789948800000, 1789948800000);

-- 清理（需要重置种子时手动执行；正常流程不清种子）：
-- DELETE FROM business_permission WHERE context_id IN ('ci-coord-zhang','ci-review-li','ci-noperm-zhao');
-- DELETE FROM current_identity WHERE id IN ('ci-coord-zhang','ci-review-li','ci-noperm-zhao');
-- DELETE FROM identity_reference WHERE id IN ('id-coord-zhang','id-review-li','id-recon-wang','id-noperm-zhao');
-- DELETE FROM installation_work_order WHERE id IN ('wo-lanshan-001','wo-lanshan-002');
-- DELETE FROM service_provider WHERE id = 'sp-lanshan-dev';
