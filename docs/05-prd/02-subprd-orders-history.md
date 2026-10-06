# PRD：工单查询与处理追溯

> 上游（我引用）：[mainprd-jd-charging.md](mainprd-jd-charging.md) §一—§五、[术语表](../03-foundation/03-01-glossary/glossary.md) §1、§3、§5、[页面清单](../02-prototype/page-list.md) §1—2、[交互说明](../02-prototype/interaction-spec.md) §1、§3、[工作台查询接口](../03-foundation/03-06-provided-apis/workbench-apis.md) §2—5、[材料预览与上传接口](../03-foundation/03-06-provided-apis/material-apis.md) §1、[公共约定](../03-foundation/03-06-provided-apis/common-contract.md) §1—4、[处理事项域表结构](../03-foundation/03-05-schema/work-item-schema.md) §2—7、[材料与分析证据域表结构](../03-foundation/03-05-schema/evidence-schema.md) §2—5、[运行数据规则](../../rules/runtime-mock-data.md) §1—4
> 下游（引用我）：[mainprd-jd-charging.md](mainprd-jd-charging.md) §七；[tc-orders.md](../06-testcase/orders/tc-orders.md) 验收矩阵；开发计划待建立后登记

> 基线版本：v1.0｜最后更新：2026-09-20｜状态：草稿
> ⚠️ 本文档描述的是目标态。与代码现状有出入时，以真实代码为准，按本文档的目标态补齐。

---

## §1 文档范围

本文档覆盖**工单查询与处理追溯**：安装工单列表与工单详情的只读查看（含工单关联的购买订单、安装权益、安装方案、原始材料与处理事项信息）、处理记录页的业务动作追溯、原始证据侧栏的材料原文与解析内容块查看。

**不含**：事项处理操作（核查决定、补充、对账、协同等写操作，归 03—07 各子 PRD）；待处理事项列表（归 01-subprd-workbench-items.md）。

**术语边界**（见术语表 §1）：安装工单 `installation_work_order` 是组织一次安装履约的业务记录；处理事项 `work_item` 是工单上需要办理的具体问题。同一安装工单可有多个不同阶段的事项；配置事项可独立于工单存在（`workOrderId=null`），不出现在工单列表。

### 需求清单

| # | 需求 | 需求简述 | 对应章节 |
|---|------|---------|---------|
| R1 | 安装工单列表 | 授权范围内工单的分页列表，展示服务商、当前阶段与进行中事项数 | §3.1 |
| R2 | 工单详情只读查看 | 工单基本信息及关联的订单、权益、方案、材料、事项汇总 | §3.2 |
| R3 | 处理记录追溯 | 按事项查看业务动作、执行人、说明与时间，含外部写入操作结果 | §3.3 |
| R4 | 原始证据侧栏 | 按材料版本查看原文与解析内容块，支持版本切换与原文定位 | §3.4 |
| R5 | 权限与异常兜底 | 越权不可见、读取失败与空文件分别真实呈现 | §3.5 |

---

## §2 页面布局

```
┌────────────────────────────────────────┐
│ A. 安装工单列表（#orders）               │  ← 本文档 §3.1
│    ├ 筛选：服务商 / 关键词 / 分页          │
│    └ 工单行 → 进入 B                     │
├────────────────────────────────────────┤
│ B. 工单详情（#order/<工单>）             │  ← 本文档 §3.2
│    ├ 基本信息 + 订单 / 权益 / 方案         │
│    ├ 关联材料清单 → 打开 D               │
│    └ 关联事项清单 → 进入 C / 事项详情      │
├────────────────────────────────────────┤
│ C. 处理记录（#history）                  │  ← 本文档 §3.3
│    ├ 事项选择（默认当前事项）              │
│    └ 事件时间线 + 外部操作结果             │
├────────────────────────────────────────┤
│ D. 原始证据侧栏（详情页右侧滑出）          │  ← 本文档 §3.4
│    ├ 版本切换 + 元数据                    │
│    ├ 原文内容区                           │
│    └ 解析内容块（按原位置）                │
└────────────────────────────────────────┘
```

**联动规则**：A、B、C、D 均为只读视图，不产生业务写入；从 B 进入某事项的办理页面后完成处理，返回时 C 重新加载该事项记录，先骨架屏后替换渲染。深链接打开任一视图均执行身份范围检查。

---

## §3 区块详述

### 3.1 安装工单列表

**使用者**：授权角色（京东各角色与服务商人员，按各自授权范围）。

