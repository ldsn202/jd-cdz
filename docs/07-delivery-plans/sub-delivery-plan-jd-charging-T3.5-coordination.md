# T3.5 履约协同与异常

## 任务来源

- 主开发计划：[main-delivery-plan-jd-charging.md](main-delivery-plan-jd-charging.md)
- 任务看板：[task-kanban-jd-charging.md](task-kanban-jd-charging.md)

#### T3.5 实现协同进展、异常登记处理、协同完成与停止决定

**Requirement ID**：REQ-COO-01

**PRD 双链·读**：
- `docs/05-prd/07-subprd-coordination.md` §3、§4、§5、§7
- `docs/03-foundation/03-06-provided-apis/coordination-apis.md`
- `docs/03-foundation/03-04-business-flows/flow-coordination-exceptions.md`
- `docs/06-testcase/coord/tc-coord.md`（TC-COO-）

**核心逻辑**：
- 实现 5 条 POST：progress、exceptions、coordination-completion、exception-resolution、stop-decisions；读取复用 T1.2 / T1.3。
- 进展保存可多次追加、继续处理；异常登记与处理完成后原业务按记录接续；协同完成与停止决定分别满足各自完成条件才生效，决定留痕可追溯。
- 异常接续的精确位置（原型 V1.1 登记的差距）按业务流程契约实现，不简化为一律回到起点。

**核心文件**：
- `code/api/src/routes/coordination.ts`（新建）
- `code/api/src/services/coordination-progress.ts`、`code/api/src/services/exception-flow.ts`（新建）

**完成标准**：
- progress 多次追加全部保留且按时间可回查；事项状态与待处理列表同步更新。
- exceptions → exception-resolution 后，原业务事项接续位置与业务流程契约一致（回查接续记录）。
- coordination-completion / stop-decisions 在完成条件不满足时被拒绝且无状态变化；生效后决定记录含操作人、时间与依据。
- 越权操作按 T1.1 裁决口径拒绝。

**Verification Method**：
- 真实走通进展追加、异常闭环、完成与停止四条链路；构造完成条件不满足的拒绝场景；执行 TC-COO 可执行用例（#12 故障注入待确认项留待 T5.1 裁决）。

**Evidence**：
- 当日开发日志：链路请求 / 响应与 D1 回查对照；TC-COO 执行结果记入 `docs/08-test-reports/`。

**Failure Handling**：
- 接续位置依赖的外部变化发现未就绪时，用受控场景验证本系统侧接续逻辑并注明，闭环结论留待 T5.1。
- 完成条件口径与子 PRD 冲突时阻塞并 `AI 执行 -> 人审核`。

**裁决记录（2026-09-20，T3.5）**：
- tc-coord TC-COO-08 的数据准备标注"无须继续的来源侧核实条件 [待确认-需产品明确]"。裁决：`POST /exception-resolution` 正文增设可选 `followupRequired`（boolean，默认 true）；为 false 时表示经核实原业务无须继续，此时 `evidenceRefs` 必须非空，服务端不新建接续事项与关联，也不据此把整个安装业务判为结束。已同步 `coordination-apis.md` §3、TC-COO-08 与 tc-coord 基线 v1.0.1。
- 接续位置取自异常登记时留存的阶段与工单（`OPEN_EXCEPTION.content_json.stage/workOrderId`）；关闭时优先复用同服务商、同工单、同阶段的未完成事项，无则新建并写 `EXCEPTION_CONTINUATION` 关联，同事务保存。

**完成收尾：状态同步**：
- 本 Task 完成实现和验证后，把完成事实、验证证据、完成日期和建议下一 Task 同步回写三处：`main-delivery-plan-jd-charging.md` 执行阶段表、`task-kanban-jd-charging.md` 对应行、本子开发计划的 `**状态**` 字段。
- 同步更新 `docs/00-process/00-02-progress/progress.md` 的进度快照。
- 回写后重新运行 `node .agent/skills/delivery-planner/scripts/check-plan-consistency.mjs docs/07-delivery-plans/main-delivery-plan-jd-charging.md --json`，确认三处一致；未通过前不得宣称本 Task 已完成。

**Owner**：AI 执行 -> 人审核

**前置**：T1.1、T2.1

**状态**：已完成（2026-09-20）
