<!-- @meta docId="tc-review-detail" status="active" baseline="v1.0.0" -->
# 安装核查与补充 — 用例详情

> 上游（我引用）：[05-subprd-installation-review.md](../../05-prd/05-subprd-installation-review.md) §3、§5、§7、[installation-apis.md](../../03-foundation/03-06-provided-apis/installation-apis.md) §3—6、[material-apis.md](../../03-foundation/03-06-provided-apis/material-apis.md) §1、[workbench-apis.md](../../03-foundation/03-06-provided-apis/workbench-apis.md) §2—4、§7.1、[common-contract.md](../../03-foundation/03-06-provided-apis/common-contract.md) §2—5、[work-item-schema.md](../../03-foundation/03-05-schema/work-item-schema.md) §3、§5—6、[evidence-schema.md](../../03-foundation/03-05-schema/evidence-schema.md) §2、§8、[installation-schema.md](../../03-foundation/03-05-schema/installation-schema.md) §2
> 下游（引用我）：[tc-review.md](tc-review.md) 一、测试范围；[tc-main-jd-charging.md](../tc-main-jd-charging.md) 域登记（待建立后登记）

> **索引文件**: [tc-review.md](tc-review.md)
> **编号前缀**: TC-REV-
> **设计方法**: 等价类+边界值、决策表、状态迁移、场景法

---

## 一、API 验证用例（01-09）

### TC-REV-01：差异与证据呈现（当前代次分析与三分组证据）

> PRD：`05-subprd-installation-review.md` §7 验收#1
> 目标：验证详情接口返回当前代次 analysis，findings 含三种 assessment 及完整 evidenceRefs
> 执行方式：curl

**前提条件**：已执行 TC-REV-SEED.sql 与 [sql/TC-REV-01.sql](sql/TC-REV-01.sql) 数据准备段；调用身份为李核查（当前核查责任人，具 READ_WORK_ITEM）。

**步骤**：
1. `curl "http://localhost:{port}/api/admin/charging/work-items/wi-rev-cht"`
2. 解析响应 JSON

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| HTTP 状态码 / code | 200 / 0 |
| data.kind、data.analysisGeneration、data.analysisStatus | `INSTALLATION_REVIEW`、`1`、`AVAILABLE` |
| data.analysis.resultId / inputSnapshotId / status | `ar-rev01` / `ais-rev01-g1` / `NEEDS_INFORMATION` |
| data.analysis.findings | 长度 3；findingId 集合 = {f-rev01-1, f-rev01-2, f-rev01-3}；content.assessment 分别为 SUPPORTED / CONFLICTING / INSUFFICIENT |
| f-rev01-1.evidenceRefs[0] | inputId=`mp-yanshou-v1`、blockId=`b1`、jsonPointer=null、quote=`施工验收：电缆敷设 18 米，施工方签字确认` |
| f-rev01-2.evidenceRefs | 长度 2，jsonPointer 分别为 `/items/0/plannedQuantity`、`/items/0/installedQuantity`，quote 分别为 `12`、`18` |
| f-rev01-3.evidenceRefs[0].quote | null（IMAGE_DESCRIPTION 块不作原文引文） |

**数据清理**：执行 [sql/TC-REV-01.sql](sql/TC-REV-01.sql) 中的"数据清理"段

### TC-REV-02：证据缺项如实呈现（NEEDS_INFORMATION）

> PRD：`05-subprd-installation-review.md` §7 验收#2
> 目标：验证 NEEDS_INFORMATION 时 findings 为空数组、openQuestions 逐条返回
> 执行方式：curl

**前提条件**：已执行 TC-REV-SEED.sql 与 [sql/TC-REV-02.sql](sql/TC-REV-02.sql) 数据准备段；身份同 TC-REV-01。

