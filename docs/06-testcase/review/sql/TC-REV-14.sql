-- TC-REV-14.sql 分析失败真实呈现（UI）— PRD：05-subprd-installation-review.md §7 验收#4
-- 前置：已执行 TC-REV-SEED.sql（本用例不新增数据，直接使用 SEED 中锦绣里事项）

-- ============ 数据准备 ============
-- 无新增数据。依赖 SEED 已有状态：
--   wi-rev-jxl：status=BLOCKED，blocked_reason='材料读取失败：现场照片 MAT-PH-01 版本 ph-v1 未取得正文'，
--               current_analysis_result_id=NULL（无可用分析）
--   ics-jxl-v1：completeness=INCOMPLETE，missing_parts 含"现场照片 MAT-PH-01 正文未取得"
--   smv-photo-v1：read_state=REFERENCED（已有资料索引可见但正文未取得）

-- ============ 数据清理 ============
-- 无（本用例不修改数据）
