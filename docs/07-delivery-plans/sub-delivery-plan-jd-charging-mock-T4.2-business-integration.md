# T4.2 接入真实工作台并完成mock业务联调

> 版本：v1.0｜日期：2026-09-20｜开发模式：solo-local
> 上游（我引用）：[主计划](main-delivery-plan-jd-charging-mock.md) Phase 4、[看板](task-kanban-jd-charging-mock.md) T4.2；具体依据见PRD双链·读
> 下游（引用我）：[主计划](main-delivery-plan-jd-charging-mock.md) §3、[看板](task-kanban-jd-charging-mock.md) 对应行

#### T4.2 接入真实工作台并完成mock业务联调

**Requirement ID**：mock PRD V1.1 §5—7

**PRD 双链·读**：
- [00-subprd-mock-data.md](../05-prd/00-subprd-mock-data.md) §5—7
- [tc-mock.md](../06-testcase/mock/tc-mock.md) TC-MCK-11、12、13、14、15、16、18、19、28、29
- [03-subprd-provider-config.md](../05-prd/03-subprd-provider-config.md) §7
- [04-subprd-installation-materials.md](../05-prd/04-subprd-installation-materials.md) §7
- [05-subprd-installation-review.md](../05-prd/05-subprd-installation-review.md) §7及评审补充
- [06-subprd-reconciliation.md](../05-prd/06-subprd-reconciliation.md) §7及列表摘要
- [README.md](../03-foundation/03-06-provided-apis/README.md) 业务API入口

**核心逻辑**：
- 实现面向实际应用的联调驱动、场景绑定和证据采集；操作业务API及工作台，由后台分别调用模拟来源。不能为让用例跑完临时造一个返回成功的业务后端。
- 先核实下方主计划登记的应用依赖：业务服务/持久化、解析及调度、已启用规则执行、页面与真实API接入、环境生命周期；缺任一能力则对应子场景阻塞，来源阶段仍可独立交付。
- 执行四个Skill相关业务闭环和多服务商协作，人员打开页面处理已准备分析；上传实际文件进入同一业务处理链。只对新增输入/接口/调度联调做必要真实模型验证，已通过且未变化的能力证据沿用。

**核心文件**（拟新建；既有文件改动须保留其他任务内容）：
- `code/mocks/acceptance/application-suites/`
- `code/mocks/control/application-lifecycle.ts`
- `code/api/tests/mock-integration/`
- `code/web/tests/mock-flows/`

**完成标准**：
- [ ] 转换启用后新同格式资料直接程序转换；整理提交、审核通过/退回/补充、双方对账与应收修订均有真实来源读写及本系统保存/页面回查证据。
- [ ] 100家来源经过实际导入后，列表/统计/权限与独立集合核对；无事项工单可见且不造待办；源成功本地失败仅恢复本地。
- [ ] 完整环境恢复、中断、旧任务迟到及实际上传保护用真实应用数据库/文件/任务验证；模拟适配器组件测试不能替代。
- [ ] 按用户 2026-09-21 明确要求选择典型业务场景验收，实际暴露缺陷完成修复复测，并明确未测范围；不把 AI mock 或工程检查折算为未执行 TC 的 PASS，真实模型证据与模拟响应分开。

**Verification Method**：
- 依据 TC-MCK 选取典型场景执行实际 API / 浏览器联调并保存证据；本轮不扩展全部子场景。已有来源/模型/生命周期证据可复用，UI 返工与核查外写失败仍待收口。

**Evidence**：
- 已有实际证据：[T5.1 工程记录](../08-test-reports/T5.1-engineering-20260921/README.md)、[生命周期摘要](../08-test-reports/mock/lifecycle-20260921/summary.json)。生命周期已验证独占空库导入、恢复、旧任务隔离、SIGTERM 中断及 R2 对象保护；真实 uploads API 与恢复组合场景及 SIGKILL 未测。原计划 `mock/T4.2/` 目录未生成不等于没有实际工程证据。
- 浏览器截图存`pwScreenShot/mock-business/`，报告以链接引用。

**Failure Handling**：
- PRD/契约定位失败或相互冲突时登记具体对象与影响，停止受影响路径；不得用前端补值或修改预期绕过。验证工具/输入/原始证据缺失时保持未完成，未实现的业务依赖不得用终态假数据替代。

**Owner**：AI 执行 -> 人审核

**前置**：T4.1；另需主计划§2列出的真实应用依赖

**状态**：进行中

**完成日期**：—

**完成收尾：状态同步**：
- 完成实现及逐项验证后，将完成事实、证据、日期和建议下一Task同次回写主计划执行阶段表、任务看板及本子计划；同步`docs/00-process/00-02-progress/progress.md`和当日日志。
- 回写后运行`node .agent/skills/delivery-planner/scripts/check-plan-consistency.mjs docs/07-delivery-plans/main-delivery-plan-jd-charging-mock.md --json`。需继续执行时同步已获授权的下一Task；若无进行中任务，明确记录阶段收口，不为通过开工检查虚构进行中任务。
- 未完成证据及状态同步不得标已完成；单个Skill既有通过证据按版本复用。
