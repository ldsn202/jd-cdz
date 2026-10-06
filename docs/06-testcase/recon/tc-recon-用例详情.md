<!-- @meta docId="tc-recon-detail" status="active" baseline="v1.0.0" -->
# 业务对账 测试用例详情

> **索引文件**: [tc-recon.md](tc-recon.md)
> **基准 PRD**: [06-subprd-reconciliation.md](../../05-prd/06-subprd-reconciliation.md) §7
> 服务端 `http://localhost:8787`；写请求统一带 Header `Idempotency-Key`；身份以 `Authorization: Bearer <开发身份凭据>` 表示。
>
> 上游（我引用）：[06-subprd-reconciliation.md](../../05-prd/06-subprd-reconciliation.md) §7、[reconciliation-apis.md](../../03-foundation/03-06-provided-apis/reconciliation-apis.md) §1—4、[common-contract.md](../../03-foundation/03-06-provided-apis/common-contract.md) §1—5、[reconciliation-schema.md](../../03-foundation/03-05-schema/reconciliation-schema.md) §1—7
> 下游（引用我）：[tc-recon.md](tc-recon.md) §一

---

## 三、API 验证用例

### TC-REC-01：读取对账结果-有差异

> PRD：`06-subprd-reconciliation.md` §7 验收#7
> 目标：验证 DIFFERENT 状态下详情接口返回契约字段，金额为十进制字符串，差额方向为服务商减京东
> 执行方式：curl
> 数据准备/清理：执行 [sql/TC-REC-01.sql](sql/TC-REC-01.sql) 对应段

**步骤**：
1. `curl "http://localhost:8787/api/admin/charging/work-items/wi-rec-01/reconciliation" -H "Authorization: Bearer <京东对账员>"`

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| HTTP 状态码 / code | 200 / 0 |
| data.reconciliationId / inputSnapshotId | "rr-rec-01" / "sn-rec-01" |
| data.status | "DIFFERENT" |
| data.currency / jdTotal / providerTotal / difference | "CNY" / "1280.00" / "1360.00" / "80.00"（string 类型） |
| data.groups | 长度 2；g1.difference="0"、g2.jdAmount="280.00"、g2.providerAmount="360.00"、g2.difference="80.00" |
| data.groups[*].jdItems/providerItems | 各含来源编号、版本、名称、数量、单位、单价、金额；g2 双方均有"材料搬运费"两行独立存在不合并 |
| data.openIssues / analysisResultId | 长度 1 且含 g2 差额说明 / "ar-rec-01" |
| data.rowVersion | 正整数 |

### TC-REC-02：应收修订产生新版本且不改对方账单

> PRD：`06-subprd-reconciliation.md` §7 验收#10、#7
> 目标：验证服务商修订应收被可靠取得后形成新比较并发布，京东账单与旧版历史不变；中间失效态为 PREPARING/null
> 执行方式：curl + SQL 回查
> 数据准备/清理：执行 [sql/TC-REC-02.sql](sql/TC-REC-02.sql) 对应段（阶段 A → 步骤1 → 阶段 B1 → 步骤2 → 阶段 B2 → 步骤3/4）

**步骤**：
1. 阶段 A 后 GET 详情 → 断言旧比较
2. 执行阶段 B1 后 GET 详情 → 断言 PREPARING
3. 执行阶段 B2 后 GET 详情 → 断言新比较
4. SQL 回查账单身份与旧记录

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤1 data.status / difference | "DIFFERENT" / "80.00" |
| 步骤2 data.status | "PREPARING"，reconciliationId/jdTotal/providerTotal/difference/currency 全为 null，groups=[]，openIssues 说明缺项，不填零 |
| 步骤3 data.reconciliationId / status | "rr-rec-02b" / "RECONCILED"，jdTotal="1280.00"、providerTotal="1280.00"、difference="0" |
| 步骤4 回查 | `billing_document` 中 bd-rec-jd-01 与 bd-rec-pv-01 的 gmt_modified=gmt_create（未被改）；rr-rec-02a 仍按原值存在；应收输入 ii-rec-02a-pv 版本仍为 v2026-08-31；京东侧无新账单身份行 |

### TC-REC-03：读取-核对一致 RECONCILED

> PRD：`06-subprd-reconciliation.md` §7 验收#12
> 目标：验证分项全一致、八项检查 true、无未决问题时视图映射 RECONCILED，且不生成结算/付款/费用批准记录
> 执行方式：curl + SQL 回查
> 数据准备/清理：执行 [sql/TC-REC-03.sql](sql/TC-REC-03.sql) 对应段

