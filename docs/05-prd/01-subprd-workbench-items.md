# PRD：待处理事项与工作台总览

> 基线版本：v1.0｜最后更新：2026-09-20｜状态：草稿
> 上游（我引用）：[mainprd-jd-charging.md](mainprd-jd-charging.md) §一—§五、[术语表](../03-foundation/03-01-glossary/glossary.md) §1—3、[workbench-apis.md](../03-foundation/03-06-provided-apis/workbench-apis.md) §1—2（`GET /api/admin/charging/session`、`GET /api/admin/charging/providers`、`GET /api/admin/charging/work-items`、`GET /api/admin/charging/work-items/summary`）、[common-contract.md](../03-foundation/03-06-provided-apis/common-contract.md) §1—4、[work-item-schema.md](../03-foundation/03-05-schema/work-item-schema.md) `work_item` / `service_provider` 表、[flow-business-main.md](../03-foundation/03-04-business-flows/flow-business-main.md) §1、[page-list.md](../02-prototype/page-list.md) §1、[interaction-spec.md](../02-prototype/interaction-spec.md) §1、[runtime-mock-data.md](../../rules/runtime-mock-data.md) §1—4
> 下游（引用我）：[mainprd-jd-charging.md](mainprd-jd-charging.md) §七；[tc-workbench.md](../06-testcase/workbench/tc-workbench.md) 验收矩阵；开发计划待建立后登记

> ⚠️ 本文档描述的是目标态。与代码现状有出入时，以真实代码为准，按本文档的目标态补齐。（当前服务尚未实现）

---

## §1 文档范围

本文档覆盖**待处理事项与工作台总览**：各角色登录后进入的待处理事项列表（`#home`），含身份与业务范围展示、状态汇总、筛选与搜索、分页、空态与加载失败兜底。不含各事项详情页内部（归 02—07 各子 PRD），不含处理记录页（归 02-subprd-orders-history.md）。

### 需求清单

| # | 需求 | 需求简述 | 对应章节 |
|---|------|---------|---------|
| R1 | 身份与业务范围展示 | 启动时取得当前身份，展示 displayName 与角色，无权限时如实呈现 | §3.1 |
| R2 | 状态汇总 | 按当前筛选条件展示总数、按状态与按类型计数 | §3.2 |
| R3 | 事项列表 | 展示标题、类型、状态、服务商、责任人、分析状态、更新时间 | §3.3 |
| R4 | 筛选与搜索 | 按类型、状态、服务商、关键词、责任范围筛选 | §3.4 |
| R5 | 分页 | 公共分页，跨请求变化按 asOf 解释 | §3.5 |
| R6 | 权限控制 | 身份与业务范围由服务端核实，前端不传身份参数、不做权限判断 | §3.1、§5 |
| R7 | 空态与失败兜底 | 空列表、字段缺失、接口失败分别如实呈现，不伪造待办 | §3.6 |

---

## §2 页面布局

本功能块即待处理事项页整页（`#home`）。整页布局与页面间导航见 [mainprd-jd-charging.md](mainprd-jd-charging.md) §五。

```text
┌──────────────────────────────────────────┐
│ A. 身份区：displayName + businessRoles     │  ← 本文档 §3.1
├──────────────────────────────────────────┤
│ B. 汇总区：total + 按状态计数 + 按类型计数   │  ← 本文档 §3.2
├──────────────────────────────────────────┤
│ C. 筛选区：类型 / 状态 / 服务商 / 关键词 /   │  ← 本文档 §3.4
│    责任范围（我负责的 / 我可见的）           │
├──────────────────────────────────────────┤
│ D. 列表区：事项行 ×N                        │  ← 本文档 §3.3
│    ├ 标题 + 类型 + 状态 + 分析状态           │
│    ├ 服务商名 + 工单编号（可空）             │
│    └ 当前责任人 + 更新时间                  │
├──────────────────────────────────────────┤
│ E. 分页区：页码 / 总数 / asOf              │  ← 本文档 §3.5
└──────────────────────────────────────────┘
```