**布局**：每行展示工单编号、服务商名称、购买订单编号、当前阶段、进行中事项数、最近更新时间。顶部为服务商筛选（`GET /api/admin/charging/providers`，仅返回当前可见服务商）与关键词输入；底部分页。

**交互**：点击工单行 → 进入工单详情（§3.2）；翻页与筛选变更 → 重新请求，不保留前端拼接结果。

**数据来源与数据链路**：

| UI 元素 | 来源 | 计算规则 | 数据源 |
|---------|------|---------|--------|
| 工单编号 | `GET work-orders` 的 sourceId（§5.6） | 直透来源编号 | `installation_work_order.source_id` |
| 服务商名称 | 同上 | 直透展示名 | `service_provider.display_name` |
| 当前阶段 / 进行中事项数 | 同上 | 服务端按本工单当前可见未完成事项返回 activeKinds / activeItemCount，多个阶段并列展示 | `work_item`（`installation_work_order_id`、status） |
| 最近更新时间 | 同上 | updatedAt 取工单与可见事项最近本地变更；无事项时取工单时间 | `work_item.gmt_modified` |
| 列表范围 | 服务端 | 先按完整权限过滤再筛选计数分页 | 授权范围 |

**前端职责**：纯渲染，不按名称猜工单归属、不用列表数量自拼总数；排序与范围由服务端决定。

### 3.2 工单详情

**布局**：四个信息区——基本信息（工单编号、服务商、来源版本与核实状态）；购买订单与安装权益（订单编号、权益服务范围、权益数量上限）；安装方案（方案安装数量等当前有效方案摘要）；关联清单（原始材料清单、该工单全部处理事项清单）。

**交互**：点击材料行 → 打开原始证据侧栏（§3.4）；点击事项行 → 有权办理时进入对应事项详情页，无办理权仅可查看；点击"处理记录"→ 进入 §3.3。

**数据链路**：

| UI 元素 | API 字段 / 来源 | 计算规则 | 数据源 |
|---------|----------------|---------|--------|
| 工单编号、来源状态 | `GET work-orders/{workOrderId}` 的 sourceId / sourceState / sourceVersion（§5.6） | 直透；UNKNOWN / REMOVED 如实展示，不解释为业务取消 | `installation_work_order.source_state`、`source_version` |
| 订单编号 / 方案摘要 | context 中 installationWorkOrder / installationPlan | 沿当前 context_snapshot_id 取已保存上下文，版本不相符显示待更新 | `installation_context_snapshot.context_json` |
| 安装权益 | entitlementRead.status / data | 后台只读调用权益适配接口，校验订单关联和工单版本；失败或无权不显示无权益 | 购买订单与安装权益读取契约 §3，保留各自来源版本与 retrievedAt |
| 关联事项清单 | `GET /api/admin/charging/work-items?workOrderId={workOrderId}&responsibility=VISIBLE` 返回项字段 `workItemId`、`title`、`kind`、`status`、`assignee`、`analysisStatus`、`updatedAt` | 服务端按工单过滤并排序 | `work_item`（`idx_work_item_order`） |
| 事项执行人 | `assignee{displayName}` | 直透；null 显示"待分配" | `work_item.assignee_identity_id` |
| 关联材料清单 | 工单详情 materialReferences | 当前上下文材料索引按来源/编号/版本关联本地版本，并核实原文权限；未导入版本不开放预览 | `installation_context_snapshot.context_json`、`source_material_version` |

**约束**：已完成事项保持固定，展示其 `completion` 结果；配置事项（`workOrderId=null`）不出现在本页。

### 3.3 处理记录页

**使用者**：各角色；展示范围限当前身份有权查看的事项。

**布局**：顶部为事项选择器（默认带入口上下文的事项，可切换同工单其他事项）；主体为事件时间线，每条展示业务动作、执行人、说明、时间；涉及外部写入的事件附操作结果块。

**交互**：切换事项 → 重新加载时间线；滚动分页加载更早记录；点击事实引用（`factType`/`factId`）→ 跳转对应事实的查看入口（材料事实打开证据侧栏）。

**数据链路**：

