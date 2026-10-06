# 计费条款与批准记录读取

> 版本：V1.0｜日期：2026-09-20｜状态：开发契约已核对，真实对接待核实
> 上游（我引用）：[外部依赖清单](external-dependency-list.md) §2—4、[原始材料读取](source-material-read.md) §2—5、[术语表](../03-01-glossary/glossary.md) §1、§3—5、[原型交互说明](../../02-prototype/interaction-spec.md) §1—3、[接口规范](../../../rules/coding-standards/09-api-design.md) §2—8
> 下游（引用我）：[原记录变化发现](source-record-changes-read.md) §3、[AI 推理与材料解析](ai-inference-material-parsing.md) §2—4、[双方账单与对账依据实体关系](../03-03-er/er-reconciliation.md) §4—5、[ER 范围与一致性总核对](../03-03-er/coverage-review.md) §2—6、[业务对账](../03-04-business-flows/flow-reconciliation.md) §1—7、[双方账单与对账依据域表结构](../03-05-schema/reconciliation-schema.md) §1—7、[00-subprd-mock-data.md](../../05-prd/00-subprd-mock-data.md) §2.3；[mock T2.3子计划](../../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T2.3-billing-sources.md) PRD双链·读

## 1. 接口基本信息

| 项 | 本项目约定 |
| --- | --- |
| 用途 | 获取与安装工单及服务商相关的计费条款、费用批准原记录及材料引用，供核实费用范围与批准依据 |
| 提供方 | 原合同、费用约定及业务批准记录所属系统，真实来源、授权范围及状态含义待核实 |
| 逻辑调用 | `read_billing_terms_and_approval_records` |
| 拟定 mock 请求 | `GET /api/admin/mock/external/installation-work-orders/{installationWorkOrderId}/fee-evidence?serviceProviderId={serviceProviderId}` |
| 鉴权 | 服务端验证身份、工单与服务商关联及各来源的访问范围；有工单权限不自动取得全部合同、批准记录权限 |
| 只读边界 | 取得原记录，不发起审批、不追加审批层级、不作费用决定，不改账或付款 |

本路径及字段为项目开发约定，尚未实现。一个逻辑读取可组合多个已登记来源。该接口取得记录及文件引用；完整文件通过原始材料读取接口取得，AI 查找和解释相关内容在后续分析中进行，不由读取接口编写批准结论。

## 2. 请求与查询范围

| 参数 | 类型 / 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| installationWorkOrderId | 非空 string / path | 是 | 本次核查或对账的工单 |
| serviceProviderId | 非空 string / query | 是 | 与目标工单及待核实费用相关的服务商，需由权威关联核实 |
| 访问上下文 | 服务端调用上下文 | 是 | 经验证的人员身份和范围，不接受浏览器自报角色代替 |

```text
GET /api/admin/mock/external/installation-work-orders/AZ-MOCK-BILL-001/fee-evidence?serviceProviderId=provider-mock
```

查询范围由已核实的工单、服务商与原合同、费用事项关联确定；不按小区名称或费用关键词搜索后直接认定适用。合同可能覆盖多工单，批准可能仅针对某一费用、施工变更或时间范围，均须保留原适用范围。

调用前需配置并核实应查询的来源和记录范围。仅查询当前可访问的部分来源、分页未取全、来源失败或无法确认查询范围完整时，相应列表为不完整；不能删掉未取得项后声称已查全。未经授权的原文不返回，权限缺口只提示范围待核实，不泄露他方记录。

## 3. 返回结构

### 3.1 查询结果

成功为 HTTP 200，外层统一 `code=0`、`msg="success"`、`data`、`requestId`；失败保留同一包装，data=null。所有以下字段必返，可空字段显式为 null，列表使用数组。

| data 字段 | 类型 | 说明 |
| --- | --- | --- |
| retrievedAt | string | 本次取数时间，带时区 |
| installationWorkOrderId | 非空 string | 与请求一致 |
| serviceProviderId | 非空 string | 与请求及已核实关联一致 |
| workOrderSourceVersion | string / null | 核实工单关联所依据的工单版本，未知为 null |
| lookupScope | 非空 string | 本次实际查询的来源和业务范围说明，不能写成泛指全公司的“全部记录” |
| termListComplete | boolean | 已核实的应查范围内，计费条款列表是否全部取得 |
| approvalListComplete | boolean | 已核实的应查范围内，费用批准记录列表是否全部取得 |
| terms | object[] | 原计费条款记录，含 §3.2 共用字段及 effectiveStatus |
| approvals | object[] | 原费用批准记录，含 §3.2 共用字段及 decision、decidedAt |
| completeness | string | COMPLETE / INCOMPLETE，仅表示本契约的信息完整程度，不表示证据充分 |
| missingParts | string[] | 去重列出 TERM_LIST、APPROVAL_LIST、SOURCE_VERSION、RECORD_CONTENT、RECORD_SCOPE、RECORD_STATUS；为空才为 COMPLETE |