**联动规则**：

- 页面初始化顺序：先 `GET /api/admin/charging/session` 取得身份，再并行调 `GET /api/admin/charging/work-items/summary` 与 `GET /api/admin/charging/work-items`；session 失败不发后续请求。
- 筛选条件变化时，列表与汇总同时重查，二者使用相同筛选参数，按各自 `asOf` 解释，不用前端当前页数量拼总数。
- 人员在其他页面完成提交、核查决定、补充、对账处理或协同操作后返回本页，列表与汇总重新加载，先骨架屏后替换渲染（见 [mainprd-jd-charging.md](mainprd-jd-charging.md) §5.3）。
- 点击事项行 → 按 `kind` 与 `workItemId` 进入对应详情页（详情页归属见 [mainprd-jd-charging.md](mainprd-jd-charging.md) §5.1）。

---

## §3 区块详述

### 3.1 身份区（A 区）

**数据来源**：`GET /api/admin/charging/session` 返回的 `identityId` / `displayName` / `subjectType` / `businessRoles` / `authorizationVersion` / `verifiedAt`。

**展示**：

- 展示 `displayName` 与 `businessRoles` 对应的中文角色名（角色中文名按 [术语表](../03-foundation/03-01-glossary/glossary.md) §3）。
- `businessRoles` 同时包含安装核查、业务对账、履约协同时，身份区统一展示“京东业务”；三个职责由同一“京东业务账号”承担。服务商资料、应收、对接职责齐备时统一显示“服务商”，每家公司只有一个账号，不再区分内部登录权限；后端始终按该公司范围核实访问与操作。
- 身份核实成功但无业务权限时：身份区正常显示，列表区显示"当前无可办理内容"，不伪装成加载失败。
- 深链接打开本页同样先走 session；身份失败（401 / 40101）按公共约定恢复真实登录，不自动切换身份。

**前端职责**：直透展示，不作任何授权判断；`authorizationVersion`、`verifiedAt` 不直接展示，供需要时排查。

**本地运行补充（2026-09-27）**：当 session 返回 `accountSwitchingAvailable=true` 时，右上角显示“切换账号”。账号列表由服务端返回，支持按名称、角色和服务商编号搜索。选择后服务端核实目标身份并更新会话，网页返回首页重新加载身份与数据；刷新保留选择，同浏览器其他标签同步更新。切换失败保留当前账号并显示错误。切换会清除当前未提交的页面内容，选择框提前说明。接口见 [工作台查询接口](../03-foundation/03-06-provided-apis/workbench-apis.md) §1.1；此入口只在本地账号切换开关开启时显示，不通过前端修改权限。

### 3.2 汇总区（B 区）

**数据来源**：`GET /api/admin/charging/work-items/summary` 返回的 `total` / `byStatus` / `byKind` / `asOf`。

**展示与进入列表**：首页使用 `responsibility=MINE` 的汇总，四张卡片按下表合计，整张卡片可点击，0 条同样保留入口。

| 卡片 | 包含状态 | 点击后的列表 |
| --- | --- | --- |
| 待我确认 | READY | 我负责的、待我确认 |
| 等待补充 / 回复 | WAITING_SUPPLEMENT、WAITING_REPLY | 我负责的、等待补充 / 回复 |
| 系统处理中 | PREPARING、PROCESSING | 我负责的、系统处理中 |
| 异常与受阻 | EXCEPTION、BLOCKED | 我负责的、异常与受阻 |

卡片以接口 `byStatus` 中对应项求和，缺少某状态视为 0；不从当前页列表计算数量。卡片计数与目标筛选共用同一份状态定义。点击后列表从第一页查询，状态下拉框回显对应组合，并支持继续筛选单一状态。所有筛选和页码写入页面地址，刷新、前进与后退后恢复。

**前端职责**：不推断或修改事项状态，进入列表不触发业务处理。列表与卡片请求之间发生后台状态更新时，以各自查询时点的数据为准。

### 3.3 列表区（D 区）

**数据来源**：`GET /api/admin/charging/work-items` 返回的 `list` 各项。