| UI 元素 | API 字段 | 计算规则 | 数据源 |
|---------|----------|---------|--------|
| 事件条目 | `GET /api/admin/charging/work-items/{workItemId}/activities` 返回 `activityId`、`eventType`、`description` | 直透；按创建时间和 id 倒序（服务端排好） | `activity_record` |
| 执行人 | `actor{identityId,displayName}` | 直透；null 显示"执行人未知"，不补造 | `activity_record.actor_identity_id` |
| 发生时间 | `occurredAt` | 直透格式化；null 时按本地保存时间排序并标注"来源时间未知" | `activity_record.occurred_at` |
| 外部操作状态 | `GET /api/admin/charging/operations/{operationId}` 返回 `status`、`receipt`、`verifiedAt`、`localContinuationStatus` | 直透；外部 SUCCEEDED 与本地接续完成分开显示 | `external_write_operation` 及回查事实 |
| 事件摘要 | `description` | 直透；不作为审核成功、付款或源端写入证明 | `activity_record.details_json` |

**约束**：除进展保存外的事件均引用实际事实（`factType`+`factId`），详情从原事实读取；同一事件重放不多记一条（`event_key` 唯一）。

### 3.4 原始证据侧栏

**定位**：从工单详情、事项详情或处理记录的材料入口右侧滑出，只读查看。

**三层对象关系**（术语表 §1）：原始材料版本 `source_material_version` 是同一原文件在确切来源版本下已取得的内容；材料解析结果 `material_parsing` 依附于一份确定版本（`source_material_version_id` 必须已 VERIFIED）；解析内容块属于该次解析，块内 `unitId` 与原位置（PDF 页 / 图片 / sheet 及 `cellRange`）对应同一文件版本。证据引用（`evidenceRefs`）经 `blockId` 定位到块、再沿 `unitId` 定位原文位置。

**布局与交互**：
- 头部：文件名、来源版本、字节数、`readState`；同一材料存在多个已保存版本时提供版本切换，切换后重新请求该版本元数据、解析与原文，并逐次核实当前权限。
- 原文区：`GET /api/admin/charging/material-versions/{materialVersionId}/content` 返回的原文件字节，按实际 MIME 预览（PDF / PNG / JPEG）或下载（XLSX）。
- 解析区：`parsing{completeness,units,blocks,issues}`；`completeness` 为 INCOMPLETE 时列出 `issues`，不把解析不全显示为资料齐全；`IMAGE_DESCRIPTION` 块明确标注是图片描述，不当原文引文。

**数据链路**：

| UI 元素 | API 字段 | 计算规则 | 数据源 |
|---------|----------|---------|--------|
| 元数据 | `GET /api/admin/charging/material-versions/{materialVersionId}` 返回 `name`、`mediaType`、`byteLength`、`sha256`、`sourceVersion` | 直透；未取得时未知字段为 null，不显空值占位 | `source_material_version` |
| 读取状态 | `readState` | REFERENCED → "原文未取得"态；VERIFIED → 可加载原文 | `source_material_version.read_state` |
| 原文内容 | `/content` 二进制响应 | 按 Content-Type 渲染；失败按公共 JSON 错误呈现 | 受控文件存储（`content_locator`） |
| 解析内容块 | `parsing.blocks`（`blockId`、原位置、内容） | 直透，按 `units` 分组展示 | `material_parsing.blocks_json` / `units_json` |

### 3.5 异常与兜底

| 场景 | 处理 |
|------|------|
| 工单列表为空 | 空态文案"授权范围内暂无安装工单"，不造示例数据 |
| 越权深链接（工单 / 事项 / 材料） | 服务端返回 404，页面提示无法查看，不返回资源细节 |
| 凭据失效（401） | 恢复真实登录，不自动切换身份 |
| 材料 `readState=REFERENCED` | 显示"原文未取得，仅登记来源引用"，展示已有元数据，不显示空文件态 |
| 材料 VERIFIED 且 `blocks=[]`（真实空白文件） | 显示"文件内容为空"，与读取失败严格区分 |
| `/content` 返回 42201 | 提示"原文暂不可取得"，保留元数据与解析区 |
| 处理记录 `actor` / `occurredAt` 为 null | 显示"执行人未知" / "来源时间未知"，不补造 |
| 列表或记录接口超时 / 5xx | 错误提示 + 点击重试，不伪装成空列表 |
| 解析 `completeness=INCOMPLETE` | 列出 `issues` 缺项，不显示"资料齐全" |

---

## §4 本区域使用的数据字段

