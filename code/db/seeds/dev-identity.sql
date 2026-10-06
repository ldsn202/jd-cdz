-- 开发身份模拟种子：仅本地开发用，配合 .dev.vars 的 DEV_IDENTITY_TOKENS。
-- 形态：INSERT ... WHERE NOT EXISTS（幂等，不写历史保护触发器禁止的替换式写入）。
-- 基准时间：2026-09-20T00:00:00.000Z = 1789862400000。


INSERT INTO identity_reference (id, identity_source, subject_id, subject_type, display_name, gmt_create, gmt_modified)
SELECT 'ir-dev-jd-review', 'DEV_IDP', 'jd-review-1', 'HUMAN', '京东核查员（开发）', 1789862400000, 1789862400000
WHERE NOT EXISTS (SELECT 1 FROM identity_reference WHERE id = 'ir-dev-jd-review');


INSERT INTO identity_reference (id, identity_source, subject_id, subject_type, display_name, gmt_create, gmt_modified)
SELECT 'ir-dev-provider-clerk', 'DEV_IDP', 'provider-clerk-1', 'HUMAN', '服务商资料员（开发）', 1789862400000, 1789862400000
WHERE NOT EXISTS (SELECT 1 FROM identity_reference WHERE id = 'ir-dev-provider-clerk');


INSERT INTO identity_reference (id, identity_source, subject_id, subject_type, display_name, gmt_create, gmt_modified)
SELECT 'ir-dev-service', 'DEV_IDP', 'svc-jd-charging', 'SERVICE', '后台任务程序（开发）', 1789862400000, 1789862400000
WHERE NOT EXISTS (SELECT 1 FROM identity_reference WHERE id = 'ir-dev-service');


INSERT INTO service_provider (id, source_system, source_id, display_name, source_version, source_state, verified_at, gmt_create, gmt_modified)
SELECT 'provider-dev-a', 'DEV', 'provider-dev-a', '服务商甲（开发）', 'dev-v1', 'ACTIVE', 1789862400000, 1789862400000, 1789862400000
WHERE NOT EXISTS (SELECT 1 FROM service_provider WHERE id = 'provider-dev-a');


INSERT INTO service_provider (id, source_system, source_id, display_name, source_version, source_state, verified_at, gmt_create, gmt_modified)
SELECT 'provider-dev-b', 'DEV', 'provider-dev-b', '服务商乙（开发）', 'dev-v1', 'ACTIVE', 1789862400000, 1789862400000, 1789862400000
WHERE NOT EXISTS (SELECT 1 FROM service_provider WHERE id = 'provider-dev-b');


INSERT INTO business_permission (id, context_id, grant_id, business_role, actions_json, scope_type, source_system, record_type, resource_ids_json, gmt_create, gmt_modified)
SELECT 'bp-dev-jd-review-1', 'ci-dev-jd-review', 'g-review-a', 'INSTALLATION_REVIEWER',
 '["READ_WORK_ITEM","READ_WORK_ORDER","READ_SOURCE_MATERIAL","DECIDE_INSTALLATION_REVIEW","RECORD_EXCEPTION_RESULT"]',
 'SERVICE_PROVIDER', NULL, NULL, '["provider-dev-a"]', 1789862400000, 1789862400000
WHERE NOT EXISTS (SELECT 1 FROM business_permission WHERE id = 'bp-dev-jd-review-1');


INSERT INTO business_permission (id, context_id, grant_id, business_role, actions_json, scope_type, source_system, record_type, resource_ids_json, gmt_create, gmt_modified)
SELECT 'bp-dev-provider-clerk-1', 'ci-dev-provider-clerk', 'g-clerk-b', 'PROVIDER_DOCUMENT_CLERK',
 '["READ_WORK_ITEM","READ_WORK_ORDER","CONFIRM_INSTALLATION_DRAFT","SUBMIT_INSTALLATION_DETAIL","SUBMIT_SUPPLEMENT"]',
 'SERVICE_PROVIDER', NULL, NULL, '["provider-dev-b"]', 1789862400000, 1789862400000
WHERE NOT EXISTS (SELECT 1 FROM business_permission WHERE id = 'bp-dev-provider-clerk-1');


INSERT INTO business_permission (id, context_id, grant_id, business_role, actions_json, scope_type, source_system, record_type, resource_ids_json, gmt_create, gmt_modified)
SELECT 'bp-dev-service-1', 'ci-dev-service', 'g-svc-all', NULL,
 '["READ_WORK_ITEM","READ_WORK_ORDER","READ_SOURCE_MATERIAL","READ_BILLING_RECORD","READ_SOURCE_CHANGES","PREPARE_ANALYSIS"]',
 'SERVICE_PROVIDER', NULL, NULL, '["provider-dev-a","provider-dev-b"]', 1789862400000, 1789862400000
WHERE NOT EXISTS (SELECT 1 FROM business_permission WHERE id = 'bp-dev-service-1');

INSERT INTO current_identity (id, identity_reference_id, subject_type, verified_at, valid_until, authorization_version, source_identities_json, grant_count, request_key, gmt_create, gmt_modified)
SELECT 'ci-dev-jd-review', 'ir-dev-jd-review', 'HUMAN', 1789862400000, NULL, 'dev-auth-v1', '[{"system":"DEV_IDP","subjectId":"jd-review-1"}]', 1, 'dev-seed-ci-jd-review', 1789862400000, 1789862400000
WHERE NOT EXISTS (SELECT 1 FROM current_identity WHERE id = 'ci-dev-jd-review');


INSERT INTO current_identity (id, identity_reference_id, subject_type, verified_at, valid_until, authorization_version, source_identities_json, grant_count, request_key, gmt_create, gmt_modified)
SELECT 'ci-dev-provider-clerk', 'ir-dev-provider-clerk', 'HUMAN', 1789862400000, NULL, 'dev-auth-v1', '[{"system":"DEV_IDP","subjectId":"provider-clerk-1"}]', 1, 'dev-seed-ci-provider-clerk', 1789862400000, 1789862400000
WHERE NOT EXISTS (SELECT 1 FROM current_identity WHERE id = 'ci-dev-provider-clerk');


INSERT INTO current_identity (id, identity_reference_id, subject_type, verified_at, valid_until, authorization_version, source_identities_json, grant_count, request_key, gmt_create, gmt_modified)
SELECT 'ci-dev-service', 'ir-dev-service', 'SERVICE', 1789862400000, NULL, 'dev-auth-v1', '[]', 1, 'dev-seed-ci-service', 1789862400000, 1789862400000
WHERE NOT EXISTS (SELECT 1 FROM current_identity WHERE id = 'ci-dev-service');

