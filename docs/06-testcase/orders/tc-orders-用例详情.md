<!-- @meta docId="tc-orders-detail" status="active" baseline="v1.0.0" -->
# 工单查询与处理追溯 — 用例详情

> 上游（我引用）：[02-subprd-orders-history.md](../../05-prd/02-subprd-orders-history.md) §7、[workbench-apis.md](../../03-foundation/03-06-provided-apis/workbench-apis.md) §2—6、[material-apis.md](../../03-foundation/03-06-provided-apis/material-apis.md) §1、[work-item-schema.md](../../03-foundation/03-05-schema/work-item-schema.md)、[evidence-schema.md](../../03-foundation/03-05-schema/evidence-schema.md)
> 下游（引用我）：[tc-main-jd-charging.md](../tc-main-jd-charging.md) 域登记（主索引由协调者随后创建后登记）

> **索引文件**: [tc-orders.md](tc-orders.md)
> **通用前置**: 已执行 [sql/TC-ORD-SEED.sql](sql/TC-ORD-SEED.sql)；身份模拟配置就位（京东核查张明 `{CRED_张明}`、服务商甲资料李工 `{CRED_李工}`、服务商乙人员 `{CRED_乙}`、无材料权限身份 `{CRED_无材权}`、授权范围内无工单身份 `{CRED_空}`）；历史保护触发器约定见索引层 §二第 3 条
> **请求约定**: `{BASE_URL}` 见索引层 §二第 4 条；响应为统一 JSON 壳（`/content` 为二进制例外）

---

## 一、API 验证用例

### TC-ORD-01：工单列表返回（含无事项工单）

> PRD：02-subprd-orders-history.md §7 验收#1、补充验收第 1 行｜方式：curl
> 数据：[sql/TC-ORD-01.sql](sql/TC-ORD-01.sql)（复用 SEED，不新增数据）

**步骤**：
1. `curl -H "Authorization: {CRED_张明}" "{BASE_URL}/api/admin/charging/work-orders"`
2. `curl -H "Authorization: {CRED_张明}" "{BASE_URL}/api/admin/charging/work-orders?page=1&pageSize=1"`

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| HTTP / code | 200 / 0 |
| 步骤1 list | 含 wo-ord-01、wo-ord-02 两行；不含 wo-ord-03（服务商乙） |
| wo-ord-01 行 | 工单编号 WO-2026-0001、providerName="服务商甲"、当前阶段与进行中事项统计非零 |
| wo-ord-02 行 | 仍在列表；activeKinds=[]、activeItemCount=0；不标安装完成 |
| 步骤2 | total=2，list 仅 1 行；page=2 可取第二行，分页可用 |

**数据清理**：见 SQL 文件「数据清理」段（重建隔离测试库还原，下同）

### TC-ORD-02：越权访问被拒

> PRD：02-subprd-orders-history.md §7 验收#2、#13｜方式：curl
> 数据：[sql/TC-ORD-02.sql](sql/TC-ORD-02.sql)（复用 SEED：wo-ord-03 / wi-ord-b 为服务商乙资源）

**步骤**：
1. `curl -H "Authorization: {CRED_张明}" "{BASE_URL}/api/admin/charging/work-orders/wo-ord-03"`
2. `curl -H "Authorization: {CRED_张明}" "{BASE_URL}/api/admin/charging/work-items/wi-ord-b"`
3. `curl -H "Authorization: {CRED_无材权}" "{BASE_URL}/api/admin/charging/material-versions/smv-ord-001-v1/content"`

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤1 | 404 公共错误；不返回工单任何字段 |
| 步骤2 | 404 公共错误；不区分"不存在"与"不可见" |
| 步骤3 | 404/403 公共错误（口径见索引层待确认#2）；响应不含存储地址与 content_locator |

### TC-ORD-03：工单详情聚合读取

> PRD：02-subprd-orders-history.md §7 验收#3、补充验收第 2、4 行｜方式：curl
> 数据：[sql/TC-ORD-03.sql](sql/TC-ORD-03.sql)（复用 SEED：ctx-ord-01 含 PO-2026-9001、方案 pv-2、两条材料索引）