**事项类型与角色对应**（按 [flow-business-main.md](../03-foundation/03-04-business-flows/flow-business-main.md) §1）：

| kind（接口枚举） | 中文标签 | 主要责任角色 |
| --- | --- | --- |
| INSTALLATION_PREPARATION | 安装资料整理 | 服务商资料人员 |
| INSTALLATION_REVIEW | 安装核查 | 京东安装资料核查人员 |
| RECONCILIATION | 业务对账 | 京东业务对账人员 / 服务商应收负责人 |
| CONFIGURATION | 接入配置 | 服务商对接人员 |
| COORDINATION | 履约协同 | 京东物流履约协同人员 |

费用依据核查、分析失败恢复是安装核查事项内的业务场景，不设独立类型枚举。三个原型详情统一按 kind=INSTALLATION_REVIEW 和 workItemId 路由到核查组件；费用内容由当前 findings/openQuestions 展示，标题仅为展示文本，不用于分类或路由；分析失败通过 analysisStatus=BLOCKED 及 blockedReasons 标识。资料确认即安装资料整理事项的人员确认环节。

**状态标签**：

| status（接口枚举） | 中文标签 |
| --- | --- |
| PREPARING | 准备中 |
| READY | 待处理 |
| WAITING_SUPPLEMENT | 待补充 |
| WAITING_REPLY | 待回复 |
| PROCESSING | 处理中 |
| EXCEPTION | 异常处理中 |
| BLOCKED | 无法办理 |
| COMPLETED | 已完成 |

**分析状态标识**（与人员事项状态分开，见 [workbench-apis.md](../03-foundation/03-06-provided-apis/workbench-apis.md) §2）：

| analysisStatus | 展示 |
| --- | --- |
| AVAILABLE | 分析结果可用，不额外标识 |
| NOT_READY | 标识"结果准备中" |
| BLOCKED | 标识"分析失败/受阻"，进入分析失败恢复场景 |

**事项行布局**：

```text
┌──────────────────────────────────────────────┐
│ 春和庭安装资料核查      安装核查 │ 待处理        │  ← title + kind + status
│ 服务商甲 · 工单 WO-xxx                        │  ← providerName + workOrderId（可空）
│ 责任人：张三 · 分析失败 · 09-20 14:03          │  ← assignee + analysisStatus + updatedAt
└──────────────────────────────────────────────┘
```

**交互**：

- 点击事项行 → 进入对应详情页；`rowVersion` / `responsibilityVersion` / `analysisGeneration` 随导航带入详情页用于后续版本条件确认，列表区自身不展示、不判断。
- 已完成事项（COMPLETED）按服务端返回顺序照常展示，不做前端沉底或隐藏。

**前端职责**：直接渲染返回字段；不做排序、不做状态推断、不把分析状态当成事项完成状态。

### 3.4 筛选区（C 区）

| 筛选项 | 对应 query 参数 | 取值来源 |
| --- | --- | --- |
| 责任范围 | `responsibility` | 默认 `MINE`（我负责的）；可切 `VISIBLE`（我可见的），仍按原权限过滤 |
| 事项类型 | `kind` | 五类枚举，单选或不选 |
| 状态 | `status` | 八值枚举，单选或不选 |
| 服务商 | `providerId` | 选项来自 `GET /api/admin/charging/providers`，仅含当前可见服务商 |
| 关键词 | `keyword` | 匹配已授权标题、工单编号与服务商名 |

- 服务商筛选项只来自 providers 接口返回；即使已知他人服务商编号，也不得借筛选参数扩大范围（见 [workbench-apis.md](../03-foundation/03-06-provided-apis/workbench-apis.md) §1）。
- 任一筛选变化：列表与汇总同时重查，页码重置为第 1 页。

### 3.5 分页区（E 区）

