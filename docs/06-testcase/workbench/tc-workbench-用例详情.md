<!-- @meta docId="tc-workbench-detail" status="active" baseline="v1.0.0" -->
# 待处理事项与工作台总览 — 用例详情

> 上游（我引用）：[01-subprd-workbench-items.md](../../05-prd/01-subprd-workbench-items.md) §7、[work-item-schema.md](../../03-foundation/03-05-schema/work-item-schema.md)、[workbench-apis.md](../../03-foundation/03-06-provided-apis/workbench-apis.md)
> 下游（引用我）：[tc-main-jd-charging.md](../tc-main-jd-charging.md) 域登记（主索引随后由协调者创建）

> **索引文件**: [tc-workbench.md](tc-workbench.md)
> **通用前置**: 已执行 SEED、身份模拟配置就位、每用例前重建测试库（见索引层 §二）
> **请求约定**: API 用例默认带 `{CRED_张三}` 凭据；`{BASE_URL}` 见索引层

---

## 三、API 验证用例

### TC-WB-01：列表正常返回三种类型事项

> PRD：01-subprd-workbench-items.md §7 验收#1｜方式：curl
> 数据：执行 [sql/TC-WB-01.sql](sql/TC-WB-01.sql)「数据准备」段（3 条 READY 事项：安装核查/业务对账/履约协同，责任人张三，服务商甲）

**步骤**：
1. `curl -H "Authorization: {CRED_张三}" "{BASE_URL}/api/admin/charging/work-items"`
2. 解析响应 JSON

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| HTTP 状态码 / code | 200 / 0 |
| data.total | 3 |
| data.list 顺序 | wi-wb01-001 → wi-wb01-002 → wi-wb01-003（gmt_modified DESC） |
| list[0] 字段 | workItemId="wi-wb01-001"、title="春和庭安装资料核查"、kind="INSTALLATION_REVIEW"、status="READY"、providerName="服务商甲"、workOrderId="wo-test-001"、assignee.displayName="张三"、rowVersion=1、responsibilityVersion=1、analysisGeneration=1 |
| analysisStatus | 每项取值 ∈ {NOT_READY, AVAILABLE, BLOCKED} |
| updatedAt | 带时区 ISO 8601 字符串，与该行 gmt_modified 对应 |
| reconciliationSummary / Access | 非对账事项：null / NOT_APPLICABLE；wi-wb01-002（对账，张三无账单权限）：null / FORBIDDEN |
| data.asOf | 非空带时区时间 |

**数据清理**：见 SQL 文件「数据清理」段（随测试库重建还原，下同不再重复说明）

### TC-WB-02：默认责任范围 MINE 与 VISIBLE

> PRD：01-subprd-workbench-items.md §7 验收#2｜方式：curl
> 数据：[sql/TC-WB-02.sql](sql/TC-WB-02.sql)（2 条责任人为张三、1 条责任人为赵六，均服务商甲、可见范围内）

**步骤**：
1. `curl -H "Authorization: {CRED_张三}" "{BASE_URL}/api/admin/charging/work-items"`（不传 responsibility）
2. `curl -H "Authorization: {CRED_张三}" "{BASE_URL}/api/admin/charging/work-items?responsibility=VISIBLE"`

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤1 total | 2（默认按 MINE） |
| 步骤1 list | 每项 assignee.identityId="user-wb-reviewer"；不含 wi-wb02-003 |
| 步骤2 total | 3 |
| 步骤2 list | 含 wi-wb02-003（assignee.identityId="user-wb-other"） |

### TC-WB-03：summary 计数与列表一致性

> PRD：01-subprd-workbench-items.md §7 验收#3｜方式：curl
> 数据：[sql/TC-WB-03.sql](sql/TC-WB-03.sql)（张三 8 条：5 READY、2 WAITING_SUPPLEMENT、1 COMPLETED；类型 6 安装核查/1 对账/1 协同）

**步骤**：
1. `curl -H "Authorization: {CRED_张三}" "{BASE_URL}/api/admin/charging/work-items/summary"`
2. `curl -H "Authorization: {CRED_张三}" "{BASE_URL}/api/admin/charging/work-items?page=1&pageSize=10"`

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| summary data.total | 8 |
| byStatus | 含 {value:"READY",count:5}、{value:"WAITING_SUPPLEMENT",count:2}、{value:"COMPLETED",count:1}；count 均为非负整数 |
| byKind | 含 {value:"INSTALLATION_REVIEW",count:6}、{value:"RECONCILIATION",count:1}、{value:"COORDINATION",count:1} |
| summary data.asOf | 非空带时区时间 |
| 列表 data.total | 8（与 summary.total 一致） |

