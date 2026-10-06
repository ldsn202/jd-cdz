# install（安装资料整理与提交） — 测试报告

> **执行环境**: Worker `http://localhost:8799`（wrangler dev，隔离本地 D1 `--persist-to`）；调用身份为种子资料员 `idt-tc-ins-clerk1`（token `dev-token-tc-ins-clerk`）
> **用例基线**: `docs/06-testcase/install/tc-install.md` v1.0.1
> **执行方式**: curl 真实 HTTP + `wrangler d1 execute` 回查；UI 用例依赖前端（T4.3）尚未实现

---

## 第1轮（2026-09-20）

> 用例总数: 16 | PASS: 8 | FAIL: 0 | BLOCKED: 8（API 1 + UI 7）

| 编号 | 名称 | 类型 | 结果 | 关键证据 |
|------|------|------|------|---------|
| TC-INS-01 | 草稿正常读取 | API | ✅ PASS | HTTP 200/code 0；draftId=`draft-tc-ins-001`、draftVersionId=`dv-tc-ins-001`、versionNo=1、rowVersion=6；items 3 行，items[1].installedQuantity=null（键存在）；openQuestions 2 条；sourceMaterials 2 条 version=`mv-1`；analysisResultId=`ar-tc-ins-001` |
| TC-INS-02 | 无草稿读取 | API | ✅ PASS | draftId/draftVersionId/versionNo/analysisResultId 均 null；items/sourceMaterials/openQuestions 均 `[]` |
| TC-INS-03 | 编辑保存生成 HUMAN 新版本 | API | ✅ PASS | 200/`SAVED`；versionNo=2、新 draftVersionId≠v1；D1 两行：v1 origin=AI/parent=null、v2 origin=HUMAN/parent=dv-tc-ins-001/editor=idt-tc-ins-clerk1；v1 items[1].installedQuantity 仍 null；草稿指针推进到 v2；同键重放返回同一 v2 |
| TC-INS-04 | 草稿版本保护 | API | ✅ PASS | 旧 expectedDraftVersionId → 409/40901，data=null；D1 版本数仍为 2 |
| TC-INS-05 | 未决写入保护 | API | ✅ PASS | PUT 与 POST 均 409/40903，`pendingOperation={operationId:"sub-tc-ins-05",status:"PROCESSING"}`；D1 草稿版本仍 1、提交仍 1 |
| TC-INS-06 | 提交受理与重复提交幂等 | API | ✅ PASS | 首次 202/`ACCEPTED`，返回 decisionId/operationId/jobId 非空；同键同内容重放 202 且 operationId 相同；同键加 `comment` 返回 409/40902；D1：submission=1、human_decision=1、op=REGISTERED、job=WRITE_EXTERNAL、事项=PROCESSING、pending_write_id=该提交 |
| TC-INS-07 | 结果未知回查 | API | ✅ PASS | operations 返回 status=`RESULT_UNKNOWN`、receipt=null、verifiedAt=null、localContinuationStatus=`NOT_READY`；按原键重放 202 且返回原 operationId=`sub-tc-ins-07`；D1 提交数仍 1（未新建） |
| TC-INS-08 | 提交成功自动产生核查事项 | API | ✅ PASS | 由 WRITE_EXTERNAL 任务回报成功回执（明细 `DET-SRC-8801`/`detv-101`）：operations=SUCCEEDED 且有回执与 verifiedAt、localContinuationStatus=COMPLETED；事项=COMPLETED/`INSTALLATION_SUBMITTED`；同工单 INSTALLATION_REVIEW 事项=1；`STAGE_HANDOFF` 链接=1；重复投递同一回执后两项仍=1（去重） |
| TC-INS-09 | 上传登记版本并进入相同解析流程 | API | ⚠️ BLOCKED | 202/`RECEIVED`、uploadId/materialVersionId/jobId 非空、workItemId 正确；D1 来源=`LOCAL_UPLOAD`、版本=VERIFIED、mediaType/size/sha256/locator 正确；事项 analysisGeneration 由 1→2、状态 PREPARING；正文重新下载 sha256 与写入前逐字节一致（cmp 相同）。**终态 READY 依赖解析链路（AI 服务/任务程序），mock 专题未交付，无法在本轮达到** |
| TC-INS-11 | 草稿明细区渲染 | UI | ⛔ BLOCKED | 前端页面（T4.3）尚未实现 |
| TC-INS-12 | 依据定位侧栏 | UI | ⛔ BLOCKED | 前端页面（T4.3）尚未实现 |
| TC-INS-13 | 缺项与冲突展示 | UI | ⛔ BLOCKED | 前端页面（T4.3）尚未实现 |
| TC-INS-14 | 无草稿页面 | UI | ⛔ BLOCKED | 前端页面（T4.3）尚未实现 |
| TC-INS-15 | 编辑保存后版本标识更新 | UI | ⛔ BLOCKED | 前端页面（T4.3）尚未实现 |
| TC-INS-16 | 提交进展三态如实区分 | UI | ⛔ BLOCKED | 前端页面（T4.3）尚未实现 |
| TC-INS-17 | 结果未知页面不换编号重提 | UI | ⛔ BLOCKED | 前端页面（T4.3）尚未实现 |

