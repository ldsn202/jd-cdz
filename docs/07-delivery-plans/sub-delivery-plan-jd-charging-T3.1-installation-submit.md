# T3.1 安装资料整理与提交

## 任务来源

- 主开发计划：[main-delivery-plan-jd-charging.md](main-delivery-plan-jd-charging.md)
- 任务看板：[task-kanban-jd-charging.md](task-kanban-jd-charging.md)

#### T3.1 实现安装资料草稿、正式提交与实际上传

**Requirement ID**：REQ-INS-01

**PRD 双链·读**：
- `docs/05-prd/04-subprd-installation-materials.md` §3、§4、§5、§7
- `docs/03-foundation/03-06-provided-apis/installation-apis.md`、`material-apis.md`
- `docs/03-foundation/03-05-schema/installation-schema.md`
- `docs/03-foundation/03-07-system-flows/sys-transactions-recovery.md` §1—§3、§6
- `docs/03-foundation/03-02-external-apis/installation-detail-submit.md`（外部写契约）
- `docs/06-testcase/install/tc-install.md`（TC-INS-）

**核心逻辑**：
- 实现 `GET/PUT installation-draft`、`POST installation-submissions`、`POST /uploads` 与 `GET /uploads/{uploadId}`，复用 T1.3 的 material-versions 读取。
- 草稿修订按版本条件保存；正式提交走确认事务：版本校验、幂等去重、外部写入登记、结果未知经 operations 回查确定，不盲目重写（40903 原操作入口承载字段按 tc-main 待确认 #1 裁决）。
- 上传保留实际来源、服务商、版本与关联记录；文件字节真实保存（本地存储或 R2），解析按 AI 契约边界执行，缺失不补造。

**核心文件**：
- `code/api/src/routes/installation.ts`、`code/api/src/routes/uploads.ts`（新建）
- `code/api/src/services/installation-draft.ts`、`code/api/src/services/installation-submit.ts`、`code/api/src/services/upload-store.ts`（新建）

**完成标准**：
- PUT 草稿在版本不匹配时按契约返回冲突且不写入（D1 回查无变化）。
- 正式提交成功后：本系统状态、外部写入登记、后续核查事项生成三者均可回查；同一幂等标识重复提交不产生第二次外部写入。
- 提交结果未知时经 `GET /operations/{operationId}` 回查得到确定终态；40903 响应携带裁决后的原操作入口字段。
- 上传文件重新读取字节一致，元信息与关联工单 / 服务商可回查；本地上传材料按服务商归属对具备原材料读取权限的身份可见（`material-versions` 读取与正文下载）。

**裁决记录（2026-09-20，T3.1）**：
- tc-main §四 #1：40903 的"原操作入口"以顶层字段 `pendingOperation={operationId,status}` 承载，统一错误壳的 `data` 保持 null。已同步 tc-install §四 #1 与 TC-INS-05。
- tc-main §四 #2：operations 在 `status=RESULT_UNKNOWN` 时 `localContinuationStatus` 取 `NOT_READY`。已同步 tc-install §四 #2 与 TC-INS-07。
- 上传存储形态：文件字节存 R2（本地为 wrangler dev 的本地 R2），`content_locator=uploads/{uploadId}/{name}`，来源记 `LOCAL_UPLOAD`。已写入 `docs/09-deploy/config-items.md`。
- 用例修订：TC-INS-08 准备段缺执行所需的 WRITE_EXTERNAL 任务，已补入 `sql/TC-INS-08.sql`（提交受理时本应创建该任务）。

**Verification Method**：
- 真实走通草稿 → 修订 → 提交 → 回查链路；构造版本冲突、重复提交、结果未知三类场景；执行 TC-INS 可执行用例。

**Evidence**：
- 当日开发日志：各场景请求 / 响应与 D1 回查对照、上传文件字节比对；TC-INS 执行结果记入 `docs/08-test-reports/`。

**Failure Handling**：
- 外部写契约缺 GET 回查路径以外的缺口时，先同步契约再实现。
- 上传存储形态（本地 / R2）按技术栈规则裁决（`AI 执行 -> 人审核`），裁决结果写入 config-items.md。

**完成收尾：状态同步**：
- 本 Task 完成实现和验证后，把完成事实、验证证据、完成日期和建议下一 Task 同步回写三处：`main-delivery-plan-jd-charging.md` 执行阶段表、`task-kanban-jd-charging.md` 对应行、本子开发计划的 `**状态**` 字段。
- 同步更新 `docs/00-process/00-02-progress/progress.md` 的进度快照。
- 回写后重新运行 `node .agent/skills/delivery-planner/scripts/check-plan-consistency.mjs docs/07-delivery-plans/main-delivery-plan-jd-charging.md --json`，确认三处一致；未通过前不得宣称本 Task 已完成。

**Owner**：AI 执行 -> 人审核

**前置**：T1.1、T2.1

**状态**：已完成（2026-09-20）
