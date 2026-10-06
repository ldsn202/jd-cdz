# PRD：履约协同与异常

> 基线版本：v1.0｜最后更新：2026-09-20｜状态：草稿
> 上游（我引用）：[mainprd-jd-charging.md](mainprd-jd-charging.md) §五、§七、[术语表](../03-foundation/03-01-glossary/glossary.md) §1「处理事项 / 人工决定 / 处理记录 / 本环节完成」、§3「京东物流履约协同人员」、[履约协同与共用异常接口](../03-foundation/03-06-provided-apis/coordination-apis.md) §1—4、[公共约定](../03-foundation/03-06-provided-apis/common-contract.md) §2—4、[工作台查询接口](../03-foundation/03-06-provided-apis/workbench-apis.md) §3—4、[处理事项域表结构](../03-foundation/03-05-schema/work-item-schema.md) §3—7 `work_item` / `human_decision` / `activity_record` / `work_item_link`、[履约协同与共用异常流程](../03-foundation/03-04-business-flows/flow-coordination-exceptions.md) §1—5、[原型页面清单](../02-prototype/page-list.md) §1—2、[原型交互说明](../02-prototype/interaction-spec.md) §1—3、[运行数据规则](../../rules/runtime-mock-data.md) §2、§4
> 下游（引用我）：[mainprd-jd-charging.md](mainprd-jd-charging.md) §七；[tc-coord.md](../06-testcase/coord/tc-coord.md) 验收矩阵；开发计划待建立后登记

> ⚠️ 本文档描述的是目标态。与代码现状有出入时，以真实代码为准，按本文档的目标态补齐。

---

## §1 文档范围

本文档覆盖**履约协同与异常**：京东物流履约协同人员处理协同事项——查看影响安装履约的问题与系统整理的协同信息、多次保存进展、完成协同；各业务事项转异常登记、异常处理完成、异常关闭后继续办理原业务；停止无需继续的事项。

不含：安装资料审核与费用核实（履约协同不自动承担这些职责，分别见 05-subprd、06-subprd）；后台失败恢复与技术异常处理（见系统流程文档）。

### 需求清单

| # | 需求 | 需求简述 | 对应章节 |
|---|------|---------|---------|
| R1 | 协同问题展示 | 展示阻碍内容、关联工单、已知进展与系统整理结果 | §3.1 |
| R2 | 保存进展 | 多次保存处理进展并留痕，事项不因此完成 | §3.2 |
| R3 | 完成协同 | 确认阻碍已解决后完成本次协同，保留具体完成原因 | §3.3 |
| R4 | 异常登记 | 原事项责任人登记业务异常，保留原问题与依据 | §3.4 |
| R5 | 异常处理完成 | 记录处置结果并关闭异常，接续未完成的原业务 | §3.4 |
| R6 | 原业务接续入口 | 关闭后显示「继续办理原业务」，可回看异常结果 | §3.4 |
| R7 | 停止决定 | 核实真实来源依据后停止无需继续的事项 | §3.5 |

---

## §2 页面布局

本功能块落在**履约协同详情页**（原型基线 `#task/coordination`，澜山府示例）；异常视图复用各业务事项详情页同一框架。整页布局见 mainprd §五。

```
┌──────────────────────────────────┐
│ A. 事项头（标题 / 工单 / 状态）      │  ← 本页各区块共用
├──────────────────────────────────┤
│ B. 协同问题与系统整理信息           │  ← 本文档 §3.1
├──────────────────────────────────┤
│ C. 进展记录时间线                  │  ← 本文档 §3.2
├──────────────────────────────────┤
│ D. 操作区                         │  ← 本文档 §3.2—3.5
│    ├ 保存进展，继续处理             │
│    ├ 完成本次协同                  │
│    ├ 登记异常 / 异常处理完成         │
│    └ 停止该事项                    │
├──────────────────────────────────┤
│ E. 异常关闭结果区（仅关闭后）        │  ← 本文档 §3.4
│    ├ 「继续办理原业务」链接          │
│    └ 「回看异常结果」链接            │
└──────────────────────────────────┘
```

**联动规则**：保存进展、完成协同、关闭异常或停止成功后，本页详情、待处理事项列表与状态汇总同时更新，先骨架屏后替换渲染。异常关闭接续的事项沿用 `#task/<事项标识>` 路由，不新建页面类型。

