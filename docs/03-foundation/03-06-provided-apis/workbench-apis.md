# 工作台查询接口

> 状态：foundation 开发契约；未实现
> 上游（我引用）：[公共约定](common-contract.md) §1—5、[事项表结构](../03-05-schema/work-item-schema.md) §2—7、[身份表结构](../03-05-schema/identity-schema.md) §1—4、[工单上下文读取](../03-02-external-apis/installation-work-order-context.md) §3、[reconciliation-apis](reconciliation-apis.md) §1、§4、[purchase-order-installation-entitlements](../03-02-external-apis/purchase-order-installation-entitlements.md) §2—3、[installation-schema](../03-05-schema/installation-schema.md) §2、[reconciliation-schema](../03-05-schema/reconciliation-schema.md) §2、§6
> 下游（引用我）：[工作台读取流程](../03-07-system-flows/sys-workbench-read.md) §1—3、[01-subprd-workbench-items.md](../../05-prd/01-subprd-workbench-items.md) §5、[02-subprd-orders-history.md](../../05-prd/02-subprd-orders-history.md) §5、[04-subprd-installation-materials.md](../../05-prd/04-subprd-installation-materials.md) §5、[05-subprd-installation-review.md](../../05-prd/05-subprd-installation-review.md) §5、[07-subprd-coordination.md](../../05-prd/07-subprd-coordination.md) §5、[06-subprd-reconciliation](../../05-prd/06-subprd-reconciliation.md) §3.1、[interaction-spec](../../02-prototype/interaction-spec.md) §4

## 1. 当前身份与可选服务商

`GET /api/admin/charging/session`，浏览器启动调用，无请求参数。身份核实成功后返回 `data={identityId,displayName,subjectType,businessRoles,authorizationVersion,verifiedAt,accountSwitchingAvailable}`。identityId 为本地主体 string，subjectType 为 HUMAN，businessRoles 为去重的角色 string[]，authorizationVersion 可 null；其余必返非空 string。不得返回凭据或全部权限明细供前端作授权判断。无业务权限仍可返回身份并由列表显示无可办理内容。

`GET /api/admin/charging/providers`，筛选器调用。query：keyword 可选 string，page/pageSize 按公共约定。仅返回当前可见服务商；每项 `{providerId,displayName}` 均 string。即使已知他人服务商编号，也不得借筛选参数扩大范围。

```json
{"code":0,"msg":"success","requestId":"request-development-1","data":{"list":[{"providerId":"provider-dev-a","displayName":"服务商甲"}],"total":1,"page":1,"pageSize":10}}
```

### 1.1 本地账号切换

`session` 增加 `accountSwitchingAvailable:boolean`，只用于决定是否显示本地账号选择入口。正常业务接口继续按已验证的会话身份授权。

| 接口 | 请求与响应 | 约束 |
| --- | --- | --- |
| `GET /api/admin/charging/session/accounts` | `data.list` 每项 `{accountId,identityId,displayName,businessRoles}` | 仅返回开发登录配置中存在且当前有效的人类账号；不返回凭据或权限明细 |
| `POST /api/admin/charging/session/switch` | 正文仅 `{accountId}`；成功返回 `{identityId,displayName}`，设置 HttpOnly、SameSite=Strict 的会话 Cookie | 目标必须是服务端已登记且有效的人类身份；不接受客户端自报角色或授权范围 |

两接口均要求当前有效的人类会话、本地显式开关、mock 来源模式与本机地址。切换请求 Origin 必须等于 LOCAL_UI_ORIGIN；环境未开启返回404，非法账号或请求来源返回403，多余字段返回400。Cookie 失效返回401，不回落到默认账号。响应禁止缓存。切换不修改任何业务数据或角色授权；重复选择同一账号只设置相同会话，不产生业务操作记录。

网页切换成功后重新加载首页；同一浏览器其他标签通过账号变更通知重新加载，清除旧身份页面状态。该扩展按用户2026-09-27要求提供本地运行能力，真实登录继续由身份提供方对接。

## 2. 事项列表与统计

`GET /api/admin/charging/work-items`。

| query | 类型 / 必填 | 规则 |
| --- | --- | --- |
| page、pageSize | integer / 否 | 公共分页 |
| providerId | string / 否 | 限已授权范围 |
| workOrderId | string / 否 | 本地工单id；权限及过滤见§6.3，summary使用同条件 |
| kind | string / 否 | INSTALLATION_PREPARATION / INSTALLATION_REVIEW / RECONCILIATION / CONFIGURATION / COORDINATION |
| status | string / 否 | PREPARING / READY / WAITING_SUPPLEMENT / WAITING_REPLY / PROCESSING / EXCEPTION / BLOCKED / COMPLETED；支持英文逗号分隔多个值，按并集筛选，逐项校验（空项或未知值返回400），重复值去重 |
| keyword | string / 否 | 匹配已授权标题、工单编号与服务商名；绑定查询参数 |
| responsibility | string / 否 | 默认 MINE；MINE / VISIBLE，VISIBLE 仍需原权限，不按京东角色放开全部 |

