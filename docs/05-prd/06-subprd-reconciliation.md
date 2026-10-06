# PRD：业务对账

> 状态：草稿｜基线版本：v1.0｜最后更新：2026-09-20
> 上游（我引用）：[mainprd-jd-charging.md](mainprd-jd-charging.md) §五、§七、[术语表](../03-foundation/03-01-glossary/glossary.md) §1、§3、§5、[双方账单与对账依据域表结构](../03-foundation/03-05-schema/reconciliation-schema.md) §1—7 `billing_document` / `fee_basis_record` / `reconciliation_record` / `reconciliation_analysis_link` / `fee_verification_action` 表、[业务对账接口](../03-foundation/03-06-provided-apis/reconciliation-apis.md) §1—3、[接口公共约定](../03-foundation/03-06-provided-apis/common-contract.md) §1—5、[业务对账流程](../03-foundation/03-04-business-flows/flow-reconciliation.md) §1—7、[对账差异解释 Skill](../04-skills/billing-diff-explainer/SKILL.md) §1—3、[原型页面清单](../02-prototype/page-list.md) §1、[原型交互说明](../02-prototype/interaction-spec.md) §1—3、[运行数据规则](../../rules/runtime-mock-data.md) §1—4、[workbench-apis](../03-foundation/03-06-provided-apis/workbench-apis.md) §7.2
> 下游（引用我）：[mainprd-jd-charging.md](mainprd-jd-charging.md) §七；[tc-recon.md](../06-testcase/recon/tc-recon.md) 验收矩阵；开发计划引用见本关联块；[mock T4.2子计划](../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T4.2-business-integration.md) PRD双链·读
>
> ⚠️ 本文档描述的是目标态。与代码现状有出入时，以真实代码为准，按本文档的目标态补齐。

---

## §1 文档范围

本文档覆盖**业务对账**功能块：京东业务对账人员的对账列表与差异详情（对账分组、双方原分项对照、程序计算的差额、Skill 差异解释及适用依据、缺项如实列出）、向服务商发起核实问题、服务商应收负责人回复核实问题、按原职责修订本方原应收、核实事实登记与核对一致判定。

不含：财务结算、付款执行、费用批准、代改任何一方账单。服务商应收由服务商应收负责人按原职责维护，不能视为京东已认可的应付；本功能不由 AI 自动批准费用、修改真实账单或执行付款。

账号划分为京东业务账号与每家公司一个服务商账号。服务商账号同时承担本公司的资料、配置与对账回复职责，对账问题交给该公司账号处理，跨公司访问与回复均被拒绝。

### 需求清单

| # | 需求 | 需求简述 | 对应章节 |
|---|------|---------|---------|
| R1 | 对账列表展示 | 展示当前身份可见的对账事项及其对账视图状态 | §3.1 |
| R2 | 差异详情呈现 | 分组展示双方原分项、程序差额、Skill 解释与缺项 | §3.2 |
| R3 | 发起核实问题 | 京东对账人员按组或范围缺失批量提问并交接 | §3.3 |
| R4 | 服务商回复核实 | 应收负责人回复问题并附材料，回复不关闭问题 | §3.4 |
| R5 | 服务商原应收视图 | 展示本方原应收及修订版本取得情况，不提供改账 | §3.5 |
| R6 | 核实事实登记 | 京东登记有依据的核实事实，按依据关闭问题组 | §3.6 |
| R7 | 核对一致判定 | 按契约口径判定 RECONCILED，总额相同不足以掩盖分项差异 | §3.6 |

---

## §2 页面布局

本功能块涉及三个视图，整页布局见 mainprd §五。侧栏仅保留一个“业务对账”入口；列表按工单展示对账事项，双方账单在详情中对照，不拆出内容重复的“对账工单 / 对账账单”列表。

```
┌──────────────────────────────────────────┐
│ 视图一：业务对账列表（#billing）            │  ← §3.1
│    ├ 筛选区与对账表格                      │
│    └ 空态 / 分页                           │
├──────────────────────────────────────────┤
│ 视图二：对账差异详情（#task/billing）       │  ← §3.2—§3.3、§3.6
│    ├ 头部：双方总额与工单差额               │
│    ├ 对账分组区：双方原分项对照 + 差额      │
│    ├ Skill 差异解释区                      │
│    ├ 缺项区                                │
│    ├ 核实往来区（问题 / 回复 / 事实）       │
│    └ 操作区：发起核实问题、登记核实事实     │
├──────────────────────────────────────────┤
│ 视图三：服务商原应收（城南应收负责人身份）   │  ← §3.4—§3.5
│    ├ 待回复问题区                           │
│    ├ 本方原应收分项与版本                   │
│    └ 修订进展提示（等新版取得）             │
└──────────────────────────────────────────┘
```