---

## §3 区块详述

### 3.1 协同问题与系统整理信息

**数据来源**：`GET /api/admin/charging/work-items/{workItemId}` 返回的事项详情（`title` / `workOrderId` / `status` / `analysis` / `blockedReasons` / `relatedItems`）。

**展示内容**：

| 区块 | 内容 |
|------|------|
| 阻碍说明 | 事项标题与具体问题（如「物业入场时间待确认」） |
| 关联工单 | 工单编号与服务商名称，点击进入工单详情 |
| 系统整理结果 | `analysis` 非空时展示 findings 与 openQuestions；履约协同可无分析，`analysis=null` 为正常情况，页面不补造内容 |
| 当前状态 | `status` 与 `blockedReasons`；PROCESSING 不证明外部已成功 |
| 相关事项 | `relatedItems` 中有权查看的前后续事项 |

**前端职责**：直渲字段，不判断阻碍是否已解决、不推断外部执行状态。

#### 数据链路

| UI 元素 | API 字段 | 计算规则 | 数据源 |
|---------|----------|---------|--------|
| 阻碍标题 | `title` | 直透 | `work_item.title` |
| 工单入口 | `workOrderId` | 直透，配置事项为空不适用本页 | `work_item.installation_work_order_id` |
| 事项状态 | `status` | 直透（READY / PROCESSING / EXCEPTION / COMPLETED 等） | `work_item.status` |
| 整理结果 | `analysis` | 直透，null 时区块显示「本次协同无系统分析结果」 | `work_item.current_analysis_result_id` |
| 阻断原因 | `blockedReasons` | 直透数组，空为 [] | `work_item.blocked_reason` |
| 相关事项 | `relatedItems` | 直透，仅显示有权查看项 | `work_item_link` |

### 3.2 保存进展，继续处理

**数据来源**：`POST /api/admin/charging/work-items/{workItemId}/progress`；时间线读取 `GET /api/admin/charging/work-items/{workItemId}/activities`。

**交互**：
- 点击「保存进展，继续处理」→ 填写本次进展、尚未解决的内容与后续安排 → 提交。
- 可多次保存；每次保存追加一条处理记录，事项继续显示在当前责任人待处理列表，**不显示为已完成**。
- 不要求为每次沟通新建待办；记录「已联系」不等于阻碍已解决。

**前端职责**：只提交 `expectedWorkItemVersion` / `expectedResponsibilityVersion` / `description` 与幂等键；不生成进展编号与时间。

#### 数据链路

| UI 元素 | API 字段 | 计算规则 | 数据源 |
|---------|----------|---------|--------|
| 进展正文 | 请求 `description` | 非空 string，人员填写 | 表单输入 |
| 版本条件 | 请求 `expectedWorkItemVersion` / `expectedResponsibilityVersion` | 取页面所读事项版本，正整数 | `work_item.row_version` / `responsibility_version` |
| 保存回执 | 响应 `{activityId,workItemId,rowVersion,status:"SAVED"}` | 服务端保存 `activity_record` 的 PROGRESS_SAVED 事件，event_key 来自主体、目标及 Idempotency-Key，同事务条件增加事项 rowVersion | `activity_record` / `work_item` |
| 时间线条目 | `activities` 返回 `{activityId,eventType,actor,occurredAt,description}` | 按创建时间与 id 倒序 | `activity_record` |

### 3.3 完成本次协同

**数据来源**：`POST /api/admin/charging/work-items/{workItemId}/coordination-completion`。

**交互**：
- 阻碍已实际解决（如相关方已确认可执行的入场安排）时，责任人填写解决事实与必要依据 → 点击「完成本次协同」。
- 完成码为 COORDINATION_RESOLVED；完成原因保留为「本次履约阻碍处理完成」，**不等于安装已经完成**，页面与列表不得显示为整个安装业务结束。
- 仅 COORDINATION 事项可执行；无必要附件时不上传无关文件。
- 服务端核实实际协调结果，不代做安装资料或费用审核；无分析的协调动作 `analysisResultId` 允许 null。

#### 数据链路

