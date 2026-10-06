<!-- @meta docId="tc-mock" status="active" baseline="v2.1.0" -->
# mock 数据与模拟接口 — 测试用例索引

> 上游（我引用）：[用例详情](tc-mock-用例详情.md) 子场景、[来源准备说明](source-scenarios.md) §1—4；[mock PRD](../../05-prd/00-subprd-mock-data.md) V1.1 §2—7；该PRD所引运行数据规则及外部契约为数据链路依据
> 下游（引用我）：[开发进度](../../00-process/00-02-progress/progress.md) mock测试用例审核、[测试目录](../README.md) mock域准备方式；[TC主索引](../tc-main-jd-charging.md) mock域、[用例详情](tc-mock-用例详情.md) 全文、[来源准备说明](source-scenarios.md) §1—4；[mock T0.1子计划](../../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T0.1-mock-runtime.md) PRD双链·读、[mock T1.1子计划](../../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T1.1-source-generation.md) PRD双链·读、[mock T1.2子计划](../../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T1.2-material-files.md) PRD双链·读、[mock T1.3子计划](../../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T1.3-data-quality.md) PRD双链·读、[mock T2.1子计划](../../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T2.1-identity-workorders.md) PRD双链·读、[mock T2.2子计划](../../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T2.2-provider-materials.md) PRD双链·读、[mock T2.3子计划](../../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T2.3-billing-sources.md) PRD双链·读、[mock T2.4子计划](../../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T2.4-detail-writeback.md) PRD双链·读、[mock T2.5子计划](../../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T2.5-review-writeback.md) PRD双链·读、[mock T2.6子计划](../../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T2.6-changes-revisions.md) PRD双链·读、[mock T3.1子计划](../../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T3.1-faults-environments.md) PRD双链·读、[mock T3.2子计划](../../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T3.2-backend-adapters.md) PRD双链·读、[mock T4.1子计划](../../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T4.1-source-acceptance.md) PRD双链·读、[mock T4.2子计划](../../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T4.2-business-integration.md) PRD双链·读、[mock开发主计划](../../07-delivery-plans/main-delivery-plan-jd-charging-mock.md) 上游清单

> 基线：v2.1.0｜日期：2026-09-20｜状态：测试设计已修订，运行未执行。
> 编号前缀：TC-MCK-；保留27个原编号，01—09外部API/后台集成，11—19业务端到端，21—29生成/环境/验收管理。
> 设计方法：场景法、状态迁移、决策表、边界值；[详情](tc-mock-用例详情.md)各子场景独立记结果。
> 依据：PRD V1.1 §7全部11项；§2—6细化行为，PRD §2.3链接的契约确定技术字段与状态码。

## 一、测试范围

| 用例 | 测试重点 | PRD验收依据 | 执行状态 |
| --- | --- | --- | --- |
| TC-MCK-01 | 可信身份、无权限与身份失效 | §7#1、#9 | NOT_RUN |
| TC-MCK-02 | 八类来源分别调用且无旁路 | §7#1 | NOT_RUN |
| TC-MCK-03 | 资源权限与撤权后的未决操作 | §7#9、#7 | NOT_RUN |
| TC-MCK-04 | 历史文件、真实字节及解析失败 | §7#3、#8、#6 | NOT_RUN |
| TC-MCK-05 | 正式明细提交及按原编号回查 | §7#6、#7 | NOT_RUN |
| TC-MCK-06 | 成功重放、并发和版本冲突 | §7#7 | NOT_RUN |
| TC-MCK-07 | 两类写接口的结果未知与恢复 | §7#7 | NOT_RUN |
| TC-MCK-08 | 首次读取、空查询后新增及修订发现 | §7#8 | NOT_RUN |
| TC-MCK-09 | 故障命中范围、解除及重复验证 | §7#7 | NOT_RUN |
| TC-MCK-11 | 转换规则启用、新记录与格式升级 | §7#5 | NOT_RUN |
| TC-MCK-12 | 安装整理、文件解析、提交与页面回查 | §7#6 | NOT_RUN |
| TC-MCK-13 | 审核通过、退回与补充的真实接续 | §7#6、#8 | NOT_RUN |
| TC-MCK-14 | 双方账单独立取得及应收修订 | §7#6、#3 | NOT_RUN |
| TC-MCK-15 | 多服务商分页、汇总与工单追溯 | §7#9 | NOT_RUN |
| TC-MCK-16 | 业务缺项、正常阶段及错误的独立判定 | §7#5、#6 | NOT_RUN |
| TC-MCK-17 | 刷新和服务重启保留真实状态 | §7#10 | NOT_RUN |
| TC-MCK-18 | 实际上传环境的完整保护 | §7#10、#6 | NOT_RUN |
| TC-MCK-19 | AI模式、输入来源与失败不降级 | §7#11 | NOT_RUN |
| TC-MCK-21 | 常规集的真实覆盖与规模 | §7#2 | NOT_RUN |
| TC-MCK-22 | 记录与文件可复现、操作时间可推进 | §7#4 | NOT_RUN |
| TC-MCK-23 | 五类交付文件与意外错误阻止使用 | §7#3、#4 | NOT_RUN |
| TC-MCK-24 | 预设负例保留与答案隔离 | §7#4、#11 | NOT_RUN |
| TC-MCK-25 | 跨接口关联及负例例外 | §7#3 | NOT_RUN |
| TC-MCK-26 | 非法配置拒绝与可用配置对照 | §7#2、#4 | NOT_RUN |
| TC-MCK-27 | 两个完整验证环境互相隔离 | §7#10 | NOT_RUN |
| TC-MCK-28 | 完整恢复、中断及旧任务迟到 | §7#10 | NOT_RUN |
| TC-MCK-29 | 证据复用与分层结论 | §7#11；§7末段 | NOT_RUN |

