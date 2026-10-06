# 正式安装明细提交

> 版本：V1.1｜日期：2026-09-20｜状态：开发契约已核对，真实对接待核实
> 上游（我引用）：[外部依赖清单](external-dependency-list.md) §2—4、[安装工单上下文读取](installation-work-order-context.md) §2—5、[原始材料读取](source-material-read.md) §2—4、[术语表](../03-01-glossary/glossary.md) §1—3、§5、[原型交互说明](../../02-prototype/interaction-spec.md) §1—3、[接口规范](../../../rules/coding-standards/09-api-design.md) §2—8
> 下游（引用我）：[核查决定与补充记录同步](review-supplement-sync.md) §3—5、[当前身份与业务权限取得](current-identity-permissions-read.md) §3、[安装资料实体关系](../03-03-er/er-installation.md) §1—5、[术语表](../03-01-glossary/glossary.md) §1、[变化接收与执行关系](../03-03-er/er-change-execution.md) §5—6、[ER 范围与一致性总核对](../03-03-er/coverage-review.md) §2—6、[安装资料整理与提交](../03-04-business-flows/flow-installation-submission.md) §1—8、[业务流程覆盖与一致性总核对](../03-04-business-flows/coverage-review.md) §2—8、[安装资料域表结构](../03-05-schema/installation-schema.md) §1—7、[安装资料与核查接口](../03-06-provided-apis/installation-apis.md) §1—4、[00-subprd-mock-data.md](../../05-prd/00-subprd-mock-data.md) §2.3；[mock T2.4子计划](../../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T2.4-detail-writeback.md) PRD双链·读

## 1. 接口基本信息

| 项 | 本项目约定 |
| --- | --- |
| 用途 | 将责任人已经核实并确认提交的安装明细写回原安装管理系统 |
| 提供方 | 原安装管理系统；真实写入、版本条件和结果回查能力待核实 |
| 逻辑调用 | `submit_installation_detail` |
| 拟定 mock 请求 | `POST /api/admin/mock/external/installation/work-orders/{installationWorkOrderId}/installation-detail-submissions` |
| 鉴权 | 服务端验证当前提交权限、工单服务商归属和人员确认记录，实际操作者来自可信身份，不接受请求方自填角色作为授权 |
| 写入边界 | 只提交正式安装明细及其依据引用；不代替京东核查，不批准费用，不修改账单或付款 |

路径及字段属于本项目后台适配的开发约定。mock 与真实写入均未实现；本轮不发出业务写请求。后续真实写入须核实本契约的前提能力，不能用“先读一次，再无条件覆盖”代替版本保护，也不能把前端弹出成功提示当作写入证明。

## 2. 请求参数与提交前提

### 2.1 请求结构

| 字段 | 位置 / 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| installationWorkOrderId | path / 非空 string | 是 | 目标安装工单，不能使用配置事项编号 |
| submissionId | body / 非空 string | 是 | 本系统为一次人员确认生成并保存的提交编号；重复点击及恢复请求继续使用同一编号 |
| humanDecisionId | body / 非空 string | 是 | 对应人员确认提交的记录，服务端核实其操作者、工单、草稿版本与全部提交内容 |
| installationDraftId | body / 非空 string | 是 | 已确认的安装资料草稿编号 |
| confirmedDraftVersion | body / 非空 string | 是 | 人员本次确认的草稿版本；确认后编辑内容必须形成新版本、新确认及新提交编号 |
| expectedWorkOrderVersion | body / 非空 string | 是 | 人员确认所依据的工单版本 |
| expectedPlanVersion | body / 非空 string | 是 | 本次确认所依据的当前有效方案版本 |
| expectedDetailVersion | body / string 或 null | 是 | 首次提交且原系统确认无正式明细时为 null；修订提交为原正式明细版本 |
| items | body / object[] | 是 | 本次正式提交的完整项目列表，至少一项；不按“仅变更几项”隐式拼接旧明细 |
| sourceMaterials | body / object[] | 是 | 本次确认使用的材料引用；无文件依据时为 []，不伪造附件 |
| 访问上下文 | 服务端调用上下文 | 是 | 当前身份、授权范围及经服务端核实的人员确认事实，不能仅凭客户端 confirmed=true 放行 |

