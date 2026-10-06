# 服务商应收读取

> 版本：V1.0｜日期：2026-09-20｜状态：开发契约已核对，真实对接待核实
> 上游（我引用）：[外部依赖清单](external-dependency-list.md) §2—4、[京东账单读取](jd-bill-read.md) §2—4、[术语表](../03-01-glossary/glossary.md) §1—3、§5、[原型交互说明](../../02-prototype/interaction-spec.md) §1—3、[接口规范](../../../rules/coding-standards/09-api-design.md) §2—8
> 下游（引用我）：[原记录变化发现](source-record-changes-read.md) §3、[双方账单与对账依据实体关系](../03-03-er/er-reconciliation.md) §1—5、[术语表](../03-01-glossary/glossary.md) §1、[ER 范围与一致性总核对](../03-03-er/coverage-review.md) §2—6、[业务对账](../03-04-business-flows/flow-reconciliation.md) §1—7、[双方账单与对账依据域表结构](../03-05-schema/reconciliation-schema.md) §1—7、[00-subprd-mock-data.md](../../05-prd/00-subprd-mock-data.md) §2.3；[mock T1.1子计划](../../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T1.1-source-generation.md) PRD双链·读、[mock T2.3子计划](../../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T2.3-billing-sources.md) PRD双链·读

## 1. 接口基本信息

| 项 | 本项目约定 |
| --- | --- |
| 用途 | 读取服务商原应收分项、原总额与源版本，为业务对账提供服务商侧独立输入 |
| 提供方 | 服务商原系统或经授权的原记录导入；真实协议、版本能力与授权范围待核实 |
| 逻辑调用 | `read_provider_receivable` |
| 拟定 mock 请求 | `GET /api/admin/mock/external/sources/{sourceSystem}/service-providers/{serviceProviderId}/receivables/{providerReceivableId}?installationWorkOrderId={installationWorkOrderId}` |
| 鉴权 | 服务端核实当前身份、服务商归属及整张应收的访问权限；路径中的服务商编号不授予权限 |
| 只读边界 | 保留服务商原应收，不修改本方或京东账单，不批准费用、结算或付款 |

本接口为后续适配与 mock 的开发约定，尚未实现。服务商应收负责人在原系统维护账目；工作台取得新版后接续比较。原型中的“保存原应收并同步”仅表达这一交接，不据此增加工作台改账接口，也不认定真实系统已提供同步能力。

## 2. 请求与归属

| 参数 | 类型 / 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| sourceSystem | 非空 string / path | 是 | 已登记的来源标识，映射服务端对接配置；不接受任意地址 |
| serviceProviderId | 非空 string / path | 是 | 本应收所属服务商，与授权范围及源记录归属同时核实 |
| providerReceivableId | 非空 string / path | 是 | 原应收编号，通过权威关联取得，不从工单号或小区名称拼接 |
| installationWorkOrderId | 非空 string / query | 是 | 本次开展核对的安装工单 |
| 访问上下文 | 服务端调用上下文 | 是 | 经验证的人员身份与数据范围，不由浏览器传入角色名称替代 |

```text
GET /api/admin/mock/external/sources/provider_system/service-providers/provider-mock/receivables/REC-MOCK-001?installationWorkOrderId=AZ-MOCK-BILL-001
```

应收由来源、服务商和原应收编号共同定位。同名编号在不同服务商中不视为同一记录。返回指定记录的当前源版本；仅有历史导入文件时保留其版本与取得时间，不宣称已取得原系统最新账目。真实模式如何确认当前版本须在接入时核实。

沿用京东账单读取 §2 的整单授权与范围要求：多工单应收不得截掉未授权行后标为完整；同一工单存在多张应收时，分别保留编号与范围，不能默认相加。归属不符先按权限处理，不向越权调用者泄露应收存在性或内容。

## 3. 返回结构与修订接续

### 3.1 必返字段

成功为 HTTP 200，外层 `code=0`、`msg="success"`、`data`、`requestId`；失败保留同一包装，data=null。以下字段全部必返，未知的可空值显式为 null。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| retrievedAt | string | 本次取数时间，带时区，不代表源记录修改时间 |
| sourceSystem | 非空 string | 与请求一致，标识服务商应收来源 |
| serviceProviderId | 非空 string | 与请求及已核实的源归属一致 |
| providerReceivableId | 非空 string | 与请求一致，标识原应收 |
| installationWorkOrderId | 非空 string | 与请求一致，标识本次核对工单 |
| sourceVersion | string / null | 原应收自身版本；未知则不能声称已收到修订版 |
| sourceUpdatedAt | string / null | 源记录带时区更新时间，未知为 null |
| previousSourceVersion | string / null | 源记录明确提供的上一版本，未提供为 null，不由版本字符串猜测 |
| sourceRevisionNote | string / null | 源记录附带的修订说明，未提供为 null；不填入 AI 解释或工作台核实意见 |
| relatedWorkOrderIds | string[] | 完整关联工单，非空、去重且包含请求工单 |
| currency | string / null | 原币种，未知为 null |
| taxBasis | string | TAX_INCLUDED / TAX_EXCLUDED / UNKNOWN，按已核实源含义映射 |
| sourceStatus | string / null | 原应收状态原意，未知为 null |
| effectiveStatus | string | EFFECTIVE / VOID / UNKNOWN；源记录有效不表示京东认可费用 |
| reportedTotalAmount | string / null | 原系统报告的整张应收总额，不以分项求和或京东金额回填 |
| targetWorkOrderAmount | string / null | 原系统明确归属于目标工单的金额；单工单时等于原总额，多工单无分配依据则为 null |
| itemsComplete | boolean | 是否取得该版本全部原分项，分页未取全则为 false |
| items | object[] | 原分项，字段见下表，不按京东账单结构合并或改名 |
| completeness | string | COMPLETE / INCOMPLETE；信息完整与业务核对一致分别判断 |
| missingParts | string[] | 去重列出 SOURCE_VERSION、CURRENCY、AMOUNT_BASIS、RECEIVABLE_STATUS、TOTAL_AMOUNT、WORK_ORDER_AMOUNT、ITEMS、ITEM_AMOUNT、ITEM_SCOPE；无缺失才为空 |

