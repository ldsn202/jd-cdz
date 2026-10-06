# 原记录变化发现

> 版本：V1.0｜日期：2026-09-20｜状态：开发契约已核对，真实对接待核实
> 上游（我引用）：[外部依赖清单](external-dependency-list.md) §2—4、[安装工单上下文读取](installation-work-order-context.md) §2—3、[服务商资料与格式说明读取](provider-documents-format-read.md) §2—3、[核查决定与补充记录同步](review-supplement-sync.md) §3—4、[服务商应收读取](provider-receivable-read.md) §2—3、[计费条款与批准记录读取](billing-terms-approval-records-read.md) §2—3、[术语表](../03-01-glossary/glossary.md) §1、§5、[原型交互说明](../../02-prototype/interaction-spec.md) §1—3、[接口规范](../../../rules/coding-standards/09-api-design.md) §2—8
> 下游（引用我）：[当前身份与业务权限取得](current-identity-permissions-read.md) §1—3、[AI 推理与材料解析](ai-inference-material-parsing.md) §3、[处理事项实体关系](../03-03-er/er-work-item.md) §2、§4—5、[材料与分析证据实体关系](../03-03-er/er-evidence.md) §3、§5、[变化接收与执行关系](../03-03-er/er-change-execution.md) §1—2、§6、[术语表](../03-01-glossary/glossary.md) §1、[ER 范围与一致性总核对](../03-03-er/coverage-review.md) §2—6、[变化接收与执行域表结构](../03-05-schema/execution-schema.md) §1—5、[受控后台执行与本地运行接口](../03-06-provided-apis/execution-apis.md) §1—5、[00-subprd-mock-data.md](../../05-prd/00-subprd-mock-data.md) §2.3；[mock T2.6子计划](../../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T2.6-changes-revisions.md) PRD双链·读

## 1. 能力与来源

| 项 | 本项目约定 |
| --- | --- |
| 用途 | 发现原记录新增、更新或移除，触发重新读取及原事项分析更新 |
| 提供方 | 各原业务系统及已登记的授权导入来源，真实能力待核实 |
| 逻辑调用 | `read_source_record_changes` |
| 拟定 mock 请求 | `GET /api/admin/mock/external/change-feeds/{feedId}/changes?cursor={cursor}&pageSize={pageSize}` |
| 鉴权 | 仅供已授权的后台处理身份使用，按 feedId 绑定的来源及服务商范围核实；不得由浏览器任意声明范围 |
| 只读边界 | 不修改源业务记录，不作审核、费用决定或付款，不把收到变化当成处理成功 |

feedId 标识一份已登记的变化读取配置，绑定一个来源、一家服务商及明确的数据范围；同一来源服务不同业务范围时分别记录进度。共享合同等记录可在多个授权范围内产生提示，不能因此把某个服务商视为合同唯一所有方。

下表列出可选取得方式，具体方式在对接核实后选定，不要求提供方已存在本文件同名 HTTP 接口。

| discoveryMode | 取得方式与限制 |
| --- | --- |
| SOURCE_FEED | 原系统提供可恢复的变化记录，或经验证的通知与补查组合；仅有可能丢失的通知不满足持续发现要求 |
| SOURCE_SCAN | 系统按已确认范围自动查询原记录并比较版本；须核实列表覆盖、分页稳定性及删除判断，不能只扫描工作台已知记录而漏掉新增记录；只发现可见状态差异，不承诺捕获扫描间发生的每一个中间版本 |
| AUTHORIZED_IMPORT | 发现已经完成授权登记的导入批次及版本；只说明导入记录变化，不冒充原系统实时数据，也不新增逐单人工导出上传步骤 |

适配层将已取得的变化保存为可恢复的读取序列，再按本契约供后台消费。源系统与适配层的保存位置分别记录；查询频率、通知协议、保留周期及来源覆盖均待实际对接确认，不在本轮承诺实时发现或固定更新间隔。没有可验证发现能力时明确报错，不能用空列表表示“没有变化”。

## 2. 请求与查询位置

