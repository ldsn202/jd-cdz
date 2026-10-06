# 京东账单读取

> 版本：V1.0｜日期：2026-09-20｜状态：开发契约已核对，真实对接待核实
> 上游（我引用）：[外部依赖清单](external-dependency-list.md) §2—4、[术语表](../03-01-glossary/glossary.md) §1—3、§5、[原型交互说明](../../02-prototype/interaction-spec.md) §1—3、[接口规范](../../../rules/coding-standards/09-api-design.md) §2—8
> 下游（引用我）：[服务商应收读取](provider-receivable-read.md) §2—4、[双方账单与对账依据实体关系](../03-03-er/er-reconciliation.md) §1—5、[术语表](../03-01-glossary/glossary.md) §1、[ER 范围与一致性总核对](../03-03-er/coverage-review.md) §2—6、[业务对账](../03-04-business-flows/flow-reconciliation.md) §1—7、[双方账单与对账依据域表结构](../03-05-schema/reconciliation-schema.md) §1—7、[00-subprd-mock-data.md](../../05-prd/00-subprd-mock-data.md) §2.3；[mock T1.1子计划](../../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T1.1-source-generation.md) PRD双链·读、[mock T2.3子计划](../../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T2.3-billing-sources.md) PRD双链·读

## 1. 接口基本信息

| 项 | 本项目约定 |
| --- | --- |
| 用途 | 读取京东原账单的分项、原总额、关联范围与版本，为业务对账提供京东侧独立输入 |
| 提供方 | 京东原账单系统，真实地址、字段及状态映射待核实 |
| 逻辑调用 | `read_jd_bill` |
| 拟定 mock 请求 | `GET /api/admin/mock/external/jd-bills/{jdBillId}?installationWorkOrderId={installationWorkOrderId}` |
| 鉴权 | 核验当前身份、账单及关联工单的访问范围；不能仅凭工单可见就推定整张账单可见 |
| 只读边界 | 不调整金额、不认可服务商应收、不批准结算或付款 |

路径和返回结构为后台适配开发约定，当前尚未实现。京东账单和服务商应收分别形成；任何服务商新报价、应收修订或 AI 解释都不得改写本接口返回的京东原金额。

## 2. 请求与关联范围

| 参数 | 类型 / 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| jdBillId | 非空 string / path | 是 | 原系统账单编号，从权威关联或原记录变化信息取得，不能从工单号拼接推测 |
| installationWorkOrderId | 非空 string / query | 是 | 本次要开展业务核对的工单 |
| 访问上下文 | 服务端调用上下文 | 是 | 经验证的身份与范围，不接收任意服务商编号扩大授权 |

```text
GET /api/admin/mock/external/jd-bills/JD-BILL-MOCK-001?installationWorkOrderId=AZ-MOCK-BILL-001
```

本次返回指定账单的当前源版本，先核实账单确与目标工单有关。存在多张关联账单时须分别明确编号和适用范围，不能默认取最近创建的一张或无条件相加。账单编号的发现与关联查询方式在原记录变化发现接口及真实对接中核实。

该接口读取一张授权完整账单；若调用身份无权读取其中其他工单信息，拒绝整单访问，不截掉未授权行后声称账单完整。真实系统若提供按工单授权的专用账单视图，应单独保留该视图的范围与总额含义，不能冒充整张原账单。

## 3. 返回结构

### 3.1 账单与总额

