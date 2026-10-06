# T3.2 交付后台HTTP适配与来源输入追溯

> 版本：v1.0｜日期：2026-09-20｜开发模式：solo-local
> 上游（我引用）：[主计划](main-delivery-plan-jd-charging-mock.md) Phase 3、[看板](task-kanban-jd-charging-mock.md) T3.2；具体依据见PRD双链·读
> 下游（引用我）：[主计划](main-delivery-plan-jd-charging-mock.md) §3、[看板](task-kanban-jd-charging-mock.md) 对应行

#### T3.2 交付后台HTTP适配与来源输入追溯

**Requirement ID**：mock PRD V1.1 §1、§2.3、§4.1、§7#1、#11

**PRD 双链·读**：
- [00-subprd-mock-data.md](../05-prd/00-subprd-mock-data.md) §1、§2.3、§4.1、§7#1、#11
- [tc-mock.md](../06-testcase/mock/tc-mock.md) TC-MCK-02、04、08、19
- [execution-apis.md](../03-foundation/03-06-provided-apis/execution-apis.md) §1—5
- [evidence-schema.md](../03-foundation/03-05-schema/evidence-schema.md) 固定版本输入
- [ai-inference-material-parsing.md](../03-foundation/03-02-external-apis/ai-inference-material-parsing.md) §2—3

**核心逻辑**：
- 在真实后台目录实现仅经HTTP访问各来源的适配器，按来源地址、可信上下文和固定版本请求；不引入模拟库的数据访问模块。
- 将文件字节与版本元数据交给实际解析入口，记录每份固定输入对应的来源响应与摘要；不复用旧Skill测试中的模拟解析块冒充生产解析。
- 业务来源模式与AI模式独立配置；AI mock流程接口单独标记，real调用沿用已实现Node工具。此任务只实现依赖适配及输入交接，不伪装业务API、持久化和调度已经完成。

**核心文件**（拟新建；既有文件改动须保留其他任务内容）：
- `code/api/package.json`
- `code/api/src/adapters/external/`
- `code/api/src/adapters/ai/`
- `code/api/tests/external-adapters/`
- `code/mocks/ai/`

**完成标准**：
- [x] 各业务来源通过独立HTTP请求取得；阻断某来源时无文件/数据库旁路，其他输入不补造失败记录。
- [x] 接口返回至固定输入的来源/ID/版本/摘要可追溯；文件传递实际字节；模拟AI结果带模式，real失败不自动调用模拟答案。
- [x] 提供可供后续服务导入的类型、错误映射及配置说明；不要求重跑未变的四个Skill能力测试。

**Verification Method**：
- 适配器对启动的模拟服务做真实HTTP集成测试，检查访问路径、文件字节和失败分支；OpenCode未调用时不能填写真实分析通过。

**Evidence**：
- 已生成：[docs/08-test-reports/mock/T3.2/summary.md](../08-test-reports/mock/T3.2/summary.md)：适配器真实 HTTP 集成 11 断言全过。

**Failure Handling**：
- PRD/契约定位失败或相互冲突时登记具体对象与影响，停止受影响路径；不得用前端补值或修改预期绕过。验证工具/输入/原始证据缺失时保持未完成，未实现的业务依赖不得用终态假数据替代。

**Owner**：AI 执行 -> 人审核

**前置**：T2.6

**状态**：已完成（2026-09-20）

**完成日期**：2026-09-20

**完成收尾：状态同步**：
- 完成实现及逐项验证后，将完成事实、证据、日期和建议下一Task同次回写主计划执行阶段表、任务看板及本子计划；同步`docs/00-process/00-02-progress/progress.md`和当日日志。
- 回写后运行`node .agent/skills/delivery-planner/scripts/check-plan-consistency.mjs docs/07-delivery-plans/main-delivery-plan-jd-charging-mock.md --json`。需继续执行时同步已获授权的下一Task；若无进行中任务，明确记录阶段收口，不为通过开工检查虚构进行中任务。
- 未完成证据及状态同步不得标已完成；单个Skill既有通过证据按版本复用。