| 参数 | 类型 / 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| feedId | 非空 string / path | 是 | 服务端已登记且当前身份有权限使用的读取配置 |
| cursor | 非空 string / query | 是 | 上一次已可靠接收的读取位置，不透明标识，只按原值使用，不拆解或排序 |
| pageSize | integer / query | 否 | 默认 10，范围 1—50；属于开发配置，不代表原系统限制 |
| 访问上下文 | 服务端调用上下文 | 是 | 已验证的后台身份及范围；凭据留在服务端 |

```text
GET /api/admin/mock/external/change-feeds/provider-receivables-mock/changes?cursor=cursor-mock-a&pageSize=10
```

游标式增量读取采用接口规范 §7 的专用约定，不使用会随新数据插入而移动的页码。cursor 绑定 feedId、来源范围和配置代次；更换来源、扩大权限范围或重建初始状态后，旧位置不能直接复用。

**首次启用不从“现在”静默开始。** 接入准备阶段先建立初始记录清单，并确保清单建立期间的变化可补查。适配层将初始记录也保存为待读取项，在服务端登记起始 cursor，再启动本接口；本轮不提供任意“跳到最新”的请求参数。无法取得完整起点时，配置保持未就绪，不把已有工单漏掉后声称自动处理已启用。

扫描方式须有稳定范围或等价的重复扫描与校验机制；一次不稳定列表遍历不能证明已查全。仅有 `updatedAt > 上次时间` 不能覆盖同时间更新、延迟记录、删除和分页期间变化，须据真实能力补足。导入方式的起点及完成范围以已核实的批次登记为准。需要逐条接续的审核、补充动作，须有可枚举回查的原动作记录或等价可靠来源，不能只看到工单版本变化便推断全部回复已收齐。

## 3. 返回与后续处理

### 3.1 一批变化

成功为 HTTP 200，外层 `code=0`、`msg="success"`、`data`、`requestId`；失败保留同一包装，data=null。以下字段全部必返，可空值显式返回 null。

| data 字段 | 类型 | 说明 |
| --- | --- | --- |
| feedId | 非空 string | 与请求一致 |
| sourceSystem | 非空 string | 该配置绑定的原来源 |
| serviceProviderId | 非空 string | 该配置的授权业务范围；不据此推定每份共享原记录只属于该服务商 |
| discoveryMode | string | SOURCE_FEED / SOURCE_SCAN / AUTHORIZED_IMPORT，与已登记方式一致 |
| retrievedAt | string | 本次读取适配层变化序列的带时区时间 |
| sourceCheckedAt | string / null | 最近一次成功取得来源变化或完成来源扫描、导入登记的时间；未知为 null，不用 retrievedAt 代替 |
| coverageThrough | string / null | 提供方能证明变化已覆盖到的带时区时间；无法证明为 null，不能把最后一条事件时间当作覆盖时间 |
| cursor | 非空 string | 本次请求位置原值 |
| nextCursor | 非空 string | 此批完整接收后可保存的新位置；空批保持原 cursor |
| hasMore | boolean | 适配层当前可读序列中是否还有下一批，不表示原系统以后不会变化或已覆盖所有最新内容 |
| list | object[] | 不超过 pageSize 的变化项；无待读项为 [] |

非空批 nextCursor 必须不同于 cursor；空批 nextCursor=cursor 且 hasMore=false。变化序列保留期间，以同一 cursor 重读可重复返回已见变化；记录身份与内容不得被改写。页大小变化不能导致跳项。无法返回完整、可信的一批时整体报错，不返回部分结果并推进位置。

sourceCheckedAt 与 coverageThrough 描述不同事实；前者说明何时取过数，后者需来源证明覆盖范围。hasMore=false、空批或本接口 code=0 均不能单独支持“所有来源均已同步”的展示。来源已知失败、发现链路存在缺口时返回错误，保留已存待处理项；不能继续返回成功空批掩盖中断。

### 3.2 每条变化

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| changeId | 非空 string | 适配层在该 feed 内稳定且唯一的变化编号，同一已接收变化重放时不变；不是业务记录版本 |
| recordType | string | 记录类型，见下表；未知类型不静默丢弃 |
| sourceRecordId | 非空 string | 该类型原记录编号，供定位后续读取，不从名称拼接 |
| sourceVersion | string / null | 变化所指的原版本；来源缺失则 null，不用 changeId 或取数时间代替 |
| changeType | string | UPSERT：新增或更新提示；REMOVED：来源明确已移除，不含查询超时、无权访问或本次列表没出现 |
| sourceUpdatedAt | string / null | 原变化时间，未知为 null，不用于单独确定新旧顺序 |
| relatedWorkOrderIds | string[] | 已知的工单关联提示，去重；空数组不一定表示无关联 |
| associationComplete | boolean | 当前变化对工单的关联范围是否已确认完整；false 时继续查关联，不遗漏未列出的受影响项 |

