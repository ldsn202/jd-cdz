-- TC-ORD-06.sql 处理记录未知执行人与未知来源时间：wi-ord-recon 两条来源导入事件
-- 上游：work-item-schema.md §7（actor_identity_id / occurred_at 可空不补造）；02-subprd-orders-history.md §7 验收#5
-- 前置：已执行 TC-ORD-SEED.sql（事实引用 op-ord-01 / wi-ord-recon）
-- 数据特征：actor_identity_id=NULL、occurred_at=NULL；gmt_create 有先后，验证按本地保存时间倒序。

-- ============ 数据准备 ============
INSERT INTO activity_record (id,work_item_id,event_key,event_type,actor_identity_id,fact_type,fact_id,occurred_at,details_json,gmt_create,gmt_modified)
SELECT 'act-ord-n1','wi-ord-recon','ek-ord-n1','SOURCE_WRITE_RESULT',NULL,'external_write_operation','op-ord-01',NULL,'{"summary":"来源导入：对账发起结果"}',1791000200000,1791000200000
WHERE NOT EXISTS (SELECT 1 FROM activity_record WHERE id='act-ord-n1');
INSERT INTO activity_record (id,work_item_id,event_key,event_type,actor_identity_id,fact_type,fact_id,occurred_at,details_json,gmt_create,gmt_modified)
SELECT 'act-ord-n2','wi-ord-recon','ek-ord-n2','SOURCE_WRITE_RESULT',NULL,'external_write_operation','op-ord-01',NULL,'{"summary":"来源导入：对账状态更新"}',1791000201000,1791000201000
WHERE NOT EXISTS (SELECT 1 FROM activity_record WHERE id='act-ord-n2');

-- ============ 数据清理 ============
-- activity_record 受历史保护触发器约束，不做行级清理；act-ord- 命名空间隔离，彻底还原重建隔离测试库。
