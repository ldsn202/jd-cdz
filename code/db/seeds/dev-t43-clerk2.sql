-- w-dev-2 资料责任人替换：原 clerk 授权缺 READ_SOURCE_MATERIAL，授权历史不可改，新建身份并重指派。

INSERT INTO identity_reference (id, identity_source, subject_id, subject_type, display_name, gmt_create, gmt_modified)
SELECT 'ir-dev-provider-clerk2', 'DEV_IDP', 'provider-clerk-2', 'HUMAN', '服务商资料员乙（开发）', 1789862408000, 1789862408000
WHERE NOT EXISTS (SELECT 1 FROM identity_reference WHERE id = 'ir-dev-provider-clerk2');

INSERT INTO business_permission (id, context_id, grant_id, business_role, actions_json, scope_type, source_system, record_type, resource_ids_json, gmt_create, gmt_modified)
SELECT 'bp-dev-provider-clerk2-1', 'ci-dev-provider-clerk2', 'g-clerk2-b', 'PROVIDER_DOCUMENT_CLERK',
 '["READ_WORK_ITEM","READ_WORK_ORDER","READ_SOURCE_MATERIAL","CONFIRM_INSTALLATION_DRAFT","SUBMIT_INSTALLATION_DETAIL","SUBMIT_SUPPLEMENT"]',
 'SERVICE_PROVIDER', NULL, NULL, '["provider-dev-b"]', 1789862408000, 1789862408000
WHERE NOT EXISTS (SELECT 1 FROM business_permission WHERE id = 'bp-dev-provider-clerk2-1');

INSERT INTO current_identity (id, identity_reference_id, subject_type, verified_at, valid_until, authorization_version, source_identities_json, grant_count, request_key, gmt_create, gmt_modified)
SELECT 'ci-dev-provider-clerk2', 'ir-dev-provider-clerk2', 'HUMAN', 1789862408000, NULL, 'dev-auth-v1', '[{"system":"DEV_IDP","subjectId":"provider-clerk-2"}]', 1, 'dev-seed-ci-provider-clerk2', 1789862408000, 1789862408000
WHERE NOT EXISTS (SELECT 1 FROM current_identity WHERE id = 'ci-dev-provider-clerk2');

UPDATE work_item SET assignee_identity_id = 'ir-dev-provider-clerk2', row_version = 2, responsibility_version = 2
WHERE id = 'w-dev-2' AND assignee_identity_id = 'ir-dev-provider-clerk';