## 二、数据准备与执行边界

统一使用[来源数据准备说明](source-scenarios.md)。原sql/下28份文件仅含注释，已移除；不得再宣称mock域“SQL已执行验证”。外部模拟系统保存原记录/实际文件，业务库由后台实际导入和办理形成。

生成、首次导入、已导入的业务操作采用各自前提；每组可以独立运行。用例引用的原记录、版本、会话、故障控制均在执行前绑定具体值。来源修订由开发入口执行，本系统仍通过对应外部接口取得变化，前端不得直连来源或补造数据。

表格映射表示设计覆盖，**不表示测试通过**。当前生成器、模拟服务、业务应用未实现，运行均为NOT_RUN；实现前无法执行的步骤在执行报告标BLOCKED。已通过且版本/输入不变的Skill能力证据沿用，新增业务联调单独验收。

## 三、PRD验收矩阵

| PRD条目 | 必须覆盖的行为 | 覆盖用例 | 设计 / 运行 |
| --- | --- | --- | --- |
| §7#1 | 八类来源各自调用，前后端均无旁路 | 01、02、12、14 | 已编写 / NOT_RUN |
| §7#2 | 多服务商真实差异、数量及合法配置 | 21、26 | 已编写 / NOT_RUN |
| §7#3 | 关联、范围、版本、文件字节及负例区分 | 04、05、23、25 | 已编写 / NOT_RUN |
| §7#4 | 初始可复现、意外错误拒绝、预设负例有效 | 22、23、24、26 | 已编写 / NOT_RUN |
| §7#5 | 可执行配置、试转换、启用、新记录、格式升级 | 11、16 | 已编写 / NOT_RUN |
| §7#6 | 整理、提交、通过、退回、补充、对账实际闭环 | 05、12、13、14、16、18 | 已编写 / NOT_RUN |
| §7#7 | 幂等、冲突、未决、拒绝及本地恢复 | 03、06、07、09 | 已编写 / NOT_RUN |
| §7#8 | 首次已有、首次空后新增、各来源修订、重复及恢复 | 04、08、11、13、14 | 已编写 / NOT_RUN |
| §7#9 | 各资源/各层权限、撤权、列表与详情一致 | 01、03、15 | 已编写 / NOT_RUN |
| §7#10 | 重启、完整恢复、中断、迟到结果、上传保护 | 17、18、27、28 | 已编写 / NOT_RUN |
| §7#11 | AI模式分开、真实输入、失败无固定答案、证据复用 | 19、24、29 | 已编写 / NOT_RUN |

## 四、实现阶段需要登记的五项

以下均为开发实现信息，不是需要重新决定的产品预期；不能因命令尚未确定而放宽用例断言。

| 原登记号 | 要补的实现信息 | 既定判据 / 影响 |
| --- | --- | --- |
| 1 | 数据生成命令、来源存储和场景对象清单 | 来源准备§2；不写本系统终态；全部用例执行前登记。**已登记（T1.1，2026-09-20）**：生成 `node generator/generate.ts --config generator/configs/<配置>.json --env <环境清单>.json`，独立校验 `node generator/verify.ts --env <环境清单> --dataset <datasetId>`（code/mocks，配置 standard/quick/extension）；来源存储 `.data/<env>/sources/<八来源>.db`（source_record 表）；场景对象清单 `.data/<env>/delivery/<datasetId>/`（数据清单/场景覆盖表/预设负例/生成校验报告）；T1.1 证据 docs/08-test-reports/mock/T1.1/ |
| 2 | 故障操作入口与命中记录 | 来源准备§4完整控制单；04、06—09、13、19、28 |
| 3 | 环境标识与各空间绑定配置 | 每环境完整配对、旧任务不串环境；17、18、27、28 |
| 4 | AI及联调报告确切存放路径 | 模式/版本/输入/原始结果/证据齐全；19、29 |
| 5 | 快速集与扩展集的执行配置 | 快速集不承担常规集验收，扩展逐项明确数量；21、26 |

## 五、本轮审核与修订

当前起点已经是v2.0.0、PRD V1.1，不属于仍完整沿用旧版。实质问题已修订：身份错误码及停用响应；成功重放断言；GET回执与正文混淆；缺少空查询后新增、权限撤销、审核通过、格式升级、真实文件负例；统一前提导致生成/首次导入不可测；纯注释SQL被计为已验证；只列预期缺步骤及恢复/上传缺实际触发；正常关联与故意负例混用；把开发参数未定当作产品待确认。

保留27组编号，细化为93行可独立记录的子场景（行内多个参数变体还需分别执行）。此数量表示设计检查单，不代表93次已运行测试。

## 六、版本历史

| 版本 | 日期 | 变更说明 |
| --- | --- | --- |
| v2.1.0 | 2026-09-20 | 审核并修正预期、补全13条业务外部操作覆盖及关键反例；27组93行子场景；移除28份纯注释SQL，用来源准备说明与逐组步骤承接；运行未执行。 |
| v2.0.0 | 2026-09-20 | 按 mock PRD V1.1 全量重建：27 条用例（API 9 / 闭环 9 / 生成与环境 9）覆盖 §7 全部 11 条验收；取代基于旧版 8 条验收的 v1.0.0（已废弃删除）。 |
