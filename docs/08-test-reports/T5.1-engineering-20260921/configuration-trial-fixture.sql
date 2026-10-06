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


INSERT INTO business_permission VALUES('bp-config','ci-config','g-config','PROVIDER_INTEGRATION_CONTACT','["ENABLE_INTEGRATION_CONFIG"]','SERVICE_PROVIDER',NULL,NULL,'["provider-dev-b"]',1789965169399,1789965169399);
INSERT INTO current_identity VALUES('ci-config','ir-dev-provider-clerk','HUMAN',1789965169399,NULL,'config-test','[]',1,'ci-config',1789965169399,1789965169399);
INSERT INTO integration_config VALUES('cfg','provider-dev-b','provider-docs','INSTALLATION','install-main',NULL,NULL,1,1789965169399,1789965169399);
INSERT INTO work_item(id,service_provider_id,item_kind,business_key,business_identity_json,creation_key,title,status,assignee_identity_id,integration_config_id,gmt_create,gmt_modified) VALUES('item','provider-dev-b','CONFIGURATION','cfg-key','["cfg"]','cfg-created','配置测试','READY','ir-dev-provider-clerk','cfg',1789965169399,1789965169399);
INSERT INTO analysis_input_item VALUES('input-provider-record', 'original-snapshot','provider-record','RECORD','PROVIDER_RECORD','provider-docs','doc-1','doc-v9','{"sourceRecord":{"sourceSystem":"provider-docs","sourceRecordId":"doc-1","sourceVersion":"doc-v9","serviceProviderId":"provider-dev-b","purpose":"CONFIGURATION","sourceFormatId":"fmt-1","sourceFormatVersion":"fv-1"},"contentComplete":true,"completeness":"COMPLETE","missingParts":[],"formatStatus":"PROVIDED","formatDefinition":{"formatId":"fmt-1","sourceVersion":"fv-1","fields":[{"fieldKey":"installationItem","label":"installationItem","meaning":"明确字段含义","unit":null},{"fieldKey":"installedQuantity","label":"installedQuantity","meaning":"明确字段含义","unit":null},{"fieldKey":"unit","label":"unit","meaning":"明确字段含义","unit":null},{"fieldKey":"materialSupplier","label":"materialSupplier","meaning":"明确字段含义","unit":null},{"fieldKey":"serviceScope","label":"serviceScope","meaning":"明确字段含义","unit":null}],"notes":null,"sourceMaterials":[]},"rawJson":"{\"rows\":[{\"installationItem\":\"桥架\",\"installedQuantity\":12.5,\"unit\":\"米\",\"materialSupplier\":\"服务商\",\"serviceScope\":\"安装\"},{\"installationItem\":\"电缆\",\"installedQuantity\":0,\"unit\":\"米\",\"materialSupplier\":\"服务商\",\"serviceScope\":\"安装\"}]}","sourceMaterials":[]}',NULL,1789965169399,1789965169399,1789965169399);
INSERT INTO analysis_input_item VALUES('input-provider-format', 'original-snapshot','provider-format','RECORD','PROVIDER_FORMAT','provider-docs','fmt-1','fv-1','{"formatId":"fmt-1","sourceVersion":"fv-1","fields":[{"fieldKey":"installationItem","label":"installationItem","meaning":"明确字段含义","unit":null},{"fieldKey":"installedQuantity","label":"installedQuantity","meaning":"明确字段含义","unit":null},{"fieldKey":"unit","label":"unit","meaning":"明确字段含义","unit":null},{"fieldKey":"materialSupplier","label":"materialSupplier","meaning":"明确字段含义","unit":null},{"fieldKey":"serviceScope","label":"serviceScope","meaning":"明确字段含义","unit":null}]}',NULL,1789965169399,1789965169399,1789965169399);
INSERT INTO analysis_input_snapshot VALUES('original-snapshot',1,'item','provider-dev-b',1,'INTEGRATION_CONFIGURATION','1.0.0','1.0.0','[]','COMPLETE' ,'[]',2,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',1789965169399,1789965169399);
INSERT INTO background_job(id,purpose,service_provider_id,work_item_id,target_json,dedupe_key,status,lease_epoch,row_version,gmt_create,gmt_modified) VALUES('analysis-job','ANALYZE_SKILL','provider-dev-b','item','{}','analysis-test','READY',0,1,1789965169399,1789965169399);
INSERT INTO capability_call VALUES('analysis-run','analysis-job','ANALYZE_SKILL',NULL,'original-snapshot','test','1','{}','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',1789965169399,1789965169399);
INSERT INTO analysis_result VALUES('analysis','analysis-run','item','original-snapshot','test','1','ANALYZED','规则候选','[]','[]', 1789965169399,1789965169399,1789965169399);
INSERT INTO integration_config_version VALUES('candidate','cfg','item',1,NULL,'analysis','AI',NULL,'initial','PROVIDED','fmt-1','fv-1','{"serviceProviderId":"provider-dev-b","sourceSystem":"provider-docs","purpose":"INSTALLATION","businessScopeKey":"install-main","formatStatus":"PROVIDED","sourceFormatId":"fmt-1","sourceFormatVersion":"fv-1","rowPath":"/rows","conditions":[],"basisReferences":["provider-format"],"unknownConditions":[]}','[{"ruleId":"installationItem","sourceFields":["/installationItem"],"targetField":"installationItem","operation":"PIPELINE","parameters":{"steps":[{"op":"field","path":"/installationItem"}]},"conditions":[]},{"ruleId":"installedQuantity","sourceFields":["/installedQuantity"],"targetField":"installedQuantity","operation":"PIPELINE","parameters":{"steps":[{"op":"field","path":"/installedQuantity"}]},"conditions":[]},{"ruleId":"unit","sourceFields":["/unit"],"targetField":"unit","operation":"PIPELINE","parameters":{"steps":[{"op":"field","path":"/unit"}]},"conditions":[]},{"ruleId":"materialSupplier","sourceFields":["/materialSupplier"],"targetField":"materialSupplier","operation":"PIPELINE","parameters":{"steps":[{"op":"field","path":"/materialSupplier"}]},"conditions":[]},{"ruleId":"serviceScope","sourceFields":["/serviceScope"],"targetField":"serviceScope","operation":"PIPELINE","parameters":{"steps":[{"op":"field","path":"/serviceScope"}]},"conditions":[]}]','[]','charging-transform-1','[]',1789965169399,1789965169399);
UPDATE work_item SET current_configuration_version_id='candidate',current_analysis_result_id='analysis',row_version=row_version+1 WHERE id='item';