适配层不得将变化提示中的业务状态直接写成审核结果。sourceVersion 缺失仍可保存提示并尝试读取当前记录，但无法核实当前版本时暂停依赖版本的结论。REMOVED 保留已有引用及历史信息并重新核实受影响事项，不删除业务决定或自动关闭事项。

| recordType | 重新取数及接续方向 |
| --- | --- |
| INSTALLATION_WORK_ORDER、INSTALLATION_PLAN、INSTALLATION_DETAIL、SOURCE_MATERIAL | 按权威关联刷新工单上下文，再按当前材料引用读取原文；各记录版本独立 |
| INSTALLATION_REVIEW、SUPPLEMENTAL_RESPONSE | 按核查与补充同步契约回查原动作及工单，核实原事项、原问题和回复关系；通知不替代成功回执 |
| PURCHASE_ORDER、INSTALLATION_ENTITLEMENT | 核实工单订单关联后重新读取订单权益 |
| PROVIDER_RECORD、PROVIDER_FORMAT | 重新读取服务商资料及格式说明；独立接入配置资料允许没有工单，按源资料及配置关联继续处理 |
| JD_BILL、PROVIDER_RECEIVABLE | 按原账单编号及工单关联分别读取双方记录；不因一方变化修改另一方 |
| BILLING_TERM、FEE_APPROVAL_RECORD | 重新查询对应工单及服务商的费用依据，再读所需原文；共享记录须找到其全部受影响范围 |

sourceRecordId 映射到具体读取接口的原编号，例如 PROVIDER_RECEIVABLE 对应 providerReceivableId，JD_BILL 对应 jdBillId，SOURCE_MATERIAL 对应 sourceMaterialId。资料、条款等不能直接按记录编号查询工单时，先按权威关联或已保存的真实引用查找受影响范围，不把编号当工单号。

同一记录涉及多工单时，分别接续受影响事项。没有完整关联时保留待解析的变化任务，不能因 relatedWorkOrderIds=[] 而忽略。配置资料无工单并且 associationComplete=true 时，按服务商资料关系定位配置事项，不新造安装工单。实际来源未提供某类独立记录时，由真实存在的所属记录变化触发重读，不伪造子记录编号。

### 3.3 接收、去重与恢复

1. **先可靠保存，再推进读取位置。** 同一事务中保存本批变化、去重标识及后续处理任务，并更新 cursor；事务失败保持原位置。无需等 AI 完成才继续发现变化，但必须保证保存的处理任务可恢复。
2. **同一读取范围只允许条件推进。** 按原 cursor 作条件更新，避免多个读取进程相互覆盖位置。重放以 feedId + changeId 去重；同号不同内容视为来源或适配异常，停止推进并排查。
3. **按业务记录继续原事项。** 不把每条通知都建成新待办；补充定位原退回问题，账目修订定位原对账事项，已成功回执与变化通知共用同一业务动作关联。找不到可靠关联时保留待核实任务，不猜配。
4. **原数据与分析分别检查。** 变化只是重读提示，按读取契约取得当前记录；sourceVersion 不按字母或数字排序。旧通知晚到时可以重新检查当前记录，不能将通知中的旧版本覆盖当前输入。分析发布时比较其输入版本及事项当前版本，过期结果不发布；相同输入无需重复分析或改变人员决定。已完成事项的依据发生变化时，保留原决定及其版本，并保存需要重新核实的任务；后续业务流程明确重新处理方式，不能因事项已完成而丢掉变化。
5. **断点可继续。** 读取位置已推进而下游失败，从已保存的任务恢复；位置未推进则重读并去重。单条关联待核实或分析失败不阻塞其他已可靠保存项，但不能丢掉该任务后标成处理完成。

