-- 开发分析链路种子：新增待分析核查事项 w-dev-5（无分析指针，供 T2.3 闭环）。幂等。

INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, responsibility_version, row_version, analysis_generation, gmt_create, gmt_modified)
SELECT 'w-dev-5', 'provider-dev-a', 'wo-dev-1', 'INSTALLATION_REVIEW', 'review-0005', '["provider-dev-a","wo-dev-1","review","review-0005"]', 'dev-seed-w5', '春和庭安装证据核查（开发闭环）', 'READY', 'ir-dev-jd-review', 1, 1, 1, 1789862404000, 1789862404000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'w-dev-5');

INSERT INTO activity_record (id, work_item_id, event_key, event_type, actor_identity_id, fact_type, fact_id, occurred_at, details_json, gmt_create, gmt_modified)
SELECT 'act-dev-5', 'w-dev-5', 'dev-seed-act5', 'WORK_CREATED', NULL, 'WORK_ITEM', 'w-dev-5', NULL, '{"note":"事项由来源变化创建（开发样例）"}', 1789862404000, 1789862404000
WHERE NOT EXISTS (SELECT 1 FROM activity_record WHERE id = 'act-dev-5');
