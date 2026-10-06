-- w-dev-2 提交链路：补安装方案与 COMPLETE 上下文快照（快照只增不改，取最新）。

INSERT INTO installation_plan (id, installation_work_order_id, source_system, source_id, gmt_create, gmt_modified)
SELECT 'plan-dev-2', 'wo-dev-2', 'DEV', 'PLAN-DEV-0002', 1789862409000, 1789862409000
WHERE NOT EXISTS (SELECT 1 FROM installation_plan WHERE id = 'plan-dev-2');

INSERT INTO installation_context_snapshot (id, installation_work_order_id, service_provider_id, source_work_order_version, installation_plan_id, source_plan_version, installation_detail_id, source_detail_version, detail_status, completeness, missing_parts_json, context_json, retrieved_at, gmt_create, gmt_modified)
SELECT 'ctx-dev-2b', 'wo-dev-2', 'provider-dev-b', 'dev-v2', 'plan-dev-2', 'plan-v1', NULL, NULL, 'NOT_SUBMITTED', 'COMPLETE', '[]', '{}', 1789862409000, 1789862409000, 1789862409000
WHERE NOT EXISTS (SELECT 1 FROM installation_context_snapshot WHERE id = 'ctx-dev-2b');