返回公共分页加 `asOf`（本次查询时间）。list 每项：workItemId、title、kind、status、providerId、providerName 必返 string；workOrderId string/null；assignee `{identityId,displayName}`/null；rowVersion、responsibilityVersion、analysisGeneration 正整数；analysisStatus 为 NOT_READY / AVAILABLE / BLOCKED；updatedAt 为带时区时间。status 与分析状态分开，不能把分析结束当成人员事项完成。每项另含§7.2定义的 reconciliationSummary / reconciliationSummaryAccess，非对账事项显式为空及NOT_APPLICABLE。

`GET /api/admin/charging/work-items/summary` 使用相同筛选参数但无分页，返回 `{total,byStatus,byKind,asOf}`；byStatus/byKind 为 `{value,count}` 数组，count 非负整数。SQL 使用相同权限及筛选条件；列表与统计跨请求数据变化时按 asOf 解释并重查，不用前端当前页数量拼总数。

## 3. 事项详情

`GET /api/admin/charging/work-items/{workItemId}`；path 必填非空 string，需 READ_WORK_ITEM。

data 包含 §2 的 list 单项字段，以及 `analysis`、`pendingOperation`、`completion`、`allowedActions`、`blockedReasons`、`relatedItems`。这些字段均必返：

| 字段 | 结构与含义 |
| --- | --- |
| analysis | null 或 `{resultId,runId,inputSnapshotId,analysisGeneration,status,summary,findings,openQuestions,validatedAt}`；findings 保留 findingId、type、content 与 evidenceRefs；仅返回已授权内容及当前有效结果 |
| pendingOperation | null 或 `{operationId,status}`，状态来自外部写入，不由前端推定 |
| completion | null 或 `{code,basis,decisionId,completedAt}`；basis 为授权范围内对象，decisionId 可 null |
| allowedActions | string[]，按当前权限、责任和状态计算，仅供展示；提交时重新检查 |
| blockedReasons | `{code,description}`[]，无阻断为 [] |
| relatedItems | `{workItemId,reasonCode,title}`[]，只显示有权查看的前后续事项 |

核查及配置的具体数据由对应域接口读取，避免通用详情泄露账单或原文件。配置事项 workOrderId=null；无分析的履约事项 analysis=null 为正常情况。

## 4. 历史记录与操作结果

`GET /api/admin/charging/work-items/{workItemId}/activities`；path 必填，query 仅 page/pageSize。读取 activity_record 及所引用的固定事实；按创建时间和 id 倒序。返回分页项 `{activityId,eventType,actor,occurredAt,description,factType,factId}`，actor 为 `{identityId,displayName}`/null，事实字段可 null；来源未知时间保留 null。

`GET /api/admin/charging/operations/{operationId}`；path 必填，需关联事项及来源记录可见权限。data=`{operationId,workItemId,status,receipt,verifiedAt,localContinuationStatus}`。receipt 为已授权的权威回执对象/null；verifiedAt 可 null；localContinuationStatus 为 NOT_READY / PENDING / COMPLETED / BLOCKED，由实际保存事实计算。外部 SUCCEEDED 与本地接续完成分开显示。

## 5. 错误与数据链路

全部接口使用公共错误；401/503 不伪装成空列表，越权深链接返回 404。提供方暂不可核实时不得继续凭历史授权返回敏感数据。

列表及统计读取本系统保存的事项和结果，来源经后台真实导入。纯查询不触发 Skill；后端实际缺数据时显示准备中或缺项，前端不能补造“待办”。业务操作完成后重读相关详情、列表及统计。

## 6. 工单聚合读取

### 6.1 工单列表

`GET /api/admin/charging/work-orders`。query：page/pageSize 按公共约定；providerId、keyword 可选非空 string。keyword 匹配授权工单的来源编号或已取得的购买订单编号。需 READ_WORK_ORDER，先按当前工单授权范围过滤，再筛选、计数、分页；越权筛选不扩大范围。没有事项的可见工单仍在列表，不能由事项列表拼工单集合。

返回 `{list,total,page,pageSize,asOf}`。list 每项全部必返：

