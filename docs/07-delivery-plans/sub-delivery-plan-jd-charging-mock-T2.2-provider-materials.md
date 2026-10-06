# T2.2 实现服务商原资料及文件版本读取

> 版本：v1.0｜日期：2026-09-20｜开发模式：solo-local
> 上游（我引用）：[主计划](main-delivery-plan-jd-charging-mock.md) Phase 2、[看板](task-kanban-jd-charging-mock.md) T2.2；具体依据见PRD双链·读
> 下游（引用我）：[主计划](main-delivery-plan-jd-charging-mock.md) §3、[看板](task-kanban-jd-charging-mock.md) 对应行

#### T2.2 实现服务商原资料及文件版本读取

**Requirement ID**：mock PRD V1.1 §2.3、§4.1、§5.2

**PRD 双链·读**：
- [00-subprd-mock-data.md](../05-prd/00-subprd-mock-data.md) §2.3、§4.1、§5.2
- [tc-mock.md](../06-testcase/mock/tc-mock.md) TC-MCK-02、03、04、11、16、25
- [provider-documents-format-read.md](../03-foundation/03-02-external-apis/provider-documents-format-read.md) §2—5
- [source-material-read.md](../03-foundation/03-02-external-apis/source-material-read.md) §2—5

**核心逻辑**：
- 原资料接口返回真实rawJson、说明和格式版本，分别表达未提供说明、含义未知、格式关联不符。文件接口按来源/ID/sourceVersion返回实际字节。
- 文件授权先于返回正文；未知版本、读取中断、摘要不符不能返回新版本或片段来凑成功。

**核心文件**（拟新建；既有文件改动须保留其他任务内容）：
- `code/mocks/providers/documents.ts`
- `code/mocks/materials/read.ts`
- `code/mocks/tests/provider-materials.test.ts`

**完成标准**：
- [x] 两条GET在至少两版内容不同文件上返回各自字节摘要；要求版本不可取得时409/40901。
- [x] NOT_PROVIDED/null、PROVIDED且meaning=null、FORMAT_ASSOCIATION三种样本的响应及缺项独立；无越权原文返回。

**Verification Method**：
- 下载实际文件逐字节比对来源清单，并执行TC-MCK-04的版本及读取错误子场景；工作台解析呈现留T4.2。

**Evidence**：
- 已生成：[docs/08-test-reports/mock/T2.2/summary.md](../08-test-reports/mock/T2.2/summary.md)：两条 GET 真实 HTTP 15 断言全过。

**Failure Handling**：
- PRD/契约定位失败或相互冲突时登记具体对象与影响，停止受影响路径；不得用前端补值或修改预期绕过。验证工具/输入/原始证据缺失时保持未完成，未实现的业务依赖不得用终态假数据替代。

**Owner**：AI 执行 -> 人审核

**前置**：T2.1

**状态**：已完成（2026-09-20）

**完成日期**：2026-09-20

**完成收尾：状态同步**：
- 完成实现及逐项验证后，将完成事实、证据、日期和建议下一Task同次回写主计划执行阶段表、任务看板及本子计划；同步`docs/00-process/00-02-progress/progress.md`和当日日志。
- 回写后运行`node .agent/skills/delivery-planner/scripts/check-plan-consistency.mjs docs/07-delivery-plans/main-delivery-plan-jd-charging-mock.md --json`。需继续执行时同步已获授权的下一Task；若无进行中任务，明确记录阶段收口，不为通过开工检查虚构进行中任务。
- 未完成证据及状态同步不得标已完成；单个Skill既有通过证据按版本复用。