**联动规则**：发起核实、回复、登记事实成功后，详情与待处理事项列表同时更新，先骨架屏后替换渲染；服务商在原系统修订应收并被可靠取得后，工作台准备新的比较，人员打开原问题时提示变化。

---

## §3 区块详述

### 3.1 业务对账列表区

**数据来源**：列表一次请求 `GET /api/admin/charging/work-items?kind=RECONCILIATION`，使用每行 reconciliationSummary / reconciliationSummaryAccess，完整契约见工作台接口 §7.2。服务端批量关联当前有效比较；浏览器不逐行请求详情，不传身份参数。点击单行后才调用 reconciliation 详情接口。

**布局**：标准表格，列为工单编号、服务商、处理状态、对账结果、京东金额、服务商应收、差额、责任人、更新时间、操作。金额按币种、千分位与两位小数展示，右对齐；非零差额标红，未知金额显示“—”。服务商名称缺失时显示编号。

**交互**：

- 按责任范围、处理状态、服务商及关键词筛选，关键词匹配工单编号或服务商名称；查询与重置返回第一页。
- 每页支持 10 / 20 / 50 条，展示总数、当前范围、页码与上一页/下一页；刷新保留当前筛选。
- 点击工单编号或“查看详情”进入对账差异详情；列表按服务端返回顺序展示。
- 无数据展示“暂无对账事项”；筛选无结果展示“没有符合筛选条件的记录”，提供清除筛选。
- 窄屏时筛选控件换行、表格横向滚动，操作列固定在右侧；输入框、选择框与查询按钮等高。

**前端职责**：分别展示处理状态、比较状态与金额，不从总额相同推断核对一致。比较记录未取得时显示“比较准备中”；没有账单权限时隐藏金额并标明“无账单权限”。查询和刷新只读取已有数据，不触发分析。

### 3.2 对账差异详情区

**数据来源**：`GET /api/admin/charging/work-items/{workItemId}/reconciliation` 返回的 `reconciliationId` / `jdTotal` / `providerTotal` / `difference` / `groups` / `openIssues` / `analysisResultId` / `questions`。

**头部**：双方目标工单金额与 `difference`（程序按服务商减京东计算的同范围差额）；尚无可靠计算时编号、金额及币种为 null，前端如实显示"尚未取得可靠计算"，不填零。

**对账分组区**：按 `groups[]` 逐组渲染。

| 列 | 内容 |
|------|------|
| 京东原分项 | 名称、数量、单位、单价、金额，未知显示 null 占位，不补值 |
| 服务商原分项 | 同上；单边项目单独呈现，不强行配对 |
| 组差额 | `jdAmount` / `providerAmount` / `difference` 直透，程序计算，前端不算 |
| 对应依据 | `matchBasis` 保留已确认对应关系及 `evidenceRefs` |

原分项不得被改写成同名项目；左右账单同名行不因此合并。

**Skill 差异解释区**：展示对账差异解释 Skill 形成的解释及适用依据（条款原文位置、费用批准记录查询结果）。金额由程序计算，Skill 只解释差异与依据，不改账、不给出扣减或结算结论。AI 解释失败或尚无解释时，保留程序比较结果并展示真实进度，不用旧解释冒充新版。

**缺项区**：`openIssues` 逐条如实列出缺项、差异、范围冲突和业务争议；账单读取失败、依据未查全时显示"尚未核实"，不把未读到应收按零金额处理、不把未查到写成未批准。

### 3.3 发起核实问题

**操作**：京东业务对账人员在分组上发起核实，填写具体问题与依据引用，可批量提问（一次形成一个 QUESTION 组），也可就范围缺失提问（`groupId` 为 null）。

**约束**：
- 发起接口为 `POST /api/admin/charging/work-items/{workItemId}/billing-questions`，`reconciliationId` 必须是当前比较记录
- 服务端核实 REQUEST_BILLING_VERIFICATION 权限与当前对账责任后保存，交接当前具体应收负责人；无法核实接收人时保留待分配，不新建全员审批
- 提交成功（200 / APPLIED）后页面刷新往来区与责任人；409 版本冲突时保留输入，重读最新版本后重新确认

### 3.4 服务商回复核实问题

**操作**：服务商应收负责人在服务商原应收视图或详情中查看待回复问题，针对原问题组回复具体事实与适用依据，可附材料版本。