| UI 元素 | API 字段 | 计算规则 | 数据源 |
|---------|----------|---------|--------|
| 处理结果 | 请求 `resolution` | 非空 string，说明解决了哪个问题与实际确认的安排 | 表单输入 |
| 依据引用 | 请求 `evidenceRefs` | 数组，指向已保存材料或记录 | 证据引用选择 |
| 完成展示 | 详情 `completion` `{code,basis,decisionId,completedAt}` | 直透；code=COORDINATION_RESOLVED，decisionId 可 null | `work_item.completion_code` / `completion_basis_json` / `completion_decision_id` |
| 完成决定 | 隐式 | 服务端记录 COMPLETE_COORDINATION 人工决定 | `human_decision` |

### 3.4 异常登记、处理完成与原业务接续

**数据来源**：登记 `POST /api/admin/charging/work-items/{workItemId}/exceptions`；处理完成 `POST /api/admin/charging/work-items/{workItemId}/exception-resolution`。

**登记异常**（原事项当前有权责任人操作）：
- 填写异常原因 `reason`（非空）与可选依据 `evidenceRefs` → 提交后原事项转 EXCEPTION，保留原问题、当时需要继续的业务环节和依据。
- 存在结果未知的外部写入时，只可记录进展与异常说明，不得借转异常清理未决保护或认定外部失败。

**异常处理完成**：
- 填写处置结果 `resolution` 与依据 `evidenceRefs` → 确认关闭。系统核实当前状态、未决动作及需继续的业务；处置未完成时只能保存进展。
- 关闭后当前异常按 EXCEPTION_RESOLVED 完成，完成原因保留为异常处置结果，不改成审核通过、核对一致或其他正常完成结果。
- 接口不接受前端指定下一服务商或任意责任人；接续对象由服务端依据原异常时保存的阶段、工单和业务身份核实。

**原业务接续**：
- 仍需办理时，服务端复用正确的现存事项，或保存新事项与 work_item_link（reason_code=EXCEPTION_CONTINUATION）；同事务保存决定、完成依据、后续关联与记录，失败全部回滚。
- 响应额外返回 `followupWorkItemIds` string[]；页面据此显示「继续办理原业务」链接，沿用 `#task/<事项标识>` 路由进入接续事项。
- 原异常事项详情保留「回看异常结果」链接，可回读本次异常的完成原因与处置依据。
- 无后续工作时须有核实依据，不能以「没有找到待办」自动判断业务结束；当前环节完成不等于安装业务全部结束。

#### 数据链路

| UI 元素 | API 字段 | 计算规则 | 数据源 |
|---------|----------|---------|--------|
| 异常原因 | 请求 `reason`（exceptions） | 非空 string | 表单输入 |
| 异常状态 | 详情 `status`=EXCEPTION | 服务端保存 OPEN_EXCEPTION 决定并转换事项 | `work_item.status` / `human_decision` |
| 处置结果 | 请求 `resolution` / `evidenceRefs`（exception-resolution） | resolution 非空，evidenceRefs 数组 | 表单输入与证据选择 |
| 接续入口 | 响应 `followupWorkItemIds` | 服务端核实后续工作后返回；渲染「继续办理原业务」 | `work_item_link` / `work_item` |
| 回看异常结果 | 详情 `completion`（code=EXCEPTION_RESOLVED） | 保留处置决定与仍需办理的工作 | `work_item.completion_*` / `human_decision` |

### 3.5 停止决定

**数据来源**：`POST /api/admin/charging/work-items/{workItemId}/stop-decisions`。

**适用条件**：
- 原安排取消、工单撤销或事项经核实确实无须继续，且有真实来源依据。
- 需 RECORD_EXCEPTION_RESULT 权限与当前责任；正文为 DecisionInput 加 `reason`（非空）及 `basisRefs`（非空证据引用数组）。

**后果与追溯**：
- 服务端重新核实取消、终止或已无须办理的具体来源依据，保存 STOP_WORK 决定，完成码 BUSINESS_STOPPED。
- 停止原因与依据保留在处理记录与事项完成信息中，供追溯；不能写成阻碍已解决，也不能在此代取消工单。
- 未决外部结果、依据缺失或来源当前状态未知不能直接停止：缺项 42201，竞争变化 40901，未决写入 40903。
- 不提供任意修改 status 的接口；完成原因、历史决定及后续关系均由服务端按已定义业务条件产生。

