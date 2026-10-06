# T2.3 实现双方账单及计费依据读取

> 版本：v1.0｜日期：2026-09-20｜开发模式：solo-local
> 上游（我引用）：[主计划](main-delivery-plan-jd-charging-mock.md) Phase 2、[看板](task-kanban-jd-charging-mock.md) T2.3；具体依据见PRD双链·读
> 下游（引用我）：[主计划](main-delivery-plan-jd-charging-mock.md) §3、[看板](task-kanban-jd-charging-mock.md) 对应行

#### T2.3 实现双方账单及计费依据读取

**Requirement ID**：mock PRD V1.1 §2.2—2.3、§4.1、§5.2

**PRD 双链·读**：
- [00-subprd-mock-data.md](../05-prd/00-subprd-mock-data.md) §2.2—2.3、§4.1、§5.2
- [tc-mock.md](../06-testcase/mock/tc-mock.md) TC-MCK-02、14、16、25
- [jd-bill-read.md](../03-foundation/03-02-external-apis/jd-bill-read.md) §2—5
- [provider-receivable-read.md](../03-foundation/03-02-external-apis/provider-receivable-read.md) §2—5
- [billing-terms-approval-records-read.md](../03-foundation/03-02-external-apis/billing-terms-approval-records-read.md) §2—5

**核心逻辑**：
- 京东账单、服务商应收、费用依据三条GET各有独立存储与权限；保存原分项/原总额、工单分配、币种、税口径及适用范围。
- 空值、零、负值与固定费用分别保存；条款/批准分别记录是否查全。保留拆合项和总分不符，不在接口预计算本系统差额或AI判断。

**核心文件**（拟新建；既有文件改动须保留其他任务内容）：
- `code/mocks/jd-bills/`
- `code/mocks/provider-receivables/`
- `code/mocks/billing-evidence/`
- `code/mocks/tests/billing-sources.test.ts`

**完成标准**：
- [x] 三条接口逐字段匹配契约，单账单多工单分配及整单权限可核验；正常记录十进制复算一致。
- [x] 无批准与未查全不同；修改应收不改变京东账单；返回中不夹带reconciliationSummary或预制判断。

**Verification Method**：
- 对TC-MCK-14/16/25指定的来源案例分别HTTP读取，独立复算原金额、检查工单/账期/币种及授权，不调用业务比较器充当来源校验器。

**Evidence**：
- 已生成：[docs/08-test-reports/mock/T2.3/summary.md](../08-test-reports/mock/T2.3/summary.md)：账单类三条 GET 12 断言全过。

**Failure Handling**：
- PRD/契约定位失败或相互冲突时登记具体对象与影响，停止受影响路径；不得用前端补值或修改预期绕过。验证工具/输入/原始证据缺失时保持未完成，未实现的业务依赖不得用终态假数据替代。

**Owner**：AI 执行 -> 人审核

**前置**：T2.1

**状态**：已完成（2026-09-20）

**完成日期**：2026-09-20

**完成收尾：状态同步**：
- 完成实现及逐项验证后，将完成事实、证据、日期和建议下一Task同次回写主计划执行阶段表、任务看板及本子计划；同步`docs/00-process/00-02-progress/progress.md`和当日日志。
- 回写后运行`node .agent/skills/delivery-planner/scripts/check-plan-consistency.mjs docs/07-delivery-plans/main-delivery-plan-jd-charging-mock.md --json`。需继续执行时同步已获授权的下一Task；若无进行中任务，明确记录阶段收口，不为通过开工检查虚构进行中任务。
- 未完成证据及状态同步不得标已完成；单个Skill既有通过证据按版本复用。
