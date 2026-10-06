-- TC-COO-15.sql（UI）异常关闭后「继续办理原业务」与「回看异常结果」
-- 数据形态同 TC-COO-07，独立事项 id
-- 上游（我引用）：work-item-schema.md §3—5；coordination-apis.md §3；07-subprd-coordination.md §3.4
-- 下游（引用我）：docs/06-testcase/coord/tc-coord-用例详情.md TC-COO-15
-- 前置：已执行 TC-COO-SEED.sql

-- ===== 数据准备 =====
INSERT INTO work_item
 (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, responsibility_version, row_version, analysis_generation, gmt_create, gmt_modified)
VALUES
 ('wi-rev-ex-15', 'sp-lanshan-dev', 'wo-lanshan-001', 'INSTALLATION_REVIEW', 'bk-rev-ex-15',
  '["sp-lanshan-dev","INSTALLATION_REVIEW","WORK_ORDER","JD-INSTALL","WO-LANSHAN-001","DETAIL_CHECK","JD-INSTALL","WO-LANSHAN-001","DECIDE_INSTALLATION_REVIEW"]',
  'ck-rev-ex-15', '澜山府安装明细差异核查', 'EXCEPTION', 'id-review-li', 1, 2, 1, 1789948800000, 1789948900000);

INSERT INTO human_decision
 (id, work_item_id, service_provider_id, origin, action_type, request_key, actor_identity_id, identity_context_id, matched_grants_json, expected_work_item_version, expected_responsibility_version, confirmed_at, content_json, gmt_create, gmt_modified)
VALUES
 ('hd-open-15', 'wi-rev-ex-15', 'sp-lanshan-dev', 'LOCAL', 'OPEN_EXCEPTION', 'rk-open-15', 'id-review-li', 'ci-review-li', '["grant-review-2"]', 1, 1, 1789948900000,
  '{"reason":"服务商反馈现场电表容量不足，需物业扩容后核查","stage":"INSTALLATION_REVIEW","workOrderId":"wo-lanshan-001"}', 1789948900000, 1789948900000);

-- ===== 数据清理 =====
DELETE FROM activity_record WHERE work_item_id IN (SELECT to_work_item_id FROM work_item_link WHERE from_work_item_id = 'wi-rev-ex-15');
DELETE FROM work_item WHERE id IN (SELECT to_work_item_id FROM work_item_link WHERE from_work_item_id = 'wi-rev-ex-15');
DELETE FROM work_item_link WHERE from_work_item_id = 'wi-rev-ex-15';
DELETE FROM activity_record WHERE work_item_id = 'wi-rev-ex-15';
DELETE FROM human_decision WHERE work_item_id = 'wi-rev-ex-15';
DELETE FROM work_item WHERE id = 'wi-rev-ex-15';
