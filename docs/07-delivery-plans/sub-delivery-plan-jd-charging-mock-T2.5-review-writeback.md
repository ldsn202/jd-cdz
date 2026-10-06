# T2.5 实现审核、退回和补充写入与回查

> 版本：v1.0｜日期：2026-09-20｜开发模式：solo-local
> 上游（我引用）：[主计划](main-delivery-plan-jd-charging-mock.md) Phase 2、[看板](task-kanban-jd-charging-mock.md) T2.5；具体依据见PRD双链·读
> 下游（引用我）：[主计划](main-delivery-plan-jd-charging-mock.md) §3、[看板](task-kanban-jd-charging-mock.md) 对应行

#### T2.5 实现审核、退回和补充写入与回查

**Requirement ID**：mock PRD V1.1 §2.3、§4.2、§5.1、§7#6—7

**PRD 双链·读**：
- [00-subprd-mock-data.md](../05-prd/00-subprd-mock-data.md) §2.3、§4.2、§5.1、§7#6—7
- [tc-mock.md](../06-testcase/mock/tc-mock.md) TC-MCK-06、07、09、13、17
- [review-supplement-sync.md](../03-foundation/03-02-external-apis/review-supplement-sync.md) §2—5

**核心逻辑**：
- 实现review-actions POST与按operationId GET；APPROVE、REQUEST_SUPPLEMENT、SUBMIT_SUPPLEMENT分别保存真实动作与来源回执。
- 退回问题、replyToOperationId、回复正文、材料版本留在来源记录；统一使用工单写保护、去重、条件版本和原操作回查。
- 来源不得假造本系统事项已交接或分析完成；补充成功仅证明来源保存，后续分析由业务后端完成。

**核心文件**（拟新建；既有文件改动须保留其他任务内容）：
- `code/mocks/installation/review-actions.ts`
- `code/mocks/installation/supplements.ts`
- `code/mocks/tests/review-actions.test.ts`

**完成标准**：
- [x] 三个动作在各自合法前态下真正保存，结果GET返回原action/编号/sourceRecord版本；越权、错误原退回或版本不符被拒绝。
- [x] 同编号同内容只执行一次；另一个未决明细/核查动作不能被新编号绕过；补充文件引用指向可读取固定版本。

**Verification Method**：
- 来源接口级验证由受控测试调用方提供契约要求的可信上下文，模拟已核实的人员确认事实；此上下文不写入本系统业务库，也不作为“真实人员办理已完成”的证据。真实确认、权限链和业务交接仍由T4.2验收。
- 通过真实提交建立前态，逐动作POST/GET核验来源记录；不SQL预置SUCCEEDED；责任交接与新分析验收明确归T4.2。

**Evidence**：
- 已生成：[docs/08-test-reports/mock/T2.5/summary.md](../08-test-reports/mock/T2.5/summary.md)：三动作写入/回查 15 断言全过。

**Failure Handling**：
- PRD/契约定位失败或相互冲突时登记具体对象与影响，停止受影响路径；不得用前端补值或修改预期绕过。验证工具/输入/原始证据缺失时保持未完成，未实现的业务依赖不得用终态假数据替代。

**Owner**：AI 执行 -> 人审核

**前置**：T2.4

**状态**：已完成（2026-09-20）

**完成日期**：2026-09-20

**完成收尾：状态同步**：
- 完成实现及逐项验证后，将完成事实、证据、日期和建议下一Task同次回写主计划执行阶段表、任务看板及本子计划；同步`docs/00-process/00-02-progress/progress.md`和当日日志。
- 回写后运行`node .agent/skills/delivery-planner/scripts/check-plan-consistency.mjs docs/07-delivery-plans/main-delivery-plan-jd-charging-mock.md --json`。需继续执行时同步已获授权的下一Task；若无进行中任务，明确记录阶段收口，不为通过开工检查虚构进行中任务。
- 未完成证据及状态同步不得标已完成；单个Skill既有通过证据按版本复用。
