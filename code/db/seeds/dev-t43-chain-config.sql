-- T4.3 三组写链路开发种子：对账（w-dev-6）、接入配置（w-dev-7）、资料整理草稿（w-dev-2）。
-- 幂等：INSERT ... WHERE NOT EXISTS；指针经条件 UPDATE 一次写入（行版本 +1）。

-- B. 接入对接身份与配置
INSERT INTO identity_reference (id, identity_source, subject_id, subject_type, display_name, gmt_create, gmt_modified)
SELECT 'ir-dev-provider-integration', 'DEV_IDP', 'provider-int-1', 'HUMAN', '服务商接入对接（开发）', 1789862406000, 1789862406000
WHERE NOT EXISTS (SELECT 1 FROM identity_reference WHERE id = 'ir-dev-provider-integration');

INSERT INTO business_permission (id, context_id, grant_id, business_role, actions_json, scope_type, source_system, record_type, resource_ids_json, gmt_create, gmt_modified)
SELECT 'bp-dev-provider-integration-1', 'ci-dev-provider-integration', 'g-int-b', 'PROVIDER_INTEGRATION_CONTACT',
 '["READ_WORK_ITEM","READ_SOURCE_MATERIAL","ENABLE_INTEGRATION_CONFIG"]',
 'SERVICE_PROVIDER', NULL, NULL, '["provider-dev-b"]', 1789862406000, 1789862406000
WHERE NOT EXISTS (SELECT 1 FROM business_permission WHERE id = 'bp-dev-provider-integration-1');

INSERT INTO current_identity (id, identity_reference_id, subject_type, verified_at, valid_until, authorization_version, source_identities_json, grant_count, request_key, gmt_create, gmt_modified)
SELECT 'ci-dev-provider-integration', 'ir-dev-provider-integration', 'HUMAN', 1789862406000, NULL, 'dev-auth-v1', '[{"system":"DEV_IDP","subjectId":"provider-int-1"}]', 1, 'dev-seed-ci-provider-integration', 1789862406000, 1789862406000
WHERE NOT EXISTS (SELECT 1 FROM current_identity WHERE id = 'ci-dev-provider-integration');

INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, responsibility_version, row_version, analysis_generation, gmt_create, gmt_modified)
SELECT 'w-dev-7', 'provider-dev-b', NULL, 'CONFIGURATION', 'config-0007', '["provider-dev-b","wo-dev-2","config","config-0007"]', 'dev-seed-w7', '服务商乙资料格式接入（开发）', 'READY', 'ir-dev-provider-integration', 1, 1, 1, 1789862406000, 1789862406000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'w-dev-7');

INSERT INTO analysis_input_snapshot (id, analysis_generation, work_item_id, service_provider_id, expected_work_item_version, skill, skill_version, output_schema_version, config_versions_json, required_input_state, input_issues_json, input_item_count, content_sha256, gmt_create, gmt_modified)
SELECT 'snap-dev-7', 1, 'w-dev-7', 'provider-dev-b', 1, 'INTEGRATION_CONFIGURATION', 'sv-dev-1', 'osv-dev-1', '[{"configurationId":"ic-dev-1","configurationVersionId":"icv-dev-1","usage":"TRIAL_CANDIDATE"}]', 'COMPLETE', '[]', 0, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 1789862406000, 1789862406000
WHERE NOT EXISTS (SELECT 1 FROM analysis_input_snapshot WHERE id = 'snap-dev-7');

INSERT INTO background_job (id, purpose, service_provider_id, work_item_id, external_write_id, target_json, dedupe_key, status, available_at, lease_epoch, lease_token, lease_owner, lease_until, row_version, outcome_json, gmt_create, gmt_modified)
SELECT 'bj-dev-7', 'ANALYZE_SKILL', 'provider-dev-b', 'w-dev-7', NULL, '{"skill":"INTEGRATION_CONFIGURATION"}', 'dev-seed-bj7', 'SUCCEEDED', 1789862406000, 0, NULL, NULL, NULL, 1, '{"analysisResult":"ar-dev-7"}', 1789862406000, 1789862406000
WHERE NOT EXISTS (SELECT 1 FROM background_job WHERE id = 'bj-dev-7');

INSERT INTO capability_call (id, job_id, operation, source_material_version_id, input_snapshot_id, profile_id, implementation_version, config_json, input_sha256, gmt_create, gmt_modified)
SELECT 'run-dev-7', 'bj-dev-7', 'ANALYZE_SKILL', NULL, 'snap-dev-7', 'mock-ai-profile', 'mock-ai-1.0.0', '{}', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 1789862406000, 1789862406000
WHERE NOT EXISTS (SELECT 1 FROM capability_call WHERE id = 'run-dev-7');

INSERT INTO analysis_result (id, run_id, work_item_id, snapshot_id, profile_id, implementation_version, status, summary, findings_json, open_questions_json, validated_at, gmt_create, gmt_modified)
SELECT 'ar-dev-7', 'run-dev-7', 'w-dev-7', 'snap-dev-7', 'mock-ai-profile', 'mock-ai-1.0.0', 'ANALYZED', '开发种子：格式映射候选已生成', '[]', '[]', 1789862406000, 1789862406000, 1789862406000
WHERE NOT EXISTS (SELECT 1 FROM analysis_result WHERE id = 'ar-dev-7');

UPDATE work_item SET integration_config_id = 'ic-dev-1', row_version = 2
WHERE id = 'w-dev-7' AND integration_config_id IS NULL;

INSERT INTO integration_config (id, service_provider_id, source_system, purpose, business_scope_key, current_version_id, current_activation_result_id, row_version, gmt_create, gmt_modified)
SELECT 'ic-dev-1', 'provider-dev-b', 'DEV', 'INSTALLATION', 'fmt-1', NULL, NULL, 1, 1789862406000, 1789862406000
WHERE NOT EXISTS (SELECT 1 FROM integration_config WHERE id = 'ic-dev-1');

INSERT INTO integration_config_version (id, integration_config_id, work_item_id, version_no, parent_version_id, analysis_result_id, origin, editor_identity_id, save_key, format_status, source_format_id, source_format_version, applicability_json, rules_json, open_questions_json, rule_catalog_version, edit_notes_json, gmt_create, gmt_modified)
SELECT 'icv-dev-1', 'ic-dev-1', 'w-dev-7', 1, NULL, 'ar-dev-7', 'AI', NULL, 'save-dev-7', 'PROVIDED', 'FMT-DEV-B', 'fv-1', '{}', '[{"ruleId":"rule-qty-map","sourceField":"数量","targetField":"installedQuantity"}]', '[]', 'rc-dev-1', '[]', 1789862406000, 1789862406000
WHERE NOT EXISTS (SELECT 1 FROM integration_config_version WHERE id = 'icv-dev-1');

INSERT INTO configuration_trial (id, configuration_version_id, snapshot_id, execution_key, transformer_version, status, output_json, rule_results_json, issues_json, checks_json, gmt_create, gmt_modified)
SELECT 'ct-dev-1', 'icv-dev-1', 'snap-dev-7', 'trial-dev-1', 'tr-dev-1', 'PASSED', '{}', '[{"ruleId":"rule-qty-map","status":"PASSED"}]', '[]', '{"input_complete":true,"scope_valid":true,"rules_covered":true,"outputs_valid":true,"meanings_resolved":true}', 1789862406000, 1789862406000
WHERE NOT EXISTS (SELECT 1 FROM configuration_trial WHERE id = 'ct-dev-1');

