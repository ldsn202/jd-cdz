-- 开发工单上下文与材料种子：仅本地开发用。1x1 PNG 实际字节存 R2（见下方说明）。
-- PNG 字节(base64): iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+aSAAAAABJRU5ErkJggg==
-- 其 sha256 与 byte_length 由生成脚本实际计算后写入本文件（勿手改）。

INSERT INTO installation_plan (id, installation_work_order_id, source_system, source_id, gmt_create, gmt_modified)
SELECT 'plan-dev-1', 'wo-dev-1', 'DEV', 'plan-dev-1', 1789862400000, 1789862400000
WHERE NOT EXISTS (SELECT 1 FROM installation_plan WHERE id = 'plan-dev-1');

INSERT INTO installation_context_snapshot (id, installation_work_order_id, service_provider_id, source_work_order_version, installation_plan_id, source_plan_version, installation_detail_id, source_detail_version, detail_status, completeness, missing_parts_json, context_json, retrieved_at, gmt_create, gmt_modified)
SELECT 'ctx-dev-1', 'wo-dev-1', 'provider-dev-a', 'dev-v1', 'plan-dev-1', 'plan-v1', NULL, NULL, 'NOT_SUBMITTED', 'COMPLETE', '[]',
 '{"installationWorkOrder":{"workOrderSourceId":"WO-DEV-0001","purchaseOrderId":"PO-DEV-1","sourceWorkOrderVersion":"dev-v1"},"sourceMaterials":[{"sourceSystem":"DEV","sourceMaterialId":"sm-dev-1","sourceVersion":"v1","name":"现场照片1.png","mediaType":"image/png"}]}',
 1789862400000, 1789862400000, 1789862400000
WHERE NOT EXISTS (SELECT 1 FROM installation_context_snapshot WHERE id = 'ctx-dev-1');

UPDATE installation_work_order SET context_snapshot_id = 'ctx-dev-1', gmt_modified = gmt_modified
WHERE id = 'wo-dev-1' AND context_snapshot_id IS NULL;

INSERT INTO source_material (id, source_system, source_material_id, gmt_create, gmt_modified)
SELECT 'sm-1', 'DEV', 'sm-dev-1', 1789862400000, 1789862400000
WHERE NOT EXISTS (SELECT 1 FROM source_material WHERE id = 'sm-1');

INSERT INTO source_material_version (id, source_material_id, source_version, read_state, name, media_type, byte_length, content_sha256, content_locator, retrieved_at, source_updated_at, gmt_create, gmt_modified)
SELECT 'mv-dev-1', 'sm-1', 'v1', 'VERIFIED', '现场照片1.png', 'image/png', 67, '358ee9d3245840eb4d46e56714165a1663fffac6d941bdb3f8dececc50148ec3', 'dev/sm-dev-1/v1.png', 1789862400000, NULL, 1789862400000, 1789862400000
WHERE NOT EXISTS (SELECT 1 FROM source_material_version WHERE id = 'mv-dev-1');

INSERT INTO background_job (id, purpose, service_provider_id, work_item_id, external_write_id, target_json, dedupe_key, status, available_at, lease_epoch, lease_token, lease_owner, lease_until, row_version, outcome_json, gmt_create, gmt_modified)
SELECT 'bj-dev-parse', 'PARSE_MATERIAL', 'provider-dev-a', NULL, NULL, '{"materialVersionId":"mv-dev-1"}', 'dev-seed-bjp', 'SUCCEEDED', 1789862400100, 0, NULL, NULL, NULL, 1, '{"parsing":"mp-dev-1"}', 1789862400100, 1789862400200
WHERE NOT EXISTS (SELECT 1 FROM background_job WHERE id = 'bj-dev-parse');

INSERT INTO capability_call (id, job_id, operation, source_material_version_id, input_snapshot_id, profile_id, implementation_version, config_json, input_sha256, gmt_create, gmt_modified)
SELECT 'pcr-dev-1', 'bj-dev-parse', 'PARSE_MATERIAL', 'mv-dev-1', NULL, 'dev-profile', '1.0.0', '{}', '358ee9d3245840eb4d46e56714165a1663fffac6d941bdb3f8dececc50148ec3', 1789862400100, 1789862400100
WHERE NOT EXISTS (SELECT 1 FROM capability_call WHERE id = 'pcr-dev-1');

INSERT INTO material_parsing (id, run_id, source_material_version_id, content_sha256, profile_id, implementation_version, completeness, units_json, blocks_json, issues_json, gmt_create, gmt_modified)
SELECT 'mp-dev-1', 'pcr-dev-1', 'mv-dev-1', '358ee9d3245840eb4d46e56714165a1663fffac6d941bdb3f8dececc50148ec3', 'dev-profile', '1.0.0', 'COMPLETE',
 '[{"unitId":"u1","kind":"IMAGE","index":0}]',
 '[{"blockId":"b1","unitId":"u1","position":{"x":0,"y":0},"content":"开发样例图片块"}]',
 '[]', 1789862400200, 1789862400200
WHERE NOT EXISTS (SELECT 1 FROM material_parsing WHERE id = 'mp-dev-1');
