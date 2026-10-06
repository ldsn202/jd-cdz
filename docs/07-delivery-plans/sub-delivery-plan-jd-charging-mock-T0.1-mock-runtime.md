# T0.1 建立可持久化的本地模拟服务工程

> 版本：v1.0｜日期：2026-09-20｜开发模式：solo-local
> 上游（我引用）：[主计划](main-delivery-plan-jd-charging-mock.md) Phase 0、[看板](task-kanban-jd-charging-mock.md) T0.1；具体依据见PRD双链·读
> 下游（引用我）：[主计划](main-delivery-plan-jd-charging-mock.md) §3、[看板](task-kanban-jd-charging-mock.md) 对应行

#### T0.1 建立可持久化的本地模拟服务工程

**Requirement ID**：mock PRD V1.1 §1、§2.1、§6、§8

**PRD 双链·读**：
- [00-subprd-mock-data.md](../05-prd/00-subprd-mock-data.md) §1、§2.1、§6、§8
- [tc-mock.md](../06-testcase/mock/tc-mock.md) TC-MCK-27
- [README.md](../03-foundation/03-02-external-apis/README.md) 模拟接口要求
- [README.md](../03-foundation/03-05-schema/README.md) 本系统表与来源存储边界

**核心逻辑**：
- 以本地Node/TypeScript进程承载外部模拟服务；各来源模块有独立存储访问层，业务后端只能HTTP访问。采用各来源SQLite库及版本文件目录，写操作、回执、待发布变化在同一来源事务保存，禁止共用本系统业务表。
- 实现环境清单与启动参数校验，绑定数据集、来源库/文件/任务空间、本系统环境引用；本系统引用仅登记，不能伪造应用已实现。建立来源版本和操作编号的唯一约束。
- 先落可运行服务、独立来源存储、契约检查及持久化冒烟；首次无任何业务记录时返回真实空/不存在，禁止先塞固定成功响应。语言无专门规范部分按通用工程规范执行。

**核心文件**（拟新建；既有文件改动须保留其他任务内容）：
- `code/mocks/package.json`
- `code/mocks/src/server.ts`
- `code/mocks/src/storage/`
- `code/mocks/src/environment/`
- `code/mocks/migrations/`
- `docs/09-deploy/config-items.md`

**完成标准**：
- [x] 独立端口可启动；重启后一个来源的测试记录与版本不丢失；同业务编号在两个环境下互不影响。
- [x] 来源模块不导入code/api的数据仓储；未准备来源时不自动返回示例成功。锁定实际依赖和运行时要求，提供安装/启动/停止命令及环境配置检查。

**Verification Method**：
- 在两个临时环境中实际启动进程、写入来源测试记录并重启查询，留环境映射和摘要；本系统库仍为空。

**Evidence**：
- 已生成：[docs/08-test-reports/mock/T0.1/summary.md](../08-test-reports/mock/T0.1/summary.md)，含命令与实际环境（mock-env-a:8790 / mock-env-b:8792）、17 项逐断言结果、来源/版本/操作关联回查及原始响应。

**Failure Handling**：
- PRD/契约定位失败或相互冲突时登记具体对象与影响，停止受影响路径；不得用前端补值或修改预期绕过。验证工具/输入/原始证据缺失时保持未完成，未实现的业务依赖不得用终态假数据替代。

**Owner**：AI 执行 -> 人审核

**前置**：无（上游基线已存在）

**状态**：已完成（2026-09-20）

**完成日期**：2026-09-20

**完成收尾：状态同步**：
- 完成实现及逐项验证后，将完成事实、证据、日期和建议下一Task同次回写主计划执行阶段表、任务看板及本子计划；同步`docs/00-process/00-02-progress/progress.md`和当日日志。
- 回写后运行`node .agent/skills/delivery-planner/scripts/check-plan-consistency.mjs docs/07-delivery-plans/main-delivery-plan-jd-charging-mock.md --json`。需继续执行时同步已获授权的下一Task；若无进行中任务，明确记录阶段收口，不为通过开工检查虚构进行中任务。
- 未完成证据及状态同步不得标已完成；单个Skill既有通过证据按版本复用。