| 分项字段 | 类型 | 说明 |
| --- | --- | --- |
| billItemId | 非空 string | 当前应收内唯一、稳定的源分项标识，跨系统不视为相同分项；复用“账单分项”术语 |
| itemName | 非空 string | 原项目名称 |
| installationWorkOrderId | string / null | 该分项明确归属的工单，共同费用或归属未知则为 null |
| chargeScope | string / null | 源分项明确的计费范围，不用合同解释替换原值 |
| billedQuantity | string / null | 原计费数量，十进制字符串，不等同于实际施工量 |
| unit | string / null | 原计费单位，未知为 null |
| unitPrice | string / null | 原单价，十进制字符串，未知为 null |
| amount | string / null | 原分项金额，十进制字符串，未知为 null |

金额精度、正负方向、真实零值与缺失值、总分核对、币种与税口径、多工单分配及部分读取处理，沿用京东账单读取 §3.1—3.3；其中 BILL_STATUS 在本契约对应 RECEIVABLE_STATUS。未知范围列出 ITEM_SCOPE，未知含税口径列出 AMOUNT_BASIS。完整空分项可为 []，不推定总额为零；VOID 只供回看，不参与新的有效账单核对。

previousSourceVersion 与 sourceRevisionNote 属于可用时保留的修订信息，缺失本身不使 completeness 降为 INCOMPLETE；也不能据其缺失判定“从未修订”。sourceVersion 缺失仍须列出 SOURCE_VERSION。原系统不提供稳定分项标识或可靠版本时，适配方式需另行核实，不用可变行序号或每次取数时间冒充源标识、源版本。

### 3.2 修订后继续原事项

1. **应收负责人修订原记录。** 工作台保留费用核实问题与回复，原系统保存本方账目。点击保存、人员回复“已修改”和收到新版本是不同事实。
2. **按权威关联读取新版。** sourceVersion 是不透明标识，只能比较是否相同，不能按数字或字母排序确定先后；previousSourceVersion 只有源系统明确提供时才使用。原系统若以新应收编号替换旧记录，须取得明确的替换关系后更新关联，不按小区、总额或名称猜测。
3. **接续原对账事项。** 新版读取成功后保留双方各自版本、分析依据与处理记录，再按已确认的项目对应关系比较。读到同版无需重复生成事项；未取得新版时维持等待取得修订记录，不把旧分析显示为修订后的结论。
4. **只发布与当前输入一致的分析。** 取数期间分项和总额版本不一致，整次结果不参与核对。异步分析结束时再次核对当前输入版本；旧请求晚到或旧分析晚完成，不覆盖当前版本结果。没有可靠版本或当前性证据时，提示待核实。

读取成功不自动关闭费用核实。只有双方有效记录、工单范围、币种与税口径、分项对应及依据均满足核对条件，才可形成“核对一致”；仍有差异则继续原事项。京东账单只由京东原系统维护，服务商修订不改变其金额或版本。

### 3.3 开发示例

复用原型云栖苑服务商侧四项费用，保留基础安装、桥架材料、桥架安装、入场搬运的原有拆分。原型未给出的税口径、源状态、完整计费范围及源修订信息保持未知。编号为开发示例，未从真实接口取得。

