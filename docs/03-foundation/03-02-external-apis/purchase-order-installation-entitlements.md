# 购买订单与安装权益读取

> 版本：V1.0｜日期：2026-09-20｜状态：开发契约已核对，真实对接待核实
> 上游（我引用）：[外部依赖清单](external-dependency-list.md) §2—4、[安装工单上下文读取](installation-work-order-context.md) §2—3、[术语表](../03-01-glossary/glossary.md) §1—2、§5、[接口规范](../../../rules/coding-standards/09-api-design.md) §2—8
> 下游（引用我）：[ER 范围与一致性总核对](../03-03-er/coverage-review.md) §2—6、[00-subprd-mock-data.md](../../05-prd/00-subprd-mock-data.md) §2.3、[workbench-apis](../03-06-provided-apis/workbench-apis.md) §6—7；[mock T2.1子计划](../../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T2.1-identity-workorders.md) PRD双链·读

## 1. 接口基本信息

| 项 | 本项目约定 |
| --- | --- |
| 用途 | 取得工单所关联购买订单的安装权益，供核实服务范围和套餐内数量使用 |
| 业务提供方 | 原订单及安装权益系统，实际系统拆分、地址与状态含义待核实 |
| 逻辑调用 | `read_purchase_order_installation_entitlements` |
| 拟定 mock 请求 | `GET /api/admin/mock/external/purchase-orders/{purchaseOrderId}/installation-entitlements?installationWorkOrderId={installationWorkOrderId}` |
| 鉴权 | 服务端验证当前身份、工单访问范围及订单关联，只返回授权范围内的安装相关信息 |
| 只读边界 | 不购买、不退款、不核销或变更权益，不计算应付金额，不批准费用或付款 |

本路径与返回结构是后台适配开发约定，当前尚未实现。实际提供方可能有多个接口，其原始状态需按有依据的映射转换，不能仅凭商品名称或 AI 推测确定权益。本系统只读取需要的订单关联和安装权益，不拉取收货人、手机号、支付信息等本接口不需要的数据。

## 2. 请求参数与关联约束

| 参数 | 位置 / 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| purchaseOrderId | path / 非空 string | 是 | 工单权威关联中的购买订单编号 |
| installationWorkOrderId | query / 非空 string | 是 | 本次需要核实权益的安装工单 |
| 访问上下文 | 服务端调用上下文 | 是 | 已验证的调用身份及访问范围，不接受调用方自报角色作为权限依据 |

```text
GET /api/admin/mock/external/purchase-orders/PO-MOCK-001/installation-entitlements?installationWorkOrderId=AZ-MOCK-001
```

- 适配层须从权威记录核实两者关联；调用方同时给出两个编号，不代表关联已成立。工单关联的订单编号尚未取得时，返回关联待核实，不用手机号、地址或商品名猜测。
- 工单与订单关联明确不符时返回关联不符。一个购买订单可能涉及不同安装范围，不能默认其全部权益都适用于当前工单。
- 查询当前记录及其明确适用范围。原权益已发生变化时，保留新版本和当前状态；后续处理历史业务是否适用，须按原系统保留的历史依据核实，不能仅看当前有效性。
- 本接口不读取指定历史快照。需要回看历史依据时，使用此前保存的引用及可核实的历史记录；无法取得历史依据时保留待核实，不用当前记录改写历史结论。

## 3. 返回结构

### 3.1 包装与订单信息

成功返回 HTTP 200，外层统一为 `code=0`、`msg="success"`、`data`、`requestId`；失败保留相同包装，`data=null`。所有下列字段必返，可空字段明确为 null，列表返回数组。

| data 字段 | 类型 | 说明 |
| --- | --- | --- |
| retrievedAt | string | 本次取数时间，带时区 |
| installationWorkOrderId | 非空 string | 与请求一致，且已经核实订单关联 |
| workOrderSourceVersion | string / null | 核实订单关联所依据的工单版本；不能用权益版本替代 |
| purchaseOrder | object | 订单最小信息，见下文 |
| entitlementListComplete | boolean | 目标订单在当前授权业务范围内的安装权益列表是否已完整取得 |
| entitlements | object[] | 安装权益列表；每项分别说明对当前工单是否适用 |
| completeness | string | `COMPLETE` / `INCOMPLETE`，只表示本契约要求的信息是否取得完整 |
| missingParts | string[] | 去重列出 `ENTITLEMENT_LIST`、`ENTITLEMENT_SCOPE`、`ENTITLEMENT_STATUS`、`ENTITLEMENT_APPLICABILITY`、`SOURCE_VERSION`；完整时为空 |