items 每项必填：`installationItem`（非空 string）、`installedQuantity`（有限非负 number）、`unit`、`materialSupplier`、`serviceScope`（均为非空 string）。这些字段与工单上下文的正式明细一致；提交时不允许用 null 或空字符串代表尚未核实。零数量仅在原业务允许且人员明确核实为零时接受，不能把未知转成零。

sourceMaterials 每项必填 `sourceSystem`、`sourceMaterialId`、`sourceVersion`（均为非空 string）。材料必须可核实归属、访问范围及指定版本；文件名或 AI 摘要不能替代材料引用。本接口不上传文件，补充附件先经相应上传流程保存后再引用。

### 2.2 受理条件

- 服务端核实人员确认记录真实存在，并与草稿版本、全部 items、材料引用及请求工单一致。AI 生成草稿本身不构成提交授权。
- 核实工单、方案及正式明细状态。首次提交须明确尚无正式明细；修订须符合原系统允许重提的业务状态，不能直接覆盖已审核通过的记录。
- 原系统按预期版本和业务状态执行条件写入。方案在并发变化时也须纳入等价条件保护；仅本工作台加锁不能防止原系统其他入口修改。
- 任一必要版本缺失或确认已过期，停止新的写入，保留草稿并提示人员只核实变化部分。方案量、权益上限、库存净额不能填入 installedQuantity 冒充实际施工量。
- 不因采用新工作台增加一轮重复审批。人员在当前页面确认提交一次，后台完成授权核实、写入与结果确认。

### 2.3 只读回查接口

拟定 mock 请求：`GET /api/admin/mock/external/installation/work-orders/{installationWorkOrderId}/installation-detail-submissions/{submissionId}`。

两个路径参数均为必填非空字符串。服务端验证当前可信身份及读取权限，并核实原操作与来源、服务商、工单的关联。不能凭自报角色或仅凭操作编号读取其他服务商结果；查询不要求再次执行人员确认，不新增业务动作。

正常返回沿用 §4.1 的结果结构，HTTP 200、code=0；业务状态仍可能为 SUCCEEDED、REJECTED 或 PENDING，pendingReason 原样保留。读取指定原操作的结果及其版本，不以工单当前最新记录替换历史提交结果，不再次发出写请求。

参数错误返回400/40001，未认证返回401/40101，无读取权限返回403/40301；授权范围内工单或关联操作不存在返回404/40401。回查临时不可用返回503/50301、超时返回504/50401，均采用data=null的错误包装。查无记录或回查失败均不足以证明此前写入未发生，本系统保留结果待确认，不据此自动重发。真实提供方的结果读取能力仍须核实。

## 3. 重复提交与结果确认

### 3.1 同一次提交只执行一次

1. 首次外部写入调用前，本系统持久保存 submissionId、工单、原确认操作者、确认内容和处理中状态，并限制同一工单只有一笔未确认结果的业务写动作；明细提交、核查及补充入口共用此保护。
2. 已验证当前身份和访问权限后，先查此提交编号。同一编号、同一确认内容返回已有状态；不同内容返回编号冲突，不改写原请求。
3. 重放已存在的相同提交时，不按已经被此次成功写入改变的旧预期版本重新判为失败；同时不再执行外部写入。当前权限仍须核验。
4. 相同 submissionId 的并发请求由唯一约束或等价机制合并；改变 submissionId 也不能绕过该工单正在处理或结果未知的状态。
5. 实际提供方须支持请求编号去重及关联回查，或具备经核实的等价能力。若不具备，真实写入不能按本契约开放；进程重启后尤其不能凭本地“没有收到成功”推断源系统未写入。

去重范围须包含来源、服务商、工单和 submissionId；本系统保存原确认内容。终态记录不能在原事项尚可能重放时被静默删除；记录留存期限在后续数据设计中统一。重复请求返回原结果，不能再次创建京东核查事项。

