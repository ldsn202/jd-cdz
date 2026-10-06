# T3.1 实现可重复故障与配对环境恢复工具

> 版本：v1.0｜日期：2026-09-20｜开发模式：solo-local
> 上游（我引用）：[主计划](main-delivery-plan-jd-charging-mock.md) Phase 3、[看板](task-kanban-jd-charging-mock.md) T3.1；具体依据见PRD双链·读
> 下游（引用我）：[主计划](main-delivery-plan-jd-charging-mock.md) §3、[看板](task-kanban-jd-charging-mock.md) 对应行

#### T3.1 实现可重复故障与配对环境恢复工具

**Requirement ID**：mock PRD V1.1 §4.3、§6、§7#7、#10

**PRD 双链·读**：
- [00-subprd-mock-data.md](../05-prd/00-subprd-mock-data.md) §4.3、§6、§7#7、#10
- [tc-mock.md](../06-testcase/mock/tc-mock.md) TC-MCK-03、07、09、17、18、27、28
- [sys-mock-upload.md](../03-foundation/03-07-system-flows/sys-mock-upload.md) §1—3
- [execution-schema.md](../03-foundation/03-05-schema/execution-schema.md) 执行代次与未决操作

**核心逻辑**：
- 实现故障控制单：环境、接口、来源/版本、原操作、触发阶段、命中次数和恢复条件；控制入口仅开发工具可访问，业务响应不返回答案。
- 实现进程重启持久化及恢复协调器：新建完整来源环境，调用本系统环境生命周期适配器建立空业务库并经接口导入，检查后才切换。本系统生命周期能力未实现时返回依赖未就绪，不做来源单边清空。
- 环境ID贯穿任务及回执；旧环境迟到响应不能写新环境。含实际上传环境只保留或另建新环境，保存文件及工单/证据/处理关系。

**核心文件**（拟新建；既有文件改动须保留其他任务内容）：
- `code/mocks/control/faults.ts`
- `code/mocks/control/environment-manager.ts`
- `code/mocks/control/application-lifecycle.ts`
- `code/mocks/tests/faults-environments.test.ts`

**完成标准**：
- [x] 可重复触发调用前失败、写入后丢响应、结果GET失败和源成功本地接续失败；对照请求无误伤，解除后真实请求恢复。
- [x] 来源重启记录不丢；两个同业务编号环境互不污染；未配置本系统恢复适配器时完整恢复明确拒绝，不报告恢复成功。
- [x] 协调器能验证中断不切换、旧任务不写新环境、上传环境不可清空；真实应用级证明须在T4.2完成。

**Verification Method**：
- 真实进程/HTTP测试故障命中、次数、恢复与来源写计数；使用受控生命周期接口测试协调器边界并标“组件验证”，不能替代真实业务库恢复验收。

**Evidence**：
- 已生成：[docs/08-test-reports/mock/T3.1/summary.md](../08-test-reports/mock/T3.1/summary.md)：四类故障与恢复协调 18 断言全过 + 重启探针。

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
