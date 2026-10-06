# 本系统接口公共约定

> 版本：V1.0｜日期：2026-09-20｜状态：开发契约，服务未实现
> 上游（我引用）：[接口规范](../../../rules/coding-standards/09-api-design.md) §2—9、[身份与权限](../03-02-external-apis/current-identity-permissions-read.md) §2—4、[表结构总核对](../03-05-schema/coverage-review.md) §2—4、[运行数据规则](../../../rules/runtime-mock-data.md) §1—4
> 下游（引用我）：[工作台查询](workbench-apis.md) §1—5、[材料](material-apis.md) §1—3、[安装](installation-apis.md) §1—4、[对账](reconciliation-apis.md) §1—3、[配置](configuration-apis.md) §1—3、[协同异常](coordination-apis.md) §1—4、[内部执行](execution-apis.md) §1—5、[foundation 全范围验收](../coverage-review.md) §1—5、[mainprd-jd-charging.md](../../05-prd/mainprd-jd-charging.md) §二、[01-subprd-workbench-items.md](../../05-prd/01-subprd-workbench-items.md) §5、[02-subprd-orders-history.md](../../05-prd/02-subprd-orders-history.md) §5、[03-subprd-provider-config.md](../../05-prd/03-subprd-provider-config.md) §5、[04-subprd-installation-materials.md](../../05-prd/04-subprd-installation-materials.md) §5、[05-subprd-installation-review.md](../../05-prd/05-subprd-installation-review.md) §5、[06-subprd-reconciliation.md](../../05-prd/06-subprd-reconciliation.md) §5、[07-subprd-coordination.md](../../05-prd/07-subprd-coordination.md) §5

## 1. 协议、身份与边界

浏览器调用统一前缀 `/api/admin/charging`；受控内部请求使用其下 `/internal`。HTTP 路由全小写，JSON 为 camelCase，枚举为 UPPER_SNAKE_CASE。以下是本系统开发契约，不表示旧系统已有这些接口。

服务端验证当前调用凭据，具体生产登录协议由身份提供方接入确认。任何模式均不接受客户端自报角色、subjectId、grantId 或服务商范围作为授权依据。开发登录由服务端隔离的身份模拟配置发放凭据；真实模式身份失败不切换为 mock。

页面只请求本系统 API。后端调用外部真实或模拟接口、真实执行业务处理并保存结果。AI mock 只供确定性测试；真实 Skill 验收运行本地 Node + OpenCode。GET 不触发 Skill 或业务写入；后台变化与上传接收触发准备任务。

## 2. 通用请求与返回

成功统一 `code=0`、`msg="success"`、`requestId`、`data`；失败 data=null。JSON 成功字段必返，未知值用 null，空数组用 []。日期时间用 ISO 8601 带时区；金额/数量用十进制字符串，版本为不透明字符串或明确的本地整数，禁止浮点金额。

安装明细的 installedQuantity 沿已确认外部契约使用有限 number，是数量字段的明确例外；其保存、展示和提交转换见安装接口 §1，金额仍一律使用十进制字符串。

列表请求 page=1、pageSize=10，允许 1—50；返回 list、total、page、pageSize。先按完整权限过滤再筛选/计数/分页，禁止读取一页后删越权行导致 total 泄露。默认 gmt_modified DESC、id DESC；跨页变更允许重查，不声称页面列表固定快照。

写请求统一 Header `Idempotency-Key` 为非空客户端请求标识，服务端按当前主体、路径和业务目标形成保存键，并比较规范化正文。首次成功受理后，同键同内容返回原结果；同键不同内容 409。失去可见权限后不得借重放读取旧结果。正文限已声明字段，额外身份字段及未知枚举拒绝。

业务确认公共正文 `DecisionInput`：

