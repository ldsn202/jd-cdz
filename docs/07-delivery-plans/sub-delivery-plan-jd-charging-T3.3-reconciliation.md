# T3.3 业务对账

## 任务来源

- 主开发计划：[main-delivery-plan-jd-charging.md](main-delivery-plan-jd-charging.md)
- 任务看板：[task-kanban-jd-charging.md](task-kanban-jd-charging.md)

#### T3.3 实现对账差异读写、核实往来与事实登记

**Requirement ID**：REQ-REC-01

**PRD 双链·读**：
- `docs/05-prd/06-subprd-reconciliation.md` §3、§4、§5、§7（含补充验收：列表摘要）
- `docs/03-foundation/03-06-provided-apis/reconciliation-apis.md`
- `docs/03-foundation/03-05-schema/reconciliation-schema.md`
- `docs/03-foundation/03-07-system-flows/sys-configuration-reconciliation.md`
- `docs/03-foundation/03-02-external-apis/jd-bill-read.md`、`provider-receivable-read.md`
- `docs/06-testcase/recon/tc-recon.md`（TC-REC-）

**核心逻辑**：
- 实现 `GET /reconciliation` 详情、`POST /billing-questions`、`POST /billing-replies`、`POST /billing-facts`；列表摘要复用 T1.2 的服务端批量金额摘要。
- 金额计算由程序以十进制执行（不用浮点），差异分组与解释来自 evidence 域真实分析结果；AI 不改账、不自动批准费用。
- 核实问题与服务商回复按事项接续；核实事实登记后支持「核对一致」判定；服务商应收修订经外部适配层写回并可回查新版本，原记录归属不变。

**核心文件**：
- `code/api/src/routes/reconciliation.ts`（新建）
- `code/api/src/services/reconciliation-read.ts`、`code/api/src/services/billing-exchange.ts`、`code/api/src/services/money.ts`（十进制金额，新建）

**完成标准**：
- 对账详情返回的分组差异、金额与 reconciliation 域表及当前有效比较结果一致（SQL 回查逐组核对）。
- billing-questions / replies / facts 写入后事项接续正确，拒绝路径错误码按裁决口径（06-subprd §7 #11 待确认项同次裁决回写）。
- 金额计算在边界值（含小数位）下与十进制期望一致，无浮点误差样例。
- 应收修订后经外部读取接口回查到新版本，旧版本保留可追溯。

**Verification Method**：
- 真实请求四条接口并 SQL 回查；构造金额边界样例核对；执行 TC-REC 可执行用例。

**Evidence**：
- 当日开发日志：请求 / 响应与 SQL 回查对照、金额边界样例；TC-REC 执行结果记入 `docs/08-test-reports/`。

**Failure Handling**：
- 差异解释所需分析结果缺失时按真实缺数呈现，不补造解释。
- 外部应收读取契约缺口先同步契约再实现。

**完成收尾：状态同步**：
- 本 Task 完成实现和验证后，把完成事实、验证证据、完成日期和建议下一 Task 同步回写三处：`main-delivery-plan-jd-charging.md` 执行阶段表、`task-kanban-jd-charging.md` 对应行、本子开发计划的 `**状态**` 字段。
- 同步更新 `docs/00-process/00-02-progress/progress.md` 的进度快照。
- 回写后重新运行 `node .agent/skills/delivery-planner/scripts/check-plan-consistency.mjs docs/07-delivery-plans/main-delivery-plan-jd-charging.md --json`，确认三处一致；未通过前不得宣称本 Task 已完成。

**Owner**：AI 执行 -> 人审核

**前置**：T1.1、T2.1

**状态**：已完成（2026-09-20）
