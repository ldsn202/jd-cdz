<!-- @meta docId="tc-coord-detail" status="active" baseline="v1.0.0" -->
# 履约协同与异常 用例详情

> **索引文件**: [tc-coord.md](tc-coord.md)
> 上游（我引用）：[07-subprd-coordination.md](../../05-prd/07-subprd-coordination.md) §3、§5、§7、[coordination-apis.md](../../03-foundation/03-06-provided-apis/coordination-apis.md) §1—4、[workbench-apis.md](../../03-foundation/03-06-provided-apis/workbench-apis.md) §3—4、[common-contract.md](../../03-foundation/03-06-provided-apis/common-contract.md) §2—4、[work-item-schema.md](../../03-foundation/03-05-schema/work-item-schema.md) §3—7
> 下游（引用我）：[tc-coord.md](tc-coord.md) §一 测试范围

前置条件、BASE_URL、身份映射见索引层 §二。curl 示例省略 `Content-Type: application/json`。

## 三、API 验证用例

### TC-COO-01：协同详情数据直透（analysis=null 为正常情况）
> PRD：07-subprd-coordination.md §7 验收#1
> 目标：验证详情接口对协同事项的字段直透，analysis=null、blockedReasons=[] 不补造
> 执行方式：curl

**数据准备**：执行 [sql/TC-COO-01.sql](sql/TC-COO-01.sql) "数据准备"段

**步骤**：
1. 以张协同凭据 `curl "http://localhost:8787/api/admin/charging/work-items/wi-coo-01"`

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| HTTP 状态码 / code | 200 / 0 |
| data.title | `澜山府物业入场时间待确认` |
| data.workOrderId | `wo-lanshan-001` |
| data.status | `READY` |
| data.analysis | `null`（不是对象、不是补造文案） |
| data.blockedReasons | `[]` |
| data.completion | `null` |
| data.relatedItems | 长度 1，元素 workItemId=`wi-pre-done-01`、reasonCode=`STAGE_HANDOFF`、title=`澜山府安装资料提交` |

**数据清理**：执行同文件 "数据清理"段

### TC-COO-02：进展连续保存 3 次留痕且事项不完成
> PRD：07-subprd-coordination.md §7 验收#2
> 目标：验证多次保存进展各追加一条 PROGRESS_SAVED，事项仍为待处理
> 执行方式：curl

**数据准备**：执行 [sql/TC-COO-02.sql](sql/TC-COO-02.sql) "数据准备"段

**步骤**：
1. 以张协同凭据连续 3 次 `POST /api/admin/charging/work-items/wi-coo-02/progress`，Idempotency-Key 分别 `coo02-k1/k2/k3`，正文 `{"expectedWorkItemVersion":N,"expectedResponsibilityVersion":1,"description":"第N次：已联系物业，待回复"}`（N=1,2,3，expectedWorkItemVersion 依次取 1,2,3）
2. `GET /api/admin/charging/work-items/wi-coo-02/activities`
3. `GET /api/admin/charging/work-items?responsibility=MINE&kind=COORDINATION`

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 3 次 POST | 均 200，data.status=`SAVED`，data.rowVersion 依次 2,3,4，activityId 互不相同 |
| activities 列表 | eventType=`PROGRESS_SAVED` 恰 3 条，description 与 3 次提交正文一致，按时间倒序 |
| 步骤 3 列表 | 含 wi-coo-02 且 status 非 `COMPLETED` |
| 详情 completion | `null` |

**数据清理**：执行同文件 "数据清理"段

### TC-COO-03：进展保存幂等（同键重放与同键冲突）
> PRD：07-subprd-coordination.md §7 验收#9
> 目标：验证同 Idempotency-Key 同内容返回原结果、同键不同内容 40902
> 执行方式：curl

**数据准备**：执行 [sql/TC-COO-03.sql](sql/TC-COO-03.sql) "数据准备"段

