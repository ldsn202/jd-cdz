# T1.1 公共契约与身份会话

## 任务来源

- 主开发计划：[main-delivery-plan-jd-charging.md](main-delivery-plan-jd-charging.md)
- 任务看板：[task-kanban-jd-charging.md](task-kanban-jd-charging.md)

#### T1.1 实现公共契约、session 与身份范围检查

**Requirement ID**：REQ-JDCHARGE-IDENT-01

**PRD 双链·读**：
- `docs/03-foundation/03-06-provided-apis/common-contract.md` §1—§5
- `docs/03-foundation/03-06-provided-apis/workbench-apis.md` §1（当前身份与可选服务商）
- `docs/05-prd/01-subprd-workbench-items.md` §3.1、§5（session / providers 业务说明）
- `docs/03-foundation/03-05-schema/identity-schema.md`（身份、权限与责任三张表）
- `docs/05-prd/mainprd-jd-charging.md` §二（权限全局约定）

**核心逻辑**：
- 落地 common-contract：统一返回结构、分页、幂等标识、版本条件、通用错误码（含 40903 原操作入口）、事务约定；全部后续路由复用，不各写一套。
- 身份与业务权限由服务端核实：实现 `GET /api/admin/charging/session` 与 `GET /api/admin/charging/providers`，前端不传身份参数、不做权限判断；深链接打开任何页面都经身份范围检查中间件。
- 404/403 适用边界（tc-main §四 待确认 #2）在本 Task 内按 common-contract §3—§4 裁决一次并回写口径（`AI 执行 -> 人审核`）。
- 开发期身份模拟凭据的发放形式（待确认 #6）采用本地受控测试会话，凭据不进前端、不进仓库。

**核心文件**：
- `code/api/src/index.ts`、`code/api/src/routes/session.ts`（新建）
- `code/api/src/services/identity.ts`、`code/api/src/services/permission-guard.ts`（新建）
- `code/api/src/lib/contract.ts`（统一返回 / 错误码 / 幂等，新建）

**完成标准**：
- session 返回的当前身份、角色与业务范围来自 identity 域表真实查询；providers 返回当前身份可选服务商清单。
- 无权限访问他人业务范围资源的请求，按裁决口径返回 403 或 404，响应结构符合 common-contract §4。
- 统一返回 / 错误码 / 幂等中间件被至少 session 与 providers 两条路由实际复用。
- 裁决后的 404/403 口径与身份凭据发放形式同次回写 tc-main §四 对应行与本计划正文。

**Verification Method**：
- 用受控测试身份真实请求 session / providers；构造越权请求核对响应码与结构；D1 回查身份数据来源行。

**Evidence**：
- 当日开发日志：请求 / 响应样例、越权用例结果、D1 回查输出。

**Failure Handling**：
- identity 域数据在联调前只能由种子或后台链路写入时，用最小受控种子验证并在日志注明，不当作业务数据闭环证据。
- common-contract 与子 PRD 口径冲突时阻塞并 `AI 执行 -> 人审核`，不私选一边。

**完成收尾：状态同步**：
- 本 Task 完成实现和验证后，把完成事实、验证证据、完成日期和建议下一 Task 同步回写三处：`main-delivery-plan-jd-charging.md` 执行阶段表、`task-kanban-jd-charging.md` 对应行、本子开发计划的 `**状态**` 字段。
- 同步更新 `docs/00-process/00-02-progress/progress.md` 的进度快照。
- 回写后重新运行 `node .agent/skills/delivery-planner/scripts/check-plan-consistency.mjs docs/07-delivery-plans/main-delivery-plan-jd-charging.md --json`，确认三处一致；未通过前不得宣称本 Task 已完成。

**裁决记录（2026-09-20）**：
- tc-main §四 #2（404/403 口径）：资源不存在或对当前身份不可见统一 404/40404；资源可见但无动作权限 403/40301；列表接口按可见范围过滤后返回空，不泄露存在性。已回写 tc-main §四 对应行。
- tc-main §四 #6（开发身份凭据）：采用服务端隔离的身份模拟配置——`DEV_IDENTITY_TOKENS`（code/.dev.vars，不进仓库）映射 token→稳定主体编号，种子 `code/db/seeds/dev-identity.sql` 保存主体、封存上下文与授权项（授权项先写、上下文后封存，触发器强制）。生产登录协议由身份提供方接入确认，标 [待确认]。
- 种子顺序实测修正：`current_identity` 封存触发器校验 grant_count 与实际授权项一致，授权项必须先于上下文写入（dev-identity.sql 已按此排序）。

**Owner**：AI 执行 -> 人审核

**前置**：T0.2

**状态**：已完成（2026-09-20）