**约束**：
- 回复接口为 `POST /api/admin/charging/work-items/{workItemId}/billing-replies`，`requestDecisionId` 唯一定位本事项仍有效的 QUESTION 组
- 需 REPLY_BILLING_VERIFICATION 权限与当前应收责任；回复不自动关闭问题组
- 一次问题可保留多次实际回复；重复提交同一次回复不多记一条；已关闭问题不接受新回复
- 回复"已修改"不能代替实际新版应收

### 3.5 服务商原应收视图

**内容**：本方原应收分项、来源版本与当前核实问题；修订已被可靠取得时展示修订版本与新版比较进展。

**约束**：
- 服务商应收由服务商应收负责人按原职责维护，不能视为京东已认可的应付
- 工作台不提供修改京东账单或代服务商改账接口；修订在服务商原系统按既有权限办理，后台通过模拟或真实来源读取新版
- 服务商修订不改变京东账单；京东侧修订按京东原职责处理，独立读取其新版
- 版本字符串只判等，不按数字或字母排序推断新旧；人员打开旧问题时若已有新比较，提示变化并保留草稿，不把旧问题改挂新版

### 3.6 核实事实登记与核对一致判定

**操作**：京东业务对账人员对已有依据可解决的疑点登记核实事实。

**约束**：
- 登记接口为 `POST /api/admin/charging/work-items/{workItemId}/billing-facts`，必填 `reconciliationId` 与非空 `facts[]`，事实必须有可核实依据
- 接口不接受 `reconciled=true` 或人工覆盖差额；可空 `questionActionId` 指定针对的问题组，为空时保存独立事实，只能通过后续比较依据关闭问题；禁止用同一事实关闭多组
- 返回 200 的 APPLIED 只代表事实已保存；完成状态通过详情读取

**核对一致判定口径**：MATCHED 要求完整快照、双方已知来源版本、两侧记录、非空且全部一致的比较组、可比金额、规范零差额、空未决问题及八项核对检查全部为 true，且仅在当前比较仍有效且全部问题有关闭依据时视图映射为 RECONCILED。总额相同不足以掩盖分项差异；核对一致不表示已结算或已付款，不生成结算、付款或费用批准记录。差异有合理解释但双方金额仍不同，不标为核对一致，不得为消除差额强制任何一方改账。

### 3.7 数据链路

> 端到端追踪：UI 元素 ← API 字段 ← 数据源。字段完整定义见接口文档与表结构，这里只写本区域用到的。

| UI 元素 | API 字段 | 计算规则 | 数据源 |
|---------|----------|---------|--------|
| 对账视图状态 | `status` | 后端按固定比较记录映射 PREPARING / NEEDS_INFORMATION / DIFFERENT / RECONCILED | `reconciliation_record.status` |
| 列表差额与对账状态 | `reconciliationSummary.difference / status`、`reconciliationSummaryAccess` | 与详情共用当前比较及问题关闭映射；无权null，不可比null，不填0 | `work_item.current_reconciliation_id` → `reconciliation_record` |
| 双方总额与工单差额 | `jdTotal` / `providerTotal` / `difference` | 程序十进制计算，服务商减京东；未知为 null，零规范为字符串 "0" | `reconciliation_record.jd_amount` / `provider_amount` / `difference_amount` |
| 分组对照 | `groups[].jdItems` / `providerItems` / `jdAmount` / `providerAmount` / `difference` | 原分项直透；组差额为组内服务商合计减京东合计，每个原分项只计入一次 | `reconciliation_record.groups_json` |
| 对应依据 | `groups[].matchBasis` / `evidenceRefs` | 保留已确认对应关系，未知为 null | `reconciliation_record.groups_json.mappingBasis` |
| Skill 解释 | `analysisResultId` | 同事项、同输入快照且唯一归属本次比较的解释 | `reconciliation_analysis_link` → `analysis_result` |
| 缺项 | `openIssues` | 如实呈现缺项、差异、范围冲突与争议 | `reconciliation_record.open_issues_json` |
| 核实往来 | `questions[].items` / `replies` / `isClosed` | 按问题组返回，保留各次历史回复；isClosed 来自实际关闭依据 | `human_decision` + `fee_verification_action` |
| 应收修订版本 | 详情内账单来源与版本 | 版本只判等，不排序推断新旧 | `billing_document` + 固定输入分项 |

### 3.8 异常与兜底

**服务端兜底**：接口异常按统一返回壳返回错误码，前端按下表执行渲染兜底。

