-- 开发事项种子：仅本地开发用，配合 dev-identity.sql。
-- 形态：INSERT ... WHERE NOT EXISTS；分析指针经条件 UPDATE 一次写入（行版本 +1）。

INSERT INTO installation_work_order (id, source_system, source_id, current_service_provider_id, source_version, source_state, context_snapshot_id, verified_at, gmt_create, gmt_modified)
SELECT 'wo-dev-1', 'DEV', 'WO-DEV-0001', 'provider-dev-a', 'dev-v1', 'ACTIVE', NULL, 1789862400000, 1789862400000, 1789862400000
WHERE NOT EXISTS (SELECT 1 FROM installation_work_order WHERE id = 'wo-dev-1');

INSERT INTO installation_work_order (id, source_system, source_id, current_service_provider_id, source_version, source_state, context_snapshot_id, verified_at, gmt_create, gmt_modified)
SELECT 'wo-dev-2', 'DEV', 'WO-DEV-0002', 'provider-dev-b', 'dev-v1', 'ACTIVE', NULL, 1789862400000, 1789862400000, 1789862400000
WHERE NOT EXISTS (SELECT 1 FROM installation_work_order WHERE id = 'wo-dev-2');

INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, responsibility_version, row_version, analysis_generation, gmt_create, gmt_modified)
SELECT 'w-dev-1', 'provider-dev-a', 'wo-dev-1', 'INSTALLATION_REVIEW', 'review-0001', '["provider-dev-a","wo-dev-1","review","review-0001"]', 'dev-seed-w1', '春和庭安装资料核查（开发）', 'READY', 'ir-dev-jd-review', 1, 1, 1, 1789862400000, 1789862400000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'w-dev-1');

INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, responsibility_version, row_version, analysis_generation, gmt_create, gmt_modified)
SELECT 'w-dev-2', 'provider-dev-b', 'wo-dev-2', 'INSTALLATION_PREPARATION', 'prep-0002', '["provider-dev-b","wo-dev-2","prep","prep-0002"]', 'dev-seed-w2', '河畔里安装资料整理（开发）', 'PREPARING', 'ir-dev-provider-clerk', 1, 1, 1, 1789862401000, 1789862401000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'w-dev-2');

INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, responsibility_version, row_version, analysis_generation, gmt_create, gmt_modified)
SELECT 'w-dev-3', 'provider-dev-a', 'wo-dev-1', 'COORDINATION', 'coord-0003', '["provider-dev-a","wo-dev-1","coord","coord-0003"]', 'dev-seed-w3', '春和庭入场履约协同（开发）', 'EXCEPTION', 'ir-dev-jd-review', 1, 1, 1, 1789862402000, 1789862402000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'w-dev-3');

INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, responsibility_version, row_version, analysis_generation, blocked_reason, gmt_create, gmt_modified)
SELECT 'w-dev-4', 'provider-dev-a', 'wo-dev-1', 'INSTALLATION_REVIEW', 'review-0004', '["provider-dev-a","wo-dev-1","review","review-0004"]', 'dev-seed-w4', '锦绣里分析失败恢复（开发）', 'BLOCKED', 'ir-dev-jd-review', 1, 1, 1, '分析任务执行失败，待恢复（开发样例）', 1789862403000, 1789862403000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'w-dev-4');

INSERT INTO background_job (id, purpose, service_provider_id, work_item_id, external_write_id, target_json, dedupe_key, status, available_at, lease_epoch, lease_token, lease_owner, lease_until, row_version, outcome_json, gmt_create, gmt_modified)
SELECT 'bj-dev-4', 'ANALYZE_SKILL', 'provider-dev-a', 'w-dev-4', NULL, '{"skill":"INSTALLATION_EVIDENCE"}', 'dev-seed-bj4', 'FAILED', 1789862403000, 0, NULL, NULL, NULL, 1, '{"error":"skill run failed (dev seed)"}', 1789862403000, 1789862403000
WHERE NOT EXISTS (SELECT 1 FROM background_job WHERE id = 'bj-dev-4');

INSERT INTO analysis_input_item (id, snapshot_id, input_key, input_kind, record_type, source_system, source_record_id, source_version, data_json, parsing_id, retrieved_at, gmt_create, gmt_modified)
SELECT 'aii-dev-1', 'ais-dev-1', 'ctx-wo-dev-1', 'RECORD', 'INSTALLATION_WORK_ORDER_CONTEXT', 'DEV', 'wo-dev-1', 'dev-v1', '{"note":"开发种子输入"}', NULL, 1789862400000, 1789862400000, 1789862400000
WHERE NOT EXISTS (SELECT 1 FROM analysis_input_item WHERE id = 'aii-dev-1');