| 字段 | 类型与来源 |
| --- | --- |
| workOrderId / sourceSystem / sourceId | 非空 string；installation_work_order.id / source_system / source_id，路径与关联过滤使用本地 workOrderId |
| providerId / providerName | string/null；当前已核实关联及 service_provider 展示名；未知不得猜测 |
| purchaseOrderId | string/null；当前 context_snapshot_id 所指 context_json.installationWorkOrder.purchaseOrderId |
| sourceState / sourceVersion / verifiedAt | 来源状态原枚举 / string或null / 带时区时间或null，分别取 source_state / source_version / verified_at |
| activeKinds | kind[]；该工单下当前身份可见且未完成事项的类型去重集合，按 §2 枚举顺序，不强行选一个阶段 |
| activeItemCount | 非负 integer；同一权限范围内 status≠COMPLETED 的事项总数，不是当前页行数 |
| updatedAt | 带时区时间；工单本地 gmt_modified 与可见关联事项 gmt_modified 最大值；没有事项时取工单时间 |

按 updatedAt 倒序、workOrderId 倒序稳定分页。activeKinds=[] 且 activeItemCount=0 显示“当前可见范围无进行中事项”，不推导整张工单安装完成。统计不暴露无 READ_WORK_ITEM 权限的其他事项。

### 6.2 工单详情

`GET /api/admin/charging/work-orders/{workOrderId}`。path 为本地非空 id；无 READ_WORK_ORDER 或工单不存在均按公共规则返回404。返回列表单项全部字段，并必返 `{contextSnapshotId,context,entitlementRead,materialReferences,itemSummary,asOf}`：

- contextSnapshotId 为 string/null；context 为 installation_context_snapshot.context_json 的授权投影/null，保留工单、当前方案、正式明细、各自来源版本、retrievedAt、completeness 与 missingParts，来源字段沿安装工单上下文契约 §3。只读取 context_snapshot_id，不取“创建时间最大”的旧版快照。上下文与当前工单关联/版本不相符时 context=null，页面提示上下文待更新，不展示旧方案为当前方案。
- entitlementRead 固定为 `{status,data,errorCode}`；status 为 AVAILABLE / UNAVAILABLE / FORBIDDEN / NOT_LINKED / STALE，data 为购买订单与安装权益读取契约 §3 的完整 data 或 null，errorCode 为 string/null。后台用上下文 purchaseOrderId 与来源工单编号调用已登记的只读权益适配接口，验证当前权限及返回 workOrderSourceVersion；关联明确未取得用 NOT_LINKED，版本不相符用 STALE，读取失败用 UNAVAILABLE，关联记录无权用 FORBIDDEN。只有 AVAILABLE 返回 data，允许 data.completeness=INCOMPLETE 并保留缺项。缺少来源工单版本不能标为 AVAILABLE，保留 STALE 待核实。不将权益字段伪称已存入工单 context_json；前端不直接调用外部接口。该只读调用不触发 Skill、不新建事项、不写业务决定。
- materialReferences 为 `{materialVersionId,sourceSystem,sourceMaterialId,sourceVersion,name,mediaType}`[]，materialVersionId 为已核实本地版本 id或null。后端从当前上下文 sourceMaterials 取得索引，按来源三元组关联确切本地版本，再按 READ_SOURCE_MATERIAL 过滤；未导入版本保留null并禁用原文按钮，不从 AI findings 反推全部材料，不以最新版代替指定版。context 的 sourceMaterials 使用同一授权投影。
- itemSummary 为 `{visibleTotal,activeCount,byKind,byStatus}`，byKind/byStatus 为 `{value,count}`[]，只统计本工单当前可见事项（含完成历史），与下述 VISIBLE 查询范围一致；无事项为0及空数组。明细分页由 `GET work-items?workOrderId={workOrderId}&responsibility=VISIBLE` 取得，不截断数组冒充完整清单。
- asOf 表示本次本地查询时间，各外部字段仍保留各自版本及取数时间，不承诺多来源原子快照。上下文未准备时 context=null、materialReferences=[]，工单身份与事项统计仍可返回；401/503 身份失败不可降级成可见数据。材料/账单权限不因工单可见而放开。

### 6.3 事项按工单筛选

§2 work-items 和 summary 增加可选 `workOrderId`（本地非空 string）。后端核实 READ_WORK_ORDER 及事项各自权限，匹配 work_item.installation_work_order_id 后再筛选、统计、分页；配置事项工单为空不匹配。无权工单返回404，不把他人工单存在性放进统计。summary 与列表应用完全相同条件；工单详情使用 responsibility=VISIBLE，不能默认 MINE 丢掉同工单其他可见责任人的事项。

## 7. 核查场景与对账列表投影

### 7.1 安装核查场景