| 表名 | 状态 | 本区域使用字段 | 完整定义 |
|------|------|--------------|----------|
| `installation_work_order` | 候选 | `source_system`、`source_id`、`current_service_provider_id`、`source_version`、`source_state`、`context_snapshot_id`、`verified_at` | [work-item-schema.md](../03-foundation/03-05-schema/work-item-schema.md) §2 |
| `service_provider` | 候选 | `display_name`、`source_state` | [work-item-schema.md](../03-foundation/03-05-schema/work-item-schema.md) §2 |
| `work_item` | 候选 | `installation_work_order_id`、`item_kind`、`title`、`status`、`assignee_identity_id`、`analysis_generation`、`completion_code`、`completed_at`、`row_version` | [work-item-schema.md](../03-foundation/03-05-schema/work-item-schema.md) §3 |
| `activity_record` | 候选 | `work_item_id`、`event_key`、`event_type`、`actor_identity_id`、`fact_type`、`fact_id`、`occurred_at`、`details_json` | [work-item-schema.md](../03-foundation/03-05-schema/work-item-schema.md) §7 |
| `source_material_version` | 候选 | `source_material_id`、`source_version`、`read_state`、`name`、`media_type`、`byte_length`、`content_sha256` | [evidence-schema.md](../03-foundation/03-05-schema/evidence-schema.md) §2 |
| `material_parsing` | 候选 | `source_material_version_id`、`completeness`、`units_json`、`blocks_json`、`issues_json` | [evidence-schema.md](../03-foundation/03-05-schema/evidence-schema.md) §2—3 |
| `analysis_result` | 候选 | `findings_json`（`evidenceRefs`：`inputId`、`blockId`、`jsonPointer`、`quote`） | [evidence-schema.md](../03-foundation/03-05-schema/evidence-schema.md) §5 |

> 工单上下文经 `installation_work_order.context_snapshot_id` 引用安装域 `installation_context_snapshot`，本区域只读展示，字段口径以安装域为准。

---

## §5 接口契约

### 5.1 `GET /api/admin/charging/work-items`

> 完整契约见 [workbench-apis.md](../03-foundation/03-06-provided-apis/workbench-apis.md) §2。

- **本区域用途**：工单详情页的关联事项清单（按工单过滤，服务端执行）；`responsibility` 传 VISIBLE 查看授权范围内他人责任事项。
- **使用字段**：`workItemId`、`title`、`kind`、`status`、`providerId`、`providerName`、`workOrderId`、`assignee`、`analysisStatus`、`updatedAt`、`asOf`。
- **前端额外计算**：无；跨请求数据变化按 `asOf` 解释并重查。

### 5.2 `GET /api/admin/charging/work-items/{workItemId}`

> 完整契约见 [workbench-apis.md](../03-foundation/03-06-provided-apis/workbench-apis.md) §3。

- **本区域用途**：从处理记录页 / 工单详情进入事项时的只读上下文；`completion`、`analysis.findings.evidenceRefs` 供事实跳转与材料入口。
- **约束**：`allowedActions` 仅供展示；本文档不含任何动作提交。

### 5.3 `GET /api/admin/charging/work-items/{workItemId}/activities`

> 完整契约见 [workbench-apis.md](../03-foundation/03-06-provided-apis/workbench-apis.md) §4。

- **本区域用途**：处理记录页时间线，query 仅 `page`/`pageSize`。
- **使用字段**：`activityId`、`eventType`、`actor`、`occurredAt`、`description`、`factType`、`factId`（见 §3.3）。

### 5.4 `GET /api/admin/charging/operations/{operationId}`

> 完整契约见 [workbench-apis.md](../03-foundation/03-06-provided-apis/workbench-apis.md) §4。

- **本区域用途**：处理记录中外部写入事件的操作结果块。
- **使用字段**：`status`、`receipt`、`verifiedAt`、`localContinuationStatus`；外部 SUCCEEDED 与本地接续完成分开显示，不由前端推定状态。

### 5.5 `GET /api/admin/charging/material-versions/{materialVersionId}` 与 `/content`

> 完整契约见 [material-apis.md](../03-foundation/03-06-provided-apis/material-apis.md) §1。

- **本区域用途**：原始证据侧栏的元数据 + 解析读取与原文字节加载。
- **使用字段**：`materialVersionId`、`sourceSystem`、`sourceMaterialId`、`sourceVersion`、`name`、`mediaType`、`byteLength`、`sha256`、`readState`、`parsing`（见 §3.4）。
- **约束**：`/content` 是统一 JSON 壳的明确二进制例外；每次请求核实权限，不缓存公开地址；未 VERIFIED 不请求正文。

