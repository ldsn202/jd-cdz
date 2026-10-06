# T4.1 交付模拟来源自动验收驱动与证据包

> 版本：v1.0｜日期：2026-09-20｜开发模式：solo-local
> 上游（我引用）：[主计划](main-delivery-plan-jd-charging-mock.md) Phase 4、[看板](task-kanban-jd-charging-mock.md) T4.1；具体依据见PRD双链·读
> 下游（引用我）：[主计划](main-delivery-plan-jd-charging-mock.md) §3、[看板](task-kanban-jd-charging-mock.md) 对应行

#### T4.1 交付模拟来源自动验收驱动与证据包

**Requirement ID**：mock PRD V1.1 §7#1—4、#7—10、§8

**PRD 双链·读**：
- [00-subprd-mock-data.md](../05-prd/00-subprd-mock-data.md) §7#1—4、#7—10、§8
- [tc-mock.md](../06-testcase/mock/tc-mock.md) TC-MCK-01、02、03、04、05、06、07、08、09、17、21、22、23、24、25、26、27、28、29
- [tc-mock-用例详情.md](../06-testcase/mock/tc-mock-用例详情.md) 外部来源、生成及环境各子场景

**核心逻辑**：
- 实现从生成配置→独立校验→装载来源→启动HTTP→操作与回查→导出证据的自动驱动，执行真实接口，不通过导入handler函数绕过网络和持久化。
- 标准集验收同时报告实际数量、语义差异、跨接口关联及读写恢复；将TC拆到子场景，明确哪些只是外部来源验证、哪些仍需真实业务服务。
- 报告生成、来源接口、业务联调三类状态；未实现业务侧仍为NOT_RUN/BLOCKED，不把来源200或纯文档检查换算为整个用例PASS。

**核心文件**（拟新建；既有文件改动须保留其他任务内容）：
- `code/mocks/acceptance/run.ts`
- `code/mocks/acceptance/source-suites/`
- `code/mocks/acceptance/report.ts`
- `docs/09-deploy/local-mock.md`

**完成标准**：
- [x] 可执行命令从空目录产出标准集与五件交付文件，启动来源并完成13条业务操作的正反例；停止重启后写回结果可查。
- [x] 每个失败能定位环境/来源对象/版本/操作编号与预期差异；无证据项不标通过。提供他人可复现的命令、配置与依赖锁定。
- [x] 交付阶段结论“模拟来源可用”与完整业务验收分开；27组用例有逐子场景的来源阶段状态及剩余依赖清单。

**Verification Method**：
- 执行实际验收驱动两次并对照生成摘要；抽查每类接口原始请求/返回、写次数、文件和负例证据；第二次生成用于可复现要求，不重复已通过Skill调用。

**Evidence**：
- 已生成：[docs/08-test-reports/mock/T4.1/](../08-test-reports/mock/T4.1/)（summary.md + report.json）：验收驱动两次执行、25 阶段全 PASS、28 操作正反例全过、29 组用例分阶段状态与 BLOCKED 依赖清单、双环境生成摘要一致；复现指南 [docs/09-deploy/local-mock.md](../09-deploy/local-mock.md)。

**Failure Handling**：
- PRD/契约定位失败或相互冲突时登记具体对象与影响，停止受影响路径；不得用前端补值或修改预期绕过。验证工具/输入/原始证据缺失时保持未完成，未实现的业务依赖不得用终态假数据替代。

**Owner**：AI 执行 -> 人审核

**前置**：T3.1、T3.2

**状态**：已完成（2026-09-20）

**完成日期**：2026-09-20

**完成收尾：状态同步**：
- 完成实现及逐项验证后，将完成事实、证据、日期和建议下一Task同次回写主计划执行阶段表、任务看板及本子计划；同步`docs/00-process/00-02-progress/progress.md`和当日日志。
- 回写后运行`node .agent/skills/delivery-planner/scripts/check-plan-consistency.mjs docs/07-delivery-plans/main-delivery-plan-jd-charging-mock.md --json`。需继续执行时同步已获授权的下一Task；若无进行中任务，明确记录阶段收口，不为通过开工检查虚构进行中任务。
- 未完成证据及状态同步不得标已完成；单个Skill既有通过证据按版本复用。
