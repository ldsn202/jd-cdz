# T2.1 实现身份、工单和权益读取接口

> 版本：v1.0｜日期：2026-09-20｜开发模式：solo-local
> 上游（我引用）：[主计划](main-delivery-plan-jd-charging-mock.md) Phase 2、[看板](task-kanban-jd-charging-mock.md) T2.1；具体依据见PRD双链·读
> 下游（引用我）：[主计划](main-delivery-plan-jd-charging-mock.md) §3、[看板](task-kanban-jd-charging-mock.md) 对应行

#### T2.1 实现身份、工单和权益读取接口

**Requirement ID**：mock PRD V1.1 §2.3、§4.1、§4.3、§7#1、#9

**PRD 双链·读**：
- [00-subprd-mock-data.md](../05-prd/00-subprd-mock-data.md) §2.3、§4.1、§4.3、§7#1、#9
- [tc-mock.md](../06-testcase/mock/tc-mock.md) TC-MCK-01、02、03、15、16
- [current-identity-permissions-read.md](../03-foundation/03-02-external-apis/current-identity-permissions-read.md) §2—4
- [installation-work-order-context.md](../03-foundation/03-02-external-apis/installation-work-order-context.md) §2—5
- [purchase-order-installation-entitlements.md](../03-foundation/03-02-external-apis/purchase-order-installation-entitlements.md) §2—5

**核心逻辑**：
- 分别实现身份、工单上下文、购买权益GET；仅返回各自来源实际记录。按可信测试会话分清人员/后台、动作/范围和服务商归属。
- 自报身份参数400、失效会话401、停用身份403；有效无授权返回grants=[]。工单可见不自动放行材料/账单，撤权后按最新范围拒绝。
- 保留计划/正式明细区别，NOT_SUBMITTED为正常阶段；权益上限不能冒充实际安装量。

**核心文件**（拟新建；既有文件改动须保留其他任务内容）：
- `code/mocks/identity/`
- `code/mocks/installation/context.ts`
- `code/mocks/purchase-orders/`
- `code/mocks/tests/identity-workorders.test.ts`

**完成标准**：
- [x] 三条GET分别从对应来源读取；正常/空/无权/停用/撤权/缺项响应按具体契约逐字段对照。
- [x] 相同名称不同ID不会混归属；跨服务商读取不泄露字段，SERVICE不代人员确认；先证明来源层结果，不以其代替工作台404测试。

**Verification Method**：
- 实际HTTP请求三接口，记录脱敏身份及授权事实和返回；外部API可先独立验收，TC中的工作台表现待T4.2。

**Evidence**：
- 已生成：[docs/08-test-reports/mock/T2.1/summary.md](../08-test-reports/mock/T2.1/summary.md)：三条 GET 真实 HTTP 18 断言全过。

**Failure Handling**：
- PRD/契约定位失败或相互冲突时登记具体对象与影响，停止受影响路径；不得用前端补值或修改预期绕过。验证工具/输入/原始证据缺失时保持未完成，未实现的业务依赖不得用终态假数据替代。

**Owner**：AI 执行 -> 人审核

**前置**：T1.3

**状态**：已完成（2026-09-20）

**完成日期**：2026-09-20

**完成收尾：状态同步**：
- 完成实现及逐项验证后，将完成事实、证据、日期和建议下一Task同次回写主计划执行阶段表、任务看板及本子计划；同步`docs/00-process/00-02-progress/progress.md`和当日日志。
- 回写后运行`node .agent/skills/delivery-planner/scripts/check-plan-consistency.mjs docs/07-delivery-plans/main-delivery-plan-jd-charging-mock.md --json`。需继续执行时同步已获授权的下一Task；若无进行中任务，明确记录阶段收口，不为通过开工检查虚构进行中任务。
- 未完成证据及状态同步不得标已完成；单个Skill既有通过证据按版本复用。