**步骤**：
1. `curl "http://localhost:{port}/api/admin/charging/work-items/wi-rev-cht"`

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| data.analysis.status | `NEEDS_INFORMATION` |
| data.analysis.findings | `[]`（空数组，非 null） |
| data.analysis.openQuestions | 长度 2，question 分别为 `需补充增量施工变更确认记录`、`需补充可辨识的现场签字照片或实际确认记录` |
| data.analysis.summary | `现有材料无法判断增量施工原因与确认依据`（不含"已确认/已通过"语义） |

**数据清理**：执行 [sql/TC-REV-02.sql](sql/TC-REV-02.sql) 中的"数据清理"段

### TC-REV-03：费用依据核查（施工事实与费用批准分离）

> PRD：`05-subprd-installation-review.md` §7 验收#3
> 目标：验证仅有施工验收签字时，施工事实 finding 与费用批准疑点 openQuestion 同时存在
> 执行方式：curl

**前提条件**：已执行 TC-REV-SEED.sql 与 [sql/TC-REV-03.sql](sql/TC-REV-03.sql) 数据准备段；身份同 TC-REV-01。

**步骤**：
1. `curl "http://localhost:{port}/api/admin/charging/work-items/wi-rev-slf"`

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| data.analysis.findings | 长度 2；f-rev03-1 content.assessment=`SUPPORTED` 且 content.topic=`增量施工事实`；f-rev03-2 content.assessment=`INSUFFICIENT` 且 content.topic=`增量费用批准依据` |
| data.analysis.openQuestions | 含 q-rev03-1，question=`增量 6 米对应额外费用是否已获批准？请补充适用计费条款或批件`（费用批准疑点未被消除） |
| data.analysis.status | `NEEDS_INFORMATION`（不因施工事实 SUPPORTED 变为 ANALYZED） |

**数据清理**：执行 [sql/TC-REV-03.sql](sql/TC-REV-03.sql) 中的"数据清理"段

### TC-REV-04：审核通过受理链路（202 受理）

> PRD：`05-subprd-installation-review.md` §7 验收#6
> 目标：验证 APPROVE 在当前代次 analysisResultId 下返回 202 受理并同事务保存决定与未决指针
> 执行方式：curl + SQL 回查

**前提条件**：已执行 TC-REV-SEED.sql 与 [sql/TC-REV-04.sql](sql/TC-REV-04.sql) 数据准备段；身份为李核查（具 DECIDE_INSTALLATION_REVIEW 及当前核查责任）。

**步骤**：
1. `curl -X POST "http://localhost:{port}/api/admin/charging/work-items/wi-rev-cht/review-decisions" -H "Idempotency-Key: idem-rev04-approve" -d '{"expectedWorkItemVersion":1,"expectedResponsibilityVersion":1,"analysisResultId":"ar-rev04","action":"APPROVE","questions":[]}'`
2. SQL 回查：`SELECT action_type, analysis_result_id FROM human_decision WHERE work_item_id='wi-rev-cht';` 与 `SELECT interface_kind, action, status FROM external_write_operation WHERE work_item_id='wi-rev-cht';` 与 `SELECT pending_write_id FROM work_item WHERE id='wi-rev-cht';`

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| HTTP 状态码 / code / msg | 202 / 0 / `success` |
| data.status | `ACCEPTED`（非 SUCCEEDED/COMPLETED；响应任何字段不得含"已写入原系统"语义） |
| data.decisionId / operationId / jobId | 均为非空 string；data.workItemId=`wi-rev-cht`；data.rowVersion>1 |
| human_decision 回查 | 新增一行：action_type=`APPROVE`、analysis_result_id=`ar-rev04`、origin=`LOCAL` |
| external_write_operation 回查 | 新增一行：interface_kind=`REVIEW_SYNC`、action=`APPROVE`、status 为 `REGISTERED` 或 `PROCESSING` |
| work_item.pending_write_id | 等于上述 operationId |

**数据清理**：执行 [sql/TC-REV-04.sql](sql/TC-REV-04.sql) 中的"数据清理"段