- 默认 `page=1`、`pageSize=10`，允许 1—50（见 [common-contract.md](../03-foundation/03-06-provided-apis/common-contract.md) §2）。
- 展示 `total`、当前 `page`、本次查询时间 `asOf`。
- 排序由服务端固定（`gmt_modified` DESC、`id` DESC）；跨页期间数据变化允许重查，不声称页面列表是固定快照，变化按 `asOf` 向用户解释。
- 翻页失败：保留当前页内容，提示重试，不清空列表。

### 3.6 数据链路

> 端到端追踪：UI 元素 ← API 字段 ← 计算规则 ← 数据源表字段。字段完整定义见接口文档，这里只写本页用到的。

| UI 元素 | API 字段 | 计算规则 | 数据源表字段 |
|---------|----------|---------|--------|
| 身份姓名 | `displayName`（session） | 直透 | 身份域 `identity_reference`（见 identity-schema） |
| 身份角色 | `businessRoles`（session） | 直透，前端映射中文角色名 | 身份域授权记录（见 identity-schema） |
| 事项标题 | `title` | 直透 | `work_item.title` |
| 类型标签 | `kind` | 直透五值枚举 | `work_item.item_kind` |
| 状态标签 | `status` | 直透八值枚举 | `work_item.status` |
| 服务商名 | `providerName` | 服务端按 `providerId` 关联 | `work_item.service_provider_id` → `service_provider.display_name` |
| 工单编号 | `workOrderId` | 直透；null（配置事项）不显示 | `work_item.installation_work_order_id` |
| 当前责任人 | `assignee.displayName` | 直透；null 显示"待分配" | `work_item.assignee_identity_id` → `identity_reference` |
| 分析状态 | `analysisStatus` | 服务端按当前有效分析结果计算 NOT_READY / AVAILABLE / BLOCKED | `work_item.current_analysis_result_id`、`work_item.analysis_generation` 及分析结果域当前有效结果 |
| 更新时间 | `updatedAt` | 直透 ISO 8601 带时区，前端仅格式化 | `work_item.gmt_modified` |
| 列表顺序 | 数组顺序 | 服务端排好：`gmt_modified` DESC、`id` DESC | `work_item.gmt_modified`、`work_item.id` |
| 版本与代次 | `rowVersion` / `responsibilityVersion` / `analysisGeneration` | 直透，带入详情页供版本条件确认 | `work_item.row_version` / `responsibility_version` / `analysis_generation` |
| 汇总总数 | `total`（summary） | 服务端同权限同筛选 SQL 统计 | `work_item` 全量（先权限过滤再计数） |
| 状态/类型计数 | `byStatus` / `byKind` 的 `{value,count}` | 服务端同条件分组统计 | `work_item.status` / `work_item.item_kind` |
| 服务商筛选选项 | providers 的 `list[].{providerId,displayName}` | 仅返回当前可见服务商 | `service_provider.id`、`service_provider.display_name` |
| 查询时点 | `asOf` | 服务端生成 | — |

### 3.7 异常与兜底

**服务端兜底**：接口异常按统一返回壳返回错误码；401 / 503 不伪装成空列表，越权深链接返回 404（见 [workbench-apis.md](../03-foundation/03-06-provided-apis/workbench-apis.md) §5）。后端实际缺数据时显示准备中或缺项，前端不能补造"待办"（见 [runtime-mock-data.md](../../rules/runtime-mock-data.md) §2）。

**前端渲染兜底**：

| 场景 | 处理 |
|------|------|
| session 401 / 40101 | 恢复真实登录，不发后续列表请求，不自动换身份 |
| 身份无业务权限 | 身份区正常显示，列表区显示"当前无可办理内容" |
| 列表为空（`total=0`） | 空态文案"当前没有需要处理的事项"；区分"无权限"与"筛选无结果"两种文案，筛选无结果时提示可清除筛选 |
| `assignee` 为 null | 责任人位显示"待分配"，照常展示结果准备进展 |
| `workOrderId` 为 null | 工单编号位不显示（配置事项属正常情况），不显示占位符 |
| `providerName` 缺失 | 服务商位不显示名称，不伪造名称、不影响行内其他字段 |
| `analysisStatus=NOT_READY` | 标识"结果准备中"，不把空白当作"没有问题" |
| 列表接口超时 / 503 | 错误提示 + 点击重试；不清空已展示内容，不显示为空列表 |
| 汇总接口失败 | 汇总区显示加载失败可重试，列表区不受影响 |
| 翻页加载失败 | 停留在当前页，提示重试 |
| 越权 providerId / 深链接 | 服务端按权限过滤或返回 404，前端提示无法查看，不展示资源细节 |
| 业务操作后返回本页 | 列表与汇总重查，先骨架屏后替换渲染 |

