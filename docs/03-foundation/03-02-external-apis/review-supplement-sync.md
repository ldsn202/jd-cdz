# 核查决定与补充记录同步

> 版本：V1.1｜日期：2026-09-20｜状态：开发契约已核对，真实对接待核实
> 上游（我引用）：[外部依赖清单](external-dependency-list.md) §2—4、[正式安装明细提交](installation-detail-submit.md) §3—5、[安装工单上下文读取](installation-work-order-context.md) §3—5、[原始材料读取](source-material-read.md) §2—4、[术语表](../03-01-glossary/glossary.md) §1、§3、§5、[原型交互说明](../../02-prototype/interaction-spec.md) §1—3、[接口规范](../../../rules/coding-standards/09-api-design.md) §2—8
> 下游（引用我）：[原记录变化发现](source-record-changes-read.md) §3、[当前身份与业务权限取得](current-identity-permissions-read.md) §3、[处理事项实体关系](../03-03-er/er-work-item.md) §2—5、[安装资料实体关系](../03-03-er/er-installation.md) §3—4、[变化接收与执行关系](../03-03-er/er-change-execution.md) §5—6、[术语表](../03-01-glossary/glossary.md) §1、[ER 范围与一致性总核对](../03-03-er/coverage-review.md) §2—6、[安装核查与补充](../03-04-business-flows/flow-installation-review.md) §1—7、[业务流程覆盖与一致性总核对](../03-04-business-flows/coverage-review.md) §2—8、[处理事项域表结构](../03-05-schema/work-item-schema.md) §1—9、[安装资料与核查接口](../03-06-provided-apis/installation-apis.md) §1—4、[00-subprd-mock-data.md](../../05-prd/00-subprd-mock-data.md) §2.3；[mock T2.5子计划](../../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T2.5-review-writeback.md) PRD双链·读

## 1. 接口基本信息与记录归属

| 项 | 本项目约定 |
| --- | --- |
| 用途 | 保存安装核查决定及针对原问题的补充回复，并接续本工作台原处理事项 |
| 提供方 | 原安装管理系统及其授权协作入口，实际接口拆分待核实 |
| 逻辑调用 | `sync_installation_review_action` |
| 拟定 mock 请求 | `POST /api/admin/mock/external/installation/work-orders/{installationWorkOrderId}/review-actions` |
| 鉴权 | 服务端验证实际操作者、当前责任人、服务商范围及动作权限；不能凭客户端角色名或 canApprove 放行 |
| 写入范围 | 安装审核通过、退回补充、提交补充；不改正式安装数量、双方账单或付款结果 |

原系统保留正式审核与补充记录；本工作台保留处理事项、分析结果、人员确认及两边记录的对应关系。workItemId 是本工作台编号，真实适配不得假定原系统已有同名字段。原系统关联使用其真实工单、明细和动作记录标识。

本契约是后台开发约定，mock 与真实接口均未实现。原系统须具备相应动作、条件写入和可关联结果回查能力；不能用普通文本备注模拟“审核已通过”。本地异常处置、对账核实和履约协同不复用这些动作，其外部状态映射在业务流程阶段核实，不把本地异常关闭映射为原系统审核通过。

## 2. 动作及角色条件

| action | 当前执行者与前提 | 原系统成功后，本工作台的接续 |
| --- | --- | --- |
| APPROVE | 当前负责此事项的京东安装核查人员；正式明细已提交，当前分析可用，必要依据已核实，无未解决的补充要求 | 保存核查通过结果，本环节完成；不表示费用获批、安装业务全部结束或已付款 |
| REQUEST_SUPPLEMENT | 当前京东安装核查责任人；明确需要补充的问题，原系统允许退回 | 原事项转为待补充，将责任交给对应服务商资料人员；不新建同类重复事项 |
| SUBMIT_SUPPLEMENT | 当前应回复的服务商资料责任人；针对同一事项中仍有效的退回要求 | 保存回复与材料，原事项进入分析中；更新分析后交回京东核查，不自动通过 |

