-- TC-COO-09.sql 停止决定（成功 / 缺依据 42201 / 未决写入 40903 / 越权 40301 / 不可见 40404）
-- 上游（我引用）：work-item-schema.md §3、§5；execution-schema.md §2 external_write_operation；coordination-apis.md §4
-- 下游（引用我）：docs/06-testcase/coord/tc-coord-用例详情.md TC-COO-09
-- 前置：已执行 TC-COO-SEED.sql

-- ===== 数据准备 =====
-- 被停止的协同事项（子场景 a 缺依据、子场景 c 成功停止共用，按步骤顺序执行）
INSERT INTO work_item
 (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, responsibility_version, row_version, analysis_generation, gmt_create, gmt_modified)
VALUES
 ('wi-coo-stop-09', 'sp-lanshan-dev', 'wo-lanshan-001', 'COORDINATION', 'bk-coo-stop-09',
  '["sp-lanshan-dev","COORDINATION","WORK_ORDER","JD-INSTALL","WO-LANSHAN-001","ENTRY_TIME","JD-INSTALL","WO-LANSHAN-001","CONFIRM_ENTRY"]',
  'ck-coo-stop-09', '澜山府物业入场时间待确认', 'READY', 'id-coord-zhang', 1, 1, 1, 1789948800000, 1789948800000),
-- 存在未决外部写入的资料事项（子场景 b：40903）
 ('wi-pre-pend-09', 'sp-lanshan-dev', 'wo-lanshan-001', 'INSTALLATION_PREPARATION', 'bk-pre-pend-09',
  '["sp-lanshan-dev","INSTALLATION_PREPARATION","WORK_ORDER","JD-INSTALL","WO-LANSHAN-001","DRAFT","JD-INSTALL","WO-LANSHAN-001","SUBMIT_INSTALLATION"]',
  'ck-pre-pend-09', '澜山府安装资料提交', 'PROCESSING', 'id-coord-zhang', 1, 2, 1, 1789948800000, 1789948900000);

-- 未决写入链：原提交决定 → 外部写入（RESULT_UNKNOWN）→ 事项 pending_write_id
INSERT INTO human_decision
 (id, work_item_id, service_provider_id, origin, action_type, request_key, actor_identity_id, identity_context_id, matched_grants_json, expected_work_item_version, expected_responsibility_version, confirmed_at, content_json, gmt_create, gmt_modified)
VALUES
 ('hd-submit-09', 'wi-pre-pend-09', 'sp-lanshan-dev', 'LOCAL', 'SUBMIT_INSTALLATION', 'rk-submit-09', 'id-coord-zhang', 'ci-coord-zhang', '["grant-coord-1"]', 1, 1, 1789948900000,
  '{"submissionId":"ewo-pend-09","note":"安装明细提交"}', 1789948900000, 1789948900000);

INSERT INTO external_write_operation
 (id, human_decision_id, work_item_id, service_provider_id, installation_work_order_id, source_system, interface_kind, action, request_json, content_sha256, status, receipt_json, verified_at, row_version, gmt_create, gmt_modified)
VALUES
 ('ewo-pend-09', 'hd-submit-09', 'wi-pre-pend-09', 'sp-lanshan-dev', 'wo-lanshan-001', 'JD-INSTALL', 'INSTALLATION_SUBMIT', 'SUBMIT_INSTALLATION',
  '{"submissionId":"ewo-pend-09","operation":"SUBMIT_INSTALLATION"}', '0000000000000000000000000000000000000000000000000000000000000000',
  'RESULT_UNKNOWN', NULL, NULL, 1, 1789948900000, 1789948900000);

UPDATE work_item SET pending_write_id = 'ewo-pend-09', row_version = 3, gmt_modified = 1789948950000 WHERE id = 'wi-pre-pend-09';

-- ===== 数据清理 =====
DELETE FROM activity_record WHERE work_item_id IN ('wi-coo-stop-09', 'wi-pre-pend-09');
DELETE FROM human_decision WHERE work_item_id IN ('wi-coo-stop-09', 'wi-pre-pend-09');
DELETE FROM external_write_operation WHERE id = 'ewo-pend-09';
DELETE FROM work_item WHERE id IN ('wi-coo-stop-09', 'wi-pre-pend-09');