`purchaseOrder` 必返 `purchaseOrderId`、`sourceSystem`、`sourceVersion`、`sourceUpdatedAt`。前两项是非空 string；后两项分别为 string / null、带时区的 string / null。编号须与请求相同。源系统未给更新时间时保留 null，不用取数时间补写。

### 3.2 每项安装权益

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| installationEntitlementId | 非空 string | 原权益记录编号，同一来源内唯一 |
| name | 非空 string | 原权益名称，用于展示，不能代替权益含义 |
| sourceSystem | 非空 string | 该权益所属来源 |
| sourceVersion | string / null | 该权益记录版本，按字符串判等，不比较大小 |
| sourceUpdatedAt | string / null | 原记录带时区更新时间，未知为 null |
| coveredServiceScope | string / null | 原记录明确的安装服务范围，未知为 null；不能由权益名称猜出 |
| quantityType | string | `LIMITED`：原记录有数量上限；`UNLIMITED`：原记录明确无数量上限；`NOT_QUANTITY_BASED`：按明确的非数量范围约定；`UNKNOWN`：无法核实 |
| includedQuantity | number / null | `LIMITED` 时为非负上限，并与 unit 成对使用；其余类型为 null |
| unit | string / null | 数量上限的单位；数量未知或非 LIMITED 时为 null |
| validity | string | `VALID` / `INVALID` / `UNKNOWN`，仅指当前源记录的有效性，按可核实的源状态转换 |
| validityBasis | string / null | 有效性依据；VALID、INVALID 时为非空，UNKNOWN 时可空 |
| applicability | string | `APPLICABLE` / `NOT_APPLICABLE` / `UNKNOWN`，指该权益是否适用于请求中的工单 |
| applicabilityBasis | string / null | 适用范围的明确依据；前两种状态为非空，UNKNOWN 时可空 |

每项权益与订单各自保留来源和版本；工单关联版本也独立记录。若某个取得的记录或工单关联缺版本，将 `SOURCE_VERSION` 加入 `missingParts`。读取多个来源不保证原子快照，后续保存业务决定时须复核所依赖版本。

范围、数量、有效性和适用性分别表达：有效权益不一定适用于此工单；权益适用也不表示施工已完成、已消耗全部额度或额外费用已批准。该接口不记录实际安装数量。

### 3.3 完整性及业务使用约束

| 情况 | 返回及使用方式 |
| --- | --- |
| 列表已查全且确实没有安装权益 | `entitlementListComplete=true`、`entitlements=[]`；不自动推导用户应额外付费 |
| 权益列表查询中断、仅取得部分结果 | false，列出 `ENTITLEMENT_LIST`，保留已取得项；不能以空数组表示确定没有权益 |
| 服务范围缺失、数量类型未知，或 LIMITED 的数量 / 单位未取得 | 保留 null / UNKNOWN，列出 `ENTITLEMENT_SCOPE`；不能用零或 UNLIMITED 补缺 |
| 有效性或工单适用性未知，或缺少明确依据 | 对应状态为 UNKNOWN，列出 `ENTITLEMENT_STATUS` 或 `ENTITLEMENT_APPLICABILITY` |
| 权益已失效或明确不适用当前工单 | 保留 INVALID / NOT_APPLICABLE 和依据；已知不适用不等于取数失败 |
| 同一范围存在冲突权益，不能确定使用哪项 | 保留各项及其源含义；受影响项 applicability 为 UNKNOWN，列出 `ENTITLEMENT_APPLICABILITY`，不自行选最大额度或合并 |
| 原购买订单未取得 / 访问权限不足 | 返回 §4 错误，不包装为“无权益” |

`missingParts=[]` 才能标记 COMPLETE；否则为 INCOMPLETE。结构格式错误与业务字段未知分开处理：负数量、非法枚举、编号不符等返回结构错误，不能当正常未知值接受。

实际安装数量必须来自正式安装明细或核实后的施工事实。套餐上限不代表已实际使用的数量；不能把套餐上限加到套餐外数量反推总实装量。判断套餐内外还需确认服务项目、单位、适用范围及实际数量，不能只做数字相减。

### 3.4 开发示例