成功为 HTTP 200，外层统一 `code=0`、`msg="success"`、`data`、`requestId`；失败保持同一包装，data=null。以下为 data 内全部必返字段，可空字段显式为 null。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| retrievedAt | string | 本次取数时间，带时区 |
| jdBillId | 非空 string | 与请求一致 |
| installationWorkOrderId | 非空 string | 本次核对工单，与请求一致 |
| serviceProviderId | 非空 string | 该账单实际对应的服务商，按权威账单关联核实 |
| sourceSystem | 非空 string | 京东原账单来源，不能写成服务商系统 |
| sourceVersion | string / null | 账单自身版本，明细与总额须属于该版本 |
| sourceUpdatedAt | string / null | 源记录带时区更新时间，未知为 null |
| relatedWorkOrderIds | string[] | 该账单完整关联的工单编号，非空且去重，必须包含请求工单 |
| currency | string / null | 原币种，未知为 null；不同币种不能直接做差额比较 |
| taxBasis | string | TAX_INCLUDED / TAX_EXCLUDED / UNKNOWN；按有依据的源含义映射，不由金额推断 |
| sourceStatus | string / null | 原账单状态原意，未取得则 null，不自行写成“已确认” |
| effectiveStatus | string | EFFECTIVE / VOID / UNKNOWN，按已核实源规则转换；无法映射时为 UNKNOWN |
| reportedTotalAmount | string / null | 原系统报告的整张账单总额；不以分项求和、服务商总额或 AI 结果回填 |
| targetWorkOrderAmount | string / null | 此账单中可明确归属于目标工单的金额；单工单账单等于原总额，多工单时须有源系统明确分配依据，未知为 null |
| itemsComplete | boolean | 账单分项是否完整取得，不能只取一页却标记完整 |
| items | object[] | 原账单分项，见 §3.2，不按对方账单结构重组 |
| completeness | string | COMPLETE / INCOMPLETE，表示本契约要求的信息是否取得完整 |
| missingParts | string[] | 去重列出 SOURCE_VERSION、CURRENCY、AMOUNT_BASIS、BILL_STATUS、TOTAL_AMOUNT、WORK_ORDER_AMOUNT、ITEMS、ITEM_AMOUNT、ITEM_SCOPE；完整时为空 |

金额采用十进制字符串，如 `"300.00"`。保留源金额精度和正负方向，不擅自舍入；不使用浮点数计算账差。字段只含可解析十进制数值，不混入币种符号、千分位分隔符或文字。源金额缺失返回 null，不能改成 `"0.00"`。

同一响应中的金额使用声明币种与口径；源记录若混合币种或含税口径，应按可核实的原范围拆分读取，未明确拆分前不拼成可直接核对的账单。effectiveStatus=EFFECTIVE 只表示源账单有效，不表示对账一致、费用获批或已付款。

### 3.2 分项字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| billItemId | 非空 string | 账单内唯一、稳定的源分项标识；不能把可变行序号冒充稳定身份 |
| itemName | 非空 string | 原计费项目名称，不按服务商名称自动改名 |
| installationWorkOrderId | string / null | 该分项明确关联的工单；共同费用或归属未知时为 null，不任意分摊 |
| chargeScope | string / null | 原记录明确的计费范围，未知为 null；合同解释属于另一个证据输入 |
| billedQuantity | string / null | 原计费数量，使用十进制字符串；不等同于实际安装数量 |
| unit | string / null | 计费数量单位，不根据项目名称猜测 |
| unitPrice | string / null | 原计费单价，使用十进制字符串，未知为 null |
| amount | string / null | 原分项金额，使用十进制字符串，未知为 null |

固定收费项可能不具备数量及单价，允许相关字段为空；不能用金额倒算数量、单价，也不能以 quantity × price 无条件覆盖原 amount。原账单若有扣减或调整，保留其原名称、范围及金额方向，不静默丢弃。

### 3.3 不完整与核对边界

| 情况 | 返回及使用方式 |
| --- | --- |
| 账单关联不明或目标工单不在确认范围内 | 返回 §4 的关联错误，不选另一账单补齐 |
| 总额、币种、版本或有效状态未知 | 保留原值 / null / UNKNOWN，列出相应缺失项 |
| taxBasis=UNKNOWN | 列出 AMOUNT_BASIS，先核实口径，不宣称双方金额可直接比较 |
| 多工单账单没有目标工单的明确金额 | targetWorkOrderAmount=null，列出 WORK_ORDER_AMOUNT；不用整单总额或平均分摊代替 |
| 分项只取得部分或分项金额缺失 | 列出 ITEMS 或 ITEM_AMOUNT，不用可见行的和充当原总额 |
| 分项计费范围或工单归属无法核实 | 列出 ITEM_SCOPE，保留原项目，不据此判断费用重复或合理 |
| 完整读取且原分项确实为空 | items=[]、itemsComplete=true；不因空列表推断整单金额为零 |
| 源账单明确作废 | 保留 VOID、原状态及原金额供回看，不作为当前有效账单参与新核对 |

missingParts 为空才为 COMPLETE，否则为 INCOMPLETE。COMPLETE 只说明取得信息完整；原总额与分项合计仍可能不一致，或与服务商分项范围不同。后续核对须验证相同币种、口径、工单范围及项目对应，不能仅因总额相同就标记核对一致。

分项、总额取数期间如发现版本发生变化，不混合旧分项与新总额；重新取得同一版本或返回版本变化错误。比较双方账单时保留各自版本与取数时间，不把读取先后当作跨系统原子快照。