**步骤**：
1. GET 详情
2. SQL 回查 `fee_basis_record` 行数与执行前一致（无新增 APPROVAL）；响应 JSON 仅含契约字段

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| data.status / difference | "RECONCILED" / "0" |
| data.groups | 长度 2，全部 MATCHED 且 difference="0" |
| data.openIssues | [] |
| 响应字段集合 | 仅 reconciliationId/inputSnapshotId/status/currency/jdTotal/providerTotal/difference/groups/openIssues/analysisResultId/questions/rowVersion，无结算、付款、费用批准字段 |
| 回查 | fee_basis_record 无新增行；无结算/付款类记录产生 |

### TC-REC-04：读取-总额相同但分项有差异仍 DIFFERENT

> PRD：`06-subprd-reconciliation.md` §7 验收#12、#6
> 目标：验证总额相同（差额 "0"）但组间存在 +80.00/-80.00 差异时不判定核对一致
> 执行方式：curl
> 数据准备/清理：执行 [sql/TC-REC-04.sql](sql/TC-REC-04.sql) 对应段

**步骤**：
1. GET 详情

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| data.status | "DIFFERENT"（不是 RECONCILED） |
| data.jdTotal / providerTotal / difference | "1360.00" / "1360.00" / "0" |
| data.groups | 长度 3；g2.difference="80.00"（DIFFERENCE）、g3.difference="-80.00"（UNMATCHED，仅京东成员） |
| data.openIssues | 长度 2，分别对应 g2 差额与 g3 未匹配 |

### TC-REC-05：发起核实问题成功

> PRD：`06-subprd-reconciliation.md` §7 验收#8
> 目标：验证京东对账责任发起核实问题返回 questionActionId 并交接当前应收负责人
> 执行方式：curl + SQL 回查
> 数据准备/清理：执行 [sql/TC-REC-05.sql](sql/TC-REC-05.sql) 对应段

**步骤**：
1. `curl -X POST "http://localhost:8787/api/admin/charging/work-items/wi-rec-01/billing-questions" -H "Authorization: Bearer <京东对账员>" -H "Idempotency-Key: tc-rec-05-q1" -H "Content-Type: application/json" -d '{"expectedWorkItemVersion":<详情读取值>,"expectedResponsibilityVersion":<详情读取值>,"reconciliationId":"rr-rec-05","questions":[{"groupId":"g2","question":"材料搬运费 80.00 差额的计费依据是什么？","evidenceRefs":["fbr-rec-term-01"]}],"comment":null}'`
2. SQL 回查 fee_verification_action 与 work_item

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| HTTP 状态码 / code / data.status | 200 / 0 / "APPLIED" |
| data.questionActionId / decisionId | 非空 string |
| 回查 fee_verification_action | 新增 QUESTION 行：reconciliation_id="rr-rec-05"、is_closed=0、question_action_id 为 NULL |
| 回查 work_item | assignee_identity_id 变为当前应收负责人，responsibility_version 较前值 +1 |

### TC-REC-06：服务商回复核实问题成功

> PRD：`06-subprd-reconciliation.md` §7 验收#9
> 目标：验证回复保存在原问题组下、isClosed 不变、事项交回京东对账责任
> 执行方式：curl + SQL 回查
> 数据准备/清理：执行 [sql/TC-REC-06.sql](sql/TC-REC-06.sql) 对应段（含开放问题 qa-rec-06，requestDecisionId="hd-rec-06-q"）

**步骤**：
1. `curl -X POST ".../work-items/wi-rec-01/billing-replies" -H "Authorization: Bearer <城南应收负责人>" -H "Idempotency-Key: tc-rec-06-r1" -d '{"expectedWorkItemVersion":<读取值>,"expectedResponsibilityVersion":<读取值>,"requestDecisionId":"hd-rec-06-q","replyText":"搬运超出 30 米，按次另计，稍后补里程依据。","materialVersionIds":[]}'`
2. GET 详情查看 questions；SQL 回查

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| HTTP 状态码 / code / data.status | 200 / 0 / "APPLIED" |
| 详情 questions[0].replies | 长度 1，replyText 与提交一致，actor 为城南应收负责人 |
| 详情 questions[0].isClosed | false（回复不自动关闭） |
| 回查 fee_verification_action | 新增 REPLY 行且 question_action_id="qa-rec-06"；qa-rec-06 的 is_closed 仍为 0 |
| 回查 work_item | assignee_identity_id 交回京东对账员 id-jd-recon-01 |