**步骤**：
1. `POST .../wi-coo-03/progress`，Key `coo03-k1`，正文 `{"expectedWorkItemVersion":1,"expectedResponsibilityVersion":1,"description":"已联系物业"}` → 记录 activityId=A
2. 原样重发步骤 1（同 Key 同正文）
3. 同 Key `coo03-k1` 改 description 为 `"内容已变更"` 重发
4. `GET .../wi-coo-03/activities`

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤 2 | 200，data.activityId=A，data.rowVersion 与步骤 1 相同 |
| 步骤 3 | HTTP 409，code=40902，data=null |
| activities | PROGRESS_SAVED 恰 1 条 |

**数据清理**：执行同文件 "数据清理"段

### TC-COO-04：过期版本提交被拒（40901）
> PRD：07-subprd-coordination.md §7 验收#10
> 目标：验证使用过期 expectedWorkItemVersion 提交返回 40901 且不产生任何写入
> 执行方式：curl

**数据准备**：执行 [sql/TC-COO-04.sql](sql/TC-COO-04.sql) "数据准备"段

**步骤**：
1. `POST .../wi-coo-04/progress`，Key `coo04-k1`，正文 expectedWorkItemVersion=`99`（当前为 1），description 非空
2. `GET .../wi-coo-04/activities` 与 `GET .../wi-coo-04`

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤 1 | HTTP 409，code=40901，data=null |
| activities | 无 PROGRESS_SAVED 记录（list 为空 []） |
| 详情 rowVersion | 仍为 1 |

**数据清理**：执行同文件 "数据清理"段

### TC-COO-05：完成协同（可追溯 + 不代审核）
> PRD：07-subprd-coordination.md §7 验收#3、#11、#14
> 目标：验证完成协同后完成码/原因/决定可追溯，且核查、对账事项不被改写
> 执行方式：curl

**数据准备**：执行 [sql/TC-COO-05.sql](sql/TC-COO-05.sql) "数据准备"段

**步骤**：
1. `POST .../wi-coo-05/coordination-completion`，Key `coo05-k1`，正文 `{"expectedWorkItemVersion":1,"expectedResponsibilityVersion":1,"analysisResultId":null,"resolution":"物业已确认9月22日上午可入场，服务商已确认该安排","evidenceRefs":["ev-lanshan-entry-001"]}`
2. `GET .../wi-coo-05`；回查数据库 human_decision / activity_record
3. `GET .../wi-rev-05` 与 `GET .../wi-rec-05`

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤 1 | 200，data.status=`APPLIED`，data.decisionId 非空 |
| 详情 status / completion.code | `COMPLETED` / `COORDINATION_RESOLVED` |
| completion.decisionId | 等于步骤 1 返回的 decisionId；completedAt 非空 |
| completion.basis | 非空对象（具体字段结构 `[待确认-需产品明确]`），不含"安装完成"语义 |
| DB human_decision | 存在 action_type=`COMPLETE_COORDINATION`、id=decisionId、content_json 含本次 resolution |
| DB activity_record | 存在该事项 DECISION_CONFIRMED 且 fact_id=decisionId |
| wi-rev-05 | status 仍 `READY`，completion=null |
| wi-rec-05 | status 仍 `WAITING_REPLY`，completion=null |

**数据清理**：执行同文件 "数据清理"段

### TC-COO-06：异常登记（转 EXCEPTION 且原问题保留）
> PRD：07-subprd-coordination.md §7 验收#4
> 目标：验证当前责任人登记异常后事项转 EXCEPTION，原问题与依据保留
> 执行方式：curl

**数据准备**：执行 [sql/TC-COO-06.sql](sql/TC-COO-06.sql) "数据准备"段

**步骤**：
1. 以李核查凭据 `POST .../wi-rev-06/exceptions`，Key `coo06-k1`，正文 `{"expectedWorkItemVersion":1,"expectedResponsibilityVersion":1,"reason":"服务商反馈现场电表容量不足，需物业扩容","evidenceRefs":["ev-meter-001"]}`
2. `GET .../wi-rev-06`；回查 DB

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤 1 | 200，data.status=`APPLIED` |
| 详情 status | `EXCEPTION`；title 仍为 `澜山府安装明细差异核查`；completion=null |
| DB human_decision | 存在 action_type=`OPEN_EXCEPTION`，content_json 含所填 reason |
| DB work_item | 完成四字段（completion_code/basis/decision/completed_at）全部为空 |

