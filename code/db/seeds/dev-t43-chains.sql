-- T4.3 三组写链路开发种子：对账（w-dev-6）、接入配置（w-dev-7）、资料整理草稿（w-dev-2）。
-- 幂等：INSERT ... WHERE NOT EXISTS；指针经条件 UPDATE 一次写入（行版本 +1）。

-- A. 对账身份与事项
INSERT INTO identity_reference (id, identity_source, subject_id, subject_type, display_name, gmt_create, gmt_modified)
SELECT 'ir-dev-jd-recon', 'DEV_IDP', 'jd-recon-1', 'HUMAN', '京东对账员（开发）', 1789862405000, 1789862405000
WHERE NOT EXISTS (SELECT 1 FROM identity_reference WHERE id = 'ir-dev-jd-recon');

INSERT INTO business_permission (id, context_id, grant_id, business_role, actions_json, scope_type, source_system, record_type, resource_ids_json, gmt_create, gmt_modified)
SELECT 'bp-dev-jd-recon-1', 'ci-dev-jd-recon', 'g-recon-a', 'BUSINESS_RECONCILER',
 '["READ_WORK_ITEM","READ_BILLING_RECORD","REQUEST_BILLING_VERIFICATION","REPLY_BILLING_VERIFICATION"]',
 'SERVICE_PROVIDER', NULL, NULL, '["provider-dev-a"]', 1789862405000, 1789862405000
WHERE NOT EXISTS (SELECT 1 FROM business_permission WHERE id = 'bp-dev-jd-recon-1');

INSERT INTO current_identity (id, identity_reference_id, subject_type, verified_at, valid_until, authorization_version, source_identities_json, grant_count, request_key, gmt_create, gmt_modified)
SELECT 'ci-dev-jd-recon', 'ir-dev-jd-recon', 'HUMAN', 1789862405000, NULL, 'dev-auth-v1', '[{"system":"DEV_IDP","subjectId":"jd-recon-1"}]', 1, 'dev-seed-ci-jd-recon', 1789862405000, 1789862405000
WHERE NOT EXISTS (SELECT 1 FROM current_identity WHERE id = 'ci-dev-jd-recon');

INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, responsibility_version, row_version, analysis_generation, gmt_create, gmt_modified)
SELECT 'w-dev-6', 'provider-dev-a', 'wo-dev-1', 'RECONCILIATION', 'recon-0006', '["provider-dev-a","wo-dev-1","recon","recon-0006"]', 'dev-seed-w6', '春和庭 2026-08 账期对账（开发）', 'READY', 'ir-dev-jd-recon', 1, 1, 1, 1789862405000, 1789862405000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'w-dev-6');

INSERT INTO reconciliation_record (id, work_item_id, installation_work_order_id, service_provider_id, snapshot_id, execution_key, comparator_version, status, currency, tax_basis, jd_amount, provider_amount, difference_amount, selected_bills_json, groups_json, basis_inputs_json, basis_lookup_json, checks_json, open_issues_json, gmt_create, gmt_modified)
SELECT 'rc-dev-1', 'w-dev-6', 'wo-dev-1', 'provider-dev-a', 'snap-dev-6', 'exec-dev-6', 'cmp-dev-1', 'DIFFERENCE', 'CNY', 'TAX_INCLUDED', '100.00', '120.00', '20.00', '[]', '[]', '[]', '{}', '{}', '["电缆敷设计费差额 20.00"]', 1789862405000, 1789862405000
WHERE NOT EXISTS (SELECT 1 FROM reconciliation_record WHERE id = 'rc-dev-1');

UPDATE work_item SET current_reconciliation_id = 'rc-dev-1', row_version = 2
WHERE id = 'w-dev-6' AND current_reconciliation_id IS NULL;

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
SELECT 'w-dev-7', 'provider-dev-b', 'wo-dev-2', 'CONFIGURATION', 'config-0007', '["provider-dev-b","wo-dev-2","config","config-0007"]', 'dev-seed-w7', '服务商乙资料格式接入（开发）', 'READY', 'ir-dev-provider-integration', 1, 1, 1, 1789862406000, 1789862406000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'w-dev-7');

INSERT INTO analysis_input_snapshot (id, analysis_generation, work_item_id, service_provider_id, expected_work_item_version, skill, skill_version, output_schema_version, config_versions_json, required_input_state, input_issues_json, input_item_count, content_sha256, gmt_create, gmt_modified)
SELECT 'snap-dev-7', 1, 'w-dev-7', 'provider-dev-b', 1, 'INTEGRATION_CONFIGURATION', 'sv-dev-1', 'osv-dev-1', '[]', 'COMPLETE', '[]', 0, 'a1b2c3d4e5f60011223344556677889900aabbccddeeff00112233445566778899', 1789862406000, 1789862406000
WHERE NOT EXISTS (SELECT 1 FROM analysis_input_snapshot WHERE id = 'snap-dev-7');

INSERT INTO analysis_result (id, run_id, work_item_id, snapshot_id, profile_id, implementation_version, status, summary, findings_json, open_questions_json, validated_at, gmt_create, gmt_modified)
SELECT 'ar-dev-7', 'run-dev-7', 'w-dev-7', 'snap-dev-7', 'mock-ai-profile', 'mock-ai-1.0.0', 'ANALYZED', '开发种子：格式映射候选已生成', '[]', '[]', 1789862406000, 1789862406000, 1789862406000
WHERE NOT EXISTS (SELECT 1 FROM analysis_result WHERE id = 'ar-dev-7');