### TC-REC-07：核实事实登记（成功关闭问题组；拒绝 reconciled=true）

> PRD：`06-subprd-reconciliation.md` §7 验收#11
> 目标：验证 FACT 保存并按依据关闭指定问题组；接口拒绝 reconciled=true
> 执行方式：curl + SQL 回查
> 数据准备/清理：执行 [sql/TC-REC-07.sql](sql/TC-REC-07.sql) 对应段（含开放问题 qa-rec-07）

**步骤**：
1. `curl -X POST ".../work-items/wi-rec-01/billing-facts" ... -d '{"expectedWorkItemVersion":<读取值>,"expectedResponsibilityVersion":<读取值>,"reconciliationId":"rr-rec-07","facts":[{"groupId":"g2","description":"条款确认基础安装含 30 米内搬运，批准记录 APR-YQ-001 仅批准 280.00","evidenceRefs":["fbr-rec-term-01","fbr-rec-appr-01"]}],"questionActionId":"qa-rec-07"}'`
2. 同接口正文增加 `"reconciled":true` 重新提交（换新 Idempotency-Key）
3. SQL 回查

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤1 HTTP / data.status | 200 / "APPLIED"（仅代表事实已保存） |
| 回查 fee_verification_action | 新增 FACT 行 question_action_id="qa-rec-07"；qa-rec-07 变为 is_closed=1、closed_by_kind="HUMAN_FACT"、closed_by_id=该 FACT 行 id、close_basis_json 非空 |
| 步骤2 HTTP 状态码 | 400，data=null；具体 code（40001/40002）[待确认-需产品明确] |
| 步骤2 回查 | 无第二条 FACT 落库；reconciliation_record 无任何变化 |

### TC-REC-08：跨服务商越权被拒

> PRD：`06-subprd-reconciliation.md` §7 验收#13
> 目标：验证城南应收负责人对远程机电事项（wi-rec-02）的读取与回复被拒，不返回资源细节、写入无状态变化
> 执行方式：curl + SQL 回查
> 数据准备/清理：执行 [sql/TC-REC-08.sql](sql/TC-REC-08.sql) 对应段

**步骤**：
1. `curl ".../work-items/wi-rec-02/reconciliation" -H "Authorization: Bearer <城南应收负责人>"`
2. `curl -X POST ".../work-items/wi-rec-02/billing-replies" ... -d '{"expectedWorkItemVersion":1,"expectedResponsibilityVersion":1,"requestDecisionId":"hd-rec-08-q","replyText":"越权回复","materialVersionIds":[]}'`
3. SQL 回查 fee_verification_action

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤1 | HTTP 404，code=40404，data=null，无金额/分组等资源细节 |
| 步骤2 | HTTP 403 code=40301 或 HTTP 404 code=40404（PRD §7#13 原文允许两者），data=null |
| 回查 | wi-rec-02 下无新增 REPLY 行；qa-rec-08 is_closed 仍为 0；wi-rec-02 的 row_version/responsibility_version 不变 |

### TC-REC-09：幂等与版本保护

> PRD：`06-subprd-reconciliation.md` §7 验收#14、#8
> 目标：验证同 Idempotency-Key 同内容返回原结果不重复保存、同键不同内容 40902、旧 reconciliationId 40901
> 执行方式：curl + SQL 回查
> 数据准备/清理：执行 [sql/TC-REC-09.sql](sql/TC-REC-09.sql) 对应段（当前比较 rr-rec-09，旧比较 rr-rec-09-old）

**步骤**：
1. POST billing-questions（Key=tc-rec-09-k1，reconciliationId="rr-rec-09"）→ 记录响应 r1
2. 同 Key 同内容重发 → 响应 r2
3. 同 Key 不同内容（改 question 文本）→ 响应 r3
4. 换新 Key，reconciliationId 改为 "rr-rec-09-old" → 响应 r4
5. SQL 回查 fee_verification_action

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| r1 | 200 / "APPLIED"，questionActionId 非空 |
| r2 | 200，decisionId 与 questionActionId 与 r1 完全相同 |
| r3 | HTTP 409，code=40902，data=null |
| r4 | HTTP 409，code=40901，data=null |
| 回查 | rr-rec-09 下 QUESTION 行仅 1 条（r3/r4 均未落库） |

---

## 四、UI 验证用例