**数据清理**：执行同文件 "数据清理"段

### TC-COO-07：异常处理完成需接续（落库核验）
> PRD：07-subprd-coordination.md §7 验收#5、#11、#12
> 目标：验证关闭仍需办理的异常后返回 followupWorkItemIds 且接续关联同事务落库
> 执行方式：curl

**数据准备**：执行 [sql/TC-COO-07.sql](sql/TC-COO-07.sql) "数据准备"段

**步骤**：
1. 以李核查凭据 `POST .../wi-rev-ex-07/exception-resolution`，Key `coo07-k1`，正文 `{"expectedWorkItemVersion":2,"expectedResponsibilityVersion":1,"resolution":"物业扩容完成，服务商可继续补充安装明细","evidenceRefs":["ev-meter-done-001"]}`
2. `GET .../wi-rev-ex-07`；按 followupWorkItemIds `GET` 接续事项；回查 DB

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤 1 | 200，data.status=`APPLIED`，data.followupWorkItemIds 为非空 string 数组 |
| 原事项 | status=`COMPLETED`，completion.code=`EXCEPTION_RESOLVED`，decisionId 非空 |
| DB work_item_link | 存在 from_work_item_id=`wi-rev-ex-07`、reason_code=`EXCEPTION_CONTINUATION`、to_work_item_id ∈ followupWorkItemIds |
| 接续事项 | status 非 `COMPLETED`，item_kind=`INSTALLATION_REVIEW`，service_provider_id=`sp-lanshan-dev` |
| DB human_decision | 存在 action_type=`CLOSE_EXCEPTION`，id=completion.decisionId，content_json 含 resolution |
| 事务回滚 | 关联写入失败时整批回滚 `[待确认-需开发提供注入手段]`，本用例只覆盖成功路径 |

**数据清理**：执行同文件 "数据清理"段

### TC-COO-08：异常处理完成无后续（不生成虚假接续）
> PRD：07-subprd-coordination.md §7 验收#6
> 目标：验证原业务无须继续时不产生接续事项与关联，核实依据保留
> 执行方式：curl

**数据准备**：执行 [sql/TC-COO-08.sql](sql/TC-COO-08.sql) "数据准备"段；正文带 `followupRequired:false` 表示经核实原业务无须继续（裁决见 coordination-apis.md §3）

**步骤**：
1. 以李核查凭据 `POST .../wi-rev-ex-08/exception-resolution`，Key `coo08-k1`，正文 `{"expectedWorkItemVersion":2,"expectedResponsibilityVersion":1,"resolution":"来源已确认差异在原系统关闭，无须继续核查","evidenceRefs":["ev-close-001"],"followupRequired":false}`
2. `GET .../wi-rev-ex-08`；回查 DB

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤 1 | 200，data.followupWorkItemIds 为 `[]` |
| 原事项 | status=`COMPLETED`，completion.code=`EXCEPTION_RESOLVED`，basis 为非空对象（含核实依据） |
| DB work_item_link | 不存在 from_work_item_id=`wi-rev-ex-08` 的记录 |
| DB work_item | 无本事项之外因本次关闭新建的 work_item |

**数据清理**：执行同文件 "数据清理"段

### TC-COO-09：停止决定（决策表：成功/42201/40903/40301/40404）
> PRD：07-subprd-coordination.md §7 验收#7、#8、#11、#13
> 目标：验证停止决定的权限、前置条件与可追溯后果
> 执行方式：curl

**数据准备**：执行 [sql/TC-COO-09.sql](sql/TC-COO-09.sql) "数据准备"段