后续实际人员分配依既有职责和账号权限完成，不把整个角色字符串当成唯一人员。仅有查看权限不能执行上述动作。

补充可以只包含事实说明；没有新增文件时 sourceMaterials=[]。如果需要修改已提交的正式安装数量，应按正式明细提交契约执行允许的修订；不能用补充文本直接覆盖正式明细。审核所依据的明细或材料发生变化时，原分析须更新后才能继续决定。

### 2.1 只读回查接口

拟定 mock 请求：`GET /api/admin/mock/external/installation/work-orders/{installationWorkOrderId}/review-actions/{operationId}`。

两个路径参数均为必填非空字符串。服务端验证当前可信身份及读取权限，并核实原操作与来源、服务商、工单的关联。不能凭自报角色或仅凭操作编号读取其他服务商结果；查询不要求再次执行人员确认，不新增业务动作。

正常返回沿用 §4.2 的结果结构，HTTP 200、code=0；业务状态仍可能为 SUCCEEDED、REJECTED 或 PENDING，pendingReason 原样保留。读取指定原操作的结果及其版本，不以工单当前最新记录替换历史提交结果，不再次发出写请求。

参数错误返回400/40001，未认证返回401/40101，无读取权限返回403/40301；授权范围内工单或关联操作不存在返回404/40401。回查临时不可用返回503/50301、超时返回504/50401，均采用data=null的错误包装。查无记录或回查失败均不足以证明此前写入未发生，本系统保留结果待确认，不据此自动重发。真实提供方的结果读取能力仍须核实。

## 3. 请求参数与版本检查

| 字段 | 位置 / 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| installationWorkOrderId | path / 非空 string | 是 | 原系统安装工单编号 |
| operationId | body / 非空 string | 是 | 一次明确业务动作的稳定编号，重复点击和恢复时不改变 |
| workItemId | body / 非空 string | 是 | 本工作台原处理事项，不是新的待办或原系统字段假定 |
| expectedWorkItemVersion | body / 非空 string | 是 | 人员执行动作时看到的事项版本，防止覆盖并发处理 |
| humanDecisionId | body / 非空 string | 是 | 本地保存的人员确认记录，须与操作者、事项、动作及全部内容一致 |
| action | body / string | 是 | APPROVE / REQUEST_SUPPLEMENT / SUBMIT_SUPPLEMENT |
| installationDetailId | body / 非空 string | 是 | 本轮核查对应的正式安装明细 |
| expectedDetailVersion | body / 非空 string | 是 | 人员所依据的正式明细版本 |
| expectedWorkOrderVersion | body / 非空 string | 是 | 原系统工单版本，须覆盖本次动作涉及的审核及补充状态变化或具备等价条件保护 |
| expectedAnalysisVersion | body / string 或 null | 是 | APPROVE、REQUEST_SUPPLEMENT 为当前可用分析版本；SUBMIT_SUPPLEMENT 为 null，不要求服务商先生成新分析 |
| replyToOperationId | body / string 或 null | 是 | SUBMIT_SUPPLEMENT 必须指向原事项中已成功生效、仍待回复的退回动作；其他动作必须为 null |
| comment | body / string | 是 | 通过时允许空字符串；退回须有具体问题，补充须有具体回复，不能只有空格 |
| sourceMaterials | body / object[] | 是 | 使用或新增的材料引用；每项含非空 sourceSystem、sourceMaterialId、sourceVersion，无文件为 [] |
| 访问上下文 | 服务端调用上下文 | 是 | 可信身份及其当前权限，不接收客户端自报的“审批人”替代 |

服务端从 workItemId 和 humanDecisionId 核对原工单、服务商、动作内容及所依赖版本；不得仅检查几个编号存在。材料须在授权范围内、可关联本工单且版本可核实。读取失败或材料更新时不得把旧分析当成最新。