### TC-WB-04：组合筛选 kind + status

> PRD：01-subprd-workbench-items.md §7 验收#4｜方式：curl
> 数据：[sql/TC-WB-04.sql](sql/TC-WB-04.sql)（张三 5 条：3 对账 READY、1 对账 PROCESSING、1 安装核查 READY）

**步骤**：
1. `curl -H "Authorization: {CRED_张三}" "{BASE_URL}/api/admin/charging/work-items?kind=RECONCILIATION&status=READY"`
2. `curl -H "Authorization: {CRED_张三}" "{BASE_URL}/api/admin/charging/work-items/summary?kind=RECONCILIATION&status=READY"`

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 列表 total | 3 |
| 列表 list 每项 | kind="RECONCILIATION" 且 status="READY" |
| summary total | 3（与列表同条件） |
| summary byStatus | 仅 {value:"READY",count:3}；byKind 仅 {value:"RECONCILIATION",count:3} |

### TC-WB-05：关键词搜索

> PRD：01-subprd-workbench-items.md §7 验收#5｜方式：curl
> 数据：[sql/TC-WB-05.sql](sql/TC-WB-05.sql)（春和庭事项挂工单 WO-SD-20260901、尚澜府事项挂 WO-SD-20260902，均服务商甲；另有服务商乙事项挂 WO-SD-20260903）

**步骤**：
1. `curl -H "Authorization: {CRED_张三}" "{BASE_URL}/api/admin/charging/work-items?keyword=WO-SD-20260901"`
2. `curl ... "?keyword=春和庭"`（URL 编码）
3. `curl ... "?keyword=服务商甲"`（URL 编码）
4. `curl ... "?keyword=WO-SD-20260903"`

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤1 | total=1，list[0].workItemId="wi-wb05-001" |
| 步骤2 | total=1，list[0].workItemId="wi-wb05-001" |
| 步骤3 | total=2，含 wi-wb05-001 与 wi-wb05-002 |
| 步骤4 | total=0 且 list=[]（越权服务商数据不泄露） |

### TC-WB-06：session 契约

> PRD：01-subprd-workbench-items.md §7 验收#9｜方式：curl｜数据：无（仅 SEED 与身份模拟配置）

**步骤**：
1. `curl -H "Authorization: {CRED_张三}" "{BASE_URL}/api/admin/charging/session"`

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| HTTP 状态码 / code | 200 / 0 |
| data.identityId | "user-wb-reviewer"（非空 string） |
| data.displayName | "张三"（非空 string） |
| data.subjectType | "HUMAN" |
| data.businessRoles | 非空 string[]，元素 ∈ 六角色枚举（INSTALLATION_REVIEWER 等，术语表 §3） |
| data.verifiedAt | 非空 string |
| 响应整体 | 不含凭据、不含全部权限明细 |

### TC-WB-07：providers 可见范围与越权 providerId

> PRD：01-subprd-workbench-items.md §7 验收#12｜方式：curl
> 数据：[sql/TC-WB-07.sql](sql/TC-WB-07.sql)（服务商甲、乙各 1 条张三名下事项；张三授权范围仅服务商甲）

**步骤**：
1. `curl -H "Authorization: {CRED_张三}" "{BASE_URL}/api/admin/charging/providers"`
2. `curl ... "{BASE_URL}/api/admin/charging/work-items?providerId=provider-dev-a"`
3. `curl ... "{BASE_URL}/api/admin/charging/work-items?providerId=provider-dev-b"`

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤1 data.list | 仅含 {providerId:"provider-dev-a",displayName:"服务商甲"}；total=1；不含 provider-dev-b |
| 步骤2 | total=1，list[0].workItemId="wi-wb07-001" |
| 步骤3 | `[待确认-需产品明确]`：PRD §3.7 写"按权限过滤或返回 404"未唯一。不变量（必须满足）：不返回任何 provider-dev-b 数据——若 200 则 total=0 且 list=[]；若 404 则 code=40404、data=null |

### TC-WB-08：权限先于分页，total 不泄露

> PRD：01-subprd-workbench-items.md §7 验收#13｜方式：curl
> 数据：[sql/TC-WB-08.sql](sql/TC-WB-08.sql)（张三服务商甲 12 条：8 READY、3 WAITING_SUPPLEMENT、1 COMPLETED；另有服务商乙 3 条 READY）