**步骤**：
1. `curl -H "Authorization: {CRED_张明}" "{BASE_URL}/api/admin/charging/work-orders/wo-ord-01"`
2. `curl -H "Authorization: {CRED_张明}" "{BASE_URL}/api/admin/charging/work-items?workOrderId=wo-ord-01&responsibility=VISIBLE"`

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤1 上下文区 | 购买订单 PO-2026-9001、方案 plan-ord-01 / pv-2、installedQuantity=2 |
| 步骤1 材料索引 | 含 MAT-ORD-001（已导入，materialVersionId 非空）与 MAT-ORD-009（未导入，materialVersionId=null）两条 |
| 步骤1 事项汇总 | 统计覆盖 VISIBLE 全范围：wi-ord-prep（COMPLETED）+ wi-ord-rev（READY）+ wi-ord-recon（PROCESSING）均计入 |
| 步骤2 list | 含上述三个事项；不含 wi-ord-cfg（配置事项，不属于工单）；不含 wi-ord-b |
| entitlementRead | 取值 ∈ 契约五态；本数据下不填 0 权益 |

### TC-ORD-04：权益读取三态

> PRD：02-subprd-orders-history.md §7 补充验收第 3 行｜方式：curl + 环境配合
> 数据：[sql/TC-ORD-04.sql](sql/TC-ORD-04.sql)（STALE 由 SQL 构造 wo-ord-04 + ctx-ord-04 版本不符；FORBIDDEN 由身份模拟配置；UNAVAILABLE 由权益 mock 故障注入）

**步骤**：
1. 故障注入使权益适配接口返回 5xx，请求 `GET /work-orders/wo-ord-01`
2. 以"工单可见但购买订单关联记录无权"凭据请求同一接口
3. 恢复后请求 `GET /work-orders/wo-ord-04`（mock 权益版本与工单 wv-9 不符）

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤1 | entitlementRead.status="UNAVAILABLE"；其余区域正常返回，不填 0 权益 |
| 步骤2 | entitlementRead.status="FORBIDDEN"；不展示任何权益内容 |
| 步骤3 | entitlementRead.status="STALE"；不把旧版权益展示为当前权益 |

### TC-ORD-05：处理记录分页与 event_key 去重

> PRD：02-subprd-orders-history.md §7 验收#4、#11｜方式：curl
> 数据：[sql/TC-ORD-05.sql](sql/TC-ORD-05.sql)（wi-ord-rev 共 12 条事件，覆盖七类事件类型，event_key 各自唯一）

**步骤**：
1. `curl -H "Authorization: {CRED_张明}" "{BASE_URL}/api/admin/charging/work-items/wi-ord-rev/activities?page=1&pageSize=10"`
2. `curl -H "Authorization: {CRED_张明}" "{BASE_URL}/api/admin/charging/work-items/wi-ord-rev/activities?page=2&pageSize=10"`

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤1 | total=12，list 10 条；按创建时间和 id 倒序，顺序稳定（重复请求一致） |
| 步骤2 | list 2 条；与步骤1 无重复 activityId（event_key 去重生效） |
| 事件字段 | eventType / actor / occurredAt / description / factType / factId 直透；非 PROGRESS_SAVED 事件 factType+factId 非空 |

### TC-ORD-06：处理记录未知字段直透

> PRD：02-subprd-orders-history.md §7 验收#5｜方式：curl
> 数据：[sql/TC-ORD-06.sql](sql/TC-ORD-06.sql)（wi-ord-recon 两条来源导入事件：actor_identity_id=NULL、occurred_at=NULL，gmt_create 有先后）

**步骤**：
1. `curl -H "Authorization: {CRED_李工}" "{BASE_URL}/api/admin/charging/work-items/wi-ord-recon/activities"`

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| actor | null（接口不补造执行人） |
| occurredAt | null（接口不补造来源时间） |
| 排序 | 两条事件按本地保存时间倒序（gmt_create 晚者在前） |

### TC-ORD-07：外部操作结果块

> PRD：02-subprd-orders-history.md §7 验收#12｜方式：curl
> 数据：[sql/TC-ORD-07.sql](sql/TC-ORD-07.sql)（复用 SEED：op-ord-01 status=SUCCEEDED、receipt 非空）