**步骤**：
1. 缺依据：`POST .../wi-coo-stop-09/stop-decisions`，Key `coo09-ka`，正文 reason 非空、basisRefs=`[]`
2. 未决写入：`POST .../wi-pre-pend-09/stop-decisions`，Key `coo09-kb`，reason 与 basisRefs 均非空
3. 越权：以赵无权凭据对 wi-coo-stop-09 提交停止，Key `coo09-kc`，reason/basisRefs 非空
4. 不可见：以张协同凭据对 `wi-not-exist-09` 提交停止，Key `coo09-kd`
5. 成功：以张协同凭据对 wi-coo-stop-09 提交，Key `coo09-ke`，`reason:"客户已取消安装，工单来源记录已撤销"`，`basisRefs:["ev-cancel-001"]`
6. `GET .../wi-coo-stop-09`；回查 DB

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤 1 | HTTP 422，code=42201；wi-coo-stop-09 仍 `READY`、completion=null |
| 步骤 2 | HTTP 409，code=40903；wi-pre-pend-09 不停止 |
| 步骤 3 | HTTP 403，code=40301；事项不停止 |
| 步骤 4 | HTTP 404，code=40404；响应不含资源细节 |
| 步骤 5 | 200，data.status=`APPLIED` |
| 步骤 6 | completion.code=`BUSINESS_STOPPED`，basis 非空含停止原因与依据引用，decisionId 对应 DB 中 action_type=`STOP_WORK` 的 human_decision |

**数据清理**：执行同文件 "数据清理"段

## 四、UI 验证用例

页面路由沿用 `#task/<事项标识>`；浏览器以对应身份的开发凭据登录。

### TC-COO-11：协同详情渲染（无分析空态）
> PRD：07-subprd-coordination.md §7 验收#1
> 目标：验证详情页各区块直透渲染，analysis=null 显示固定空态文案
> 执行方式：浏览器 UI

**数据准备**：执行 [sql/TC-COO-11.sql](sql/TC-COO-11.sql) "数据准备"段

**步骤**：以张协同打开 `#task/wi-coo-11`

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 阻碍说明区 | 显示 `澜山府物业入场时间待确认` |
| 关联工单区 | 显示工单编号 `WO-LANSHAN-001` 与服务商 `澜山府安装服务商`，可点击进入工单详情 |
| 系统整理结果区 | 显示 `本次协同无系统分析结果`，无其他补造内容 |
| 阻断原因区 | 空态展示，区块标题不隐藏 |
| 相关事项区 | 显示 `澜山府安装资料提交` 一条 |

**数据清理**：执行同文件 "数据清理"段

### TC-COO-12：保存进展交互（空描述阻止 + 时间线追加）
> PRD：07-subprd-coordination.md §7 验收#2（联动 §3.6）
> 目标：验证空进展前端阻止提交，保存成功后时间线追加且事项不显示完成
> 执行方式：浏览器 UI

**数据准备**：执行 [sql/TC-COO-12.sql](sql/TC-COO-12.sql) "数据准备"段

**步骤**：
1. 打开 `#task/wi-coo-12`，点「保存进展，继续处理」，进展正文留空直接提交
2. 填写 `已联系物业，待其回复入场时间` 后提交
3. 查看进展记录时间线与待处理事项列表

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤 1 | 提交被前端阻止，焦点定位到进展正文字段，未发出请求 |
| 步骤 2 | 先骨架屏后替换渲染；时间线新增 1 条进展，正文与填写一致 |
| 步骤 3 | 待处理列表仍含该事项，无"已完成"标识 |

**数据清理**：执行同文件 "数据清理"段

### TC-COO-13：完成协同展示
> PRD：07-subprd-coordination.md §7 验收#3
> 目标：验证完成协同后页面显示完成原因，不显示为整个安装业务结束
> 执行方式：浏览器 UI

**数据准备**：执行 [sql/TC-COO-13.sql](sql/TC-COO-13.sql) "数据准备"段

**步骤**：
1. 打开 `#task/wi-coo-13`，点「完成本次协同」，填写解决事实 `物业已确认9月22日上午可入场` 与依据引用后提交
2. 重看详情页与待处理列表

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 完成原因展示 | 显示 `本次履约阻碍处理完成` |
| 文案负面清单 | 页面与列表不出现"安装完成""业务结束"类文案 |
| 操作区 | 「完成本次协同」按钮不再出现 |
| 列表 | 该事项不再出现在待处理列表 |

**数据清理**：执行同文件 "数据清理"段

### TC-COO-14：异常登记交互
> PRD：07-subprd-coordination.md §7 验收#4
> 目标：验证登记异常后转异常视图，原问题与依据仍可见
> 执行方式：浏览器 UI

**数据准备**：执行 [sql/TC-COO-14.sql](sql/TC-COO-14.sql) "数据准备"段

