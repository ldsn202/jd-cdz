# 服务商接入配置接口

> 状态：foundation 开发契约；未实现
> 上游（我引用）：[公共约定](common-contract.md) §1—5、[接入配置表结构](../03-05-schema/integration-config-schema.md) §1—7、[配置流程](../03-04-business-flows/flow-configuration.md) §1—7
> 下游（引用我）：[配置与业务计算流程](../03-07-system-flows/sys-configuration-reconciliation.md) §1—3、[03-subprd-provider-config.md](../../05-prd/03-subprd-provider-config.md) §5

## 1. 读取候选与当前生效配置

`GET /api/admin/charging/work-items/{workItemId}/configuration`。需 READ_WORK_ITEM 及资料权限。返回 `{configurationId,candidateVersion,activeVersion,trial,openQuestions,rowVersion,responsibilityVersion}`。无候选/生效/试转换时对应对象为 null，问题为空数组或实际缺项。

candidateVersion/activeVersion 结构为 `{versionId,versionNo,sourceFormatId,sourceFormatVersion,formatStatus,applicability,rules,ruleCatalogVersion,analysisResultId}`；来源格式缺失保留 null，formatStatus 沿表结构枚举。rules 为固定受控规则数组，字段与可用规则以服务端版本化目录校验，不接受任意代码或命令。

trial 为 `{trialId,configurationVersionId,inputSnapshotId,status,output,ruleResults,issues,checks}`；全部来自 configuration_trial，状态和检查字段按表结构定义。查看预览不等于试转换已通过，页面不能自行填 checks=true。

checks 对外使用 camelCase，逐项映射存储字段：`inputComplete ← input_complete`、`scopeValid ← scope_valid`、`rulesCovered ← rules_covered`、`outputsValid ← outputs_valid`、`meaningsResolved ← meanings_resolved`；字段含义及通过条件以 configuration_trial 为准。

## 2. 修订候选并自动试转换

`PUT /api/admin/charging/work-items/{workItemId}/configuration-draft`。需 ENABLE_INTEGRATION_CONFIG 与当前对接责任；正文必填 `expectedWorkItemVersion`、`expectedResponsibilityVersion`、`expectedCandidateVersionId`、`rules`、`applicability`、`editNotes`。rules 为完整受控规则数组，applicability 为明确适用范围对象，editNotes 为非空 `{field,reason}`[]。

服务端校验规则目录、参数类型和范围，保存 HUMAN 候选新版本、更新当前候选，并同事务安排 TRIAL_CONFIG 任务；返回 202 `{configurationId,candidateVersionId,jobId,workItemId,rowVersion,status:"ACCEPTED"}`。旧生效配置继续使用。修改后的试转换由后台自动执行，无需人员再点“运行 Skill”或“试转换”。

`GET /api/admin/charging/configuration-trials/{trialId}` 返回 §1 trial 完整结构，需关联配置事项与全部输入的读取权限。待执行状态从配置详情及其关联任务读取，不伪造一条 PASSED 试转换。

## 3. 确认启用

`POST /api/admin/charging/work-items/{workItemId}/configuration-enablement`。需 ENABLE_INTEGRATION_CONFIG 与当前具体责任。正文为 DecisionInput 加必填 `candidateVersionId`、`trialId`、`expectedConfigurationRowVersion`、`expectedActiveVersionId`（可 null）。

服务端重读当前候选、试转换、实际输入覆盖及范围，核实所有未解决含义、输入缺项和规则问题均已处理。试转换必须为本候选、本次固定输入且 PASSED；真实程序执行与版本记录是通过依据。

保存决定、configuration_enablement、APPLIED activation_result、切换 integration_config 生效指针、完成当前事项及处理记录，在同一条件事务内完成；最后核对事项/责任/候选与配置旧版本，零行命中触发整批回滚。返回公共 200。配置或事项已变化返回 40901，试转换不足返回 42201，旧配置保持有效。

启用后对适用范围内受影响输入登记重新处理任务，输入代次随实际依赖变化增加。不得批量改写旧决定或声称一次试转换证明全部资料适用。失败保留候选供修订，不新增第二轮审批。