### 5.6 工单聚合读取

完整契约已补入 [workbench-apis.md](../03-foundation/03-06-provided-apis/workbench-apis.md) §6：`GET /api/admin/charging/work-orders` 分页返回工单及可见事项统计；`GET /api/admin/charging/work-orders/{workOrderId}` 返回工单、上下文、权益读取结果、材料版本索引和事项汇总。详情关联事项使用 `work-items?workOrderId={workOrderId}&responsibility=VISIBLE`，summary 使用同条件。工单没有事项时仍可查看；不从前端事项列表归组。权益不在工单上下文存储内，由后台只读适配取得并核实关联和版本；多来源不声称原子快照。

---

## §6 管理台配置

本功能块无管理端可配项。分页大小取公共约定默认值（page=1、pageSize=10，允许 1—50）；空态文案、骨架屏样式硬编码，不可配。

---

## §7 验收标准

### 区块展示

| # | 场景 | 输入条件 | 预期结果 |
|---|------|---------|----------|
| 1 | 工单列表渲染 | 当前身份授权范围内有工单 | 工单编号、服务商、当前阶段、进行中事项数正确展示，分页可用 |
| 2 | 工单列表权限隔离 | 服务商 A 身份查看 | 仅出现服务商 A 工单；改用他商编号深链接返回 404 |
| 3 | 工单详情关联信息 | 工单有订单、权益、方案与 ≥2 个不同阶段事项 | 四个信息区齐全；事项清单含各阶段事项，配置事项不出现 |
| 4 | 处理记录时间线 | 事项有创建、分析完成、人员确认、进展保存事件 | 按创建时间和 id 倒序展示业务动作、执行人、说明、时间 |
| 5 | 处理记录未知字段 | 来源导入事件 `actor`、`occurredAt` 为 null | 显示"执行人未知""来源时间未知"，按本地保存时间排序 |
| 6 | 证据侧栏读取失败 | 材料 `readState=REFERENCED` | 显示"原文未取得"态与已有元数据，不显示空文件态 |
| 7 | 证据侧栏空文件 | 材料 VERIFIED 且解析 `blocks=[]` | 显示"文件内容为空"，与读取失败明确区分 |
| 8 | 证据侧栏版本切换 | 同一材料存在两个已保存版本 | 切换后元数据、解析、原文均换为所选版本；权限逐次核实 |
| 9 | 解析原文定位 | 证据引用含 `blockId` | 侧栏定位到对应内容块及其 PDF 页 / sheet / 单元格位置 |
| 10 | 解析不全呈现 | `parsing.completeness=INCOMPLETE` | 列出 `issues` 缺项，不显示"资料齐全" |

### 数据与接口

| # | 场景 | 输入条件 | 预期结果 |
|---|------|---------|----------|
| 11 | activities 分页 | 单事项记录超过一页 | 按 page/pageSize 返回，倒序稳定，无重复事件（`event_key` 去重） |
| 12 | 外部操作结果 | 事件关联 `operationId` | operations 接口返回真实 `status` 与 `localContinuationStatus`，两者分开显示 |
| 13 | 材料正文权限 | 无 READ_SOURCE_MATERIAL 权限请求 `/content` | 返回 404/403 公共错误，无公开存储地址泄露 |
| 14 | 接口异常 | work-items / activities 超时或 5xx | 页面展示错误提示与重试，不伪装成空列表、不补造记录 |

### 补充验收：工单聚合

| 场景 | 预期结果 |
| --- | --- |
| 有授权工单但没有事项 | 工单列表仍有该行，activeKinds=[]、activeItemCount=0，不标安装完成 |
| 同工单存在多个阶段、不同责任人的可见事项 | 统计覆盖 VISIBLE 全范围，列表按 workOrderId 分页；不因默认MINE丢事项，不计无权事项 |
| 权益读取失败、无权或工单版本变更 | entitlementRead 分别返回 UNAVAILABLE、FORBIDDEN、STALE；不填0权益，不展示旧版为当前权益 |
| 无分析结果但工单有材料 | 按上下文材料索引展示有权项；不依赖findings才能查原材料 |


## 2026-09-27 服务商名称持续取得

工单归属通过 current_service_provider_id 关联服务商主数据；名称从安装管理来源的服务商名录同步。首次生成、启动及后续来源检查均包含名录更新，不依赖浏览器临时拼接账号名称。来源名称未取得时显示已有服务商编号，不能将已存在归属显示为无服务商。
