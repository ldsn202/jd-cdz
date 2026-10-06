-- T4.3 三组写链路开发种子：对账（w-dev-6）、接入配置（w-dev-7）、资料整理草稿（w-dev-2）。
-- 幂等：INSERT ... WHERE NOT EXISTS；指针经条件 UPDATE 一次写入（行版本 +1）。

-- C. w-dev-2 资料整理草稿链路上下文
INSERT INTO installation_context_snapshot (id, installation_work_order_id, service_provider_id, source_work_order_version, installation_plan_id, source_plan_version, installation_detail_id, source_detail_version, detail_status, completeness, missing_parts_json, context_json, retrieved_at, gmt_create, gmt_modified)
SELECT 'ctx-dev-2', 'wo-dev-2', 'provider-dev-b', 'dev-v1', NULL, NULL, NULL, NULL, 'NOT_SUBMITTED', 'INCOMPLETE', '["INSTALLATION_PLAN"]', '{}', 1789862407000, 1789862407000, 1789862407000
WHERE NOT EXISTS (SELECT 1 FROM installation_context_snapshot WHERE id = 'ctx-dev-2');

INSERT INTO analysis_input_snapshot (id, analysis_generation, work_item_id, service_provider_id, expected_work_item_version, skill, skill_version, output_schema_version, config_versions_json, required_input_state, input_issues_json, input_item_count, content_sha256, gmt_create, gmt_modified)
SELECT 'snap-dev-2', 1, 'w-dev-2', 'provider-dev-b', 1, 'INSTALLATION_EXTRACTION', 'sv-dev-1', 'osv-dev-1', '[]', 'COMPLETE', '[]', 0, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 1789862407000, 1789862407000
WHERE NOT EXISTS (SELECT 1 FROM analysis_input_snapshot WHERE id = 'snap-dev-2');

INSERT INTO background_job (id, purpose, service_provider_id, work_item_id, external_write_id, target_json, dedupe_key, status, available_at, lease_epoch, lease_token, lease_owner, lease_until, row_version, outcome_json, gmt_create, gmt_modified)
SELECT 'bj-dev-2', 'ANALYZE_SKILL', 'provider-dev-b', 'w-dev-2', NULL, '{"skill":"INSTALLATION_EXTRACTION"}', 'dev-seed-bj2', 'SUCCEEDED', 1789862407000, 0, NULL, NULL, NULL, 1, '{"analysisResult":"ar-dev-2"}', 1789862407000, 1789862407000
WHERE NOT EXISTS (SELECT 1 FROM background_job WHERE id = 'bj-dev-2');

INSERT INTO capability_call (id, job_id, operation, source_material_version_id, input_snapshot_id, profile_id, implementation_version, config_json, input_sha256, gmt_create, gmt_modified)
SELECT 'run-dev-2', 'bj-dev-2', 'ANALYZE_SKILL', NULL, 'snap-dev-2', 'mock-ai-profile', 'mock-ai-1.0.0', '{}', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 1789862407000, 1789862407000
WHERE NOT EXISTS (SELECT 1 FROM capability_call WHERE id = 'run-dev-2');

INSERT INTO analysis_result (id, run_id, work_item_id, snapshot_id, profile_id, implementation_version, status, summary, findings_json, open_questions_json, validated_at, gmt_create, gmt_modified)
SELECT 'ar-dev-2', 'run-dev-2', 'w-dev-2', 'snap-dev-2', 'mock-ai-profile', 'mock-ai-1.0.0', 'ANALYZED', '开发种子：安装资料整理草稿已生成', '[]', '[]', 1789862407000, 1789862407000, 1789862407000
WHERE NOT EXISTS (SELECT 1 FROM analysis_result WHERE id = 'ar-dev-2');

INSERT INTO installation_draft_version (id, installation_draft_id, work_item_id, version_no, parent_version_id, analysis_result_id, context_snapshot_id, origin, editor_identity_id, items_json, source_materials_json, open_questions_json, edit_notes_json, save_key, gmt_create, gmt_modified)
SELECT 'dv-dev-2', 'draft-dev-2', 'w-dev-2', 1, NULL, 'ar-dev-2', 'ctx-dev-2', 'AI', NULL,
 '[{"installationItem":"桥架安装","installedQuantity":12,"unit":"米","materialSupplier":"服务商","serviceScope":"供料及安装"},{"installationItem":"电缆敷设","installedQuantity":45,"unit":"米","materialSupplier":"服务商","serviceScope":"供料及安装"}]',
 '[]', '[]', '[]', 'save-dev-2', 1789862407000, 1789862407000
WHERE NOT EXISTS (SELECT 1 FROM installation_draft_version WHERE id = 'dv-dev-2');

INSERT INTO installation_draft (id, work_item_id, current_version_id, row_version, gmt_create, gmt_modified)
SELECT 'draft-dev-2', 'w-dev-2', 'dv-dev-2', 1, 1789862407000, 1789862407000
WHERE NOT EXISTS (SELECT 1 FROM installation_draft WHERE id = 'draft-dev-2');