### 3.2 写入结果状态

| submissionStatus | 判定依据 | 业务处理 |
| --- | --- | --- |
| SUCCEEDED | 原系统明确已提交，取得正式明细编号及版本，并能以本次提交关联回查核对内容 | 保存权威明细引用，进入京东核查；这不表示京东已审核通过 |
| REJECTED | 有可核实结果证明本次提交没有写入，例如原系统明确拒绝业务条件 | 保留草稿和具体原因，修正后重新确认；原编号仍返回该次拒绝结果 |
| PENDING | 原系统尚在处理，或请求结果无法确定 | 保持“提交结果确认中”，暂停新的提交；后台回查，同一次操作不重复写入 |

PENDING 的 pendingReason 为 `PROCESSING` 或 `RESULT_UNKNOWN`，分别表示原系统明确仍在处理、无法确认结果。超时、响应丢失、进程中断、写调用返回异常但不能证明未执行，都属于结果待确认，不能直接判成 REJECTED。

恢复时按 submissionId 或可唯一关联的原系统回执只读回查。一般工单查询中暂时没有新记录，不足以证明本次未写入；看到相同字段的旧记录也不足以证明本次成功。只有取得可关联的终态证据才转 SUCCEEDED 或 REJECTED。没有可靠回查能力时保留待核实，不能自动重发。

已存在提交的重复 POST 用于返回或核实该次状态，不再次发出外部写操作。真正修改草稿、刷新版本后的新确认使用新编号，且前一笔必须已明确终态。

## 4. 返回与开发示例

### 4.1 返回结构

受理及结果读取正常时使用 HTTP 200、`code=0`、`msg="success"`、`data`、`requestId`。code=0 只表示本次接口处理正常，页面必须检查 submissionStatus，不能把 PENDING 或 REJECTED 显示为提交成功。受理前拒绝使用 §5 的错误包装，data=null。

| data 字段 | 类型 | 说明 |
| --- | --- | --- |
| submissionId | 非空 string | 本次人员确认对应的提交编号 |
| installationWorkOrderId | 非空 string | 目标工单，与请求一致 |
| submissionStatus | string | SUCCEEDED / REJECTED / PENDING |
| pendingReason | string / null | PENDING 时为 PROCESSING / RESULT_UNKNOWN，其余为 null |
| installationDetail | object / null | SUCCEEDED 时含 sourceSystem、installationDetailId、sourceVersion，均为非空 string；其他状态为 null |
| resultDescription | 非空 string | 可给人员理解的结果说明，不泄露凭据或内部堆栈 |
| verifiedAt | string / null | 核实终态的带时区时间；PENDING 为 null |

SUCCEEDED 记录所指明细版本必须对应本次确认内容；不能将后续别人的修订版本写成本次提交结果。正式明细的新版本由原系统确定，不由客户端自增。修订提交保留此前记录，不能覆盖历史证据。

### 4.2 开发请求与响应

以下是独立 mock 工单，只包含桥架项目。桥架数量、供料方及服务范围取自当前原型的桂语庭资料；示例不代表真实完整工单或真实接口响应。

```json
{
  "submissionId": "submission-mock-001",
  "humanDecisionId": "decision-mock-001",
  "installationDraftId": "draft-mock-001",
  "confirmedDraftVersion": "draft-1",
  "expectedWorkOrderVersion": "work-order-1",
  "expectedPlanVersion": "plan-1",
  "expectedDetailVersion": null,
  "items": [{"installationItem":"桥架安装","installedQuantity":12,"unit":"米","materialSupplier":"物业","serviceScope":"仅安装"}],
  "sourceMaterials": [{"sourceSystem":"installation_management","sourceMaterialId":"material-mock-001","sourceVersion":"material-1"}]
}
```

请求路径为 `POST /api/admin/mock/external/installation/work-orders/AZ-MOCK-SUBMIT-001/installation-detail-submissions`。正常写入并回查后：