### TC-REV-05：退回-回复接续全链（原事项接续与代次递增）

> PRD：`05-subprd-installation-review.md` §7 验收#7、#8，及评审补充场景"回复仅文字无附件""同轮拒绝与成功回复""旧分析晚到"
> 目标：验证退回生效绑定、回复接续原事项、代次只增一次、新输入只含成功回复、晚到旧结果不覆盖
> 执行方式：curl + SQL 回查（源端结果经外部 mock 驱动，无驱动入口时执行 SQL 文件 mock 替代段）

**前提条件**：已执行 TC-REV-SEED.sql 与 [sql/TC-REV-05.sql](sql/TC-REV-05.sql) 数据准备段；京东侧身份李核查，服务商侧身份王资料。

**步骤**：
1. 李核查 POST `…/wi-rev-cht/review-decisions`，Idempotency-Key=`idem-rev05-rs`，body：`{"expectedWorkItemVersion":1,"expectedResponsibilityVersion":1,"analysisResultId":"ar-rev05","action":"REQUEST_SUPPLEMENT","questions":[{"findingId":"f-rev05-1","question":"增量 6 米的施工原因与变更确认依据是什么？","requiredMaterialDescription":"增量施工变更确认记录"},{"findingId":null,"question":"请说明增量施工时间段与班组","requiredMaterialDescription":"文字说明即可"}]}`
2. 驱动退回源端成功并完成本地接续（mock 替代段 A），GET 详情与 `GET …/work-items?workOrderId=wo-chunheting&kind=INSTALLATION_REVIEW`
3. 王资料 POST `…/wi-rev-cht/supplements`（回复 A，Idempotency-Key=`idem-rev05-sup-a`，requestDecisionId=步骤1 decisionId，replyText=`增量为现场绕行`，materialVersionIds=[]）→ 202；驱动源端 REJECTED（mock 替代段 B）；再提交回复 B（Idempotency-Key=`idem-rev05-sup-b`，replyText=`增量 6 米为现场管线绕行，施工时间段为 9 月 10 日白班`，materialVersionIds=[]）→ 202；驱动源端成功并完成本地接续（mock 替代段 C）
4. 后台准备第 2 代次输入（mock 替代段 D）后 SQL 回查新快照输入项
5. 模拟旧代次晚到结果入库（mock 替代段 E），GET 详情
6. `GET …/work-items/wi-rev-cht/activities`

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤 1 | HTTP 202，data.status=`ACCEPTED` |
| 步骤 2 详情 | status=`WAITING_SUPPLEMENT`，assignee.identityId=`idt-provider-wang`；事项列表 total=1（未新建重复事项） |
| 步骤 3 回复 A 被拒后 | status 回到 `WAITING_SUPPLEMENT`，原退回仍有效（active_supplement_request_id 不变） |
| 步骤 3 回复 B 接续后 | analysis_generation=2、current_analysis_result_id 清空、active_supplement_request_id 清空、status=`PREPARING`；同一 workItemId，kind 不变 |
| 步骤 4 新快照 | analysis_generation=2；含 SUPPLEMENTAL_RESPONSE RECORD（data_json.replyText 为回复 B 原文）与 INSTALLATION_REVIEW RECORD（原退回决定）；不含回复 A；明细 RECORD 的 installedQuantity 仍为 18（不被文字覆盖） |
| 步骤 5 详情 | analysis 为 null 或第 2 代次新结果；不返回 ar-rev05-late（旧代次不覆盖当前指针） |
| 步骤 6 | activities 含 REQUEST_SUPPLEMENT 与 SUBMIT_SUPPLEMENT 事实记录（前轮问题与回复保留） |

**数据清理**：执行 [sql/TC-REV-05.sql](sql/TC-REV-05.sql) 中的"数据清理"段

### TC-REV-06：过期分析结果被拒（40901）