以下演示“订单关联已明确，但权益数量范围尚未取得”的开发响应。使用独立 mock 编号和空值，不提供无依据的套餐量或价格；未从真实提供方取得。

```json
{
  "code": 0,
  "msg": "success",
  "requestId": "mock-entitlement-001",
  "data": {
    "retrievedAt": "2026-09-20T11:00:00+08:00",
    "installationWorkOrderId": "AZ-MOCK-001",
    "workOrderSourceVersion": "work-order-1",
    "purchaseOrder": {
      "purchaseOrderId": "PO-MOCK-001",
      "sourceSystem": "purchase_order_system",
      "sourceVersion": "order-1",
      "sourceUpdatedAt": null
    },
    "entitlementListComplete": true,
    "entitlements": [{
      "installationEntitlementId": "entitlement-mock-001",
      "name": "基础安装服务",
      "sourceSystem": "installation_entitlement_system",
      "sourceVersion": "entitlement-1",
      "sourceUpdatedAt": null,
      "coveredServiceScope": "随本次购买提供的基础安装服务，数量范围尚待核实",
      "quantityType": "UNKNOWN",
      "includedQuantity": null,
      "unit": null,
      "validity": "VALID",
      "validityBasis": "开发场景中源记录明确为当前有效",
      "applicability": "APPLICABLE",
      "applicabilityBasis": "开发场景中源记录明确关联工单 AZ-MOCK-001"
    }],
    "completeness": "INCOMPLETE",
    "missingParts": ["ENTITLEMENT_SCOPE"]
  }
}
```

## 4. 失败与兜底

| 情况 | HTTP / code | 本系统处理 |
| --- | --- | --- |
| 必填参数缺失或格式非法 | 400 / 40001 | 修正参数，不猜测订单编号 |
| 身份未验证 / 没有相应访问权限 | 401 / 40101、403 / 40301 | 停止读取，不通过更换服务商参数扩大范围 |
| 工单或购买订单不存在 | 404 / 40401 | 在已授权范围内提示关联记录不存在，不创建模拟业务记录补齐 |
| 工单与请求订单明确不匹配 | 409 / 40901 | 停止读取权益，提示关联不符 |
| 工单订单关联暂时无法核实 | 409 / 40902 | 显示关联待核实，不选取其他订单代替 |
| 已核实订单，权益信息不完整 | 200 / 0，INCOMPLETE | 展示缺失项，暂停依赖它的判断，不强制重走完整审核 |
| 来源不可用 / 超时，未能取得订单或完成关联核验 | 503 / 50301、504 / 50401 | 标明当前取数失败，旧结果只作为历史 |
| 来源结构非法、订单或权益归属不符 | 502 / 50201 | 拒绝作为有效权益输入，记录 requestId 定位 |

关联的业务信息未知使用 40902；关联取数因临时不可用而失败使用 50301 / 50401，避免把暂时故障当作业务关联缺失。若已取得订单，只有权益部分读取失败，可按 §3.3 返回不完整信息。错误信息不得附带其他订单或客户资料。

```json
{"code":40902,"msg":"当前工单与购买订单的关联尚待核实","data":null,"requestId":"mock-entitlement-002"}
```

开发默认：单次读取含组合调用最多 5 秒，仅 50301 / 50401 在 1 秒后重试 1 次，含重试最多 11 秒；不对不完整成功响应循环重试。重试保留同一工单及订单，不回退到其他关联。这是待实现配置，尚未验证运行效果，不表示提供方 SLA。

## 5. 依赖方与后续验证

资料整理和安装核查使用此接口取得购买范围，实际施工仍取正式明细和证明材料。对账差异解释可使用适用权益作为依据之一，计费条款、费用批准和双方账单仍分别读取；接口没有“应付”“审核通过”或付款动作。

角色走查：后台自动带出已核实的购买范围；服务商资料人员核实实际施工，京东人员处理差异与证据。关联或范围未知时只提示缺失问题，不要求人员另开订单系统重新抄录全部信息，也不新增一轮全量审批。

后续 mock 覆盖：数量上限明确、明确不限数量、非数量范围、数量缺失、有效但不适用、有效性未知、冲突权益、完整空列表、部分列表、工单关联缺失或不符、权限不足、版本缺失和来源失败。真实接入另需验证状态映射、权限、订单关联和版本能力。

本轮只定义文档契约，未实现 mock 或联调真实订单与权益系统。
