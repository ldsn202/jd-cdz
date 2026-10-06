# T1.3 建立独立数据校验与场景预期

> 版本：v1.0｜日期：2026-09-20｜开发模式：solo-local
> 上游（我引用）：[主计划](main-delivery-plan-jd-charging-mock.md) Phase 1、[看板](task-kanban-jd-charging-mock.md) T1.3；具体依据见PRD双链·读
> 下游（引用我）：[主计划](main-delivery-plan-jd-charging-mock.md) §3、[看板](task-kanban-jd-charging-mock.md) 对应行

#### T1.3 建立独立数据校验与场景预期

**Requirement ID**：mock PRD V1.1 §2.2、§3.3、§5.3、§7#2—4

**PRD 双链·读**：
- [00-subprd-mock-data.md](../05-prd/00-subprd-mock-data.md) §2.2、§3.3、§5.3、§7#2—4
- [tc-mock.md](../06-testcase/mock/tc-mock.md) TC-MCK-21、22、23、24、25、26
- [source-scenarios.md](../06-testcase/mock/source-scenarios.md) §1—4

**核心逻辑**：
- 校验程序独立读取生成产物，分别查关联、版本、时间、金额与文件；不直接复用生成器的金额和映射算法判自身正确。
- 先编写小份可人工逐字段核实的固定样本：单位差异、同名异义、拆合项、固定费用、未知/零/负金额、范围不一致、总分不符、材料不足；用清晰算式与原文位置固定预期，再运行生成和被测逻辑。
- 每个场景保存输入版本、操作、可变/不可变来源、应出现的业务结果与原文支持；预期文件和场景标签不能被来源业务响应或Skill输入读取。

**核心文件**（拟新建；既有文件改动须保留其他任务内容）：
- `code/mocks/validation/`
- `code/mocks/acceptance/golden/`
- `code/mocks/acceptance/expected/`
- `code/mocks/generator/manifest.ts`

**完成标准**：
- [x] 交付数据清单、文件清单、场景覆盖表、校验报告、独立验收预期五项；正常数据无未解释校验错误。
- [x] 故意负例命中对应预期并保留；未预期坏关联、错误金额或摘要不符阻止装载。任意改坏固定样本的关键值时校验确实失败。
- [x] 同配置两次生成记录及文件摘要一致；后续测试时间可推进，新操作版本不被种子冻结。

**Verification Method**：
- 执行TC-MCK-21—26；将关联、金额、文件分别单独破坏，确认独立验证器能抓出每种错误。输出原始计数及差异，不能仅输出passed=true。

**Evidence**：
- 已生成：[docs/08-test-reports/mock/T1.3/summary.md](../08-test-reports/mock/T1.3/summary.md)：五件交付清单、四类破坏抓出记录、golden 17 断言、TC-MCK-21—26 承接表。

**Failure Handling**：
- PRD/契约定位失败或相互冲突时登记具体对象与影响，停止受影响路径；不得用前端补值或修改预期绕过。验证工具/输入/原始证据缺失时保持未完成，未实现的业务依赖不得用终态假数据替代。

**Owner**：AI 执行 -> 人审核

**前置**：T1.1、T1.2

**状态**：已完成（2026-09-20）

**完成日期**：2026-09-20

**完成收尾：状态同步**：
- 完成实现及逐项验证后，将完成事实、证据、日期和建议下一Task同次回写主计划执行阶段表、任务看板及本子计划；同步`docs/00-process/00-02-progress/progress.md`和当日日志。
- 回写后运行`node .agent/skills/delivery-planner/scripts/check-plan-consistency.mjs docs/07-delivery-plans/main-delivery-plan-jd-charging-mock.md --json`。需继续执行时同步已获授权的下一Task；若无进行中任务，明确记录阶段收口，不为通过开工检查虚构进行中任务。
- 未完成证据及状态同步不得标已完成；单个Skill既有通过证据按版本复用。
