# 履约协同与共用异常接口

> 状态：foundation 开发契约；未实现
> 上游（我引用）：[公共约定](common-contract.md) §1—5、[事项表结构](../03-05-schema/work-item-schema.md) §3—8、[协同异常流程](../03-04-business-flows/flow-coordination-exceptions.md) §1—7
> 下游（引用我）：[事务与恢复流程](../03-07-system-flows/sys-transactions-recovery.md) §1—5、[07-subprd-coordination.md](../../05-prd/07-subprd-coordination.md) §5

## 1. 保存处理进展

`POST /api/admin/charging/work-items/{workItemId}/progress`。正文必填 `expectedWorkItemVersion`、`expectedResponsibilityVersion`、`description`（非空 string）。服务端核实当前责任和该事项办理动作：资料使用 CONFIRM_INSTALLATION_DRAFT 或当前 SUBMIT_SUPPLEMENT；核查使用 DECIDE_INSTALLATION_REVIEW；对账使用当前 REQUEST_BILLING_VERIFICATION 或 REPLY_BILLING_VERIFICATION；配置使用 ENABLE_INTEGRATION_CONFIG；履约使用 COMPLETE_FULFILLMENT_COORDINATION。

保存 activity_record 的 PROGRESS_SAVED 事件，event_key 来自主体、目标及 Idempotency-Key；同事务条件增加事项 rowVersion。返回 `{activityId,workItemId,rowVersion,status:"SAVED"}`。不修改分析输入代次，不据进展文字改成“已完成”。

## 2. 登记异常

`POST /api/admin/charging/work-items/{workItemId}/exceptions`。需 RECORD_EXCEPTION_RESULT 与当前责任；正文为 DecisionInput 加 `reason`、`evidenceRefs`（数组可空，reason 非空）。后端核实业务状态，保存 OPEN_EXCEPTION 决定及实际问题，将原事项转 EXCEPTION，保留当时需要继续的业务环节和依据。返回公共 200。

存在结果未知的外部写入时只可记录进展与异常说明，不清理未决保护或认定外部失败；影响正式流程的状态变更先按操作恢复结果。

## 3. 结束协调或异常处理

`POST /api/admin/charging/work-items/{workItemId}/coordination-completion`。仅 COORDINATION 事项、COMPLETE_FULFILLMENT_COORDINATION 动作；正文为 DecisionInput 加 `resolution`（非空 string）、`evidenceRefs`（数组）。后端核实实际协调结果，记录 COMPLETE_COORDINATION，完成码为 COORDINATION_RESOLVED；不代做安装资料或费用审核。

`POST /api/admin/charging/work-items/{workItemId}/exception-resolution`。需 RECORD_EXCEPTION_RESULT；正文为 DecisionInput 加 `resolution`、`evidenceRefs`，可选 `followupRequired`（boolean，默认 true；为 false 表示经核实原业务无须继续，此时 `evidenceRefs` 必须非空）。接口不接受前端指定下一服务商或任意责任人。后端依据原异常时保存的确切阶段、工单和业务身份核实后续工作：复用正确的现存事项，或保存新事项与 work_item_link；然后将当前异常按 EXCEPTION_RESOLVED 完成。同事务保存决定、完成依据、后续关联与记录，失败全部回滚。返回公共 200 并额外返回 `followupWorkItemIds` string[]。

无后续工作须有核实依据，不能以“没有找到待办”自动判断业务结束；当前环节完成不等于安装业务全部结束。

## 4. 停止无需继续的事项

`POST /api/admin/charging/work-items/{workItemId}/stop-decisions`。需 RECORD_EXCEPTION_RESULT 与当前责任；正文为 DecisionInput 加 `reason`（非空）及 `basisRefs`（非空证据引用数组）。后端重新核实取消、终止或已无须办理的具体来源依据，保存 STOP_WORK，完成码 BUSINESS_STOPPED。

未决外部结果、依据缺失或来源当前状态未知不能直接停止。缺项 42201，竞争变化 40901，未决写入 40903。不提供任意修改 status 的接口，完成原因、历史决定及后续关系均由服务端按已定义业务条件产生。