### 3.2 条款与批准原记录

terms 与 approvals 中每项都必返以下共用字段。记录身份由 sourceSystem 和 sourceRecordId 共同区分，不按标题去重。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| sourceSystem | 非空 string | 原记录来源，必须属于服务端登记且授权的来源 |
| sourceRecordId | 非空 string | 原条款或批准记录编号，在该来源内唯一 |
| sourceVersion | string / null | 该原记录版本，不能用材料版本或分析版本替代 |
| sourceUpdatedAt | string / null | 源记录带时区更新时间，未知为 null |
| title | 非空 string | 原记录标题，用于展示，不用标题认定费用批准 |
| sourceStatus | string / null | 源业务状态原意，不能根据 AI 解释补填 |
| scope | string / null | 原记录明确的服务、费用、对象及时间等适用范围，未知部分不能推测补齐 |
| applicability | string | APPLICABLE / NOT_APPLICABLE / UNKNOWN，指原记录与请求工单、服务商的适用关系；具体费用项目仍按 scope 与原文核实 |
| applicabilityBasis | string / null | 原关联及适用范围依据；前两种 applicability 必须有明确依据，UNKNOWN 时可空 |
| recordText | string / null | 原系统提供的完整条款或决定文字；文件型记录可为 null，不以 AI 摘要或截断片段代替完整正文 |
| materialReferences | object[] | 原记录附带的授权材料引用；每项必返 sourceSystem、sourceMaterialId、sourceVersion，前两项非空 string，版本为 string / null |

terms 每项额外必返 `effectiveStatus`：EFFECTIVE / VOID / UNKNOWN，按已核实源状态映射，仅表示当前记录有效性。当前已失效的条款可能在业务发生时适用，不能只按取数当天有效性重判历史费用；其历史适用依据不明时 applicability=UNKNOWN。

approvals 每项额外必返 `decision`：APPROVED / REJECTED / PENDING / REVOKED / UNKNOWN，以及 `decidedAt`：源决定时间，带时区 string / null。decision 只映射原费用流程的业务决定，不将合同签字、施工确认、验收完成映射为 APPROVED；源状态未识别或无法证明其为费用决定时保留 UNKNOWN。决定时间未知且影响适用性时，applicability=UNKNOWN。

本接口不单独推导可支付金额；批准范围、金额或数量限制按原文保留，后续分析须核实项目、单位、币种及条件。批准只涉及原记录明确的范围，不能扩展到整个工单、整个服务商或所有额外费用。本次请求按工单和服务商查询相关记录，并未传入某个费用分项；applicability=APPLICABLE 不能代替具体费用的适用判断。

原文若为文件，引用应按原始材料读取 §2 的来源、编号、确切版本规则使用；版本未知时先处理缺失，不省略版本调用最新文件。材料版本与记录版本分别保存。页码、位置及证据片段由取得完整原文后的解析与分析产生，本接口不编造定位。

### 3.3 完整性与业务使用

| 情况 | 返回及处理 |
| --- | --- |
| 条款或批准列表未查全、来源范围未核实 | 对应列表完整标记为 false，列出 TERM_LIST / APPROVAL_LIST；已有授权记录可以返回 |
| 列表确实查全且没有匹配记录 | 相应标记为 true、列表为 []；只说明该查询范围未发现记录，不能直接推出费用未获批准 |
| 工单、原记录或材料引用版本缺失 | 保留 null，列出 SOURCE_VERSION；停止依赖确切版本的后续调用 |
| 原文字段没有内容且没有可用材料引用 | recordText=null，列出 RECORD_CONTENT；不能用标题或处理意见代替正文 |
| scope 缺失、适用性或明确依据不足 | applicability=UNKNOWN，列出 RECORD_SCOPE；不能按同名项目认定适用 |
| 原业务状态缺失、条款有效性或费用决定未知 | sourceStatus=null 或原值，规范状态为 UNKNOWN，列出 RECORD_STATUS |
| 有原文或完整材料引用，但原文尚未解析 | 读取接口可按信息是否齐全返回；COMPLETE 不表示材料已读完或支持业务结论 |
| 同范围存在相互冲突的条款或批准记录 | 保留各记录与版本；无法核实替代和适用关系时，受影响记录 applicability=UNKNOWN 并列出 RECORD_SCOPE，不任取一份覆盖 |
| 原批准明确驳回、撤销或仍在处理中 | 分别保留 REJECTED、REVOKED、PENDING；这些是已知状态，不作为已获批准的依据 |

查询完整、材料完整、对当前费用适用和足以支持决定是不同条件。找到批准记录仍需核实其当前状态与适用范围；单条驳回也不能在存在其他未知记录时被概括为整个费用事项“从未批准”。

版本按字符串判等；记录与对应材料引用须属于可核实的同一记录版本。读取中发生变化导致关系不一致时返回版本变化错误。各来源分别保留版本，不声称跨系统原子快照；发布新分析或作出决定前须复核所依赖版本，旧记录仅用于回看。