**步骤**：
1. `curl -H "Authorization: {CRED_张明}" "{BASE_URL}/api/admin/charging/operations/op-ord-01"`

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| status | "SUCCEEDED"（真实外部结果，非前端推定） |
| receipt / verifiedAt | 非空，receipt.finalState="ACCEPTED" |
| localContinuationStatus | 与 status 分开返回的独立字段；取值合法（具体计算条件见索引层待确认#1） |

### TC-ORD-08：材料 REFERENCED 读取

> PRD：02-subprd-orders-history.md §7 验收#6｜方式：curl
> 数据：[sql/TC-ORD-08.sql](sql/TC-ORD-08.sql)（复用 SEED：smv-ord-002 全部内容字段 NULL）

**步骤**：
1. `curl -H "Authorization: {CRED_张明}" "{BASE_URL}/api/admin/charging/material-versions/smv-ord-002"`
2. `curl -H "Authorization: {CRED_张明}" "{BASE_URL}/api/admin/charging/material-versions/smv-ord-002/content"`

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤1 | readState="REFERENCED"；name/mediaType/byteLength/sha256 均为 null；parsing 为空 |
| 步骤2 | 公共错误（42201 未取原文），不返回任何字节 |

### TC-ORD-09：空文件与解析不全的元数据区分

> PRD：02-subprd-orders-history.md §7 验收#7、#10｜方式：curl
> 数据：[sql/TC-ORD-09.sql](sql/TC-ORD-09.sql)（复用 SEED：mp-ord-003 blocks=[]；mp-ord-004 INCOMPLETE 带 issues）

**步骤**：
1. `curl -H "Authorization: {CRED_张明}" "{BASE_URL}/api/admin/charging/material-versions/smv-ord-003"`
2. `curl -H "Authorization: {CRED_张明}" "{BASE_URL}/api/admin/charging/material-versions/smv-ord-004"`

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤1 | readState="VERIFIED"；parsing.completeness="COMPLETE" 且 blocks=[]（空文件事实，非读取失败） |
| 步骤2 | parsing.completeness="INCOMPLETE"；issues 含 PAGE_UNREADABLE"第 2 页扫描件无法识别"；units 中第 2 页 status="UNREADABLE" |

---

## 二、UI 验证用例

### TC-ORD-11：工单列表渲染与空态

> PRD：02-subprd-orders-history.md §7 验收#1｜方式：浏览器
> 数据：[sql/TC-ORD-11.sql](sql/TC-ORD-11.sql)（同 TC-ORD-01 数据集）

**步骤**：
1. 以 `{CRED_张明}` 打开安装工单列表页
2. 切换 `{CRED_空}`（授权范围内无工单）刷新页面

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤1 | 两行工单：编号、服务商、当前阶段、进行中事项数与 TC-ORD-01 接口结果一致 |
| 步骤2 | 空态插画与引导文案；不显示任何工单行、不报错 |

### TC-ORD-12：服务商身份列表隔离与越权深链接

> PRD：02-subprd-orders-history.md §7 验收#2｜方式：浏览器
> 数据：[sql/TC-ORD-12.sql](sql/TC-ORD-12.sql)（同 TC-ORD-02 数据集）

**步骤**：
1. 以 `{CRED_李工}` 打开工单列表
2. 浏览器直接输入他商工单详情地址（wo-ord-03）

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤1 | 仅服务商甲工单；无服务商乙任何行 |
| 步骤2 | 404 提示页（无可读工单信息）；深链接同样经服务端身份范围检查 |

### TC-ORD-13：工单详情四个信息区渲染

> PRD：02-subprd-orders-history.md §7 验收#3｜方式：浏览器
> 数据：[sql/TC-ORD-13.sql](sql/TC-ORD-13.sql)（同 TC-ORD-03 数据集）

**步骤**：
1. 以 `{CRED_张明}` 打开 wo-ord-01 工单详情

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 信息区 | 工单与订单、方案、材料索引、关联事项四个区齐全 |
| 事项清单 | 三阶段事项在列（资料整理已完成 / 核查进行中 / 对账进行中）；配置事项"服务商甲接入配置确认"不出现 |
| 材料索引 | MAT-ORD-009 显示未导入态，可区分于已导入项 |

