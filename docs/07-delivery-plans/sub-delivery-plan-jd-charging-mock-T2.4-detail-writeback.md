# T2.4 实现安装明细提交与结果回查

> 版本：v1.0｜日期：2026-09-20｜开发模式：solo-local
> 上游（我引用）：[主计划](main-delivery-plan-jd-charging-mock.md) Phase 2、[看板](task-kanban-jd-charging-mock.md) T2.4；具体依据见PRD双链·读
> 下游（引用我）：[主计划](main-delivery-plan-jd-charging-mock.md) §3、[看板](task-kanban-jd-charging-mock.md) 对应行

#### T2.4 实现安装明细提交与结果回查

**Requirement ID**：mock PRD V1.1 §2.3、§4.2—4.3、§7#6—7

**PRD 双链·读**：
- [00-subprd-mock-data.md](../05-prd/00-subprd-mock-data.md) §2.3、§4.2—4.3、§7#6—7
- [tc-mock.md](../06-testcase/mock/tc-mock.md) TC-MCK-05、06、07、09、17
- [installation-detail-submit.md](../03-foundation/03-02-external-apis/installation-detail-submit.md) §2—5

**核心逻辑**：
- 实现明细POST与按submissionId回查GET；按确认内容和版本条件真实写入，来源事务保存正式明细版本、原操作回执与变化记录。
- 相同请求返回原结果；同编号改内容40902，过期新操作40901；成功重放不按自身已改变的旧版本重新拒绝。统一工单未决保护供核查动作复用。
- 结果GET只读，返回原回执和版本；正文另经上下文/来源保存记录核实。明确REJECTED和PENDING两种非成功结果。

**核心文件**（拟新建；既有文件改动须保留其他任务内容）：
- `code/mocks/installation/submissions.ts`
- `code/mocks/installation/operation-store.ts`
- `code/mocks/installation/write-guard.ts`
- `code/mocks/tests/submissions.test.ts`

**完成标准**：
- [x] 首次写入后GET及上下文能对照原确认内容；同编号并发和重放仅写一次。
- [x] 错误内容/版本不覆盖原记录；PENDING/REJECTED不能用code=0冒充成功；进程重启后仍能回查原编号。

**Verification Method**：
- 来源接口级验证由受控测试调用方提供契约要求的可信上下文，模拟已核实的人员确认事实；此上下文不写入本系统业务库，也不作为“真实人员办理已完成”的证据。真实确认、权限链和业务交接仍由T4.2验收。
- 真实POST/GET/上下文三方比对；实际并发请求及进程重启后检查来源写次数、版本及操作记录；故障阶段深化由T3.1。

**Evidence**：
- 已生成：[docs/08-test-reports/mock/T2.4/summary.md](../08-test-reports/mock/T2.4/summary.md)：提交/回查 15 断言全过。

**Failure Handling**：
- PRD/契约定位失败或相互冲突时登记具体对象与影响，停止受影响路径；不得用前端补值或修改预期绕过。验证工具/输入/原始证据缺失时保持未完成，未实现的业务依赖不得用终态假数据替代。

**Owner**：AI 执行 -> 人审核

**前置**：T2.2

**状态**：已完成（2026-09-20）

**完成日期**：2026-09-20

**完成收尾：状态同步**：
- 完成实现及逐项验证后，将完成事实、证据、日期和建议下一Task同次回写主计划执行阶段表、任务看板及本子计划；同步`docs/00-process/00-02-progress/progress.md`和当日日志。
- 回写后运行`node .agent/skills/delivery-planner/scripts/check-plan-consistency.mjs docs/07-delivery-plans/main-delivery-plan-jd-charging-mock.md --json`。需继续执行时同步已获授权的下一Task；若无进行中任务，明确记录阶段收口，不为通过开工检查虚构进行中任务。
- 未完成证据及状态同步不得标已完成；单个Skill既有通过证据按版本复用。
