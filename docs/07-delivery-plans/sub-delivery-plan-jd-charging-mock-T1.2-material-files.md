# T1.2 生成可解析且可追溯的原始材料文件

> 版本：v1.0｜日期：2026-09-20｜开发模式：solo-local
> 上游（我引用）：[主计划](main-delivery-plan-jd-charging-mock.md) Phase 1、[看板](task-kanban-jd-charging-mock.md) T1.2；具体依据见PRD双链·读
> 下游（引用我）：[主计划](main-delivery-plan-jd-charging-mock.md) §3、[看板](task-kanban-jd-charging-mock.md) 对应行

#### T1.2 生成可解析且可追溯的原始材料文件

**Requirement ID**：mock PRD V1.1 §3.1、§3.3、§5.2

**PRD 双链·读**：
- [00-subprd-mock-data.md](../05-prd/00-subprd-mock-data.md) §3.1、§3.3、§5.2
- [tc-mock.md](../06-testcase/mock/tc-mock.md) TC-MCK-04、12、22、23
- [source-material-read.md](../03-foundation/03-02-external-apis/source-material-read.md) §2—5
- [ai-inference-material-parsing.md](../03-foundation/03-02-external-apis/ai-inference-material-parsing.md) §2—3

**核心逻辑**：
- 根据已冻结来源事实生成实际PDF、多sheet XLSX、PNG/JPEG，文件与字段来自同一施工事实；包含费用依据、现场记录、签字材料及补充文件。文件布局体现多服务商差异。
- 固定创建信息、内部编号、顺序与生成依赖版本，形成字节摘要、页/sheet索引及内容位置；图片描述与识别出的原文分开。
- 生成确实损坏或缺页的负例，并保留正常对照；不能靠把解析状态字段改为失败制造负例。安装事实证明、费用批准分别建模，签字不能自动代表批准。

**核心文件**（拟新建；既有文件改动须保留其他任务内容）：
- `code/mocks/generator/files/`
- `code/mocks/generator/file-manifest.ts`
- `code/mocks/fixtures/material-layouts/`
- `code/mocks/tests/files/`

**完成标准**：
- [x] 每个正常文件都可打开，页/sheet数量与清单一致，指定关键字段在原文中能定位；所有引用的来源/工单/版本能回查。
- [x] 两次同配置生成文件摘要一致；损坏/缺页负例实际字节与正常对照不同且能触发相应解析失败或缺项。

**Verification Method**：
- 对五种资料形态分别人工阅读固定核对文件，工具逐文件检查类型/摘要/页或sheet覆盖；真实解析单列证据，不能用模板文本直接回填解析结果。

**Evidence**：
- 已生成：[docs/08-test-reports/mock/T1.2/summary.md](../08-test-reports/mock/T1.2/summary.md)：997 文件 8 断言全过、两类文件级负例触发证据、两次生成摘要一致、五形态人工阅读样本（samples/）。

**Failure Handling**：
- PRD/契约定位失败或相互冲突时登记具体对象与影响，停止受影响路径；不得用前端补值或修改预期绕过。验证工具/输入/原始证据缺失时保持未完成，未实现的业务依赖不得用终态假数据替代。

**Owner**：AI 执行 -> 人审核

**前置**：T1.1

**状态**：已完成（2026-09-20）

**完成日期**：2026-09-20

**完成收尾：状态同步**：
- 完成实现及逐项验证后，将完成事实、证据、日期和建议下一Task同次回写主计划执行阶段表、任务看板及本子计划；同步`docs/00-process/00-02-progress/progress.md`和当日日志。
- 回写后运行`node .agent/skills/delivery-planner/scripts/check-plan-consistency.mjs docs/07-delivery-plans/main-delivery-plan-jd-charging-mock.md --json`。需继续执行时同步已获授权的下一Task；若无进行中任务，明确记录阶段收口，不为通过开工检查虚构进行中任务。
- 未完成证据及状态同步不得标已完成；单个Skill既有通过证据按版本复用。
