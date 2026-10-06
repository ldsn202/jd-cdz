# 业务对账接口

> 状态：foundation 开发契约；未实现
> 上游（我引用）：[公共约定](common-contract.md) §1—5、[对账表结构](../03-05-schema/reconciliation-schema.md) §1—7、[业务对账流程](../03-04-business-flows/flow-reconciliation.md) §1—7
> 下游（引用我）：[自动准备与分析流程](../03-07-system-flows/sys-analysis-preparation.md) §1—4、[配置试转换与业务对账计算](../03-07-system-flows/sys-configuration-reconciliation.md) §1—3、[06-subprd-reconciliation.md](../../05-prd/06-subprd-reconciliation.md) §5、[workbench-apis](workbench-apis.md) §6—7

## 1. 读取对账结果

`GET /api/admin/charging/work-items/{workItemId}/reconciliation`。path 为非空 string；需 READ_WORK_ITEM、双方完整记录对应的 READ_BILLING_RECORD，以及读取依据所需权限。

返回 `{reconciliationId,inputSnapshotId,status,currency,jdTotal,providerTotal,difference,groups,openIssues,analysisResultId,questions,rowVersion}`。尚无可靠计算时编号、金额及币种为 null，groups=[]、openIssues 说明缺项。status 为 PREPARING / NEEDS_INFORMATION / DIFFERENT / RECONCILED，由后端按固定比较记录映射。

groups 为 `{groupId,jdItems,providerItems,jdAmount,providerAmount,difference,matchBasis,evidenceRefs}`[]；原分项各有来源编号、版本、名称、数量、单位、单价、金额，未知为 null。金额 string，matchBasis 保留已确认对应关系。questions 按问题组返回 `{questionActionId,requestDecisionId,items,askedBy,askedAt,replies,isClosed}`[]；items 为 `{itemId,groupId,question,evidenceRefs}`[]，一次批量提问形成一个 QUESTION action，组内 itemId 在保存时固定；replies 为 `{replyActionId,decisionId,replyText,materialVersionIds,actor,repliedAt}`[]，保留各次历史。isClosed 来自实际关闭依据，不能以已有文字回复推断。

视图状态映射：尚无比较为 PREPARING；reconciliation_record.NEEDS_INFORMATION / DIFFERENCE 映射为 NEEDS_INFORMATION / DIFFERENT；MATCHED 仅在当前比较仍有效且全部问题有关闭依据时映射 RECONCILED，否则仍保留待核实状态。分组保存于 reconciliation_record.groups_json，不另建 reconciliation_group 表。

只返回总额不足以支持核对。原分项不得被改写成同名项目；总额一致但分项、依据或覆盖不完整仍不能返回 RECONCILED。

这里的 status 表示对账视图状态；事项整体进展仍由 work_item.status 返回，二者不得混作同一字段。

## 2. 发起费用核实与回复

`POST /api/admin/charging/work-items/{workItemId}/billing-questions`。需 REQUEST_BILLING_VERIFICATION 与当前对账责任；正文为 DecisionInput 加 `reconciliationId`、`questions`。questions 为非空 `{groupId,question,evidenceRefs}`[]，groupId 可 null（范围缺失问题），question 非空；reconciliationId 必须是当前比较记录。

后端将整组问题固定存入 human_decision.content_json（REQUEST_FEE_VERIFICATION），同事务保存 fee_verification_action 的 QUESTION 行（关联本次比较和该决定）、处理记录及事项版本，交接当前具体应收负责人。返回公共 200 并增加 questionActionId。无法核实接收人时保留待分配，不新建全员审批。

`POST /api/admin/charging/work-items/{workItemId}/billing-replies`。需 REPLY_BILLING_VERIFICATION 与当前应收责任；正文为 DecisionInput 加 `requestDecisionId`、`replyText`、`materialVersionIds`。后者为 string[]，可为空；前两者非空。由 requestDecisionId 唯一定位本事项仍有效的 QUESTION action，保存 REPLY_FEE_VERIFICATION 决定和 REPLY action（question_action_id 指向原组），交回原对账责任，安排必要重读/重新分析任务；全部同事务。回复不自动关闭问题组。

回复“已修改”不能代替实际新版应收。工作台不提供修改京东账单或代服务商改账接口；服务商按原系统既有权限修订应收，后台通过模拟或真实来源读取新版。

## 3. 保存核实事实与完成条件

`POST /api/admin/charging/work-items/{workItemId}/billing-facts`。需 REQUEST_BILLING_VERIFICATION 与当前对账责任；正文继承 DecisionInput，必填 `reconciliationId`、`facts`，facts 为非空 `{groupId,description,evidenceRefs}`[]。事实必须有可核实依据；接口不接受 `reconciled=true` 或人工覆盖差额。

正文另含可空 `questionActionId`，明确本次事实所针对的问题组；指定时须属于本事项且仍开放，FACT 的 question_action_id 保存此编号。groupId 只标识账单分组，不能代替问题组编号。questionActionId 为空时保存独立事实，只能通过后续 COMPARISON 依据关闭问题；禁止猜测目标或用同一 FACT 关闭多组。

后端保存 RECORD_FEE_FACTS 决定与 FACT action，按确切依据关闭对应问题组或保留未解决状态，再按已确认关系及当前版本执行比较。问题组全部问题均有依据时方可关闭，关闭所用 HUMAN_FACT 或 COMPARISON 引用须固定保存。数据已足够且分项全部核对一致时保存 RECONCILED 完成依据；否则保持待处理。返回 200 的 APPLIED 只代表事实已保存；完成状态通过详情读取。

旧比较版本、责任变化、未决冲突分别按公共 409；缺账单或依据返回 422。没有独立的“强制对账完成”接口，也不生成结算、付款或费用批准记录。

## 4. 列表摘要复用

工作台查询接口 §7.2 在 RECONCILIATION 列表行返回 reconciliationSummary，使用本接口 §1 相同的当前比较选择、金额和视图状态映射，后台批量读取。无账单权限不返回金额；没有有效比较不取旧值填补；前端仅在打开详情时请求本接口，不逐行补取差额。