> 页面路由：列表 `#billing`，对账差异详情 `#task/billing`（wi-rec-01），服务商原应收视图为城南应收负责人身份登录后的应收视图。

### TC-REC-11：分组对照渲染

> PRD：`06-subprd-reconciliation.md` §7 验收#1
> 目标：验证双方原分项名称/数量/单位/单价/金额原样展示，同名行不合并
> 执行方式：浏览器 UI
> 数据准备/清理：执行 [sql/TC-REC-11.sql](sql/TC-REC-11.sql) 对应段

**步骤**：1. 京东对账员打开 `#task/billing`（wi-rec-01）

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 头部 | 京东 1280.00、服务商 1360.00、差额 80.00（红色） |
| 组1 | 京东行"基础安装费 1 项 1000.00=1000.00"，服务商行同值，组差额 0 |
| 组2 | 京东行"材料搬运费 2 次 140.00=280.00"与服务商行"材料搬运费 2 次 180.00=360.00"两行独立展示，不合并为一行；组差额 80.00 |
| 对应依据列 | g1/g2 显示已确认对应关系（mappingBasis），无 null 时显示占位不补值 |

### TC-REC-12：缺项如实呈现

> PRD：`06-subprd-reconciliation.md` §7 验收#2
> 目标：验证应收未读到、批准未查全时逐条列出缺项，金额 null 占位，不填零、不写成"未批准"
> 执行方式：浏览器 UI
> 数据准备/清理：执行 [sql/TC-REC-12.sql](sql/TC-REC-12.sql) 对应段

**步骤**：1. 打开 `#task/billing`（wi-rec-01）

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 状态标签 | "待补充信息" |
| 头部 | 服务商金额、差额、币种显示 null 占位，不出现 "0.00" |
| 缺项区 | 两条缺项："服务商应收尚未取得""费用批准记录查询未覆盖全部范围，批准情况尚未核实"；不出现"未批准"字样、不把应收按零金额展示 |
| 分组区 | 仅京东分项展示，服务商列为 null 占位 |

### TC-REC-13：单边项目保留

> PRD：`06-subprd-reconciliation.md` §7 验收#3
> 目标：验证仅服务商一侧的分项单独呈现为未匹配项，不强行配对、不改写为同名项目
> 执行方式：浏览器 UI
> 数据准备/清理：执行 [sql/TC-REC-13.sql](sql/TC-REC-13.sql) 对应段

**步骤**：1. 打开 `#task/billing`（wi-rec-01）

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 组3 | "远程上门费 80.00" 单独呈现为未匹配项，京东侧为 null 占位，不与任何京东行配对 |
| 项目名称 | 保持"远程上门费"原文，未被改写或并入其他组 |
| 头部差额 | 80.00（与组3差额一致） |

### TC-REC-14：Skill 解释与程序金额分离

> PRD：`06-subprd-reconciliation.md` §7 验收#4
> 目标：验证 AI 解释失败/未完成时保留程序比较结果与真实进度，旧比较的解释不冒充新版
> 执行方式：浏览器 UI
> 数据准备/清理：执行 [sql/TC-REC-14.sql](sql/TC-REC-14.sql) 对应段（当前比较 rr-rec-14 无解释；旧比较 rr-rec-14-old 有旧解释）

**步骤**：1. 打开 `#task/billing`（wi-rec-01）

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 程序比较区 | 正常展示差额 80.00、g2 差额与缺项，不因解释缺失隐藏 |
| Skill 差异解释区 | 展示解释生成失败/进行中的真实进度占位；不出现旧解释文本"旧解释：差额 100.00 待核实" |
| 头部差额 | 80.00（非旧比较的 100.00） |

### TC-REC-15：核实往来留痕

> PRD：`06-subprd-reconciliation.md` §7 验收#5
> 目标：验证问题组按时间展示一次提问、两次回复、一次事实，保留提问人/回复人与各自所见比较版本
> 执行方式：浏览器 UI
> 数据准备/清理：执行 [sql/TC-REC-15.sql](sql/TC-REC-15.sql) 对应段

**步骤**：1. 打开 `#task/billing`（wi-rec-01），查看核实往来区

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 问题组 | 提问"材料搬运费 80.00 差额的计费依据是什么？"，提问人 id-jd-recon-01，所见比较 rr-rec-15a |
| 回复 | 两条按时间排列：r1（rr-rec-15a，"搬运超出 30 米…"）、r2（rr-rec-15b，含材料版本 mv-rec-15-01），回复人 id-pv-recon-01 |
| 事实 | 一条事实（条款与 APR-YQ-001 依据），登记人 id-jd-recon-01 |
| isClosed | 已关闭，关闭依据显示为该事实（HUMAN_FACT） |