| 场景 | 处理 |
|------|------|
| 尚无可靠比较（PREPARING） | 金额与币种显示 null 占位，缺项说明展示，不填零 |
| 依据未查全 / 账单读取失败 | 显示查询范围与缺项，暂停依赖结论，不写成"未批准"或"零金额" |
| AI 解释失败 | 保留程序比较结果与真实进度，旧解释不冒充新版 |
| 40901 版本冲突 | 保留输入，重读最新版本后重新确认 |
| 40902 幂等冲突 | 拒绝并提示，禁止改键绕过 |
| 40903 已有未决写入 | 返回原操作入口，继续查原结果 |
| 42201 缺账单或依据 | 展示缺项说明，不造值 |
| 40301 无权限 / 跨服务商 | 停止动作，提示无权限，不隐藏为成功 |
| 40404 资源不存在或不可见 | 提示无法查看，不返回资源细节 |
| 接口超时 / 结果未知 | 展示真实状态，写请求按原键回查确定结果，不盲目重发 |

---

## §4 本区域使用的数据字段

| 表名 | 状态 | 本区域使用字段 | 完整定义 |
|------|------|--------------|----------|
| `reconciliation_record` | 候选 | `status`、`currency`、`jd_amount`、`provider_amount`、`difference_amount`、`groups_json`、`basis_lookup_json`、`checks_json`、`open_issues_json`、`snapshot_id` | [reconciliation-schema.md](../03-foundation/03-05-schema/reconciliation-schema.md) §2 |
| `billing_document` | 候选 | `side`、`source_system`、`source_id`、`service_provider_id` | 同上 §2 |
| `fee_basis_record` | 候选 | `record_kind`、`source_system`、`source_id` | 同上 §2 |
| `reconciliation_analysis_link` | 候选 | `reconciliation_id`、`analysis_result_id` | 同上 §2 |
| `fee_verification_action` | 候选 | `action_kind`、`question_action_id`、`is_closed`、`closed_by_kind`、`close_basis_json` | 同上 §2 |
| `human_decision` | 候选 | `content_json`（REQUEST_FEE_VERIFICATION / REPLY_FEE_VERIFICATION / RECORD_FEE_FACTS） | [work-item-schema.md](../03-foundation/03-05-schema/work-item-schema.md) |

金额字段为 TEXT 十进制字符串，保留原精度与正负方向；前端不做金额加减，差额均由服务端程序计算。

---

## §5 接口契约

### `GET /api/admin/charging/work-items/{workItemId}/reconciliation`

> 完整契约见 [reconciliation-apis.md](../03-foundation/03-06-provided-apis/reconciliation-apis.md) §1，这里只写本区域的业务说明。

- **权限**：需 READ_WORK_ITEM、双方完整记录对应的 READ_BILLING_RECORD 及读取依据所需权限；不可见编号与不存在编号统一 404
- **本区域使用的响应字段**：`reconciliationId` / `inputSnapshotId` / `status` / `currency` / `jdTotal` / `providerTotal` / `difference` / `groups` / `openIssues` / `analysisResultId` / `questions` / `rowVersion`（见 §3.7）
- **前端额外计算**：仅格式化金额与时间显示，不做差额计算与状态判断
- 这里的 `status` 是对账视图状态，与 `work_item.status` 的事项整体进展不得混用

### `POST /api/admin/charging/work-items/{workItemId}/billing-questions`

> 完整契约见 [reconciliation-apis.md](../03-foundation/03-06-provided-apis/reconciliation-apis.md) §2。

- **请求参数来源**：`DecisionInput`（`expectedWorkItemVersion` / `expectedResponsibilityVersion` / `comment`）加 `reconciliationId`、非空 `questions[]`（`groupId` 可 null）；Header `Idempotency-Key` 非空
- **权限**：REQUEST_BILLING_VERIFICATION 与当前对账责任
- **成功返回**：公共 200 增加 `questionActionId`；交接当前具体应收负责人，无法核实接收人时保留待分配

### `POST /api/admin/charging/work-items/{workItemId}/billing-replies`

> 完整契约见 [reconciliation-apis.md](../03-foundation/03-06-provided-apis/reconciliation-apis.md) §2。

- **请求参数来源**：`DecisionInput` 加非空 `requestDecisionId`、`replyText`，`materialVersionIds` 为 string[] 可为空
- **权限**：REPLY_BILLING_VERIFICATION 与当前应收责任；`requestDecisionId` 必须定位本事项仍有效的 QUESTION 组
- 回复不自动关闭问题组；保存后交回原对账责任并安排必要重读/重新分析

### `POST /api/admin/charging/work-items/{workItemId}/billing-facts`

> 完整契约见 [reconciliation-apis.md](../03-foundation/03-06-provided-apis/reconciliation-apis.md) §3。

