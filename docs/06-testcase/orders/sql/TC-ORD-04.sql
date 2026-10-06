-- TC-ORD-04.sql 工单详情权益读取三态（UNAVAILABLE / FORBIDDEN / STALE）
-- 上游：workbench-apis.md §6.2（entitlementRead 五态语义）；02-subprd-orders-history.md §7 补充验收第 3 行
-- 前置：已执行 TC-ORD-SEED.sql
-- 说明：entitlementRead 由后台调用已登记的只读权益适配接口（外部 mock）得出，本地 SQL 只能构造工单/上下文侧条件：
--   STALE      —— 本文件插入 wo-ord-04 + ctx-ord-04，mock 权益返回的 workOrderSourceVersion 与工单 source_version='wv-9' 不符；
--   FORBIDDEN  —— 由身份模拟发放"工单可见但购买订单关联记录无权"的凭据，本地无需额外数据；
--   UNAVAILABLE—— 由 mock 权益适配接口故障注入（返回 5xx/超时），本地无需额外数据。

-- ============ 数据准备 ============
INSERT INTO installation_work_order (id,source_system,source_id,current_service_provider_id,source_version,source_state,context_snapshot_id,verified_at,gmt_create,gmt_modified)
SELECT 'wo-ord-04','JD-IWO','WO-2026-0004','sp-ord-a','wv-9','ACTIVE','ctx-ord-04',1791000000000,1791000000000,1791000002000
WHERE NOT EXISTS (SELECT 1 FROM installation_work_order WHERE id='wo-ord-04');
INSERT INTO installation_plan (id,installation_work_order_id,source_system,source_id,gmt_create,gmt_modified)
SELECT 'plan-ord-04','wo-ord-04','JD-IWO','PLAN-2026-0004',1791000000500,1791000000500
WHERE NOT EXISTS (SELECT 1 FROM installation_plan WHERE id='plan-ord-04');
INSERT INTO installation_context_snapshot (id,installation_work_order_id,service_provider_id,source_work_order_version,installation_plan_id,source_plan_version,installation_detail_id,source_detail_version,detail_status,completeness,missing_parts_json,context_json,retrieved_at,gmt_create,gmt_modified)
SELECT 'ctx-ord-04','wo-ord-04','sp-ord-a','wv-9','plan-ord-04','pv-1',NULL,NULL,'NOT_SUBMITTED','COMPLETE','[]',
'{"installationWorkOrder":{"purchaseOrderId":"PO-2026-9004","workOrderSourceVersion":"wv-9"},"installationPlan":{"installationPlanId":"plan-ord-04","sourcePlanVersion":"pv-1","installedQuantity":1,"serviceScope":"家用充电桩基础安装"},"sourceMaterials":[],"completeness":"COMPLETE","missingParts":[],"retrievedAt":1791000000000}',
1791000000000,1791000001000,1791000001000
WHERE NOT EXISTS (SELECT 1 FROM installation_context_snapshot WHERE id='ctx-ord-04');

-- ============ 数据清理 ============
-- installation_work_order / installation_context_snapshot 受历史保护触发器约束，不做行级清理；
-- ord- 命名空间隔离，彻底还原重建隔离测试库。