### TC-REC-16：核对一致口径提示

> PRD：`06-subprd-reconciliation.md` §7 验收#6
> 目标：验证双方总额相同但存在未决分项争议时状态仍为有差异，且不出现结算/付款入口
> 执行方式：浏览器 UI
> 数据准备/清理：执行 [sql/TC-REC-16.sql](sql/TC-REC-16.sql) 对应段

**步骤**：1. 打开 `#task/billing`（wi-rec-01）

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 状态标签 | "有差异"（头部差额显示 0，但状态不是"核对一致"） |
| 分组区 | g2 +80.00 与 g3 -80.00 差异均展示 |
| 操作区 | 无"结算""付款""费用批准"任何入口按钮；存在"发起核实问题""登记核实事实"入口 |
| 往来区 | 开放问题 qa-rec-16 显示未关闭 |

### TC-REC-17：服务商原应收视图

> PRD：`06-subprd-reconciliation.md` §3.5（需求 R5）
> 目标：验证服务商应收负责人视图展示本方原应收分项、来源版本与待回复问题，不提供改账入口
> 执行方式：浏览器 UI
> 数据准备/清理：执行 [sql/TC-REC-17.sql](sql/TC-REC-17.sql) 对应段

**步骤**：1. 城南应收负责人登录，打开服务商原应收视图

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 本方原应收 | 分项"基础安装费 1000.00""材料搬运费 360.00"，来源版本 v2026-08-31，来源编号 AR-CN-2026-08-01 |
| 待回复问题区 | 显示 qa-rec-17 的问题原文与提问人 |
| 改账入口 | 无"修改京东账单""代改应收"任何入口；仅提示修订在服务商原系统办理 |
| 口径提示 | 应收展示不标注为"京东已认可应付" |

### TC-REC-18：应收修订后打开旧问题

> PRD：`06-subprd-reconciliation.md` §7 验收#10、§3.5
> 目标：验证人员打开旧比较上的问题时提示已有新比较、保留草稿、问题不改挂新版
> 执行方式：浏览器 UI
> 数据准备/清理：执行 [sql/TC-REC-18.sql](sql/TC-REC-18.sql) 对应段（qa-rec-18 挂 rr-rec-18a；当前比较 rr-rec-18b MATCHED）

**步骤**：1. 京东对账员打开 `#task/billing`（wi-rec-01）→ 进入核实往来区打开问题 qa-rec-18，在回复/备注草稿框输入"跟进中"不提交 → 切换查看新比较后返回

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 变化提示 | 打开问题时展示"已有新比较"提示（新比较 rr-rec-18b 核对一致） |
| 问题归属 | 问题详情仍显示所见比较为 rr-rec-18a，未被改挂到 rr-rec-18b |
| 草稿 | 输入的"跟进中"保留，未被清空 |
| 历史 | 旧比较 rr-rec-18a 的差额 80.00 与问题原文仍可查看 |

### TC-REC-19：列表摘要

> PRD：`06-subprd-reconciliation.md` §7 补充验收
> 目标：验证列表一次请求显示差额、摘要与详情一致、PREPARING 显示 null、无账单权限不泄露
> 执行方式：浏览器 UI（开发者工具网络面板）
> 数据准备/清理：执行 [sql/TC-REC-19.sql](sql/TC-REC-19.sql) 对应段

**步骤**：
1. 京东对账员（全权限）打开 `#billing`，观察网络面板与列表行
2. 点击云栖苑行进入详情，比对金额
3. 切换为仅有 READ_WORK_ITEM（无 READ_BILLING_RECORD）的身份重新打开 `#billing`

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤1 网络 | 仅 1 次 `GET /api/admin/charging/work-items?kind=RECONCILIATION` 请求，无逐行 reconciliation 详情请求 |
| 步骤1 行展示 | 云栖苑行"有差异 +80.00"（差额红色）；江畔里行"待补充信息"，差额为 null 占位（不显示旧差额、不填零） |
| 步骤2 | 详情 jdTotal/providerTotal/difference 与列表摘要完全一致（1280.00/1360.00/80.00），视图状态一致 |
| 步骤3 | 行 reconciliationSummary 为 null 且 access="FORBIDDEN"；页面不显示任何金额、不显示 0 |