> PRD：`05-subprd-installation-review.md` §7 验收#9
> 目标：验证用非当前代次 analysisResultId 提交决定被 40901 拒绝且不保存决定
> 执行方式：curl + SQL 回查

**前提条件**：已执行 TC-REV-SEED.sql 与 [sql/TC-REV-06.sql](sql/TC-REV-06.sql) 数据准备段（事项当前第 2 代次，ar-rev06-old 为第 1 代次历史结果）；身份同 TC-REV-04。

**步骤**：
1. POST `…/wi-rev-cht/review-decisions`，Idempotency-Key=`idem-rev06-stale`，body：`{"expectedWorkItemVersion":2,"expectedResponsibilityVersion":1,"analysisResultId":"ar-rev06-old","action":"APPROVE","questions":[]}`
2. SQL 回查：`SELECT count(*) FROM human_decision WHERE work_item_id='wi-rev-cht';`

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| HTTP 状态码 / code / data | 409 / 40901 / null；msg 提示版本已变化需重读最新版本 |
| human_decision 行数 | 0（决定未保存） |
| work_item | row_version=2、current_analysis_result_id=`ar-rev06-cur` 均不变 |

**数据清理**：执行 [sql/TC-REV-06.sql](sql/TC-REV-06.sql) 中的"数据清理"段

### TC-REV-07：无权限/非责任人决定被拒（403 决策表）

> PRD：`05-subprd-installation-review.md` §7 验收#11 及评审补充场景"退回成功但资料责任人未知"
> 目标：验证无 DECIDE 权限、非当前责任人、待分配事项同角色人员三类提交均被 40301 拒绝
> 执行方式：curl + SQL 回查

**前提条件**：已执行 TC-REV-SEED.sql 与 [sql/TC-REV-07.sql](sql/TC-REV-07.sql) 数据准备段（含待分配事项 wi-rev-jxl：WAITING_SUPPLEMENT、assignee=null）。

**步骤**（决策表三行）：
1. 赵查看（无 DECIDE_INSTALLATION_REVIEW）POST `…/wi-rev-cht/review-decisions` APPROVE（analysisResultId=`ar-rev07-cht`，版本 1/1）
2. 陈核查（有 DECIDE 权限但非当前责任人）POST 同上
3. 王资料（资料角色，但事项待分配未交给他）POST `…/wi-rev-jxl/supplements`（requestDecisionId=`hd-rev07-req`，replyText=`补充说明`，materialVersionIds=[]）

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 三步 HTTP 状态码 / code / data | 均为 403 / 40301 / null；不隐藏为成功 |
| human_decision | 三步均无新增（除准备段的 hd-rev07-req 外无新行） |
| work_item | 两事项 row_version、status、assignee_identity_id 均不变 |

**数据清理**：执行 [sql/TC-REV-07.sql](sql/TC-REV-07.sql) 中的"数据清理"段

### TC-REV-08：未决写入与幂等（40903 / 重放 / 40902）

> PRD：`05-subprd-installation-review.md` §7 验收#12
> 目标：验证未决写入拒绝新决定并返回原操作入口；同键同内容重放返回原结果；同键不同内容 40902
> 执行方式：curl + SQL 回查

**前提条件**：已执行 TC-REV-SEED.sql 与 [sql/TC-REV-08.sql](sql/TC-REV-08.sql) 数据准备段（wi-rev-cht 存在未决写入 ewo-rev08-pending；wi-rev-slf 无未决写入）；身份同 TC-REV-04。