| 字段 | 类型 / 必填 | 含义 |
| --- | --- | --- |
| expectedWorkItemVersion | integer / 是 | 页面所读事项 rowVersion，正整数 |
| expectedResponsibilityVersion | integer / 是 | 页面所读责任版本，正整数 |
| analysisResultId | string / 条件必填 | 安装审核通过/退回必填，其余按各域规则；无分析的协调动作允许 null |
| comment | string / 否 | 人员说明；缺省按 null 处理，具体动作可要求非空 |

服务器核实当前具体责任、权限、事项状态和所确认版本后保存决定；客户端不能填写确认人、确认时间、AI 判断、执行状态或最终金额。

异步受理返回 HTTP 202：`data={decisionId,operationId,jobId,workItemId,rowVersion,status}`，status 为 ACCEPTED，operationId 无外部写入时为 null。同步本地成功返回 HTTP 200：`data={decisionId,workItemId,rowVersion,status}`，status 为 APPLIED。HTTP 202 不得显示“提交已成功写入原系统”。所有返回编号都须已持久保存。

## 3. 资源与证据授权

READ_WORK_ITEM 不自动包含 READ_SOURCE_MATERIAL 或 READ_BILLING_RECORD。详情中不泄露未授权证据正文和账单字段；证据入口可返回受限状态，不返回可直接绕过权限的存储地址。历史版本、文件下载、解析定位均逐次检查当前权限。不可见编号与不存在编号统一 404，避免枚举资源。

动作与目标范围必须在同一 grant 成立；多工单账单核实整张记录范围。写请求还须匹配具体责任人。后台仅 SERVICE 调用内部接口，原确认人重新验证能力缺失时不得开启异步新写入。

## 4. 通用错误

| HTTP / code | 含义 | 页面或调用方行为 |
| --- | --- | --- |
| 400 / 40001、40002 | 字段缺失/非法、枚举非法 | 定位字段，保留输入 |
| 401 / 40101 | 当前凭据无效 | 恢复真实登录，不自动换身份 |
| 403 / 40301 | 可见资源但无操作权限 | 停止动作，不隐藏为成功 |
| 404 / 40404 | 资源不存在或不可见 | 提示无法查看，不返回资源细节 |
| 409 / 40901 | 事项、责任、输入或配置版本变化 | 保留输入，重读最新版本后重新确认 |
| 409 / 40902 | 幂等键被不同内容使用 | 拒绝，禁止改键绕过未决写保护 |
| 409 / 40903 | 同事项或工单已有未决写入 | 返回可读的原操作入口，继续查原结果 |
| 422 / 42201 | 缺少材料、依据或未通过业务条件 | 返回缺项说明，不造值 |
| 413 / 41301 | 文件或请求超过已登记限制 | 保留表单，明确限制，不静默截断 |
| 429 / 42901 | 执行容量或速率上限 | 按服务端 Retry-After 恢复，不无限重发 |
| 502 / 50201 | 依赖返回不合法 | 保留已保存进度，记录 requestId |
| 503 / 50301、504 / 50401 | 依赖不可用或超时 | 展示真实状态；写请求超时先按原键/操作回查 |
| 500 / 50001 | 本系统内部失败 | 不泄露堆栈、凭据和其他服务商内容 |

```json
{"code":40901,"msg":"资料版本已变化，请刷新后核实","requestId":"request-development-1","data":null}
```

## 5. 事务、幂等与验收

本系统接口中版本条件、保存位置与状态更新是同一次受控操作。按表结构总核对的事务断言把零行更新转为整批失败。保存确认及任务后才调用外部系统；接口断开不删除已经接受的决定。

本地确认用 human_decision.request_key，草稿/配置编辑用各自 save_key，上传用来源材料的固定接收编号，后台运行用 runId 去重。保存进展用 activity_record.event_key。试转换任务用 background_job.dedupe_key 并核对固定输入。各键均关联规范化正文，不能仅靠键存在直接当成功。

后续用例须验证正常、多服务商隔离、直接请求越权、版本竞争、幂等冲突、依赖失败及操作后回查；前端固定数组、成功 toast 或浏览器拦截响应不能作为联调证据。