接收新动作时，对本地事项版本作条件更新，并按源系统的当前工单、明细及业务状态作条件写入。只有提交前查询、随后无条件更新的实现不满足要求；实际源版本覆盖哪些变化须在对接时验证。已确认的成功动作重放按既有结果返回，不因其自身已改变版本而误报冲突。

同一事项只能有一个未确认结果的写动作。正式明细提交和核查动作还须共用工单级保护，避免明细尚未确认提交成功就批准，或明细修订与批准并发穿过本地检查。多个原系统入口之间的保护仍依赖源系统条件写入，不能只靠工作台本地锁。

## 4. 去重、回执与接续

### 4.1 复用已有写入规则

复用正式安装明细提交 §3—5 的规则：调用外部写入前保存操作与确认内容；同编号同内容返回已存状态，同编号改内容拒绝；结果未知时只读回查，不盲目重发；原系统成功、本地接续失败时只恢复本地处理。

对应字段为 `submissionId → operationId`、`submissionStatus → operationStatus`。去重范围包含来源、服务商、工单及 operationId，同时校验 workItemId 和动作内容。每次读取既有回执仍核验当前访问权限。真实提供方须有可唯一关联该动作的结果证据，不能用“当前状态看起来一样”推定该动作已成功。

SUBMIT_SUPPLEMENT 还须核对 replyToOperationId：不能回复已关闭的问题、另一服务商的事项，或把某轮补充绑定到上一轮退回。重复传同一操作不得重复保存回复、触发分析或增加待办计数。

### 4.2 返回结构

受理及结果读取正常时为 HTTP 200，外层 `code=0`、`msg="success"`、`data`、`requestId`。code=0 不等于业务动作成功，调用方须检查 operationStatus。受理前错误的 data=null。

| data 字段 | 类型 | 说明 |
| --- | --- | --- |
| operationId、workItemId、installationWorkOrderId | 非空 string | 与本次已登记操作一致，始终接续原事项 |
| action | string | 本次登记的动作，与请求一致 |
| operationStatus | string | SUCCEEDED / REJECTED / PENDING，与明细提交的结果含义一致 |
| pendingReason | string / null | PENDING 时为 PROCESSING / RESULT_UNKNOWN，终态为 null |
| sourceRecord | object / null | SUCCEEDED 时包含 sourceSystem、sourceRecordId、sourceVersion、workOrderSourceVersion，均为非空 string；其他状态为 null |
| resultDescription | 非空 string | 明确说明审核决定已保存、补充已收到或结果仍待确认，不混称“已通过” |
| verifiedAt | string / null | 核实终态的带时区时间；PENDING 为 null |

sourceRecord 是本次原系统审核或补充记录的回执，不是本地分析版本。每个成功回执必须可回查并与原动作内容匹配。REJECTED 表示有证据证明该动作未生效；PENDING 不得用作责任人交接、审核通过或补充分析完成的依据。

补充成功后，系统先关联新增内容，再更新原事项分析；分析失败保留原问题和补充记录，显示失败并允许重试分析，不让服务商重新提交同一回复。旧分析或晚到达的旧动作结果不能覆盖较新事项版本。

### 4.3 开发示例

以下独立 mock 场景表示：原事项的退回动作 `return-mock-001` 已成功且仍待回复，服务商提交文字补充。编号及版本均为开发约定，未取自真实系统。

```json
{
  "operationId": "reply-mock-001",
  "workItemId": "work-item-mock-001",
  "expectedWorkItemVersion": "item-2",
  "humanDecisionId": "decision-reply-mock-001",
  "action": "SUBMIT_SUPPLEMENT",
  "installationDetailId": "detail-mock-001",
  "expectedDetailVersion": "detail-1",
  "expectedWorkOrderVersion": "work-order-2",
  "expectedAnalysisVersion": null,
  "replyToOperationId": "return-mock-001",
  "comment": "已核实现场变更确认单与本工单的关联，请继续复核。",
  "sourceMaterials": []
}
```