**步骤**：以李核查打开 `#task/wi-rev-14`，点「登记异常」，填写原因 `服务商反馈现场电表容量不足，需物业扩容` 后提交，重看详情

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 状态区 | 显示异常状态（字面值 `[待确认-需产品明确]`），不显示已完成 |
| 原问题保留 | 标题 `澜山府安装明细差异核查` 与所填异常原因均可见 |
| 时间线 | 新增本次异常登记记录 |

**数据清理**：执行同文件 "数据清理"段

### TC-COO-15：异常关闭后的接续入口与回看
> PRD：07-subprd-coordination.md §7 验收#5
> 目标：验证「继续办理原业务」链接的路由与「回看异常结果」入口
> 执行方式：浏览器 UI

**数据准备**：执行 [sql/TC-COO-15.sql](sql/TC-COO-15.sql) "数据准备"段

**步骤**：
1. 以李核查打开 `#task/wi-rev-ex-15`，完成异常处理（resolution 非空）提交
2. 在异常关闭结果区点「继续办理原业务」
3. 回到原异常事项详情，点「回看异常结果」

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤 1 后 | 异常关闭结果区显示「继续办理原业务」与「回看异常结果」链接 |
| 步骤 2 | 路由变为 `#task/<接续事项id>`（接续 id 为响应 followupWorkItemIds 元素），进入接续事项详情 |
| 步骤 3 | 可查看本次异常的完成原因（处置结果）与依据 |

**数据清理**：执行同文件 "数据清理"段

### TC-COO-16：无后续工作展示
> PRD：07-subprd-coordination.md §7 验收#6
> 目标：验证无后续时不显示继续办理链接、展示核实依据、不判断业务结束
> 执行方式：浏览器 UI

**数据准备**：执行 [sql/TC-COO-16.sql](sql/TC-COO-16.sql) "数据准备"段（前提构造同 TC-COO-08 的 `[待确认]`）

**步骤**：以李核查打开 `#task/wi-rev-ex-16`，完成异常处理后查看详情

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 继续办理链接 | 不显示 |
| 核实依据 | 异常结果区展示本次处置的核实依据（来自 completion.basis） |
| 文案负面清单 | 不出现"业务全部结束"类文案；「回看异常结果」仍可用 |

**数据清理**：执行同文件 "数据清理"段

### TC-COO-17：停止决定展示
> PRD：07-subprd-coordination.md §7 验收#7
> 目标：验证停止后页面展示停止原因与依据，不显示为阻碍已解决
> 执行方式：浏览器 UI

**数据准备**：执行 [sql/TC-COO-17.sql](sql/TC-COO-17.sql) "数据准备"段

**步骤**：以张协同打开 `#task/wi-coo-stop-17`，点「停止该事项」，填写原因 `客户已取消安装，工单来源记录已撤销` 与非空依据后提交，重看详情

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 完成信息区 | 显示停止原因与依据引用（可追溯） |
| 文案负面清单 | 不出现"阻碍已解决"类文案 |
| 操作区 | 无继续办理、完成协同等操作入口 |

**数据清理**：执行同文件 "数据清理"段

### TC-COO-18：错误兜底（40901 保留输入 / 40301 / 40404）
> PRD：07-subprd-coordination.md §7 验收#8、#10（联动 §3.6）
> 目标：验证版本竞争、越权与不可见深链的页面行为
> 执行方式：浏览器 UI

**数据准备**：执行 [sql/TC-COO-18.sql](sql/TC-COO-18.sql) "数据准备"段

**步骤**：
1. 打开 `#task/wi-coo-18` 填写进展正文（不提交）；用另一会话对该事项先保存一次进展使版本变化；回本会话提交
2. 以赵无权打开 `#task/wi-coo-18` 尝试「停止该事项」
3. 以张协同直接访问 `#task/wi-not-exist-18`

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤 1 | 提示版本已变化（40901），已填进展正文保留在表单中 |
| 步骤 2 | 动作被停止并提示无操作权限（40301），不显示成功态 |
| 步骤 3 | 提示无法查看（40404），不显示任何事项字段内容 |

**数据清理**：执行同文件 "数据清理"段
