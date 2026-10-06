# 原型交互说明

> 版本：V1.1｜日期：2026-09-20｜状态：待评审
> 上游（我引用）：[BRD](../01-brd/BRD-jd-charging.md) §2—4、[页面清单](page-list.md) §1—2、[workbench-apis](../03-foundation/03-06-provided-apis/workbench-apis.md) §7、[installation-apis](../03-foundation/03-06-provided-apis/installation-apis.md) §5
> 下游（引用我）：[术语表](../03-foundation/03-01-glossary/glossary.md) §1—5、[安装工单上下文读取](../03-foundation/03-02-external-apis/installation-work-order-context.md) §1—5、[原始材料读取](../03-foundation/03-02-external-apis/source-material-read.md) §3、§5、[服务商资料与格式说明读取](../03-foundation/03-02-external-apis/provider-documents-format-read.md) §3、§5、[正式安装明细提交](../03-foundation/03-02-external-apis/installation-detail-submit.md) §2—5、[核查决定与补充记录同步](../03-foundation/03-02-external-apis/review-supplement-sync.md) §2—5、[京东账单读取](../03-foundation/03-02-external-apis/jd-bill-read.md) §3、§5、[服务商应收读取](../03-foundation/03-02-external-apis/provider-receivable-read.md) §1—3、§5、[计费条款与批准记录读取](../03-foundation/03-02-external-apis/billing-terms-approval-records-read.md) §1、§3、§5、[原记录变化发现](../03-foundation/03-02-external-apis/source-record-changes-read.md) §3、§5、[当前身份与业务权限取得](../03-foundation/03-02-external-apis/current-identity-permissions-read.md) §1—3、§5、[AI 推理与材料解析](../03-foundation/03-02-external-apis/ai-inference-material-parsing.md) §3—5、[处理事项实体关系](../03-foundation/03-03-er/er-work-item.md) §1—5、[材料与分析证据实体关系](../03-foundation/03-03-er/er-evidence.md) §5、[安装资料实体关系](../03-foundation/03-03-er/er-installation.md) §5、[双方账单与对账依据实体关系](../03-foundation/03-03-er/er-reconciliation.md) §4—5、[接入配置实体关系](../03-foundation/03-03-er/er-integration-config.md) §3、§5、[身份与事项责任关系](../03-foundation/03-03-er/er-identity-responsibility.md) §3、§5、[ER 范围与一致性总核对](../03-foundation/03-03-er/coverage-review.md) §2—6、[业务主流程与角色交接](../03-foundation/03-04-business-flows/flow-business-main.md) §1—7、[安装资料整理与提交](../03-foundation/03-04-business-flows/flow-installation-submission.md) §1—8、[安装核查与补充](../03-foundation/03-04-business-flows/flow-installation-review.md) §1—7、[业务对账](../03-foundation/03-04-business-flows/flow-reconciliation.md) §1—7、[配置确认](../03-foundation/03-04-business-flows/flow-configuration.md) §1—7、[履约协同与共用异常](../03-foundation/03-04-business-flows/flow-coordination-exceptions.md) §1—7、[业务流程覆盖与一致性总核对](../03-foundation/03-04-business-flows/coverage-review.md) §2—8、[01-subprd-workbench-items.md](../05-prd/01-subprd-workbench-items.md) §2—§3、[02-subprd-orders-history.md](../05-prd/02-subprd-orders-history.md) §2—§3、[03-subprd-provider-config.md](../05-prd/03-subprd-provider-config.md) §2—§3、[04-subprd-installation-materials.md](../05-prd/04-subprd-installation-materials.md) §2—§3、[05-subprd-installation-review.md](../05-prd/05-subprd-installation-review.md) §2—§3、[06-subprd-reconciliation.md](../05-prd/06-subprd-reconciliation.md) §2—§3、[07-subprd-coordination.md](../05-prd/07-subprd-coordination.md) §2—§3

## 1. 交互范围

待处理事项直接展示已形成的分析结果；不要求人员选择 Skill 或写指令。首页计数、筛选、搜索和处理记录由当前模拟状态产生。当前责任人执行决定，其他授权身份查看进展，服务商之间隔离数据。