---

## §4 本区域使用的数据字段

| 表名 | 状态 | 本区域使用字段 | 完整定义 |
|------|------|--------------|----------|
| `work_item` | 新建 | `id`、`title`、`item_kind`、`status`、`service_provider_id`、`installation_work_order_id`、`assignee_identity_id`、`row_version`、`responsibility_version`、`analysis_generation`、`current_analysis_result_id`、`gmt_modified` | [work-item-schema.md](../03-foundation/03-05-schema/work-item-schema.md) §3 |
| `service_provider` | 新建 | `id`、`display_name` | [work-item-schema.md](../03-foundation/03-05-schema/work-item-schema.md) §2 |

> 身份域表（`identity_reference` 等）仅供 session 与责任人展示关联，字段归身份域定义（identity-schema）；分析结果表字段归证据域定义，本区域只经 `analysisStatus` 消费其服务端计算结果。

---

## §5 接口契约

> 完整契约见 [workbench-apis.md](../03-foundation/03-06-provided-apis/workbench-apis.md) §1—2 与 [common-contract.md](../03-foundation/03-06-provided-apis/common-contract.md) §1—4，这里只写本页的业务说明。

### `GET /api/admin/charging/session`

- **调用时机**：页面初始化第一个请求；失败不发后续请求。
- **请求参数来源**：无参数，身份由服务端按凭据核实，前端不传任何身份标识。
- **本区域使用的响应字段**：`identityId` / `displayName` / `subjectType` / `businessRoles` / `authorizationVersion` / `verifiedAt`。
- **前端额外计算**：仅角色枚举到中文名的映射，不做权限判断。

### `GET /api/admin/charging/providers`

- **调用时机**：筛选区服务商下拉初始化；`keyword` 可选。
- **本区域使用的响应字段**：`list[].providerId` / `list[].displayName` 及公共分页字段。
- **约束**：仅返回当前可见服务商；不得借筛选参数扩大范围。

### `GET /api/admin/charging/work-items`

- **调用时机**：初始化（session 成功后）、筛选变化、翻页、业务操作后返回。
- **请求参数来源**：`page` / `pageSize` / `providerId` / `kind` / `status` / `keyword` 来自筛选区；`responsibility` 默认 `MINE`；不含任何身份参数。
- **本区域使用的响应字段**：`list` 各项 `workItemId` / `title` / `kind` / `status` / `providerId` / `providerName` / `workOrderId` / `assignee` / `rowVersion` / `responsibilityVersion` / `analysisGeneration` / `analysisStatus` / `updatedAt`，及 `reconciliationSummary` / `reconciliationSummaryAccess`、`total` / `page` / `pageSize` / `asOf`。
- **前端额外计算**：仅时间与枚举的展示格式化，不做任何业务判断。

### `GET /api/admin/charging/work-items/summary`

- **调用时机**：与列表同机调用，使用相同筛选参数、无分页。
- **本区域使用的响应字段**：`total` / `byStatus` / `byKind` / `asOf`。
- **约束**：与列表跨请求数据变化时按 `asOf` 解释并重查，不用前端当前页数量拼总数。

---

## §6 管理台配置

本功能块无管理端可配项。每页条数默认值（10）与上限（50）按 [common-contract.md](../03-foundation/03-06-provided-apis/common-contract.md) §2 固定；空态文案、状态与类型中文标签硬编码在前端，不可配。

---

## §7 验收标准

### 区块展示

