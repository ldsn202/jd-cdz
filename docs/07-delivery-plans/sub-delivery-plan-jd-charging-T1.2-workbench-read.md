# T1.2 工作台读取链路

## 任务来源

- 主开发计划：[main-delivery-plan-jd-charging.md](main-delivery-plan-jd-charging.md)
- 任务看板：[task-kanban-jd-charging.md](task-kanban-jd-charging.md)

#### T1.2 实现 work-items 列表 / 汇总 / 详情 / 记录与 operations 查询

**Requirement ID**：REQ-WB-01

**PRD 双链·读**：
- `docs/05-prd/01-subprd-workbench-items.md` §3（3.2—3.7）、§4、§5、§7
- `docs/03-foundation/03-06-provided-apis/workbench-apis.md` §2—§4、§7
- `docs/03-foundation/03-05-schema/work-item-schema.md`
- `docs/03-foundation/03-07-system-flows/sys-workbench-read.md`
- `docs/06-testcase/workbench/tc-workbench.md`（TC-WB- 对应 API 号段）

**核心逻辑**：
- 实现 5 条 GET：`/work-items`、`/work-items/summary`、`/work-items/{workItemId}`、`/work-items/{workItemId}/activities`、`/operations/{operationId}`。
- 列表 / 汇总 / 详情全部来自 work_item 域真实查询：筛选、排序、分页在服务端执行；汇总按身份业务范围统计；操作结果回执与正文分开（mock 审核已纠正的口径）。
- 对账摘要投影按 workbench-apis §7.2 由服务端批量计算（金额十进制），详情复用当前有效比较。

**核心文件**：
- `code/api/src/routes/work-items.ts`（新建）
- `code/api/src/services/work-item-query.ts`、`code/api/src/services/reconciliation-summary.ts`（新建）

**完成标准**：
- 5 条接口的请求参数、返回字段与 workbench-apis §2—§4 逐字段一致；分页与筛选按 01-subprd §3.4—3.5 口径。
- summary 的各状态计数与 work-items 同条件查询结果真实相等（同一查询回查核对）。
- operations 查询返回真实操作状态；结果未知与处理中状态按契约区分。
- 越权访问他方业务范围事项按 T1.1 裁决口径拒绝。

**Verification Method**：
- 受控数据下逐条真实请求并核对响应字段；用 SQL 回查同一条件，比对 summary 计数与列表行数；执行 TC-WB API 号段中可执行用例。

**Evidence**：
- 当日开发日志：响应样例与 SQL 回查对照；TC-WB 执行结果记入 `docs/08-test-reports/`（由 test-case-runner 落盘）。

**Failure Handling**：
- work_item 域尚无业务写入链路（Phase 2/3 才产生事项）时，用受控种子数据验证查询逻辑并注明，不宣称业务闭环完成。
- TC-WB 中标 BLOCKED 的用例保持阻塞并在报告注明原因，不改判 PASS。

**完成收尾：状态同步**：
- 本 Task 完成实现和验证后，把完成事实、验证证据、完成日期和建议下一 Task 同步回写三处：`main-delivery-plan-jd-charging.md` 执行阶段表、`task-kanban-jd-charging.md` 对应行、本子开发计划的 `**状态**` 字段。
- 同步更新 `docs/00-process/00-02-progress/progress.md` 的进度快照。
- 回写后重新运行 `node .agent/skills/delivery-planner/scripts/check-plan-consistency.mjs docs/07-delivery-plans/main-delivery-plan-jd-charging.md --json`，确认三处一致；未通过前不得宣称本 Task 已完成。

**Owner**：AI 执行 -> 人审核

**前置**：T1.1

**裁决与偏差记录（2026-09-20）**：
- analysisStatus 推导口径（裁决）：`current_analysis_result_id` 非空 → AVAILABLE；否则该事项存在 ANALYZE_SKILL 目的且 FAILED/BLOCKED 终态的 background_job → BLOCKED；否则 NOT_READY。分析失败以执行域任务终态为准。
- operations.localContinuationStatus 计算条件（裁决，对应 02-subprd §7 #12）：REGISTERED/PROCESSING/RESULT_UNKNOWN → NOT_READY；SUCCEEDED 且同工单 SOURCE_WRITE_RESULT 活动记录指向本 operation → COMPLETED，否则 PENDING；REJECTED → BLOCKED。
- 偏差：TC-WB API 号例的逐条执行留待 T5.1（test-case-runner 统一驱动各域用例）；本轮以真实接口请求 + SQL 回查为完成证据，未按用例编号逐条跑。

**状态**：已完成（2026-09-20）