**步骤**：
1. `curl ... "{BASE_URL}/api/admin/charging/work-items?page=1&pageSize=10"`
2. `curl ... "{BASE_URL}/api/admin/charging/work-items?page=2&pageSize=10"`

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤1 total / list 长度 | 12 / 10 |
| 步骤2 list 长度 | 2 |
| 两页全部行 providerId | 均为 "provider-dev-a"，不出现 provider-dev-b（total=12 不含越权 3 条） |
| 排序 | 同页内按 updatedAt 倒序稳定 |

### TC-WB-09：字段缺失项返回 null

> PRD：01-subprd-workbench-items.md §7 验收#14｜方式：curl
> 数据：[sql/TC-WB-09.sql](sql/TC-WB-09.sql)（1 条接入配置事项：无工单、待分配；1 条安装核查事项：待分配）

**步骤**：
1. `curl ... "{BASE_URL}/api/admin/charging/work-items"`

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| wi-wb09-001 行 | kind="CONFIGURATION"、workOrderId=null、assignee=null |
| wi-wb09-002 行 | assignee=null、workOrderId="wo-test-001" |
| 两行其余字段 | title/status/providerName="服务商甲"/updatedAt 等必返字段照常非空 |

---

## 四、UI 验证用例

### TC-WB-11：列表行渲染

> PRD：01-subprd-workbench-items.md §7 验收#1｜方式：浏览器 UI
> 数据：[sql/TC-WB-11.sql](sql/TC-WB-11.sql)（同 TC-WB-01 场景，id 前缀 wi-wb11-）

**步骤**：
1. 以 `{CRED_张三}` 打开 `{WEB_URL}#home`
2. 观察列表区三行事项

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 行数与顺序 | 3 行，顺序 wi-wb11-001 → 002 → 003 |
| 首行 | 标题"春和庭安装资料核查"、类型"安装核查"、状态"待处理"、服务商"服务商甲"、工单"wo-test-001"、责任人"张三"、更新时间为 updatedAt 的格式化值 |
| 类型中文标签 | 安装核查 / 业务对账 / 履约协同 与 kind 一一对应 |
| 状态中文标签 | 三行均为"待处理" |

### TC-WB-12：默认责任范围展示与切换

> PRD：01-subprd-workbench-items.md §7 验收#2｜方式：浏览器 UI
> 数据：[sql/TC-WB-12.sql](sql/TC-WB-12.sql)（同 TC-WB-02 场景，id 前缀 wi-wb12-）

**步骤**：
1. 打开 `{WEB_URL}#home`，打开浏览器网络面板
2. 观察筛选区责任范围默认值与列表；切换为"我可见的"

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 默认选中 | "我负责的"；列表请求带 responsibility=MINE |
| 默认列表 | 2 行，责任人均为"张三"，无赵六名下事项 |
| 切换后 | 列表 3 行，出现赵六名下 wi-wb12-003，请求带 responsibility=VISIBLE |

### TC-WB-13：汇总区直透展示

> PRD：01-subprd-workbench-items.md §7 验收#3｜方式：浏览器 UI
> 数据：[sql/TC-WB-13.sql](sql/TC-WB-13.sql)（同 TC-WB-08 场景，服务商甲 12 条，id 前缀 wi-wb13-）

**步骤**：
1. 打开 `{WEB_URL}#home`，停留第 1 页（10 行）

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 汇总总数 | 12（非当前页行数 10） |
| 按状态计数 | 待处理 8、待补充 3、已完成 1，与 summary 返回一致 |
| 按类型计数 | 与 summary 的 byKind 各 {value,count} 一致，计数为 0 的分组不由前端补出 |
| asOf | 分页区展示本次查询时间 |

### TC-WB-14：组合筛选同时重查与页码重置

> PRD：01-subprd-workbench-items.md §7 验收#4｜方式：浏览器 UI
> 数据：[sql/TC-WB-14.sql](sql/TC-WB-14.sql)（同 TC-WB-04 场景，id 前缀 wi-wb14-）

**步骤**：
1. 打开 `{WEB_URL}#home`，网络面板待命
2. 类型选"业务对账"、状态选"待处理"

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 请求 | work-items 与 summary 同时重查，二者 query 均为 kind=RECONCILIATION&status=READY |
| 页码 | 重置为第 1 页 |
| 列表 | 3 行，均为对账待处理事项 |
| 汇总 | 总数 3，与列表一致 |