| # | 场景 | 输入条件 | 预期结果 |
|---|------|---------|----------|
| 1 | 列表正常渲染 | 当前身份有 3 条不同 kind 的待处理事项 | 每行展示标题、类型中文标签、状态中文标签、服务商名、责任人、更新时间，与接口字段一致 |
| 2 | 默认责任范围 | 未做任何筛选进入本页 | 请求带 `responsibility=MINE`，仅展示当前身份为责任人的事项 |
| 3 | 汇总展示 | summary 返回 `total=8`、`byStatus` 含 `{value:"READY",count:5}` | 汇总区总数显示 8，"待处理"计数显示 5，与接口一致，不用当前页数量拼总数 |
| 4 | 组合筛选 | 选择 kind=RECONCILIATION 且 status=READY | 列表与汇总请求带相同参数并同时重查，页码重置为第 1 页，结果均为对账待处理事项 |
| 5 | 关键词搜索 | 输入已授权工单编号 | 请求带 `keyword`，返回匹配标题/工单编号/服务商名的已授权事项 |
| 6 | 分析失败标识 | 某事项 `analysisStatus=BLOCKED`、`status=READY` | 该行标识"分析失败/受阻"，且不被当作已完成或可忽略项 |
| 7 | 空列表 | 当前筛选下 `total=0` | 展示空态文案；筛选导致的空结果提示可清除筛选；不伪造任何待办 |
| 8 | 加载失败 | 列表接口返回 503 / 50301 | 展示真实失败状态与重试入口，不显示为空列表，不清空已展示内容 |

### 数据与接口

| # | 场景 | 输入条件 | 预期结果 |
|---|------|---------|----------|
| 9 | 启动顺序 | 有效凭据打开 `#home` | 先调 session，成功后再调 summary 与 work-items；session 返回 `identityId` / `displayName` / `businessRoles` 非空 |
| 10 | 登录失效 | session 返回 401 / 40101 | 不发列表请求，引导恢复真实登录，不自动切换身份 |
| 11 | 无业务权限身份 | session 成功但无任何授权 | 身份区正常显示 displayName 与角色，列表区显示"当前无可办理内容" |
| 12 | 越权服务商筛选 | providers 接口调用 | 仅返回当前可见服务商；构造未授权 `providerId` 查询不扩大结果范围 |
| 13 | 权限先于分页 | 授权范围内 12 条事项、越权范围另有事项 | `total=12`，先权限过滤再计数分页，total 不泄露越权数据 |
| 14 | 字段缺失兜底 | 某事项 `assignee=null`、`workOrderId=null` | 责任人位显示"待分配"，工单编号位不显示，行内其他字段照常渲染 |

---

> 关联说明：各事项详情页内部（安装核查、费用依据核查、分析失败恢复、资料确认、对账差异、接入配置、履约协同）分别归 02—07 各子 PRD；本页只负责列表入口与导航。


### 2026-09-27 手动分析补充（用户授权）

业务资料到达后仍自动分析。当前具体责任人在 PREPARING / READY / BLOCKED、无待确认外写时，可点击“开始分析 / 重新分析”；采用已有本业务动作权限与服务商范围。接口为 `POST /api/admin/charging/work-items/{workItemId}/analysis`，契约见 [工作台接口](../03-foundation/03-06-provided-apis/workbench-apis.md)“手动分析”。已有同轮待执行任务时复用；否则重新取数并创建新分析代次，旧结果保留历史。详情分别呈现准备资料、等待分析、正在分析、失败和完成；运行配置缺失时给出明确原因。


## 2026-09-27 mock 运行方式调整

mock 环境的所有分析等待当前责任人在具体事项详情点击“运行分析”；入口旁固定显示“当前为 mock 环境，数据为演示数据，因此改为手动触发。”刷新、重新启动、新来源和配置变化均不替人员触发新分析。首页对应分组显示“待运行 / 处理中”。

分析前即能读取业务资料和原文件。京东业务账号可以查看服务商的配置资料及映射结果；配置分析、上传和确认仍由所属服务商办理。文件离线解析可在真实上传后执行以便预览，不自动调用模型。