**步骤**：
1. POST `…/wi-rev-cht/review-decisions`，Idempotency-Key=`idem-rev08-new`，APPROVE（analysisResultId=`ar-rev08-cht`，版本 2/1）
2. POST `…/wi-rev-slf/review-decisions`，Idempotency-Key=`idem-rev08-replay`，body B=`{"expectedWorkItemVersion":1,"expectedResponsibilityVersion":1,"analysisResultId":"ar-rev08-slf","action":"APPROVE","questions":[]}`，记录返回 decisionId D1
3. 同键同内容重放步骤 2 请求
4. 同键不同内容重放（body 加 `"comment":"改内容"`）

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤 1 | HTTP 409 / code=40903 / data=null；响应含原操作入口（可定位到 ewo-rev08-pending；承载字段见 [待确认-需产品明确]#2）；human_decision 无新增 |
| 步骤 2 | HTTP 202，decisionId=D1 非空 |
| 步骤 3 | 返回原结果：decisionId=D1、operationId 与步骤 2 相同；human_decision 中 wi-rev-slf 的 APPROVE 决定恰 1 行（HTTP 状态码见 [待确认-需产品明确]#1） |
| 步骤 4 | HTTP 409 / code=40902 / data=null；human_decision 行数仍为 1 |

**数据清理**：执行 [sql/TC-REV-08.sql](sql/TC-REV-08.sql) 中的"数据清理"段

### TC-REV-09：证据原文版本校验（42201 / VERIFIED 字节 / 权限）

> PRD：`05-subprd-installation-review.md` §7 验收#13
> 目标：验证 REFERENCED 版本 content 返回 42201；VERIFIED 版本按版本返回字节；每次核实权限
> 执行方式：curl（含字节摘要核对）

**前提条件**：已执行 TC-REV-SEED.sql（本用例对应 [sql/TC-REV-09.sql](sql/TC-REV-09.sql) 无新增数据）；测试文件存储存有 smv-yanshou-v1 对应字节；调用身份具 READ_SOURCE_MATERIAL（步骤 3 用无该权限身份）。

**步骤**：
1. `curl -i "http://localhost:{port}/api/admin/charging/material-versions/smv-photo-v1/content"`
2. `curl -s -D - "http://localhost:{port}/api/admin/charging/material-versions/smv-yanshou-v1/content" -o /tmp/tc-rev-09.pdf && shasum -a 256 /tmp/tc-rev-09.pdf`
3. 以无 READ_SOURCE_MATERIAL 权限身份重复步骤 2

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤 1 | HTTP 422 / code=42201 / 统一 JSON 错误壳、data=null；不返回字节流 |
| 步骤 2 | HTTP 200；Content-Type=`application/pdf`；Content-Length=`102400`；字节 SHA-256=`2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae`；Cache-Control 为私有 |
| 步骤 3 | HTTP 404 / code=40404（材料对无权限身份不可见，与不存在统一 404） |

**数据清理**：删除 /tmp/tc-rev-09.pdf；数据库无变更

---

## 二、UI 验证用例（11-19）

### TC-REV-11：差异与证据区渲染

> PRD：`05-subprd-installation-review.md` §7 验收#1
> 目标：验证逐项差异对照、证据三分组、原文定位侧栏与 SUPPORTED 不误标
> 执行方式：浏览器 UI（数据复用 [sql/TC-REV-11.sql](sql/TC-REV-11.sql)，同 TC-REV-01）

**步骤**：
1. 以李核查身份打开安装核查详情页（事项 wi-rev-cht，原型场景 `#task/bridge`）
2. 点击 f-rev01-1 证据的"查看原文"入口

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 逐项差异区 | 同项对照：方案 12 米 / 明细 18 米；方案量标注为比较依据，不显示为实际完成量 |
| 证据分组 | 支持/冲突/不足三组各 1 条；每条证据带来源材料版本标识（ys-v1；版本数据来源见 [待确认-需产品明确]#3） |
| 原文侧栏 | 沿 blockId=b1 定位施工验收单 PDF 第 1 页，高亮原文"施工验收：电缆敷设 18 米，施工方签字确认" |
| 图片描述证据 | f-rev01-3 标明"图片描述"，不显示为原文引文 |
| 分组标题 | SUPPORTED 组不显示"已审核通过"字样 |

