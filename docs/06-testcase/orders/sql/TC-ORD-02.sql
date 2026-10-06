-- TC-ORD-02.sql 越权访问被拒（他商工单 / 他商事项 / 无材料权限正文）
-- 上游：workbench-apis.md §5—6；material-apis.md §1；common-contract.md §3—4；02-subprd-orders-history.md §7 验收#2、#13
-- 前置：已执行 TC-ORD-SEED.sql

-- ============ 数据准备 ============
-- 复用 TC-ORD-SEED.sql：wo-ord-03 / wi-ord-b（服务商乙资源）、smv-ord-001-v1（服务商甲材料，用于无 READ_SOURCE_MATERIAL 身份请求 /content）。
-- 越权凭据由身份模拟配置发放（服务商乙身份、无材料权限身份），本地无需新增数据。

-- ============ 数据清理 ============
-- 无新增数据；SEED 受历史保护触发器约束，彻底还原重建隔离测试库。