INSERT INTO integration_config (id, service_provider_id, source_system, purpose, business_scope_key, current_version_id, current_activation_result_id, row_version, gmt_create, gmt_modified)
SELECT 'ic-dev-1', 'provider-dev-b', 'DEV', 'INSTALLATION', 'fmt-1', NULL, NULL, 1, 1789862406000, 1789862406000
WHERE NOT EXISTS (SELECT 1 FROM integration_config WHERE id = 'ic-dev-1');

INSERT INTO integration_config_version (id, integration_config_id, work_item_id, version_no, parent_version_id, analysis_result_id, origin, editor_identity_id, save_key, format_status, source_format_id, source_format_version, applicability_json, rules_json, open_questions_json, rule_catalog_version, edit_notes_json, gmt_create, gmt_modified)
SELECT 'icv-dev-1', 'ic-dev-1', 'w-dev-7', 1, NULL, 'ar-dev-7', 'AI', NULL, 'save-dev-7', 'PROVIDED', 'FMT-DEV-B', 'fv-1', '{}', '[]', '[]', 'rc-dev-1', '[]', 1789862406000, 1789862406000
WHERE NOT EXISTS (SELECT 1 FROM integration_config_version WHERE id = 'icv-dev-1');

INSERT INTO configuration_trial (id, configuration_version_id, snapshot_id, execution_key, transformer_version, status, output_json, rule_results_json, issues_json, checks_json, gmt_create, gmt_modified)
SELECT 'ct-dev-1', 'icv-dev-1', 'snap-dev-7', 'trial-dev-1', 'tr-dev-1', 'PASSED', '{}', '[]', '[]', '{}', 1789862406000, 1789862406000
WHERE NOT EXISTS (SELECT 1 FROM configuration_trial WHERE id = 'ct-dev-1');

-- C. w-dev-2 资料整理草稿链路上下文
INSERT INTO installation_context_snapshot (id, installation_work_order_id, service_provider_id, source_work_order_version, installation_plan_id, source_plan_version, installation_detail_id, source_detail_version, detail_status, completeness, missing_parts_json, context_json, retrieved_at, gmt_create, gmt_modified)
SELECT 'ctx-dev-2', 'wo-dev-2', 'provider-dev-b', 'dev-v1', NULL, NULL, NULL, NULL, 'NOT_SUBMITTED', 'INCOMPLETE', '[]', '{}', 1789862407000, 1789862407000, 1789862407000
WHERE NOT EXISTS (SELECT 1 FROM installation_context_snapshot WHERE id = 'ctx-dev-2');

INSERT INTO analysis_input_snapshot (id, analysis_generation, work_item_id, service_provider_id, expected_work_item_version, skill, skill_version, output_schema_version, config_versions_json, required_input_state, input_issues_json, input_item_count, content_sha256, gmt_create, gmt_modified)
SELECT 'snap-dev-2', 1, 'w-dev-2', 'provider-dev-b', 1, 'INSTALLATION_EXTRACTION', 'sv-dev-1', 'osv-dev-1', '[]', 'COMPLETE', '[]', 0, 'b1b2c3d4e5f60011223344556677889900aabbccddeeff00112233445566778899', 1789862407000, 1789862407000
WHERE NOT EXISTS (SELECT 1 FROM analysis_input_snapshot WHERE id = 'snap-dev-2');

INSERT INTO analysis_result (id, run_id, work_item_id, snapshot_id, profile_id, implementation_version, status, summary, findings_json, open_questions_json, validated_at, gmt_create, gmt_modified)
SELECT 'ar-dev-2', 'run-dev-2', 'w-dev-2', 'snap-dev-2', 'mock-ai-profile', 'mock-ai-1.0.0', 'ANALYZED', '开发种子：安装资料整理草稿已生成', '[]', '[]', 1789862407000, 1789862407000, 1789862407000
WHERE NOT EXISTS (SELECT 1 FROM analysis_result WHERE id = 'ar-dev-2');

INSERT INTO installation_draft (id, work_item_id, current_version_id, row_version, gmt_create, gmt_modified)
SELECT 'draft-dev-2', 'w-dev-2', 'dv-dev-2', 1, 1789862407000, 1789862407000
WHERE NOT EXISTS (SELECT 1 FROM installation_draft WHERE id = 'draft-dev-2');

INSERT INTO installation_draft_version (id, installation_draft_id, work_item_id, version_no, parent_version_id, analysis_result_id, context_snapshot_id, origin, editor_identity_id, items_json, source_materials_json, open_questions_json, edit_notes_json, save_key, gmt_create, gmt_modified)
SELECT 'dv-dev-2', 'draft-dev-2', 'w-dev-2', 1, NULL, 'ar-dev-2', 'ctx-dev-2', 'AI', NULL,
 '[{"installationItem":"桥架安装","installedQuantity":12,"unit":"米","materialSupplier":"服务商","serviceScope":"供料及安装"},{"installationItem":"电缆敷设","installedQuantity":45,"unit":"米","materialSupplier":"服务商","serviceScope":"供料及安装"}]',
 '[]', '[]', '[]', 'save-dev-2', 1789862407000, 1789862407000
WHERE NOT EXISTS (SELECT 1 FROM installation_draft_version WHERE id = 'dv-dev-2');
