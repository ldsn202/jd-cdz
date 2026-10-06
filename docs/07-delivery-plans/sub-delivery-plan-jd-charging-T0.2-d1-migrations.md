# T0.2 D1 数据层落地

## 任务来源

- 主开发计划：[main-delivery-plan-jd-charging.md](main-delivery-plan-jd-charging.md)
- 任务看板：[task-kanban-jd-charging.md](task-kanban-jd-charging.md)

#### T0.2 七域 41 张表正式 migration 落地

**Requirement ID**：REQ-JDCHARGE-DB-01

**PRD 双链·读**：
- `docs/03-foundation/03-05-schema/README.md` 交付表与「文档和变更约定」
- `docs/03-foundation/03-05-schema/` 七域 `*-schema.sql` 与 `cross-domain-guards.sql`
- `docs/03-foundation/03-05-schema/coverage-review.md` 总核对口径
- `docs/03-foundation/03-01-glossary/glossary.md`（字段命名以术语表 V1.12 为准）

**核心逻辑**：
- 候选 SQL 只经过本地验证；本 Task 按 coverage-review 确定的加载顺序，把七域候选 DDL 与组合保护转为 `code/db/migrations/` 下的正式 migration，禁止手工改库。
- 历史保护触发器与 INSERT OR REPLACE/DELETE 的已知冲突（见 progress.md PHASE-18 记录）必须在 migration 形态下重新验证；差异点先改 schema 文档再改 migration（`AI 执行 -> 人审核`）。
- 保存期限与合法删除未明确前，不引入物理删除或级联清理。

**核心文件**：
- `code/db/migrations/0001_*.sql` 起按域拆分（新建）
- `docs/03-foundation/03-05-schema/` 七域 `*-schema.sql`、`cross-domain-guards.sql`（只读依据）

**完成标准**：
- migration 在本地 D1（`wrangler d1 execute --local`）按序执行成功，`.tables` 核查到七域 41 张业务与执行表 + transaction_assertion。
- 沿用 foundation 既有约束检查口径（各域 17/17/20/19/22/—/— 组合计 123 项 + 总核对）在 migration 落库后的库上重跑通过，包括幂等重跑。
- 候选 DDL 与 migration 内容逐域比对无遗漏；任何因 D1 行为差异产生的改写登记差异清单并同步 schema 文档。

**Verification Method**：
- 真实执行 migration 并用 sqlite 查询回查表与触发器清单；重跑 foundation 检查脚本（PHASE-14 tests 目录对应检查项）并保存输出。

**Evidence**：
- 当日开发日志：migration 执行输出、表清单查询结果、检查脚本通过输出；差异清单（如有）。

**Failure Handling**：
- 触发器 / 事务在 D1 行为与候选设计冲突时阻塞该域，先回写 schema 文档与 coverage-review，再改 migration；不得在代码里绕开约束。
- 检查脚本无法复用时，按其断言逐条手写等价验证并登记，不降低验证强度。

**完成收尾：状态同步**：
- 本 Task 完成实现和验证后，把完成事实、验证证据、完成日期和建议下一 Task 同步回写三处：`main-delivery-plan-jd-charging.md` 执行阶段表、`task-kanban-jd-charging.md` 对应行、本子开发计划的 `**状态**` 字段。
- 同步更新 `docs/00-process/00-02-progress/progress.md` 的进度快照。
- 回写后重新运行 `node .agent/skills/delivery-planner/scripts/check-plan-consistency.mjs docs/07-delivery-plans/main-delivery-plan-jd-charging.md --json`，确认三处一致；未通过前不得宣称本 Task 已完成。

**Owner**：AI 执行 -> 人审核

**前置**：T0.1

**状态**：已完成（2026-09-20）