INSERT INTO analysis_input_snapshot (id, analysis_generation, work_item_id, service_provider_id, expected_work_item_version, skill, skill_version, output_schema_version, config_versions_json, required_input_state, input_issues_json, input_item_count, content_sha256, gmt_create, gmt_modified)
SELECT 'ais-dev-1', 1, 'w-dev-1', 'provider-dev-a', 1, 'INSTALLATION_EVIDENCE', '1.0.0', '1.0.0', '[]', 'COMPLETE', '[]', 1, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 1789862400500, 1789862400500
WHERE NOT EXISTS (SELECT 1 FROM analysis_input_snapshot WHERE id = 'ais-dev-1');

INSERT INTO background_job (id, purpose, service_provider_id, work_item_id, external_write_id, target_json, dedupe_key, status, available_at, lease_epoch, lease_token, lease_owner, lease_until, row_version, outcome_json, gmt_create, gmt_modified)
SELECT 'bj-dev-1', 'ANALYZE_SKILL', 'provider-dev-a', 'w-dev-1', NULL, '{"skill":"INSTALLATION_EVIDENCE"}', 'dev-seed-bj1', 'SUCCEEDED', 1789862400400, 0, NULL, NULL, NULL, 1, '{"result":"ar-dev-1"}', 1789862400400, 1789862400600
WHERE NOT EXISTS (SELECT 1 FROM background_job WHERE id = 'bj-dev-1');

INSERT INTO capability_call (id, job_id, operation, source_material_version_id, input_snapshot_id, profile_id, implementation_version, config_json, input_sha256, gmt_create, gmt_modified)
SELECT 'run-dev-1', 'bj-dev-1', 'ANALYZE_SKILL', NULL, 'ais-dev-1', 'dev-profile', '1.0.0', '{}', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 1789862400500, 1789862400500
WHERE NOT EXISTS (SELECT 1 FROM capability_call WHERE id = 'run-dev-1');

INSERT INTO analysis_result (id, run_id, work_item_id, snapshot_id, profile_id, implementation_version, status, summary, findings_json, open_questions_json, validated_at, gmt_create, gmt_modified)
SELECT 'ar-dev-1', 'run-dev-1', 'w-dev-1', 'ais-dev-1', 'dev-profile', '1.0.0', 'ANALYZED', '发现一处施工差异，建议人工核实（开发样例）',
 '[{"findingId":"f-dev-1","type":"CONFLICT","content":"实际电缆长度与方案不一致（开发样例）","evidenceRefs":[]}]', '[]', 1789862400600, 1789862400600, 1789862400600
WHERE NOT EXISTS (SELECT 1 FROM analysis_result WHERE id = 'ar-dev-1');

UPDATE work_item SET current_analysis_result_id = 'ar-dev-1', row_version = 2
WHERE id = 'w-dev-1' AND row_version = 1 AND current_analysis_result_id IS NULL;

INSERT INTO activity_record (id, work_item_id, event_key, event_type, actor_identity_id, fact_type, fact_id, occurred_at, details_json, gmt_create, gmt_modified)
SELECT 'act-dev-1', 'w-dev-1', 'dev-seed-act1', 'WORK_CREATED', NULL, 'WORK_ITEM', 'w-dev-1', NULL, '{"note":"事项由来源变化创建（开发样例）"}', 1789862400000, 1789862400000
WHERE NOT EXISTS (SELECT 1 FROM activity_record WHERE id = 'act-dev-1');

INSERT INTO activity_record (id, work_item_id, event_key, event_type, actor_identity_id, fact_type, fact_id, occurred_at, details_json, gmt_create, gmt_modified)
SELECT 'act-dev-2', 'w-dev-1', 'dev-seed-act2', 'ANALYSIS_COMPLETED', NULL, 'ANALYSIS_RESULT', 'ar-dev-1', NULL, '{"note":"分析完成（开发样例）"}', 1789862400700, 1789862400700
WHERE NOT EXISTS (SELECT 1 FROM activity_record WHERE id = 'act-dev-2');

INSERT INTO activity_record (id, work_item_id, event_key, event_type, actor_identity_id, fact_type, fact_id, occurred_at, details_json, gmt_create, gmt_modified)
SELECT 'act-dev-3', 'w-dev-2', 'dev-seed-act3', 'WORK_CREATED', NULL, 'WORK_ITEM', 'w-dev-2', NULL, '{"note":"事项由来源变化创建（开发样例）"}', 1789862401000, 1789862401000
WHERE NOT EXISTS (SELECT 1 FROM activity_record WHERE id = 'act-dev-3');

INSERT INTO activity_record (id, work_item_id, event_key, event_type, actor_identity_id, fact_type, fact_id, occurred_at, details_json, gmt_create, gmt_modified)
SELECT 'act-dev-4', 'w-dev-3', 'dev-seed-act4', 'WORK_CREATED', NULL, 'WORK_ITEM', 'w-dev-3', NULL, '{"note":"协同事项创建（开发样例）"}', 1789862402000, 1789862402000
WHERE NOT EXISTS (SELECT 1 FROM activity_record WHERE id = 'act-dev-4');