请求路径：`POST /api/admin/mock/external/installation/work-orders/AZ-MOCK-REVIEW-001/review-actions`。原系统明确保存并经回查确认后：

```json
{"code":0,"msg":"success","requestId":"mock-review-001","data":{"operationId":"reply-mock-001","workItemId":"work-item-mock-001","installationWorkOrderId":"AZ-MOCK-REVIEW-001","action":"SUBMIT_SUPPLEMENT","operationStatus":"SUCCEEDED","pendingReason":null,"sourceRecord":{"sourceSystem":"installation_management","sourceRecordId":"supplement-mock-001","sourceVersion":"supplement-1","workOrderSourceVersion":"work-order-3"},"resultDescription":"补充回复已保存，原事项将更新分析并交京东复核","verifiedAt":"2026-09-20T14:00:00+08:00"}}
```

若写入结果暂时无法确认，则使用以下独立响应场景，不表示成功后状态回退：

```json
{"code":0,"msg":"success","requestId":"mock-review-002","data":{"operationId":"reply-mock-001","workItemId":"work-item-mock-001","installationWorkOrderId":"AZ-MOCK-REVIEW-001","action":"SUBMIT_SUPPLEMENT","operationStatus":"PENDING","pendingReason":"RESULT_UNKNOWN","sourceRecord":null,"resultDescription":"正在确认补充是否保存，原问题暂不重复提交","verifiedAt":null}}
```

## 5. 失败处理与验证

| 场景 | 返回 / 处理 |
| --- | --- |
| 字段缺失、动作非法、意见为空或 replyToOperationId 使用不符 | HTTP 400 / code 40001，data=null，受理前拒绝 |
| 身份未验证 / 非当前责任人、越权或缺少有效人员确认 | 401 / 40101、403 / 40301，data=null，不代他人决定 |
| 授权范围内工单、明细或事项不存在 | 404 / 40401，data=null |
| 事项、明细、工单、分析版本已变或必要依据缺失 | 409 / 40901，data=null，保留意见并刷新相关信息 |
| 同 operationId 的内容与原登记不同 | 409 / 40902，data=null，不替换原操作 |
| 存在未确认结果的写动作、原问题已关闭或不是待回复轮次 | 409 / 40903，data=null，继续处理原操作或当前问题 |
| 确定未发出外部写入的受理前临时失败 | 503 / 50301，data=null，可恢复后使用同编号重试 |
| 可能已发出写入，结果未知 | PENDING / RESULT_UNKNOWN，只读回查，不按普通超时直接重发 |
| 原系统明确拒绝且证明动作未生效 | REJECTED，保留原责任人与状态及具体原因 |

```json
{"code":40903,"msg":"该补充要求已不在待回复状态，请刷新原事项","data":null,"requestId":"mock-review-003"}
```

本轮沿用明细提交的单次写等待及只读回查限制，不另设一套自动重试口径。comment 开发上限 4000 字符、材料引用上限 100 项，受理前超限拒绝，不截断、不拆成部分写入；生产限额待核实。附件必须先保存成功再引用，本接口不接收文件字节。

原系统若把记录回复、关联材料、变更审核状态拆为多次写入，必须核实能否得到一致结果。部分动作成功不得返回 SUCCEEDED 或 REJECTED；保留待确认并恢复，不能自动删除原记录补偿。即使外部通知失败，也不能撤销已确认的业务动作或重复写入；通知与事项提醒由后续流程处理。

角色走查：京东人员提出一次具体问题，服务商在原事项回复一次，系统自动接续分析；京东只核实更新结果，不增加人工搬运回复、另建工单或重复启动 Skill 的步骤。

后续 mock 覆盖三类动作、角色越权、事项关联不符、回复轮次错误、相同操作重放、分析或明细变化、超时实际成功、部分写入、分析失败、旧结果晚到及本地交接失败。真实条件写入、账号映射与可关联回查仍待提供方证据。本轮仅定义文档，没有实现或执行外部写入。
