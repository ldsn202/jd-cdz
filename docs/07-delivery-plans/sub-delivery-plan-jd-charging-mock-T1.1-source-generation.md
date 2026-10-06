# T1.1 生成相互关联的业务事实与多服务商原记录

> 版本：v1.0｜日期：2026-09-20｜开发模式：solo-local
> 上游（我引用）：[主计划](main-delivery-plan-jd-charging-mock.md) Phase 1、[看板](task-kanban-jd-charging-mock.md) T1.1；具体依据见PRD双链·读
> 下游（引用我）：[主计划](main-delivery-plan-jd-charging-mock.md) §3、[看板](task-kanban-jd-charging-mock.md) 对应行

#### T1.1 生成相互关联的业务事实与多服务商原记录

**Requirement ID**：mock PRD V1.1 §2.2、§3.1—3.3

**PRD 双链·读**：
- [00-subprd-mock-data.md](../05-prd/00-subprd-mock-data.md) §2.2、§3.1—3.3
- [tc-mock.md](../06-testcase/mock/tc-mock.md) TC-MCK-21、25、26
- [provider-documents-format-read.md](../03-foundation/03-02-external-apis/provider-documents-format-read.md) §2—5
- [installation-work-order-context.md](../03-foundation/03-02-external-apis/installation-work-order-context.md) §2—5
- [jd-bill-read.md](../03-foundation/03-02-external-apis/jd-bill-read.md) §3—5
- [provider-receivable-read.md](../03-foundation/03-02-external-apis/provider-receivable-read.md) §3—5

**核心逻辑**：
- 用显式业务事实定义工单、施工段、购买权益、计划量、实际量、账单费用及适用依据，再转换为各来源自己的原字段记录。来源编号保持可关联，各方原分项和原总额分别保存。
- 固定生成器版本、种子、初始时间与确切场景数量；模板区分语义、单位、列布局、拆合项和说明可用性，不能只改名称。所有数字标为开发数据，不复述成实际经营统计。
- 标准集按PRD九种工单主场景及四种格式条件分配；正常数据和预设负例显式分开，负例预期只留验收空间。生成器不得写本系统事项、分析、人工决定或已启用配置。

**核心文件**（拟新建；既有文件改动须保留其他任务内容）：
- `code/mocks/generator/business-facts.ts`
- `code/mocks/generator/providers.ts`
- `code/mocks/generator/source-projectors/`
- `code/mocks/generator/configs/standard.json`

**完成标准**：
- [x] 真实生成100家服务商、1000工单、3账期；九场景数量200/180/120/100/140/100/60/60/40，合计1000；每家有业务且工单分布不同。
- [x] 五类资料形态各覆盖至少20家；100份初始格式为70/10/10/10，四条件分别涉及相同数量服务商；主场景跨至少3家，涉文件场景至少2类格式。
- [x] 输出来源ID/版本/关联与覆盖清单；总数冲突、范围不适用及最低覆盖不足返回失败，无静默补数。

**Verification Method**：
- 独立遍历生成的实际对象统计数量及八类关联，注入TC-MCK-26的逐项无效配置并核实拒绝；文件覆盖待T1.2实际字节完成后再验。

**Evidence**：
- 已生成：[docs/08-test-reports/mock/T1.1/summary.md](../08-test-reports/mock/T1.1/summary.md)：命令与实际环境（mock-env-a + 一次性环境）、常规集 38 项断言全过、TC-MCK-26 六类非法配置拒绝输出、快速/扩展有效对照、同配置同种子二次生成 8142 条记录逐条一致、来源库非空拒绝覆盖。

**Failure Handling**：
- PRD/契约定位失败或相互冲突时登记具体对象与影响，停止受影响路径；不得用前端补值或修改预期绕过。验证工具/输入/原始证据缺失时保持未完成，未实现的业务依赖不得用终态假数据替代。

**Owner**：AI 执行 -> 人审核

**前置**：T0.1

**状态**：已完成（2026-09-20）

**完成日期**：2026-09-20

**完成收尾：状态同步**：
- 完成实现及逐项验证后，将完成事实、证据、日期和建议下一Task同次回写主计划执行阶段表、任务看板及本子计划；同步`docs/00-process/00-02-progress/progress.md`和当日日志。
- 回写后运行`node .agent/skills/delivery-planner/scripts/check-plan-consistency.mjs docs/07-delivery-plans/main-delivery-plan-jd-charging-mock.md --json`。需继续执行时同步已获授权的下一Task；若无进行中任务，明确记录阶段收口，不为通过开工检查虚构进行中任务。
- 未完成证据及状态同步不得标已完成；单个Skill既有通过证据按版本复用。