#### 数据链路

| UI 元素 | API 字段 | 计算规则 | 数据源 |
|---------|----------|---------|--------|
| 停止原因 | 请求 `reason` | 非空 string | 表单输入 |
| 停止依据 | 请求 `basisRefs` | 非空证据引用数组 | 证据引用选择 |
| 停止结果 | 详情 `completion`（code=BUSINESS_STOPPED） | 服务端保存 STOP_WORK 及影响范围 | `work_item.completion_*` / `human_decision` |

### 3.6 异常与兜底

**服务端兜底**：接口异常按统一返回壳返回错误码，前端按下表执行渲染兜底。

| 场景 | 处理 |
|------|------|
| `analysis` 为 null | 整理结果区块显示「本次协同无系统分析结果」，不补造内容 |
| `relatedItems` 为空 | 显示 [] 对应空态，不隐藏整个区块标题 |
| 进展 `description` 为空 | 前端阻止提交并定位字段 |
| 版本竞争 40901 | 保留已填写内容，重读最新版本后重新确认 |
| 同键不同内容 40902 | 拒绝，禁止改键绕过 |
| 存在未决写入 40903 | 返回可读的原操作入口，继续查原结果 |
| 无操作权限 40301 / 不可见 40404 | 停止动作并提示，不隐藏为成功；深链接越权按 404 |
| 缺依据 42201 | 返回缺项说明，不造值 |
| 详情接口超时 | 错误提示 + 点击重试；写请求超时先按原键/操作回查，不盲目重发 |

---

## §4 本区域使用的数据字段

| 表名 | 状态 | 本区域使用字段 | 完整定义 |
|------|------|--------------|----------|
| `work_item` | 新建 | `id`、`status`、`assignee_identity_id`、`row_version`、`responsibility_version`、`blocked_reason`、`completion_code`、`completion_basis_json`、`completion_decision_id`、`completed_at`、`pending_write_id` | [work-item-schema.md](../03-foundation/03-05-schema/work-item-schema.md) §3 |
| `human_decision` | 新建 | `action_type`（OPEN_EXCEPTION / CLOSE_EXCEPTION / COMPLETE_COORDINATION / STOP_WORK）、`request_key`、`expected_work_item_version`、`expected_responsibility_version`、`content_json` | 同上 §5 |
| `activity_record` | 新建 | `event_key`、`event_type`（PROGRESS_SAVED 等）、`details_json`、`occurred_at` | 同上 §7 |
| `work_item_link` | 新建 | `from_work_item_id`、`to_work_item_id`、`reason_code`（EXCEPTION_CONTINUATION）、`basis_json` | 同上 §4 |

> 账单、费用与安装资料字段本区域不使用；完成协同与关闭异常均不改写这些域的记录。

---

## §5 接口契约

> 完整契约见 [coordination-apis.md](../03-foundation/03-06-provided-apis/coordination-apis.md) §1—4 与 [common-contract.md](../03-foundation/03-06-provided-apis/common-contract.md) §2—4，这里只写本区域的业务说明。全部写请求带 Header `Idempotency-Key`，正文限已声明字段。

### `POST /api/admin/charging/work-items/{workItemId}/progress`

- 履约事项使用 COMPLETE_FULFILLMENT_COORDINATION 动作权限；服务端核实当前责任与办理动作。
- 保存进展不修改分析输入代次，不据进展文字改成「已完成」；同键同内容返回原结果。

### `POST /api/admin/charging/work-items/{workItemId}/exceptions`

- 需 RECORD_EXCEPTION_RESULT 与当前责任；保存 OPEN_EXCEPTION 决定，原事项转 EXCEPTION。
- 存在结果未知的外部写入时只可记录进展与异常说明，不清理未决保护。

### `POST /api/admin/charging/work-items/{workItemId}/coordination-completion`

- 仅 COORDINATION 事项、COMPLETE_FULFILLMENT_COORDINATION 动作；完成码 COORDINATION_RESOLVED。
- 不代做安装资料或费用审核；无分析的协调动作 `analysisResultId` 允许 null。

### `POST /api/admin/charging/work-items/{workItemId}/exception-resolution`

