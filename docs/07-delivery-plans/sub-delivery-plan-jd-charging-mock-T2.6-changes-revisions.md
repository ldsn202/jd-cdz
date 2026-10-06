# T2.6 实现来源修订与变化发现

> 版本：v1.0｜日期：2026-09-20｜开发模式：solo-local
> 上游（我引用）：[主计划](main-delivery-plan-jd-charging-mock.md) Phase 2、[看板](task-kanban-jd-charging-mock.md) T2.6；具体依据见PRD双链·读
> 下游（引用我）：[主计划](main-delivery-plan-jd-charging-mock.md) §3、[看板](task-kanban-jd-charging-mock.md) 对应行

#### T2.6 实现来源修订与变化发现

**Requirement ID**：mock PRD V1.1 §2.3、§4.1—4.2、§7#8

**PRD 双链·读**：
- [00-subprd-mock-data.md](../05-prd/00-subprd-mock-data.md) §2.3、§4.1—4.2、§7#8
- [tc-mock.md](../06-testcase/mock/tc-mock.md) TC-MCK-08、11、14、25
- [source-record-changes-read.md](../03-foundation/03-02-external-apis/source-record-changes-read.md) §2—5

**核心逻辑**：
- 提供开发用来源修订命令：改应收、方案、材料、条款及格式，输入明确来源对象和预期版本，只修改该来源记录。
- 各来源从自身事务中的变化记录发布；变化接口按契约返回索引，不能合并为含全量业务结果的大接口。后台仍分别读取详情。
- 实现首次已有记录、首次空后新增、分页时追加、重复读取和重启恢复；已存在变化内容稳定，新变化仍可见。

**核心文件**（拟新建；既有文件改动须保留其他任务内容）：
- `code/mocks/change-feeds/`
- `code/mocks/control/revise-source.ts`
- `code/mocks/src/storage/source-events.ts`
- `code/mocks/tests/changes.test.ts`

**完成标准**：
- [x] 空查询之后实际新增记录无需重置环境即可发现；每种修订产生可追溯新版本，重复通知不更改原事件内容。
- [x] 事件与源写入一致，崩溃恢复不会出现已写无事件或事件指向不存在版本；应收修订不修改京东原账单。

**Verification Method**：
- HTTP分批拉取实际变化并逐项请求详情；分别中断事件发布与消费恢复，核对来源清单及事件/版本集合，消费者事项去重留T4.2。

**Evidence**：
- 已生成：[docs/08-test-reports/mock/T2.6/summary.md](../08-test-reports/mock/T2.6/summary.md)：修订与变化发现 14 断言全过。

**Failure Handling**：
- PRD/契约定位失败或相互冲突时登记具体对象与影响，停止受影响路径；不得用前端补值或修改预期绕过。验证工具/输入/原始证据缺失时保持未完成，未实现的业务依赖不得用终态假数据替代。

**Owner**：AI 执行 -> 人审核

**前置**：T2.3、T2.5

**状态**：已完成（2026-09-20）

**完成日期**：2026-09-20

**完成收尾：状态同步**：
- 完成实现及逐项验证后，将完成事实、证据、日期和建议下一Task同次回写主计划执行阶段表、任务看板及本子计划；同步`docs/00-process/00-02-progress/progress.md`和当日日志。
- 回写后运行`node .agent/skills/delivery-planner/scripts/check-plan-consistency.mjs docs/07-delivery-plans/main-delivery-plan-jd-charging-mock.md --json`。需继续执行时同步已获授权的下一Task；若无进行中任务，明确记录阶段收口，不为通过开工检查虚构进行中任务。
- 未完成证据及状态同步不得标已完成；单个Skill既有通过证据按版本复用。