```json
{"code":0,"msg":"success","requestId":"mock-submit-001","data":{"submissionId":"submission-mock-001","installationWorkOrderId":"AZ-MOCK-SUBMIT-001","submissionStatus":"SUCCEEDED","pendingReason":null,"installationDetail":{"sourceSystem":"installation_management","installationDetailId":"detail-mock-001","sourceVersion":"detail-1"},"resultDescription":"安装明细已提交，进入京东核查","verifiedAt":"2026-09-20T13:00:00+08:00"}}
```

提交后暂时无法确认结果时：

```json
{"code":0,"msg":"success","requestId":"mock-submit-002","data":{"submissionId":"submission-mock-001","installationWorkOrderId":"AZ-MOCK-SUBMIT-001","submissionStatus":"PENDING","pendingReason":"RESULT_UNKNOWN","installationDetail":null,"resultDescription":"正在确认原系统提交结果，请勿重复提交","verifiedAt":null}}
```

以上两种响应是同一开发请求的不同场景，不表示同一次提交先成功又退回待确认。终态不得被较晚到达的旧响应降为 PENDING。

## 5. 失败与业务衔接

| 情况 | 返回 / 处理 |
| --- | --- |
| 受理前参数或项目内容非法 | HTTP 400 / code 40001，data=null；保留草稿，不调用外部写入 |
| 身份未验证 / 无提交权限或无有效人员确认 | 401 / 40101、403 / 40301，data=null；不接受 AI 自行确认 |
| 授权范围内工单不存在 | 404 / 40401，data=null |
| 受理前版本变化、版本缺失或当前业务状态不允许提交 | 409 / 40901，data=null；刷新必要资料，保留原意见 |
| 相同编号但确认内容不一致 | 409 / 40902，data=null；不替换原提交内容 |
| 同工单另一明细提交、核查或补充动作尚未确认结果 | 409 / 40903，data=null；继续确认原提交，不新写入 |
| 无法持久保存提交记录，或来源预检失败且确定尚未发出写调用 | 503 / 50301，data=null；明确尚未受理，可在恢复后重试同一请求 |
| 请求可能已发到原系统，结果未知 | 返回该 submissionId 的 PENDING / RESULT_UNKNOWN；不能按普通 503 或超时错误触发自动重发 |
| 原系统有明确拒绝且证明未写入 | 正常结果包装，submissionStatus=REJECTED；保存拒绝原因，不创建京东核查事项 |

错误包装示例：

```json
{"code":40902,"msg":"该提交编号已用于另一份确认内容","data":null,"requestId":"mock-submit-003"}
```

开发默认单次等待外部写响应最多 5 秒，超时转结果确认，不自动重发写调用。结果回查为只读操作，单次最多 5 秒，临时不可用时最多再查 1 次；失败仍保留 PENDING。项目列表开发上限为 100 项，超限在受理前拒绝，不拆成多次可能部分成功的提交。实际容量、超时和原系统条件写入能力均待核实。

若原系统存在分项写入，应先核实能否实现整份提交的一致结果。部分成功不能标为 SUCCEEDED 或 REJECTED，保留 PENDING 并核实处理；不能用自动删除已写数据作为未经确认的补偿动作。

工作台后续处理须以 SUCCEEDED 为唯一的提交成功依据，并按提交编号或对应正式明细版本去重接续核查事项。源系统写入成功但本地接续暂时失败时，恢复本地处理即可，不再次提交原明细。

角色走查：服务商确认一次安装事实，系统完成提交和结果核实；京东仍审核正式明细。后台核验及结果确认不构成第二轮人工审批，结果未知时也不要求人员重新填写整单。

后续 mock 覆盖首次提交、允许的修订、相同请求重放、同编号改内容、并发提交、当前权限撤销、版本变化、来源明确拒绝、超时但实际成功、服务重启恢复、部分写入和本地接续失败。真实接入必须提供人员身份映射、条件写入、去重及可关联回查的证据；本轮仅完成文档约定。