- 需 RECORD_EXCEPTION_RESULT；接续对象由服务端核实，接口不接受前端指定下一服务商或任意责任人。
- 同事务保存决定、完成依据、后续关联与记录，失败全部回滚；额外返回 `followupWorkItemIds` string[]。

### `POST /api/admin/charging/work-items/{workItemId}/stop-decisions`

- 需 RECORD_EXCEPTION_RESULT 与当前责任；`reason` 与 `basisRefs` 均非空。
- 未决外部结果、依据缺失或来源状态未知不能直接停止；完成码 BUSINESS_STOPPED。

### 读取接口（复用）

- `GET /api/admin/charging/work-items/{workItemId}`：本页全部展示数据，含 `completion` / `relatedItems` / `allowedActions`。
- `GET /api/admin/charging/work-items/{workItemId}/activities`：进展与操作时间线。
- `allowedActions` 仅供展示，提交时服务端重新检查；前端不据此做权限结论。

---

## §6 管理台配置

本功能块无管理端可配项。空态文案、操作按钮名称与错误提示文案均为硬编码。

---

## §7 验收标准

### 区块展示

| # | 场景 | 输入条件 | 预期结果 |
|---|------|---------|----------|
| 1 | 协同详情渲染 | 打开澜山府履约协同事项 | 阻碍说明、关联工单、状态与整理信息正确展示；`analysis=null` 时显示无分析结果，不补造内容 |
| 2 | 进展多次保存留痕 | 同一事项连续保存 3 次进展 | 时间线追加 3 条 PROGRESS_SAVED 记录，事项仍在待处理列表且不显示完成 |
| 3 | 完成协同 | 阻碍已解决，填写 resolution 与依据后完成 | 详情 `completion.code`=COORDINATION_RESOLVED，完成原因显示为本次履约阻碍处理完成，不显示为整个安装业务结束 |
| 4 | 异常登记 | 当前责任人提交非空 reason | 事项转 EXCEPTION，原问题与依据保留 |
| 5 | 异常关闭后续接入口 | 处置完成且原业务仍需办理 | 显示「继续办理原业务」链接，点击沿用 `#task/<事项标识>` 进入接续事项；原异常详情保留「回看异常结果」链接 |
| 6 | 无后续工作 | 处置完成且原业务无须继续 | 不生成虚假接续事项，展示核实依据，不判断为业务结束 |
| 7 | 停止决定展示 | 停止成功后打开事项 | `completion.code`=BUSINESS_STOPPED，停止原因与依据可追溯，不显示为阻碍已解决 |
| 8 | 越权操作被拒 | 无 RECORD_EXCEPTION_RESULT 或无当前责任的身份提交关闭 / 停止 | 40301 拒绝，动作停止；不可见编号按 40404 处理，不泄露资源细节 |

### 数据与接口

| # | 场景 | 输入条件 | 预期结果 |
|---|------|---------|----------|
| 9 | 进展保存幂等 | 同 Idempotency-Key 同内容重发 | 返回原结果，不重复追加 activity_record；同键不同内容返回 40902 |
| 10 | 版本竞争 | 使用过期 `expectedWorkItemVersion` 提交 | 40901，保留输入，重读最新版本后重新确认 |
| 11 | 完成原因可追溯 | 协同完成 / 异常关闭 / 停止后重读详情与处理记录 | `completion` 的 code、basis、decisionId 与对应 human_decision、activity_record 一致保存，可回查具体完成原因 |
| 12 | 异常关闭接续落库 | 关闭仍需办理的异常 | 响应返回 `followupWorkItemIds`；work_item_link 写入 EXCEPTION_CONTINUATION 关联，决定、完成依据、关联与记录同事务保存，关联写入失败则整批回滚 |
| 13 | 停止决定权限与后果 | 依据缺失提交停止；存在未决外部写入时提交停止 | 分别返回 42201、40903，事项不停止；有真实依据时保存 STOP_WORK 与 BUSINESS_STOPPED，来源状态与影响范围可追溯 |
| 14 | 协同不代审核 | 完成履约协同后核查、对账事项状态 | 审核、费用核实与账单记录不被协同完成或异常关闭改写，各自事项保持原状态与责任 |
