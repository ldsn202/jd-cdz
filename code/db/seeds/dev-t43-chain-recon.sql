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

INSERT INTO analysis_input_snapshot (id, analysis_generation, work_item_id, service_provider_id, expected_work_item_version, skill, skill_version, output_schema_version, config_versions_json, required_input_state, input_issues_json, input_item_count, content_sha256, gmt_create, gmt_modified)
SELECT 'snap-dev-6', 1, 'w-dev-6', 'provider-dev-a', 2, 'RECONCILIATION_EXPLANATION', 'sv-dev-1', 'osv-dev-1', '[]', 'COMPLETE', '[]', 0, 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', 1789862405000, 1789862405000
WHERE NOT EXISTS (SELECT 1 FROM analysis_input_snapshot WHERE id = 'snap-dev-6');

INSERT INTO reconciliation_record (id, work_item_id, installation_work_order_id, service_provider_id, snapshot_id, execution_key, comparator_version, status, currency, tax_basis, jd_amount, provider_amount, difference_amount, selected_bills_json, groups_json, basis_inputs_json, basis_lookup_json, checks_json, open_issues_json, gmt_create, gmt_modified)
SELECT 'rc-dev-1', 'w-dev-6', 'wo-dev-1', 'provider-dev-a', 'snap-dev-6', 'exec-dev-6', 'cmp-dev-1', 'DIFFERENCE', 'CNY', 'TAX_INCLUDED', '100.00', '120.00', '20.00', '[]', '[]', '[]', '{}', '{}', '["电缆敷设计费差额 20.00"]', 1789862405000, 1789862405000
WHERE NOT EXISTS (SELECT 1 FROM reconciliation_record WHERE id = 'rc-dev-1');

UPDATE work_item SET current_reconciliation_id = 'rc-dev-1', row_version = 2
WHERE id = 'w-dev-6' AND current_reconciliation_id IS NULL;

