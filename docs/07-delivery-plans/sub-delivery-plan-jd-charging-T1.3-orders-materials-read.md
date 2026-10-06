# T1.3 工单聚合与材料读取链路

## 任务来源

- 主开发计划：[main-delivery-plan-jd-charging.md](main-delivery-plan-jd-charging.md)
- 任务看板：[task-kanban-jd-charging.md](task-kanban-jd-charging.md)

#### T1.3 实现 work-orders 聚合读取与 material-versions 材料读取

**Requirement ID**：REQ-ORD-01

**PRD 双链·读**：
- `docs/05-prd/02-subprd-orders-history.md` §3、§4、§5、§7（含补充验收：工单聚合）
- `docs/03-foundation/03-06-provided-apis/workbench-apis.md` §6（工单聚合读取）
- `docs/03-foundation/03-06-provided-apis/material-apis.md`
- `docs/03-foundation/03-05-schema/evidence-schema.md`
- `docs/06-testcase/orders/tc-orders.md`（TC-ORD- API 号段）

**核心逻辑**：
- 实现 4 条 GET：`/work-orders`（聚合列表）、`/work-orders/{workOrderId}`（聚合详情）、`/material-versions/{materialVersionId}` 与 `.../content`。
- 工单聚合在服务端按工单维度组装：订单权益、安装进展、关联事项（按 workOrderId 过滤复用 work-items 查询）；localContinuationStatus 等服务端计算字段按契约口径实现，计算条件待确认项在 Task 内裁决（`AI 执行 -> 人审核`）。
- 材料版本与内容读取遵守证据授权（common-contract §3）：无权查看原文的返回受控响应，不泄露内容。

**核心文件**：
- `code/api/src/routes/work-orders.ts`、`code/api/src/routes/material-versions.ts`（新建）
- `code/api/src/services/work-order-aggregation.ts`、`code/api/src/services/material-read.ts`（新建）

**完成标准**：
- 工单列表 / 详情返回字段与 workbench-apis §6.1—§6.2 逐字段一致；`GET /work-items?workOrderId=` 过滤行为符合 §6.3。
- material-versions 返回元信息与内容分开两条路径；`/content` 返回真实保存的原始字节或受控缺省，缺数据不填假值。
- 越权与不存在资源按 T1.1 裁决口径响应（02-subprd §7 #13 待确认项同次裁决回写）。
- 聚合详情中各来源段落可回查到对应表记录（SQL 回查一致）。

**Verification Method**：
- 真实请求 4 条接口并逐字段核对契约；SQL 回查聚合来源行；执行 TC-ORD API 号段中可执行用例。

**Evidence**：
- 当日开发日志：响应样例、SQL 回查对照；TC-ORD 执行结果记入 `docs/08-test-reports/`。

**Failure Handling**：
- 权益 / 材料来源数据未就绪时用受控种子验证并注明，聚合口径不得简化为单表查询。
- 契约与实际证据存储结构冲突时阻塞并 `AI 执行 -> 人审核`，不改返回结构充数。

**完成收尾：状态同步**：
- 本 Task 完成实现和验证后，把完成事实、验证证据、完成日期和建议下一 Task 同步回写三处：`main-delivery-plan-jd-charging.md` 执行阶段表、`task-kanban-jd-charging.md` 对应行、本子开发计划的 `**状态**` 字段。
- 同步更新 `docs/00-process/00-02-progress/progress.md` 的进度快照。
- 回写后重新运行 `node .agent/skills/delivery-planner/scripts/check-plan-consistency.mjs docs/07-delivery-plans/main-delivery-plan-jd-charging.md --json`，确认三处一致；未通过前不得宣称本 Task 已完成。

**Owner**：AI 执行 -> 人审核

**前置**：T1.1

**裁决与偏差记录（2026-09-20）**：
- 材料可见性裁决：材料经安装上下文快照 `context_json.sourceMaterials` 关联到服务商；任一关联服务商在当前身份 READ_SOURCE_MATERIAL 范围内即可见，否则 404。
- entitlementRead 偏差：外部权益只读适配属 T2.1 外部依赖适配层；当前实现真实判定 NOT_LINKED（上下文无 purchaseOrderId），有 purchaseOrderId 时返回 UNAVAILABLE/errorCode=ENTITLEMENT_ADAPTER_PENDING，T2.1 完成后切换为真实适配读取并复核 AVAILABLE / STALE / FORBIDDEN 路径。
- 文件存储裁决：受控存储采用 R2 绑定 FILES（content_locator=对象键），本地 wrangler 仿真；禁止公开 URL，/content 每次核实权限后流式返回真实字节。
- TC-ORD API 逐条执行留待 T5.1（与 T1.2 同口径）。

**状态**：已完成（2026-09-20）