### 3.4 开发示例

金额复用当前原型云栖苑京东侧的基础安装 300.00、桥架综合施工 360.00 和合计 660.00。原型未明确含税口径、源状态及分项完整计费范围，这些字段保留未知；编号为独立 mock 编号，未从真实接口取得。

```json
{
  "code": 0,
  "msg": "success",
  "requestId": "mock-jd-bill-001",
  "data": {
    "retrievedAt": "2026-09-20T15:00:00+08:00",
    "jdBillId": "JD-BILL-MOCK-001",
    "installationWorkOrderId": "AZ-MOCK-BILL-001",
    "serviceProviderId": "provider-mock",
    "sourceSystem": "jd_bill_system",
    "sourceVersion": "bill-1",
    "sourceUpdatedAt": null,
    "relatedWorkOrderIds": ["AZ-MOCK-BILL-001"],
    "currency": "CNY",
    "taxBasis": "UNKNOWN",
    "sourceStatus": null,
    "effectiveStatus": "UNKNOWN",
    "reportedTotalAmount": "660.00",
    "targetWorkOrderAmount": "660.00",
    "itemsComplete": true,
    "items": [
      {"billItemId":"item-mock-001","itemName":"基础安装","installationWorkOrderId":"AZ-MOCK-BILL-001","chargeScope":null,"billedQuantity":null,"unit":null,"unitPrice":null,"amount":"300.00"},
      {"billItemId":"item-mock-002","itemName":"桥架综合施工","installationWorkOrderId":"AZ-MOCK-BILL-001","chargeScope":null,"billedQuantity":null,"unit":null,"unitPrice":null,"amount":"360.00"}
    ],
    "completeness": "INCOMPLETE",
    "missingParts": ["AMOUNT_BASIS", "BILL_STATUS", "ITEM_SCOPE"]
  }
}
```

## 4. 失败与兜底

| 情况 | HTTP / code | 本系统处理 |
| --- | --- | --- |
| 参数缺失或格式非法 | 400 / 40001 | 修正编号，不猜测账单关联 |
| 身份未验证 / 无整张账单访问权限 | 401 / 40101、403 / 40301 | 停止读取，不用服务商提供的账单冒充京东数据 |
| 指定账单不存在 | 404 / 40401 | 显示尚未取得该账单，不创建零金额账单 |
| 账单与目标工单明确不符 | 409 / 40901 | 提示关联不符，不改读其他账单 |
| 账单关联范围无法核实 | 409 / 40902 | 保留关联待核实，不擅自分摊 |
| 取数过程中账单版本变化 | 409 / 40903 | 重新获取同一版本，旧结果仅供历史回看 |
| 来源不可用 / 超时 | 503 / 50301、504 / 50401 | 明示当前失败，不把旧账单显示为最新 |
| 结构非法、重复分项标识、金额格式非法、分项明确属于账单范围外工单 | 502 / 50201 | 拒绝为有效输入，记录 requestId 定位 |
| 账单已取得但必要信息不完整 | 200 / 0，INCOMPLETE | 展示可用金额和缺失项，暂停依赖这些缺失信息的核对结论 |

```json
{"code":40903,"msg":"账单在读取期间已更新，请重新获取当前版本","data":null,"requestId":"mock-jd-bill-002"}
```

开发默认单次完整取数最多 5 秒；临时来源错误 50301 / 50401 可在 1 秒后重试 1 次。版本变化可重新发起整次只读获取，但不能无限重试；本轮不实现此调度。页数和调用次数须受单次总时限约束，取不全则按不完整处理，不能静默截断。配置未做运行验证，不表示提供方 SLA。

## 5. 依赖方与后续验证

业务对账、差异解释及账单详情使用京东侧独立记录。金额计算由程序按已确认的对应关系进行，AI 辅助解释疑点，人员核实费用合理性。此读取接口不承担对方应收修订、差异批准或财务结算。

角色走查：京东对账人员进入事项即可看到已读取的双方记录和待核实问题；不要求人员先复制账单、手算所有金额或逐个启动 Skill。服务商修订自己的应收后，系统读取新版并再次比较，京东账单维持原归属和版本。

后续 mock 覆盖单工单账单、多工单范围、未知口径、真实零金额与缺失金额、扣减项目、同总额但分项不同、总分不一致、部分分项、作废、版本变化、权限不足和来源失败。真实账单状态、计费范围、币种精度及关联方式仍待核实；本轮未实现 mock 或调用真实系统。