游标失效、来源发现存在缺口或配置范围变化时，停止正常推进并保留现有任务和历史。恢复须重新核实范围、补查或重建完整记录清单，并衔接重建期间的变化；确认没有缺口后登记新的起点。不能把 cursor 清空、改为当前时间并直接继续。本轮仅规定恢复条件，实际快照、通知与补查能力须在接入时验证。

### 3.4 开发示例

复用服务商应收契约的独立 mock 记录，演示发现应收版本发生变化。来源能力、cursor 和 changeId 均为开发示例；本响应不携带金额，不证明原账目已核对一致。

```json
{
  "code": 0,
  "msg": "success",
  "requestId": "mock-source-change-001",
  "data": {
    "feedId": "provider-receivables-mock",
    "sourceSystem": "provider_system",
    "serviceProviderId": "provider-mock",
    "discoveryMode": "SOURCE_SCAN",
    "retrievedAt": "2026-09-20T17:00:00+08:00",
    "sourceCheckedAt": "2026-09-20T16:59:00+08:00",
    "coverageThrough": null,
    "cursor": "cursor-mock-a",
    "nextCursor": "cursor-mock-b",
    "hasMore": false,
    "list": [{
      "changeId": "change-mock-001",
      "recordType": "PROVIDER_RECEIVABLE",
      "sourceRecordId": "REC-MOCK-001",
      "sourceVersion": "receivable-2",
      "changeType": "UPSERT",
      "sourceUpdatedAt": null,
      "relatedWorkOrderIds": ["AZ-MOCK-BILL-001"],
      "associationComplete": true
    }]
  }
}
```

本例说明适配层当前只有这一条待读取提示。随后仍须按服务商应收读取契约取得当前版本、原分项和状态；coverageThrough=null，不能宣称原系统的全部变化已覆盖到 retrievedAt。

## 4. 失败与兜底

| 情况 | HTTP / code | 本系统处理 |
| --- | --- | --- |
| 参数缺失、pageSize 越界或格式非法 | 400 / 40001 | 修正参数，不重置读取位置 |
| 身份未验证 / 无配置范围权限 | 401 / 40101、403 / 40301 | 停止访问及下游取数，不继续使用旧权限缓存 |
| 已授权范围内配置不存在 | 404 / 40401 | 核实配置，不自动切换其他服务商 |
| cursor 与 feed 或当前配置代次不符 | 409 / 40901 | 拒绝使用，核实范围及起点 |
| cursor 过期、发现缺口或无法证明适配层保存序列连续 | 409 / 40902 | 暂停推进，按 §3.3 补查和重建 |
| 首次清单、来源能力或读取配置尚未就绪 | 409 / 40903 | 显示发现能力待准备，不返回成功空列表 |
| 来源或变化存储不可用 / 超时 | 503 / 50301、504 / 50401 | 保留原 cursor 和已存任务；不能解释为没有变化 |
| 未知记录类型、重复编号内容冲突、范围不符或非法结构 | 502 / 50201 | 整批不推进，记录 requestId；未知类型待适配后从原位置恢复 |

```json
{"code":40902,"msg":"变化读取位置已失效，需补查并确认覆盖范围后继续","data":null,"requestId":"mock-source-change-002"}
```

开发默认每次完整读取最多 5 秒；仅 50301 / 50401 在 1 秒后重试 1 次，含重试最多 11 秒，重试使用原 feedId、cursor 与 pageSize。每次只处理一批，后台接续下一批；来源扫描与回补另设有界任务，不能在一次请求里无限扫描。本配置尚未运行验证，不代表提供方 SLA。

## 5. 依赖方与后续验证

四类 Skill 的自动准备、补充后的复核及修订后的业务对账使用此能力。人员仍从工作台处理已形成的分析与问题，不增加“检查原系统是否有新记录”、手动启动 Skill 或重新建事项的日常步骤。发现延迟、失败与待核实状态须如实展示，不把已取得的历史结果呈现为实时结果。

后续 mock 与实现须覆盖：初始记录及其间变化、正常分页、同 cursor 重读、并发推进、先保存后中断、下游分析失败、重复回执和变化通知、旧事件晚到、多工单关联、无工单配置资料、缺版本、删除与无权限区别、来源失败、空批、失效 cursor、范围变化及共享条款变更。真实通知可靠性、扫描稳定性、关联查询、保存周期和来源覆盖仍待核实；本轮未实现 mock、后台调度或调用真实来源。