春和庭差异核查、尚澜府费用依据核查、锦绣里失败恢复是原型的三个详情场景，统一 `kind=INSTALLATION_REVIEW`，均进入同一安装核查详情组件。它们不是三个后端业务类型，也不据标题关键词路由。费用相关内容按当前 analysis.findings / openQuestions 展示；失败按 analysisStatus=BLOCKED 及 blockedReasons 展示；准备中为 NOT_READY。某事项可以同时有费用疑点与分析失败，恢复后仍用同一 workItemId，不改 kind。类型筛选和 byKind 仍只有五种既有值。

### 7.2 对账摘要

§2 事项列表及 §3 详情单项增加必返 `reconciliationSummary`，非 RECONCILIATION 或无双方账单读取权限时为 null；同时必返 `reconciliationSummaryAccess`：NOT_APPLICABLE / FORBIDDEN / ALLOWED，分别说明不适用、无账单权限及可读。不得以0金额替代无权限或缺计算。

可读时 reconciliationSummary 固定 `{reconciliationId,inputSnapshotId,status,currency,jdTotal,providerTotal,difference}`，字段及空值沿业务对账接口 §1；无有效比较返回 PREPARING、其余字段null。有结果时通过 work_item.current_reconciliation_id 关联 reconciliation_record，核实所属事项、当前输入代次及来源/配置仍有效；不按最新创建时间选记录，不依赖 AI 是否成功。status 与详情采用同一映射，MATCHED 仍需全部问题有关闭依据才能显示 RECONCILED。

同页摘要在服务端按授权集合批量读取，列表返回即足够渲染差额；禁止浏览器为每一行额外请求详情。difference 来自 difference_amount（服务商减京东的精确十进制字符串），不可比为null，零为“0”；前端仅格式化。金额可读但无可靠比较时展示“尚未取得可靠计算”；FORBIDDEN 展示“无账单查看权限”。详情打开后若版本已变，以新的 reconciliationId/inputSnapshotId 为准并刷新列表；同一有效比较版本的摘要与详情金额及视图状态一致。


## 2026-09-27 手动分析

依据：[工作台 PRD](../../05-prd/01-subprd-workbench-items.md)“手动分析补充”；实现 `code/api/src/services/analysis-control.ts`。`POST /api/admin/charging/work-items/{workItemId}/analysis`，必填 Idempotency-Key（最多120字符）和 JSON `{expectedVersion: 正整数}`。当前具体责任人须具备本业务处理动作权限，事项必须可重分析且无待确认外写。成功返回 `{status: ACCEPTED | ALREADY_QUEUED, analysisGeneration}`，只代表排入处理。相同请求重放复用结果；旧版本40901、同键异内容40902、无权限40301、缺少运行配置50301。

详情增加 analysisProgress（state、description、errorCode）、canRequestAnalysis、analysisRuntimeError。state 为 PREPARING / QUEUED / RUNNING / FAILED / AVAILABLE / NOT_APPLICABLE，仅按当前分析代次读取任务；不把历史失败当成当前失败。凭证缺失提示不包含密钥。mock 环境中的新资料等待事项责任人手动触发。


## 2026-09-27 mock 手动触发与业务资料

mock 当前执行口径如下。详情新增 analysisTriggerMode=manual，analysisProgress.state 包含 WAITING_MANUAL。只有所属责任人具备现有业务动作时 canRequestAnalysis=true；京东可以读取服务商配置，不代替服务商运行配置分析。按钮只出现在具体事项详情。

- GET `/api/admin/charging/work-items/{id}/business-materials`：返回 records、sourceMaterials、uploads、mappingUpload、issues、sourceError、retrievedAt。核实事项可见性、READ_SOURCE_MATERIAL；工单和对账资料分别追加原有读取权限。仅读取，不创建分析快照或任务；来源不可用时仍返回已上传文件和明确错误。
- GET `.../{id}/business-materials/content?sourceSystem=&sourceMaterialId=&sourceVersion=`：仅允许当前事项来源索引中的原文件，返回前核对归属、版本、MIME、10 MB 限制、长度及 SHA256。跨服务商或冒用文件不可下载。
- GET `/api/admin/charging/material-versions/{id}/content`：沿用本地真实上传下载接口，保留授权隔离。
- POST `/api/admin/charging/uploads`：multipart 真文件。配置事项使用 PROVIDER_FORMAT；保存原文件、版本和解析任务。最近 XLSX 经实际解析成为配置输入；再次上传清除旧候选并更新分析代次，等待新的手动触发。映射结果由固定上传数据和候选规则实际执行产生。

程序逐项核对完全一致的对账，analysisProgress.state=CHECKED、analysisStatus=AVAILABLE、analysis=null、canRequestAnalysis=false，保存真实比较记录而不创建模型调用。正常数量/单价差异且基础计算完整的事项在解释完成后进入 READY，不因有差额本身变为 BLOCKED。