### TC-WB-15：关键词搜索呈现

> PRD：01-subprd-workbench-items.md §7 验收#5｜方式：浏览器 UI
> 数据：[sql/TC-WB-15.sql](sql/TC-WB-15.sql)（同 TC-WB-05 场景，id 前缀 wi-wb15-）

**步骤**：
1. 打开 `{WEB_URL}#home`
2. 关键词输入"WO-SD-20260901"并触发搜索

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 请求 | work-items 与 summary 均带 keyword=WO-SD-20260901 |
| 列表 | 仅 1 行"春和庭安装资料核查"（wi-wb15-001） |
| 汇总 | 总数 1 |

### TC-WB-16：分析失败标识与缺失字段兜底

> PRD：01-subprd-workbench-items.md §7 验收#6、#14｜方式：浏览器 UI
> 数据：[sql/TC-WB-16.sql](sql/TC-WB-16.sql)（wi-wb16-001 安装核查 READY 且接口返回 analysisStatus=BLOCKED；wi-wb16-002 接入配置 READY、assignee=null）
> ⚠️ `[待确认-需产品明确]`：analysisStatus=BLOCKED 由服务端按分析失败事实计算，当前 schema 无 SQL 可构造入口，SQL 已备事项行，BLOCKED 状态构造方式待明确后补齐

**步骤**：
1. 打开 `{WEB_URL}#home`，观察两行

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| wi-wb16-001 | 行内标识"分析失败/受阻"；状态仍为"待处理"，不显示为已完成、不作可忽略处理 |
| wi-wb16-002 | 责任人位显示"待分配"；工单编号位不显示且无占位符；标题/类型/状态/更新时间照常渲染 |

### TC-WB-17：空态两种文案与无权限身份

> PRD：01-subprd-workbench-items.md §7 验收#7、#11｜方式：浏览器 UI
> 数据：[sql/TC-WB-17.sql](sql/TC-WB-17.sql)（无新增事项；王五身份无任何授权）

**步骤**：
1. 以 `{CRED_王五}` 打开 `{WEB_URL}#home`
2. 以 `{CRED_张三}` 打开，关键词输入"WB17不存在的关键词"触发搜索

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤1 身份区 | 正常显示"王五"（不伪装成加载失败） |
| 步骤1 列表区 | 显示"当前无可办理内容"，不伪造待办 |
| 步骤2 列表区 | 显示空态文案"当前没有需要处理的事项"，并提示可清除筛选；与无权限文案可区分 |

### TC-WB-18：列表接口 503 真实呈现

> PRD：01-subprd-workbench-items.md §7 验收#8｜方式：浏览器 UI
> 数据：[sql/TC-WB-18.sql](sql/TC-WB-18.sql)（3 条 READY 事项，id 前缀 wi-wb18-）

**步骤**：
1. 打开 `{WEB_URL}#home`，确认 3 行正常渲染
2. 使列表接口不可用（停止本地服务或断开网络），触发筛选变化以重查列表

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 错误呈现 | 展示真实失败状态（错误提示 + 重试入口），不显示为空列表 |
| 已展示内容 | 原 3 行内容保留，不被清空 |
| 恢复 | 恢复服务后点击重试，列表重新加载成功 |

### TC-WB-19：启动顺序、身份区与登录失效

> PRD：01-subprd-workbench-items.md §7 验收#9、#10｜方式：浏览器 UI
> 数据：[sql/TC-WB-19.sql](sql/TC-WB-19.sql)（1 条 READY 事项，id 前缀 wi-wb19-）

**步骤**：
1. 以 `{CRED_张三}` 直接打开深链接 `{WEB_URL}#home`，网络面板记录请求顺序
2. 观察身份区
3. 改用 `{CRED_失效}` 打开同一地址

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 请求顺序 | session 先发出；session 成功后才发出 summary 与 work-items；深链接同样先走 session |
| 身份区 | 显示"张三"及角色中文名"京东安装资料核查人员"（术语表 §3 映射）；多角色时逐个展示 |
| 步骤3 | session 返回 401/40101；不发出 work-items / summary 请求；引导恢复真实登录，不自动切换身份 |

---

## 五、版本历史

| 版本 | 日期 | 变更说明 |
|------|------|---------|
| v1.0.0 | 2026-09-20 | 初版：API 9 条 + UI 9 条用例详情 |
