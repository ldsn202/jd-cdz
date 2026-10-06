# 安装资料与核查接口

> 状态：foundation 开发契约；未实现
> 上游（我引用）：[公共约定](common-contract.md) §1—5、[安装表结构](../03-05-schema/installation-schema.md) §1—7、[提交外部契约](../03-02-external-apis/installation-detail-submit.md) §2—5、[审核补充外部契约](../03-02-external-apis/review-supplement-sync.md) §2—5、[安装流程](../03-04-business-flows/flow-installation-submission.md) §1—7、[核查流程](../03-04-business-flows/flow-installation-review.md) §1—7、[ai-inference-material-parsing](../03-02-external-apis/ai-inference-material-parsing.md) §2.3.1
> 下游（引用我）：[确认与外部写入流程](../03-07-system-flows/sys-transactions-recovery.md) §1—5、[04-subprd-installation-materials.md](../../05-prd/04-subprd-installation-materials.md) §5、[05-subprd-installation-review.md](../../05-prd/05-subprd-installation-review.md) §5、[interaction-spec](../../02-prototype/interaction-spec.md) §4

## 1. 读取与修订草稿

`GET /api/admin/charging/work-items/{workItemId}/installation-draft`。需 READ_WORK_ITEM 及对应原材料权限；返回 `{draftId,draftVersionId,versionNo,rowVersion,contextSnapshotId,analysisResultId,items,sourceMaterials,openQuestions,editNotes}`。尚无草稿时 draftId/draftVersionId/versionNo/contextSnapshotId/analysisResultId 为 null，数组为空；不能编造可提交明细。

items 保留 `{installationItem,installedQuantity,unit,materialSupplier,serviceScope}`；数量沿外部明细契约使用有限非负 number/null，其余字段为 string/null，未知保持 null，不混用方案量与计费量。sourceMaterials 为 `{sourceSystem,sourceMaterialId,sourceVersion}`[]；后端将确切引用解析为本地材料版本用于预览，证据从 analysisResultId 对应发现读取，不把前端附加字段混入正式 items。其他字段语义对应 installation_draft_version，rowVersion 为事项版本。

`PUT /api/admin/charging/work-items/{workItemId}/installation-draft`，需 CONFIRM_INSTALLATION_DRAFT 与当前资料责任。正文为 `{expectedWorkItemVersion,expectedResponsibilityVersion,expectedDraftVersionId,items,editNotes}`，全部必填，items 为完整明细列表，editNotes 为 `{itemIndex,field,reason}`[]（itemIndex 为本次完整列表从 0 开始的行位置）；实质修改必须有理由。只能编辑明细的业务字段，不能更改证据原文、分析结论或来源版本。

后端固定字段顺序和 JSON 序列化，将规范化 items 与已有确切 sourceMaterials 保存为草稿；确认时原样生成外部正文，使保存内容与确认内容一致。数量必须通过有限值及十进制往返精度检查，无法准确表达时拒绝，不静默四舍五入。正式提交前每个项目字段须完整。

后端以当前分析和上下文保存 HUMAN 草稿新版本、更新草稿指针及事项版本；不写原系统。返回 HTTP 200 `{draftId,draftVersionId,versionNo,workItemId,rowVersion,status:"SAVED"}`。无草稿、旧版本、未决写入分别返回 42201/40901/40903；本地保存不表示已确认提交。

## 2. 确认并提交安装明细

`POST /api/admin/charging/work-items/{workItemId}/installation-submissions`。正文继承 DecisionInput，并必填 `draftVersionId`。需 CONFIRM_INSTALLATION_DRAFT 与 SUBMIT_INSTALLATION_DETAIL，分别核实同一当前上下文中的完整范围授权。

确认当前草稿、完整必填数量与单位、方案/权益上下文、材料依据及当前工单版本；后端重新组装外部请求，客户端不得提交“已校验”标记。保存人工决定、external_write_operation、同编号 installation_detail_submission、WRITE_EXTERNAL 任务及事项未决指针，同事务后返回公共 202。

后续状态从操作结果接口取得。外部成功须有当前操作匹配的正式明细回执；仅进入队列、API 返回 202、模型完成均不表示明细已提交。外部成功后资料事项按具体完成条件结束，再保存或接续核查事项，暂时交接失败只恢复本地。

## 3. 审核通过与要求补充

`POST /api/admin/charging/work-items/{workItemId}/review-decisions`。需 DECIDE_INSTALLATION_REVIEW 及当前核查责任。正文继承 DecisionInput，必填 `action`：APPROVE / REQUEST_SUPPLEMENT；analysisResultId 必填且为当前代次。