```json
{
  "code": 0,
  "msg": "success",
  "requestId": "mock-provider-receivable-001",
  "data": {
    "retrievedAt": "2026-09-20T15:00:00+08:00",
    "sourceSystem": "provider_system",
    "serviceProviderId": "provider-mock",
    "providerReceivableId": "REC-MOCK-001",
    "installationWorkOrderId": "AZ-MOCK-BILL-001",
    "sourceVersion": "receivable-1",
    "sourceUpdatedAt": null,
    "previousSourceVersion": null,
    "sourceRevisionNote": null,
    "relatedWorkOrderIds": ["AZ-MOCK-BILL-001"],
    "currency": "CNY",
    "taxBasis": "UNKNOWN",
    "sourceStatus": null,
    "effectiveStatus": "UNKNOWN",
    "reportedTotalAmount": "720.00",
    "targetWorkOrderAmount": "720.00",
    "itemsComplete": true,
    "items": [
      {"billItemId":"rec-item-001","itemName":"基础安装","installationWorkOrderId":"AZ-MOCK-BILL-001","chargeScope":null,"billedQuantity":null,"unit":null,"unitPrice":null,"amount":"300.00"},
      {"billItemId":"rec-item-002","itemName":"桥架材料","installationWorkOrderId":"AZ-MOCK-BILL-001","chargeScope":null,"billedQuantity":null,"unit":null,"unitPrice":null,"amount":"216.00"},
      {"billItemId":"rec-item-003","itemName":"桥架安装","installationWorkOrderId":"AZ-MOCK-BILL-001","chargeScope":null,"billedQuantity":null,"unit":null,"unitPrice":null,"amount":"144.00"},
      {"billItemId":"rec-item-004","itemName":"入场搬运","installationWorkOrderId":"AZ-MOCK-BILL-001","chargeScope":null,"billedQuantity":null,"unit":null,"unitPrice":null,"amount":"60.00"}
    ],
    "completeness": "INCOMPLETE",
    "missingParts": ["AMOUNT_BASIS", "RECEIVABLE_STATUS", "ITEM_SCOPE"]
  }
}
```

沿用原型“应收负责人撤回单列搬运费”的修订场景，下表仅说明前后变化；实际 GET 仍返回完整结构，不能把该表当作局部响应。

| 字段 / 项目 | 修订前 | 取得源修订版后 |
| --- | --- | --- |
| providerReceivableId | REC-MOCK-001 | REC-MOCK-001 |
| sourceVersion | receivable-1 | receivable-2 |
| 入场搬运 amount | "60.00" | "0.00" |
| reportedTotalAmount / targetWorkOrderAmount | "720.00" | "660.00" |
| 其他三项金额 | "300.00"、"216.00"、"144.00" | 保持原值 |
| previousSourceVersion / sourceRevisionNote | null / null | 仅在源系统确实返回时填入，否则仍为 null |
| 京东账单金额 | "660.00" | 保持 "660.00"，独立读取 |

以上未补足税口径、源状态和计费范围；取得修订版后仍为 INCOMPLETE，不能仅凭 660.00 相等生成核对一致结论。版本编号只用于展示内容变化，不表示提供方承诺连续递增编号。

## 4. 失败与兜底

| 情况 | HTTP / code | 本系统处理 |
| --- | --- | --- |
| 缺少参数、来源未登记或编号格式非法 | 400 / 40001 | 修正来源和编号，不尝试其他服务商记录 |
| 身份未验证 / 无该服务商或整张应收的权限 | 401 / 40101、403 / 40301 | 停止读取，不返回他方应收内容 |
| 授权范围内指定应收不存在 | 404 / 40401 | 提示未取得记录，不创建零金额应收 |
| 目标工单明确不符 / 关联无法核实 | 409 / 40901、409 / 40902 | 保留原事项等待关联核实，不任意分摊 |
| 取数过程中源版本变化 | 409 / 40903 | 放弃混合结果，重新获取同一版本 |
| 来源不可用 / 超时 | 503 / 50301、504 / 50401 | 记录失败及 requestId，旧版只供回看，不显示为最新 |
| 响应标识与请求不符、重复分项标识、金额格式非法或分项明确属于范围外工单 | 502 / 50201 | 拒绝作为有效输入，不展示串单内容 |
| 应收已取得但必要信息不完整 | 200 / 0，INCOMPLETE | 展示已有信息和缺失项，暂停依赖缺项的核对结论 |

```json
{"code":40903,"msg":"应收在读取期间已更新，请重新获取当前版本","data":null,"requestId":"mock-provider-receivable-002"}
```

沿用京东账单读取 §4 的只读取数预算：开发默认整次最多 5 秒，50301 / 50401 在 1 秒后最多重试 1 次，分页受整次时限约束；版本变化后最多额外获取 1 次，仍变化则保留失败，不与其他重试叠加成无限循环。预算为待运行验证的项目默认值，不表示提供方 SLA。读取失败不得触发任何原账目修改。

## 5. 依赖方与后续验证

业务对账、差异解释和原应收详情使用本接口。角色走查：京东对账人员直接查看已形成的差异及依据并提出核实问题；服务商应收负责人在原系统维护本方记录；系统读取修订版、更新原事项，人员继续处理尚未解决的问题。该读取不增加一轮录入、导出上传或重复审核。

后续 mock 覆盖：四项独立应收、修订为真实零值、同总额不同分项、不同服务商同名编号、多工单范围、未知税口径和状态、部分分项、作废、版本缺失或变化、重复读取、旧响应晚到、替换应收编号、权限不足和来源失败。原系统修订协议、变化发现、稳定编号及当前版本证明仍待对接核实。本轮只核验契约与示例，未实现 mock 或调用真实服务商系统。
