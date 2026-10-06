# T2.2 变化接收与后台执行内部路由

## 任务来源

- 主开发计划：[main-delivery-plan-jd-charging.md](main-delivery-plan-jd-charging.md)
- 任务看板：[task-kanban-jd-charging.md](task-kanban-jd-charging.md)

#### T2.2 实现 execution 域 7 条内部 SERVICE 路由

**Requirement ID**：REQ-EXEC-01

**PRD 双链·读**：
- `docs/03-foundation/03-06-provided-apis/execution-apis.md` §1—§5
- `docs/03-foundation/03-05-schema/execution-schema.md`（九张表）
- `docs/03-foundation/03-07-system-flows/sys-transactions-recovery.md` §1—§5
- `docs/03-foundation/03-07-system-flows/sys-analysis-preparation.md` §1（变化接收）

**核心逻辑**：
- 实现 7 条内部路由：`POST /internal/change-batches`、`POST /internal/job-claims`、`POST /internal/job-attempts/{attemptId}/heartbeats`、`.../results`、`.../dispatch-start`、`POST /internal/agent-runs`、`GET /internal/agent-runs/{runId}`。
- 内部路由仅后台任务程序调用，按 execution-apis §1 的鉴权边界与浏览器接口分开验证。
- 变化批次可靠接收并保存读取位置（重复变化不重复创建事项）；任务领取、心跳、结果回传支持中断恢复与迟到任务不写新环境；原系统结果与本地接续分开保存。

**核心文件**：
- `code/api/src/routes/internal-execution.ts`（新建）
- `code/api/src/services/change-batch.ts`、`code/api/src/services/job-dispatch.ts`、`code/api/src/services/agent-run.ts`（新建）

**完成标准**：
- 7 条路由出入参与 execution-apis 逐字段一致；浏览器身份调用被按契约拒绝。
- 同一变化批次重复上报只落一条记录（D1 回查行数不变）；读取位置随批次推进可查询。
- 任务尝试中断后经 job-claims 可重新领取；心跳超时任务状态按契约流转。
- agent-runs 写入与回读一致，运行参数、快照引用与结果分开保存。

**Verification Method**：
- 真实请求逐条路由并 D1 回查状态流转；构造重复批次、中断重领、结果未知三类场景核对；浏览器身份调用核对拒绝响应。

**Evidence**：
- 当日开发日志：逐路由请求 / 响应与 D1 回查对照、三类异常场景记录。

**Failure Handling**：
- execution 域约束与路由实现冲突（如条件零行回滚）时先回写 schema 文档再改实现。
- 后台任务程序（T2.3）未就绪前，用直接 HTTP 调用验证路由行为并注明，不当作全链路证据。

**完成收尾：状态同步**：
- 本 Task 完成实现和验证后，把完成事实、验证证据、完成日期和建议下一 Task 同步回写三处：`main-delivery-plan-jd-charging.md` 执行阶段表、`task-kanban-jd-charging.md` 对应行、本子开发计划的 `**状态**` 字段。
- 同步更新 `docs/00-process/00-02-progress/progress.md` 的进度快照。
- 回写后重新运行 `node .agent/skills/delivery-planner/scripts/check-plan-consistency.mjs docs/07-delivery-plans/main-delivery-plan-jd-charging.md --json`，确认三处一致；未通过前不得宣称本 Task 已完成。

**Owner**：AI 执行 -> 人审核

**前置**：T0.2、T2.1

**裁决与偏差记录（2026-09-20）**：
- 内部路由鉴权裁决：人员身份调内部路由返回 403/40301（已认证但无操作权限），无凭据 401；SERVICE 由 DEV_IDENTITY_TOKENS 映射的 ir-dev-service 充当。
- 结果采用边界：T2.2 只负责尝试与任务状态机（SUCCEEDED/FAILED/UNKNOWN、RETRY_WAIT 预算、终态）；分析结果入库与事项发布属 T2.3 采用逻辑。UNKNOWN 统一转 RETRY_WAIT（不判业务失败）。
- 修复记录：心跳 UPDATE 补 row_version 递增（触发器要求）；attempt.result_json 约束为 JSON object，非对象结果存 {}。
- 租约/预算参数登记 config-items（TASK_LEASE_MS=600000、TASK_MAX_ATTEMPTS=3、TASK_RETRY_BACKOFF_MS=60000）。

**状态**：已完成（2026-09-20）