| 业务 | 已实现的连续交互 |
| --- | --- |
| 安装资料核查 | 对照差异 → 打开证据侧栏 → 通过 / 退回 / 转异常 → 记录结果 |
| 补充与复核 | 京东提出具体问题 → 服务商回复及附加材料 → 分析中 → 原事项结果更新 → 京东继续处理 |
| 安装资料整理 | 查看草稿与原文 → 修改或确认数量、供料方和范围 → 校验 → 正式提交 → 形成京东核查事项 |
| 对账差异核实 | 查看双方独立账单与条款 → 发起核实 → 应收负责人回复或进入原应收视图修订 → 自动比较新版 |
| 接入配置 | 确认字段含义 → 查看试转换结果 → 启用配置 → 保留生效版本 |
| 履约协同 | 查看阻碍 → 保存进展继续跟进 / 记录已确认结果并完成本次协同 |
| 异常后续 | 记录原因 → 保存处理进展 / 记录结果并关闭异常 → 接续未完成的原业务 |
| 失败恢复 | 明示材料读取失败 → 主动重试 → 分析中 → 结果更新；处理中不能审批 |

## 2. 建议体验顺序

1. 使用默认“京东 · 安装核查”打开春和庭，查看原文、写退回意见并退回补充。
2. 切到“安家安装 · 资料人员”，打开同一事项，选择材料或附加本地文件，填写回复并提交。
3. 切回核查身份，在原事项查看更新结果、处理记录并完成审核。
4. 服务商资料身份打开桂语庭，核实整理结果并提交；切回京东可看到新核查事项。
5. “京东 · 业务对账”打开云栖苑并发起核实；切到“城南安装 · 应收负责人”，打开服务商原应收，修订单列搬运费并保存。新版核对一致后，京东账单保持独立。
6. “远程机电 · 接入对接”打开配置事项，确认电缆分段与桥架材料、人工含义，试转换后启用。
7. 可另行体验尚澜府缺少费用批准依据的异常处理、锦绣里读取失败恢复和物流履约协同。

## 3. 状态与限制

- 事项状态包括待处理、待补充 / 待回复、分析中、已完成、异常处理中和读取失败。
- 提交后更新责任人、记录、版本与列表计数。重复提交和越权操作被前端状态模块拦截。
- 查看证据保留当前填写内容；重新分析完成后更新原事项。已完成事项仅展示结果。
- 模拟数据和记录保存到本地存储；切换身份是原型体验工具，不是真实登录机制。
- 原型中的原文为可阅读的样例材料；本地附件支持 PDF、PNG、JPG、XLSX，最大 2 MB，保存在浏览器内。图片和 PDF 可预览，XLSX 可下载。
- 本地文件不会由真实 AI 读取。异步分析、费用核对和接口回传使用固定场景与前端时序模拟。
- 核对一致表示业务核对状态，不表示结算批准或付款；原型没有付款入口。
- 原型不覆盖生产鉴权、跨终端同步、真实接口失败类型及任意账单结构；这些由后续 PRD 与实现补充。
- 异常后续在固定场景中按工单、服务商、业务类型简化匹配；多个同类问题须在正式实现中按原问题及所需动作区分。原业务已真实停止、无需创建后续事项的路径尚未模拟。
- 配置启用检查当前候选的模拟试转换记录；修改含义后旧记录失效，刷新保留未修改的候选与结果。真实输入转换、范围校验及服务端权限仍须正式实现。
- 协同及异常可保存进展，事项继续显示在当前责任人的待处理列表。关闭异常保存独立的完成原因，接续已有未完成事项，或创建关联事项保留原材料、记录和业务限制；不会因此自动通过安装审核或把账单记为核对一致。

- 对账固定场景按双方总额相同模拟完成；正式交互还须呈现完整范围、分项、币种、税口径及未决问题，全部结束条件按业务对账流程执行，不能据两个总额直接关闭。
- “查看试转换结果”当前触发固定场景计算；最终流程由系统自动准备匹配当前候选的试转换，人员查看并核实。完整规则覆盖、候选历史及适用范围尚未模拟。

## 4. 原型场景到正式接口的映射

安装核查详情、费用依据核查、分析失败恢复是三个演示场景，正式业务均为 kind=INSTALLATION_REVIEW，按workItemId进入同一核查组件；费用内容由证据呈现，失败由分析状态呈现。无需新增三种kind，也不将固定demo路由或标题当作业务分类。

正式接口的202受理与原系统成功、本地接续完成分开，安装接口 §5 明确逐阶段投影；原型即时切换不替代此运行要求。列表差额由后端聚合摘要返回，原型前端固定金额仅为设计展示。完整实现以已补齐的PRD及接口契约为准。
