-- TC-ORD-05.sql 处理记录时间线分页：wi-ord-rev 共 12 条事件（超过一页）
-- 上游：work-item-schema.md §7（activity_record 字段与 event_type 枚举）；workbench-apis.md §4（倒序分页）
-- 前置：已执行 TC-ORD-SEED.sql（事实引用指向 SEED 的 wi-ord-rev / ar-ord-seed / hd-ord-01 / op-ord-01）
-- 数据特征：event_key 各自唯一；非 PROGRESS_SAVED 事件均带 fact_type+fact_id；覆盖八类事件中的七类及多执行人。

-- ============ 数据准备 ============
INSERT INTO activity_record (id,work_item_id,event_key,event_type,actor_identity_id,fact_type,fact_id,occurred_at,details_json,gmt_create,gmt_modified)
SELECT 'act-ord-01','wi-ord-rev','ek-ord-01','WORK_CREATED',NULL,'work_item','wi-ord-rev',1791000100000,'{"summary":"事项由资料提交成功事实创建"}',1791000100000,1791000100000
WHERE NOT EXISTS (SELECT 1 FROM activity_record WHERE id='act-ord-01');
INSERT INTO activity_record (id,work_item_id,event_key,event_type,actor_identity_id,fact_type,fact_id,occurred_at,details_json,gmt_create,gmt_modified)
SELECT 'act-ord-02','wi-ord-rev','ek-ord-02','ANALYSIS_COMPLETED',NULL,'analysis_result','ar-ord-seed',1791000101000,'{"summary":"安装证据分析完成"}',1791000101000,1791000101000
WHERE NOT EXISTS (SELECT 1 FROM activity_record WHERE id='act-ord-02');
INSERT INTO activity_record (id,work_item_id,event_key,event_type,actor_identity_id,fact_type,fact_id,occurred_at,details_json,gmt_create,gmt_modified)
SELECT 'act-ord-03','wi-ord-rev','ek-ord-03','PROGRESS_SAVED','id-ord-jd-01',NULL,NULL,1791000102000,'{"summary":"已核对确认单与方案数量","openIssues":"待服务商补充车位照片"}',1791000102000,1791000102000
WHERE NOT EXISTS (SELECT 1 FROM activity_record WHERE id='act-ord-03');
INSERT INTO activity_record (id,work_item_id,event_key,event_type,actor_identity_id,fact_type,fact_id,occurred_at,details_json,gmt_create,gmt_modified)
SELECT 'act-ord-04','wi-ord-rev','ek-ord-04','DECISION_CONFIRMED','id-ord-jd-01','human_decision','hd-ord-01',1791000103000,'{"summary":"核查通过确认已受理"}',1791000103000,1791000103000
WHERE NOT EXISTS (SELECT 1 FROM activity_record WHERE id='act-ord-04');
INSERT INTO activity_record (id,work_item_id,event_key,event_type,actor_identity_id,fact_type,fact_id,occurred_at,details_json,gmt_create,gmt_modified)
SELECT 'act-ord-05','wi-ord-rev','ek-ord-05','SOURCE_WRITE_RESULT',NULL,'external_write_operation','op-ord-01',1791000104000,'{"summary":"源端返回核查通过回执"}',1791000104000,1791000104000
WHERE NOT EXISTS (SELECT 1 FROM activity_record WHERE id='act-ord-05');
INSERT INTO activity_record (id,work_item_id,event_key,event_type,actor_identity_id,fact_type,fact_id,occurred_at,details_json,gmt_create,gmt_modified)
SELECT 'act-ord-06','wi-ord-rev','ek-ord-06','PROGRESS_SAVED','id-ord-sp-01',NULL,NULL,1791000105000,'{"summary":"服务商已补传车位照片","openIssues":""}',1791000105000,1791000105000
WHERE NOT EXISTS (SELECT 1 FROM activity_record WHERE id='act-ord-06');
INSERT INTO activity_record (id,work_item_id,event_key,event_type,actor_identity_id,fact_type,fact_id,occurred_at,details_json,gmt_create,gmt_modified)
SELECT 'act-ord-07','wi-ord-rev','ek-ord-07','RESPONSIBILITY_CHANGED','id-ord-jd-01','work_item','wi-ord-rev',1791000106000,'{"summary":"责任由李工转交张明","from":"id-ord-sp-01","to":"id-ord-jd-01"}',1791000106000,1791000106000
WHERE NOT EXISTS (SELECT 1 FROM activity_record WHERE id='act-ord-07');
INSERT INTO activity_record (id,work_item_id,event_key,event_type,actor_identity_id,fact_type,fact_id,occurred_at,details_json,gmt_create,gmt_modified)
SELECT 'act-ord-08','wi-ord-rev','ek-ord-08','FOLLOWUP_LINKED','id-ord-jd-01','work_item','wi-ord-prep',1791000107000,'{"summary":"关联前序资料整理事项"}',1791000107000,1791000107000
WHERE NOT EXISTS (SELECT 1 FROM activity_record WHERE id='act-ord-08');
INSERT INTO activity_record (id,work_item_id,event_key,event_type,actor_identity_id,fact_type,fact_id,occurred_at,details_json,gmt_create,gmt_modified)
SELECT 'act-ord-09','wi-ord-rev','ek-ord-09','PROGRESS_SAVED','id-ord-jd-01',NULL,NULL,1791000108000,'{"summary":"等待源端同步最新状态","openIssues":""}',1791000108000,1791000108000
WHERE NOT EXISTS (SELECT 1 FROM activity_record WHERE id='act-ord-09');
INSERT INTO activity_record (id,work_item_id,event_key,event_type,actor_identity_id,fact_type,fact_id,occurred_at,details_json,gmt_create,gmt_modified)
SELECT 'act-ord-10','wi-ord-rev','ek-ord-10','DECISION_CONFIRMED','id-ord-jd-01','human_decision','hd-ord-01',1791000109000,'{"summary":"补充说明确认"}',1791000109000,1791000109000
WHERE NOT EXISTS (SELECT 1 FROM activity_record WHERE id='act-ord-10');
INSERT INTO activity_record (id,work_item_id,event_key,event_type,actor_identity_id,fact_type,fact_id,occurred_at,details_json,gmt_create,gmt_modified)
SELECT 'act-ord-11','wi-ord-rev','ek-ord-11','SOURCE_WRITE_RESULT',NULL,'external_write_operation','op-ord-01',1791000110000,'{"summary":"源端回查确认终态"}',1791000110000,1791000110000
WHERE NOT EXISTS (SELECT 1 FROM activity_record WHERE id='act-ord-11');
INSERT INTO activity_record (id,work_item_id,event_key,event_type,actor_identity_id,fact_type,fact_id,occurred_at,details_json,gmt_create,gmt_modified)
SELECT 'act-ord-12','wi-ord-rev','ek-ord-12','ANALYSIS_COMPLETED',NULL,'analysis_result','ar-ord-seed',1791000111000,'{"summary":"新材料触发的重新分析完成"}',1791000111000,1791000111000
WHERE NOT EXISTS (SELECT 1 FROM activity_record WHERE id='act-ord-12');

-- ============ 数据清理 ============
-- activity_record 受历史保护触发器约束，不做行级清理；act-ord- 命名空间隔离，彻底还原重建隔离测试库。