- **请求参数来源**：`DecisionInput` 加必填 `reconciliationId`、非空 `facts[]`（`groupId` / `description` / `evidenceRefs`），可空 `questionActionId`
- **权限**：REQUEST_BILLING_VERIFICATION 与当前对账责任
- 接口不接受 `reconciled=true` 或人工覆盖差额；旧比较版本、责任变化、未决冲突按公共 409；缺账单或依据返回 422；没有"强制对账完成"接口

---

## §6 管理台配置

本功能块无管理端可配项。硬编码项：空态文案、骨架屏样式、状态标签文案——不可配。判定口径（核对一致条件、差额方向、版本判等）为契约固定规则，不开放配置。

---

## §7 验收标准

### 区块展示

| # | 场景 | 输入条件 | 预期结果 |
|---|------|---------|----------|
| 1 | 分组对照渲染 | 详情返回 2 个含双方分项的比较组 | 双方原分项名称、数量、单位、单价、金额原样展示，同名行不合并 |
| 2 | 缺项如实呈现 | 服务商应收未读到、批准记录未查全 | openIssues 逐条列出缺项，金额显示 null 占位，不填零、不写成"未批准" |
| 3 | 单边项目保留 | 存在仅服务商一侧的分项 | 单独呈现为未匹配项，不强行配对、不改写为同名项目 |
| 4 | Skill 解释与程序金额分离 | 有比较结果、AI 解释失败 | 展示程序差额与缺项及解释失败的真实进度，旧解释不冒充新版 |
| 5 | 核实往来留痕 | 一次提问、两次回复、一次事实登记 | 问题组按时间展示各次回复与事实，保留提问人、回复人与各自所见比较版本 |
| 6 | 核对一致口径提示 | 双方总额相同但存在未决分项争议 | 状态仍为 DIFFERENT / NEEDS_INFORMATION，不展示核对一致；核对一致时不出现结算或付款入口 |

### 数据与接口

| # | 场景 | 输入条件 | 预期结果 |
|---|------|---------|----------|
| 7 | 读取对账结果 | 有效身份与 READ_BILLING_RECORD | 返回契约字段，金额十进制字符串；尚无可靠计算时金额与币种为 null、groups=[] |
| 8 | 发起核实问题 | 京东对账责任、当前 reconciliationId、非空 questions | 200 返回 questionActionId，事项交接当前应收负责人；旧 reconciliationId 返回 40901 |
| 9 | 服务商回复 | 应收责任、有效 requestDecisionId | 回复保存在原问题组下，isClosed 不变，事项交回京东对账责任 |
| 10 | 应收修订产生新版本且不改对方账单 | 服务商原系统修订应收并被可靠取得 | 形成新版应收输入并触发新比较，京东账单与旧版应收历史保持不变；回复"已修改"不产生新版本 |
| 11 | 核实事实登记 | 非空 facts、可核实依据、指定开放问题组 | FACT 保存并按依据关闭该问题组；同一 FACT 不能关闭多组，接口拒绝 reconciled=true |
| 12 | 核对一致判定 | 分项全部一致、八项核对检查为 true、无未决问题 | 视图映射 RECONCILED；总额相同但分项有差异时不判定一致，且不生成结算、付款或费用批准记录 |
| 13 | 跨服务商越权被拒 | 城南应收负责人请求其他服务商事项的回复或读取 | 40301 或 40404，不返回资源细节，写入不产生状态变化 |
| 14 | 幂等与版本保护 | 同 Idempotency-Key 同内容重发 / 不同内容 | 前者返回原结果不重复保存，后者 40902；40901 时前端保留输入并重读 |

### 补充验收：列表摘要

列表有多条对账事项时，浏览器只发一次分页列表请求即可显示有权查看的差额，不逐条请求详情。同一 reconciliationId/inputSnapshotId 的摘要与详情金额、视图状态完全一致；输入变更使旧指针失效后显示 PREPARING 与null，不显示旧差额；AI解释失败仍可显示有效程序比较。READ_WORK_ITEM 不含双方账单权限时摘要为null且 access=FORBIDDEN；不得泄露金额或填零。总额差额为“0”但分项或问题未核对完整时仍不显示RECONCILED。


## 2026-09-27 当前演示要求

完整逐项比较一致时不调用 AI，显示程序核对一致；金额总数相等不足以跳过分项检查。正常数量、单价差异在分析完成后可进入待确认，供京东发起核实。待核实与模型执行失败分别显示，缺少合同、范围未知或金额校验错误须说明具体原因。解释使用业务名称、双方值、依据和下一步，系统字段与内部状态码不直接充当业务说明。
