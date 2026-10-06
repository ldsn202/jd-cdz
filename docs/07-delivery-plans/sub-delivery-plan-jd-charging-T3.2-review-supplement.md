# T3.2 安装核查与补充

## 任务来源

- 主开发计划：[main-delivery-plan-jd-charging.md](main-delivery-plan-jd-charging.md)
- 任务看板：[task-kanban-jd-charging.md](task-kanban-jd-charging.md)

#### T3.2 实现核查决定、退回补充接续与分析失败恢复

**Requirement ID**：REQ-REV-01

**PRD 双链·读**：
- `docs/05-prd/05-subprd-installation-review.md` §3、§4、§5、§7（含评审补充）
- `docs/03-foundation/03-06-provided-apis/installation-apis.md`（review-decisions / supplements）
- `docs/03-foundation/03-07-system-flows/sys-transactions-recovery.md` §6（安装核查的接续状态）
- `docs/03-foundation/03-02-external-apis/review-supplement-sync.md`
- `docs/06-testcase/review/tc-review.md`（TC-REV-）

**核心逻辑**：
- 实现 `POST /review-decisions` 与 `POST /supplements`；详情读取复用 T1.2 work-items 详情与 T1.3 material-versions。
- 审核决定（通过 / 退回）真实改变事项状态并同步外部核查记录；退回后的服务商回复继续原事项，不另建重复事项；成功回复与原问题、附件进入新快照（PHASE-17 疑点 #3 口径）。
- 分析失败恢复：分析失败的事项以待处理真实状态呈现，重试经后台链路（T2.3）重新分析，不展示伪造结论。

**核心文件**：
- `code/api/src/routes/review.ts`（新建）
- `code/api/src/services/review-decision.ts`、`code/api/src/services/supplement-sync.ts`（新建）

**完成标准**：
- review-decisions 写入后：事项状态、decision 记录、外部核查同步三者可回查一致；版本 / 权限不满足时按契约拒绝且无部分写入。
- 退回 → 服务商补充 → 继续原事项全链路的记录挂在同一 workItemId 下（D1 回查事项唯一）。
- 分析失败事项在 work-items 中呈现失败状态，重试后状态与结果真实更新；失败期间无伪造分析结论。
- 202 / PROCESSING 与外部成功、本地接续、拒绝、待分配状态按裁决状态表区分（PHASE-17 疑点 #4 口径）。

**Verification Method**：
- 真实走通决定、退回补充、失败恢复三条链路并逐环节回查；执行 TC-REV 可执行用例。

**Evidence**：
- 当日开发日志：三链路请求 / 响应与 D1 回查对照；TC-REV 执行结果记入 `docs/08-test-reports/`。

**Failure Handling**：
- 外部同步契约与本系统接续状态冲突时阻塞并 `AI 执行 -> 人审核`。
- T2.3 未就绪时，分析失败恢复链路记阻塞，先完成决定与补充链路并注明。

**完成收尾：状态同步**：
- 本 Task 完成实现和验证后，把完成事实、验证证据、完成日期和建议下一 Task 同步回写三处：`main-delivery-plan-jd-charging.md` 执行阶段表、`task-kanban-jd-charging.md` 对应行、本子开发计划的 `**状态**` 字段。
- 同步更新 `docs/00-process/00-02-progress/progress.md` 的进度快照。
- 回写后重新运行 `node .agent/skills/delivery-planner/scripts/check-plan-consistency.mjs docs/07-delivery-plans/main-delivery-plan-jd-charging.md --json`，确认三处一致；未通过前不得宣称本 Task 已完成。

**Owner**：AI 执行 -> 人审核

**前置**：T1.1、T2.1、T2.3

**状态**：已完成（2026-09-20）