**数据清理**：同 TC-REV-01

### TC-REV-12：证据缺项如实展示

> PRD：`05-subprd-installation-review.md` §7 验收#2
> 目标：验证 NEEDS_INFORMATION 时缺项展示为待核实而非已确认发现
> 执行方式：浏览器 UI（数据复用 [sql/TC-REV-12.sql](sql/TC-REV-12.sql)，同 TC-REV-02）

**步骤**：打开 wi-rev-cht 详情页。

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 待核实问题区 | 逐条列出 2 条缺项（变更确认记录、可辨识签字照片），标识"待核实" |
| 证据区 | 无证据条目；不出现"已确认发现"样式 |
| 结论区域 | 无预填结论或模拟成功文案 |

**数据清理**：同 TC-REV-02

### TC-REV-13：费用依据核查渲染

> PRD：`05-subprd-installation-review.md` §7 验收#3
> 目标：验证费用场景下施工事实证据与费用批准疑点分离展示
> 执行方式：浏览器 UI（数据复用 [sql/TC-REV-13.sql](sql/TC-REV-13.sql)，同 TC-REV-03）

**步骤**：打开尚澜府费用依据核查页（事项 wi-rev-slf，原型场景 `#task/fee`）。

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 施工事实证据 | 验收签字证据展示为仅覆盖施工事实（topic=`增量施工事实`） |
| 待核实问题区 | 费用批准疑点 q-rev03-1 仍在列表中，未被消除 |
| 操作区 | 不出现费用批准类操作按钮（核查人无费用批准权） |

**数据清理**：同 TC-REV-03

### TC-REV-14：分析失败真实呈现

> PRD：`05-subprd-installation-review.md` §7 验收#4
> 目标：验证材料读取失败事项以真实失败状态呈现且不开放审批
> 执行方式：浏览器 UI（[sql/TC-REV-14.sql](sql/TC-REV-14.sql)，无新增数据）

**步骤**：打开锦绣里分析失败恢复页（事项 wi-rev-jxl，原型场景 `#task/failed`）。

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 失败状态区 | 展示真实失败状态与失败位置：`材料读取失败：现场照片 MAT-PH-01 版本 ph-v1 未取得正文` |
| 已有资料区 | 材料索引仍展示（现场照片条目可见但正文未取得，原文按钮禁用） |
| 结论区域 | 无预填结论、无模拟成功文案；不把空结果显示为"没有差异" |
| 决定操作区 | 通过/退回按钮不可提交（详情 allowedActions 不含 APPROVE、REQUEST_SUPPLEMENT） |

**数据清理**：无

### TC-REV-15：失败恢复动作

> PRD：`05-subprd-installation-review.md` §7 验收#5
> 目标：验证读取失败恢复后原事项展示新分析且保留已有资料
> 执行方式：浏览器 UI（[sql/TC-REV-15.sql](sql/TC-REV-15.sql)，恢复经后台真实任务或恢复替代段）

**步骤**：
1. 打开 wi-rev-jxl 详情页确认失败态（同 TC-REV-14）
2. 执行恢复（重新分析；无后台驱动时执行 SQL 恢复替代段），刷新页面

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 事项身份 | workItemId 仍为 wi-rev-jxl，kind 仍为 INSTALLATION_REVIEW，未新建事项 |
| 分析区 | 展示新分析结果（f-rev15-1：方案 12 米、明细 12 米一致，签字可辨识） |
| 已有资料区 | 失败前材料索引仍展示；现场照片正文恢复可取 |
| 提示文案 | 不出现要求服务商重交资料的提示 |

**数据清理**：执行 [sql/TC-REV-15.sql](sql/TC-REV-15.sql) 中的"数据清理"段

### TC-REV-16：202 受理与决定进展呈现