REQUEST_SUPPLEMENT 额外必填 `questions`，为非空 `{findingId,question,requiredMaterialDescription}`[]；findingId 可 null（人工新增问题），question 非空。APPROVE 的 questions 必为空数组，不允许未解决缺项或不完整依据直接通过。后端核实所确认的正式明细、分析输入与当前源版本。

同事务保存决定、REVIEW_SYNC 写入、后台任务和未决指针，返回 202。源端成功后才将通过记为完成，或把有效退回绑定 active_supplement_request_id 并交给明确的服务商资料责任人；尚未取得责任人时保留待分配，不给同角色所有人员放行。

## 4. 提交补充回复

`POST /api/admin/charging/work-items/{workItemId}/supplements`。需 SUBMIT_SUPPLEMENT 及当前资料责任。正文继承 DecisionInput，必填 `requestDecisionId`、`replyText`、`materialVersionIds`（string[] 可为空，但必须满足所提问题；有新附件必须先上传并取得确切版本）。

所回复决定必须是本事项仍有效的退回，关联原外部操作 replyToOperationId，由后端查得。决定、supplemental_response、REVIEW_SYNC 写入与任务同事务。202 仅表示受理；原系统成功后固定回复成功事实，清理未决指针，输入代次增加、重新准备分析，仍接续原核查事项。材料或分析失败不要求重复提交已成功回复。

四类写入均遵守版本、权限、完整内容与未决保护。超时按原 Idempotency-Key 重放查受理结果，存在 operationId 时继续查该操作，不换编号强行重提。

## 5. 退回与回复的状态投影

下表为系统事务流程在安装核查上的具体应用。work_item.status、pending_write_id、active_supplement_request_id、责任人与允许动作必须从同一已提交本地事实计算；前端不根据 HTTP 202 自行交接责任。

| 已确认事实 | 事项状态、责任与允许动作 |
| --- | --- |
| REQUEST_SUPPLEMENT 持久受理（202）；REGISTERED / PROCESSING 或 RESULT_UNKNOWN | PROCESSING，保留核查责任及 pending_write_id；本轮新退回尚不生效。禁止 APPROVE、再次 REQUEST_SUPPLEMENT、SUBMIT_SUPPLEMENT，继续查原 operationId；未知结果不得显示“已退回” |
| 退回源端 SUCCEEDED，但 localContinuationStatus=PENDING/BLOCKED | 保持 PROCESSING 及未决保护，显示“原系统已退回，本地交接处理中/受阻”；只恢复 CONTINUE_LOCAL，不重复外发、不提前开放补充按钮 |
| 退回源端成功且本地接续提交 | 原子绑定本轮 active_supplement_request_id、清理 pending_write_id、置 WAITING_SUPPLEMENT、交给核实后的服务商资料责任人；责任变更增加 responsibility_version。接收人未取得时 assignee=null、blockedReasons 含 RESPONSIBILITY_UNRESOLVED，保持待补充且无提交动作，不能给全角色放行 |
| 退回明确 REJECTED，完成本地清理 | 不绑定本轮退回；保留核查责任。重算当前输入：有效分析 READY，需准备 PREPARING，实际阻断 BLOCKED；显示拒绝原因，不声称退回成功 |
| 服务商 SUBMIT_SUPPLEMENT 持久受理至外部结果未明 | PROCESSING、保留本轮退回及服务商资料责任、保留未决指针；禁止重复回复及京东审核 |
| 回复明确 REJECTED，完成本地清理 | 回到 WAITING_SUPPLEMENT，原退回仍有效，保留失败回复记录；原责任仍有权且版本有效时可修正后重新提交 |
| 回复 SUCCEEDED，完成本地接续 | 同一事务补写 success_verified_at、清空本轮 active_supplement_request_id 和 pending_write_id、analysis_generation加1、清空旧分析指针并建立新输入任务；状态 PREPARING，交回原核查责任人或待分配。后续分析失败为BLOCKED，分析可用为READY；回复成功不等于问题解决 |

所有本地接续按原操作编号幂等；回复成功与代次增加不能因重试执行两次。外部成功但本地未接续时，不能因 source 已成功就清理未决保护。allowedActions 始终结合版本、当前权限和实际责任计算。

## 6. 回复进入分析

仅已核实源端成功且完成本地接续的 supplemental_response 进入后续分析，按 AI 契约 §2.3.1 固定为 SUPPLEMENTAL_RESPONSE RECORD；原退回问题固定为 INSTALLATION_REVIEW RECORD，附件另取确切版本解析。202、未知或拒绝的回复可在处理记录展示，不送作“已收到成功补充”的事实。准备服务沿同一 workItemId 选取本轮及仍相关历史轮次，逐条保留问题、回复关联，不合并覆盖正文。