### 补充核对（完成标准相关，非 TC 编号）

| 检查项 | 结果 | 证据 |
|--------|------|------|
| 上传材料按服务商归属可见 | ✅ PASS | `material-versions/{id}` 与 `/content` 对具备 READ_SOURCE_MATERIAL 的资料员返回 200；正文与原始文件 SHA-256 一致、`cmp` 逐字节相同 |
| 缺 Idempotency-Key | ✅ PASS | PUT/POST 均 400/40001 |
| 提交正文含未声明字段 | ✅ PASS | 400/40001（`roleId` 等被拒） |
| 草稿实质修改缺 `editNotes` 理由 | ✅ PASS | 400/40001 |
| 同键不同草稿内容 | ✅ PASS | 409/40902 |

### 依赖与阻塞

1. **TC-INS-09 终态 READY**：解析需要 AI 服务或任务程序实际运行；`AI_MODE=mock` 指向的模拟服务属 mock 专题（jd-charging-mock），未交付。上传受理、字节保存、版本登记、代次增加均已真实验证。
2. **TC-INS-11—17（UI）**：属 Phase 4（T4.3 前端业务页），未实现；不在 T3.1 范围内。
3. **外部成功回执驱动**：本轮的 TC-INS-08 经内部任务结果通道（WRITE_EXTERNAL 的 `job-claims` / `job-attempts/{id}/results`）以外部契约回执驱动，与后台任务程序交付结果的真实路径一致；对 mock 原系统的真实 HTTP 写入属 T5.1 联调，未在本轮执行。

### 执行说明

- 候选 DDL 全部业务表带 no_delete/no_update 触发器，用例“数据清理”按 TC 约定为重建隔离库；本轮使用独立 `--persist-to` 目录，未污染开发库。
- 逐条按“数据准备 → 请求 → D1/SQL 回查”串行执行；写操作用例按 TC 约定各自独立事项链。


## 第2轮（2026-09-21）：TC-INS-09 单条复测

本轮 1 PASS / 0 FAIL / 0 BLOCKED；其他用例保留第1轮记录，未将工程测试算作正式用例。累计最近结果：9 PASS、7 UI 尚未正式执行。

| 编号 | 结果 | 实际验证与清理 |
|---|---|---|
| TC-INS-09 | PASS | 新空D1应用全部9份生产迁移并执行原SEED；额外登记受控SERVICE执行身份。真实HTTP上传两工作表XLSX，202 RECEIVED；从R2取回字节逐字节一致；实际Python解析，结果经租约接口采纳；上传READY、材料LOCAL_UPLOAD/VERIFIED、material_parsing COMPLETE且2个工作表、analysisGeneration=2。核验后停止专属18889实例并移除仅本用例临时库和文件。API用例，无UI按钮/弹窗。 |

证据：[HTTP与解析](install/TC-INS-09-20260921/http-and-parser.json)、[D1查库](install/TC-INS-09-20260921/database.json)、[清理](install/TC-INS-09-20260921/cleanup.json)。单条驱动：[verify-single-upload.mjs](../../code/task-runner/verify-single-upload.mjs)。本条证明上传解析完成；后续自动生成新业务草稿仍属T5.1其他验收，未据此宣称完成。