> PRD：`05-subprd-installation-review.md` §7 验收#6 及评审补充场景"退回202受理、外部未知、本地接续失败"
> 目标：验证受理页不声称已写入原系统，进展五态如实区分，源端成功后事项以 REVIEW_APPROVED 完成
> 执行方式：浏览器 UI（数据复用 [sql/TC-REV-16.sql](sql/TC-REV-16.sql)，同 TC-REV-04）

**步骤**：
1. 打开 wi-rev-cht 详情页，提交 APPROVE
2. 观察受理提示与进展区（进展来自 `GET …/operations/{operationId}`）
3. 驱动源端成功与本地接续（SQL mock 替代段），刷新页面

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 受理提示 | 显示"已受理/处理中"语义；不出现"提交已成功写入原系统" |
| 进展区（受理后） | pendingOperation.status 如实显示（REGISTERED/PROCESSING 显示"正在处理"；RESULT_UNKNOWN 显示"结果未知"）；五种含义不混用 |
| 源端成功后 | 事项显示完成，completion.code=`REVIEW_APPROVED`；列表中该事项进入已完成 |
| 外部成功但本地接续失败时 | 仍显示 PROCESSING 及"本地交接处理中/受阻"，不提前显示完成（评审补充场景，经 SQL 置 localContinuationStatus=BLOCKED 验证） |

**数据清理**：执行 [sql/TC-REV-16.sql](sql/TC-REV-16.sql) 中的"数据清理"段

### TC-REV-17：退回待回复与待分配呈现

> PRD：`05-subprd-installation-review.md` §7 验收#7 及评审补充场景"退回成功但资料责任人未知"
> 目标：验证退回生效后绑定本轮退回并交给明确责任人；责任人未知时不向同角色放行
> 执行方式：浏览器 UI（[sql/TC-REV-17.sql](sql/TC-REV-17.sql)）

**步骤**：
1. 以王资料身份打开 wi-rev-cht 详情页（WAITING_SUPPLEMENT，assignee=王资料）
2. 以李核查身份打开同一事项
3. 以王资料身份打开 wi-rev-jxl（WAITING_SUPPLEMENT，assignee=null）

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤 1 | 显示本轮退回问题（增量施工原因、变更确认记录）；可提交回复（allowedActions 含 SUBMIT_SUPPLEMENT） |
| 步骤 2 | 京东可查看进展；不显示"直接通过"动作（未解决的补充要求下不允许 APPROVE） |
| 步骤 3 | 显示待分配，blockedReasons 含 `RESPONSIBILITY_UNRESOLVED`；王资料（同角色非责任人）无提交动作 |

**数据清理**：执行 [sql/TC-REV-17.sql](sql/TC-REV-17.sql) 中的"数据清理"段

### TC-REV-18：新版材料到达的代次保护

> PRD：`05-subprd-installation-review.md` §7 验收#10
> 目标：验证新材料版本到达后代次递增、旧分析不再作为当前依据、基于旧内容的决定被暂停
> 执行方式：浏览器 UI（[sql/TC-REV-18.sql](sql/TC-REV-18.sql)）

**步骤**：
1. 打开 wi-rev-cht 详情页，确认展示第 1 代次分析（ar-rev01）
2. 模拟新版材料到达（上传替换材料经后台真实触发，或执行 SQL 变化替代段），刷新页面
3. 尝试基于旧页面提交 APPROVE（analysisResultId=ar-rev01）

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤 2 上下文条 | analysisGeneration=2；事项状态为 PREPARING；旧结果不再作为当前有效分析展示（analysis=null 或明确标为旧依据） |
| 步骤 2 决定操作区 | 基于旧内容的批准/退回被暂停（按钮禁用或提示等待新分析） |
| 步骤 3 | 提交被拒（HTTP 409 / code=40901），页面保留已填意见并提示重读最新版本 |

**数据清理**：执行 [sql/TC-REV-18.sql](sql/TC-REV-18.sql) 中的"数据清理"段