### TC-ORD-14：处理记录时间线展示

> PRD：02-subprd-orders-history.md §7 验收#4、#5｜方式：浏览器
> 数据：[sql/TC-ORD-14.sql](sql/TC-ORD-14.sql)（执行 TC-ORD-05 + TC-ORD-06 数据）

**步骤**：
1. 打开 wi-ord-rev 处理记录页，翻页浏览
2. 打开 wi-ord-recon 处理记录页

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤1 | 时间线倒序展示业务动作、执行人、说明、时间；翻页无重复事件 |
| 步骤2 | null 执行人显示"执行人未知"；null 来源时间显示"来源时间未知"；按本地保存时间排序 |

### TC-ORD-15：解析不全如实展示

> PRD：02-subprd-orders-history.md §7 验收#10｜方式：浏览器
> 数据：[sql/TC-ORD-15.sql](sql/TC-ORD-15.sql)（同 TC-ORD-09 数据集）

**步骤**：
1. 工单详情材料索引打开 MAT-ORD-004 证据侧栏

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 解析状态 | 显示解析不全及 issues 缺项（"第 2 页扫描件无法识别"） |
| 负面清单 | 不显示"资料齐全"；已识别内容块仍可查 |

### TC-ORD-16：证据侧栏"原文未取得"与"文件内容为空"区分

> PRD：02-subprd-orders-history.md §7 验收#6、#7｜方式：浏览器
> 数据：[sql/TC-ORD-16.sql](sql/TC-ORD-16.sql)（smv-ord-002 REFERENCED；smv-ord-003 VERIFIED 且 blocks=[]）

**步骤**：
1. 分别打开 MAT-ORD-002、MAT-ORD-003 证据侧栏

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| MAT-ORD-002 | 显示"原文未取得"态与已有元数据（编号/版本）；不显示空文件态；无正文加载入口 |
| MAT-ORD-003 | 显示"文件内容为空"；与读取失败文案明确不同 |

### TC-ORD-17：证据侧栏材料版本切换

> PRD：02-subprd-orders-history.md §7 验收#8｜方式：浏览器
> 数据：[sql/TC-ORD-17.sql](sql/TC-ORD-17.sql)（sm-ord-001 下 v1/v2 双版本；文件存储存有对应字节）

**步骤**：
1. 打开 MAT-ORD-001 证据侧栏（默认当前版本）
2. 切换至另一已保存版本，再切回

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 切换后 | 元数据（sha256/字节数）、解析内容块（v2 含"新增车位照片说明"）、原文区均换为所选版本 |
| 权限 | 每次切换 /content 请求均经服务端权限核实，不缓存公开地址 |

### TC-ORD-18：解析原文定位

> PRD：02-subprd-orders-history.md §7 验收#9｜方式：浏览器
> 数据：[sql/TC-ORD-18.sql](sql/TC-ORD-18.sql)（ar-ord-seed evidenceRefs → blk-ord-1 → unit-1 PDF 第 1 页）

**步骤**：
1. 从 wi-ord-rev 分析结果"供电条件"发现点击"查看原文"

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 定位 | 证据侧栏打开 MAT-ORD-001 v1，定位到内容块 blk-ord-1 及其 PDF 第 1 页位置 |
| 引文一致性 | 侧栏高亮文本与 evidenceRefs.quote 一致（"现场已具备 380V 供电条件，配电箱距车位 12 米。"） |

### TC-ORD-19：接口异常的错误提示与重试

> PRD：02-subprd-orders-history.md §7 验收#14｜方式：浏览器 + 故障注入
> 数据：[sql/TC-ORD-19.sql](sql/TC-ORD-19.sql)（时间线数据同 TC-ORD-05；故障为环境操作）

**步骤**：
1. 故障注入使 work-items / activities 返回 500，打开工单详情与处理记录页
2. 恢复接口，点击重试

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤1 | 页面展示错误提示与重试入口；不伪装成空列表、不补造记录 |
| 步骤2 | 重试后正常渲染真实数据 |

---

> 版本历史见索引层 [tc-orders.md](tc-orders.md) §五。全部 SQL 已经内存 SQLite 加载真实候选 DDL（含历史保护触发器）两遍执行验证通过。