### 3.4 开发示例

条款文字复用原型中“基础安装包含设备搬运”的约定。编号、来源和版本为独立开发示例；真实有效状态、完整范围及批准列表尚未取得，保持未知，不补造批准记录或审批金额。材料引用仅演示调用所需字段，不代表已有对应真实文件。

```json
{
  "code": 0,
  "msg": "success",
  "requestId": "mock-fee-evidence-001",
  "data": {
    "retrievedAt": "2026-09-20T16:00:00+08:00",
    "installationWorkOrderId": "AZ-MOCK-BILL-001",
    "serviceProviderId": "provider-mock",
    "workOrderSourceVersion": "work-order-1",
    "lookupScope": "开发场景：目标工单关联的服务商费用约定；费用批准来源范围尚待核实",
    "termListComplete": true,
    "approvalListComplete": false,
    "terms": [{
      "sourceSystem": "contract_system",
      "sourceRecordId": "TERM-MOCK-001",
      "sourceVersion": "term-1",
      "sourceUpdatedAt": null,
      "title": "基础安装服务费用范围",
      "sourceStatus": null,
      "scope": "基础安装服务中的设备入场搬运，其他适用条件尚待核实",
      "applicability": "UNKNOWN",
      "applicabilityBasis": null,
      "recordText": "基础安装服务费用已包含设备搬运，不另行计取入场搬运费用。",
      "materialReferences": [{"sourceSystem":"contract_system","sourceMaterialId":"CONTRACT-MATERIAL-MOCK-001","sourceVersion":"contract-file-1"}],
      "effectiveStatus": "UNKNOWN"
    }],
    "approvals": [],
    "completeness": "INCOMPLETE",
    "missingParts": ["APPROVAL_LIST", "RECORD_SCOPE", "RECORD_STATUS"]
  }
}
```

该示例只支持展示“已有相关条款，适用范围及批准依据仍待核实”，不支持自动撤费、通过审核或确认账单。

## 4. 失败与兜底

| 情况 | HTTP / code | 本系统处理 |
| --- | --- | --- |
| 参数缺失或格式非法 | 400 / 40001 | 修正工单及服务商编号，不扩大检索范围 |
| 身份未验证 / 无目标工单或服务商范围权限 | 401 / 40101、403 / 40301 | 停止读取，不泄露未授权记录 |
| 授权范围内工单不存在 | 404 / 40401 | 提示目标工单不存在，不解释为没有批准 |
| 工单与服务商关联明确不符 / 无法核实 | 409 / 40901、409 / 40902 | 关联待核实，不按名称匹配 |
| 读取期间版本变化，记录与引用无法保持一致 | 409 / 40903 | 放弃混合结果，等待重新取得一致记录 |
| 来源不可用 / 超时，未能取得基础关联或任何所需查询结果 | 503 / 50301、504 / 50401 | 显示读取失败，不作为费用决定依据 |
| 已核实关联，部分来源或记录信息未取得 | 200 / 0，INCOMPLETE | 返回已取得的授权内容及缺失项，不能以空列表认定无批准 |
| 返回工单或服务商不符、重复源记录身份、非法枚举或结构 | 502 / 50201 | 拒绝作为有效输入，记录 requestId 定位 |

```json
{"code":50401,"msg":"费用依据读取超时，批准记录尚未核实","data":null,"requestId":"mock-fee-evidence-002"}
```

开发默认单次组合读取最多 5 秒；仅 50301 / 50401 可在 1 秒后重试 1 次，含重试最多 11 秒；对不完整成功响应不循环重试。分页与来源调用受整次时限约束，未取全按 §3.3 处理。版本变化待后续刷新重新获取，不叠加无限重试。配置未做运行验证，不代表提供方 SLA。

文件引用读取失败时由原始材料读取接口给出具体错误；保留其他资料和已填写的处理意见，暂停依赖失败材料的判断。此时不得把已有元数据“完整”转述为费用依据已核实。

## 5. 依赖方与后续验证

安装资料核查 Skill 与对账差异解释 Skill 使用条款、批准原记录及其引用，辅助定位相关内容。核查人员从原事项查看分析与证据，决定通过、继续核实或转异常；需要补充时沿原事项交接，系统更新依据和分析，不要求人员手动选 Skill、重复整理所有材料。

角色走查：京东核查、对账人员保留当前业务决定；服务商人员只补充原问题所需资料或核实本方记录。此接口不建立新的批准流程，也不把服务商回复或施工签字当成费用批准。

后续 mock 覆盖条款适用、批准仅适用于部分费用、明确驳回、撤销、待批准、未知状态、查全为空、查询未全为空、部分来源失败、冲突记录、历史适用性、材料引用缺版本及旧版本不可读。真实来源、批准状态映射、范围关联与取数完整性仍待核实；本轮未实现 mock 或联调真实接口。
