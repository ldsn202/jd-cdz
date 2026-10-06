# 安装工单上下文读取

> 版本：V1.0｜日期：2026-09-20｜状态：开发契约已核对，真实对接待核实
> 上游（我引用）：[外部依赖清单](external-dependency-list.md) §1—4、[术语表](../03-01-glossary/glossary.md) §1—3、§5、[原型交互说明](../../02-prototype/interaction-spec.md) §1—3、[接口规范](../../../rules/coding-standards/09-api-design.md) §2—8
> 下游（引用我）：[工单聚合接口](../03-06-provided-apis/workbench-apis.md) §6、[原始材料读取](source-material-read.md) §2—3、[购买订单与安装权益读取](purchase-order-installation-entitlements.md) §2—3、[正式安装明细提交](installation-detail-submit.md) §2—3、[核查决定与补充记录同步](review-supplement-sync.md) §2—3、[原记录变化发现](source-record-changes-read.md) §3、[处理事项实体关系](../03-03-er/er-work-item.md) §1—2、[安装资料实体关系](../03-03-er/er-installation.md) §1—2、§4、[ER 范围与一致性总核对](../03-03-er/coverage-review.md) §2—6、[安装资料整理与提交](../03-04-business-flows/flow-installation-submission.md) §1—8、[安装资料域表结构](../03-05-schema/installation-schema.md) §1—7、[00-subprd-mock-data.md](../../05-prd/00-subprd-mock-data.md) §2.3；[mock T1.1子计划](../../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T1.1-source-generation.md) PRD双链·读、[mock T2.1子计划](../../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T2.1-identity-workorders.md) PRD双链·读

## 1. 接口基本信息

| 项 | 本项目约定 |
| --- | --- |
| 用途 | 取得安装工单的当前有效方案、正式安装明细与可见材料索引，为资料处理和核查提供输入 |
| 业务提供方 | 原安装管理、履约相关系统；实际系统拆分与地址待核实 |
| 逻辑调用 | `read_installation_work_order_context` |
| 拟定 mock 请求 | `GET /api/admin/mock/external/installation/work-orders/{installationWorkOrderId}/context` |
| 真实请求 | 待取得原系统对接资料后明确；可能由多个只读接口组合实现 |
| 鉴权 | 从已验证的调用身份和服务端授权范围取得访问上下文；真实凭据由服务端管理，具体协议待核实 |
| mock 权限 | 使用服务端测试身份及其授权范围；不信任调用方自行传入角色或服务商编号扩大访问范围 |
| 只读边界 | 不提交明细、不改变审核结论、不修改工单或账单 |

mock HTTP 路径沿用项目 `/api/admin/` 前缀，供后台适配开发使用，当前尚未实现。真实提供方的原始协议不受此路径约束，其返回结果须经过字段映射。本接口不作为浏览器绕过业务权限的入口；真实模式不得悄悄降级为 mock 成功响应。

## 2. 请求参数

| 参数 | 位置 / 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| installationWorkOrderId | path / string | 是 | 目标安装工单在约定来源中的唯一编号，非空；独立配置事项编号不能作为工单编号 |
| 访问上下文 | 服务端调用上下文 | 是 | 已验证的调用身份及其授权范围，不作为任意可改的业务查询参数 |

开发请求示例：

```text
GET /api/admin/mock/external/installation/work-orders/AZ-260918-021/context
```

只读取当前有效上下文。读取历史材料版本由材料读取契约承担；本接口不以材料旧版本覆盖当前有效方案。

## 3. 返回结构

### 3.1 包装与业务字段

成功返回 HTTP 200；外层统一为 `code=0`、`msg="success"`、`data` 和 `requestId`。`requestId` 是本次调用标识，不进入业务记录版本。失败时保留同一包装，`data=null`，错误码见 §4。

以下字段均位于 `data`，全部必返；允许为空的字段显式返回 null，列表返回数组。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| retrievedAt | string | 本次取数时间，带时区；不等同于原记录更新时间 |
| completeness | string | `COMPLETE` 或 `INCOMPLETE`，表示本契约要求的数据是否取得完整 |
| missingParts | string[] | 不完整部分：`INSTALLATION_PLAN`、`INSTALLATION_DETAIL`、`SOURCE_MATERIAL_INDEX`、`SOURCE_VERSION`；完整时为空，取值不重复 |
| installationWorkOrder | object | 必有工单记录，字段见下表 |
| installationPlan | object / null | 当前有效方案，字段见下表 |
| installationDetailStatus | string | `NOT_SUBMITTED`、`SUBMITTED` 或 `UNKNOWN`，由可核实的源状态转换 |
| installationDetail | object / null | 已提交的正式安装明细，字段见下表 |
| sourceMaterialIndexComplete | boolean | 在当前授权范围内，材料索引是否已完整取得 |
| sourceMaterials | object[] | 当前授权范围内的材料索引，字段见下表；不能只返回第一页却标记完整 |

| 对象 | 专属必返字段 | 公共必返字段 |
| --- | --- | --- |
| installationWorkOrder | `installationWorkOrderId`、`serviceProviderId`：非空 string；`purchaseOrderId`：string / null | `sourceSystem`、`sourceVersion`、`sourceUpdatedAt` |
| installationPlan | `installationPlanId`：非空 string；`items`：项目数组 | 同上 |
| installationDetail | `installationDetailId`：非空 string；`items`：项目数组 | 同上 |
| sourceMaterials 每一项 | `sourceMaterialId`、`name`、`mediaType`：非空 string | 同上 |

方案、正式明细可同时返回 `installationWorkOrderId`，明确所属工单。本地模拟来源返回此字段；分析取数时若与当前事项工单不一致则拒绝使用。旧来源省略此字段时仍按工单上下文契约读取，不把省略直接当成资料缺失。

公共字段约定：

- `sourceSystem`：非空 string，区分原记录归属。
- `sourceVersion`：string / null，原记录版本或可核实的等价变更标识，按字符串判等，不比较数值大小。取得的记录缺少版本时返回 null，并将 `SOURCE_VERSION` 加入 `missingParts`。不存在的记录不要求伪造版本。
- `sourceUpdatedAt`：带时区的 string / null，原系统未提供时返回 null，不以本次取数时间填充。更新时间未知本身不等于记录版本未知。

工单、方案、明细和每份材料各自保留版本。组合取数不保证跨系统事务快照；后续保存业务决定时须复核决定所依赖的记录版本。适配层发现方案、明细或材料关联到另一工单时，应返回结构错误，不得拼接为有效上下文。

### 3.2 方案与正式明细中的项目

项目字段全部必返；方案使用 `plannedQuantity`，正式明细使用 `installedQuantity`，不在一个对象里混用两种数量。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| installationItem | 非空 string | 安装项目名称；名称相同本身不足以证明两个项目可以直接对应 |
| plannedQuantity | number / null | 仅方案项目必返，表示方案约定数量；不得为负数 |
| installedQuantity | number / null | 仅正式明细项目必返，表示实际完成数量；不得为负数 |
| unit | string / null | 计量单位；不得只比较数值 |
| materialSupplier | string / null | 供料方，保留原数据支持的含义 |
| serviceScope | string / null | 服务商承担的范围，如供料及安装、仅安装 |

缺失数量、单位、供料方或服务范围时返回 null，并将其所属的 `INSTALLATION_PLAN` 或 `INSTALLATION_DETAIL` 加入 `missingParts`。空字符串不能表示已核实；不把零当成缺失值。不适用某字段时保留源系统明确给出的业务含义，不凭空补值。

### 3.3 完整性规则

| 取得情况 | 必须返回的结果 |
| --- | --- |
| 正式明细尚未提交 | `installationDetailStatus=NOT_SUBMITTED`、`installationDetail=null`，不因此标为缺失；不能据此生成已提交资料的审核结论 |
| 已提交但未取得正式明细，或无法确认提交状态 | 返回 `SUBMITTED` 或 `UNKNOWN`；未取得的明细为 null，列出 `INSTALLATION_DETAIL` |
| 当前有效方案未取得 | `installationPlan=null`，列出 `INSTALLATION_PLAN`，不用旧方案填补 |
| 已取得对象的项目只读到一部分或字段缺失 | 保留已取得项目，列出所属的方案或明细；无法取得任何项目时返回空数组并仍标为不完整 |
| 原记录确实为完整的空项目列表 | `items=[]`；该状态只表示已读全，不代表施工已完成或审核可通过 |
| 授权范围内确实没有材料 | `sourceMaterialIndexComplete=true`、`sourceMaterials=[]`，不因此列缺失 |
| 材料索引读取中断或只取得部分结果 | `sourceMaterialIndexComplete=false`，列出 `SOURCE_MATERIAL_INDEX`，保留已取得的材料索引 |
| 没有访问工单或必要关联记录的权限 | 返回 §4 权限错误，不能以空对象、空数组或普通缺失掩盖 |
| 已取得记录缺少版本 | 对应 `sourceVersion=null`，列出 `SOURCE_VERSION` |

`missingParts=[]` 时 `completeness=COMPLETE`，否则为 `INCOMPLETE`。完整性描述数据取得情况，不表示安装合规、证据充分或人工已经批准。购买订单编号未知不自动标为不完整，购买范围与安装权益仍由购买订单与安装权益读取契约 §2—3 核实。

工单本身读取失败时返回错误；工单已经取得、只有方案或明细等关联读取失败时，可以按上表返回不完整上下文。调用方只展示可用信息，暂停依赖缺失部分的判断，不以默认值补齐后继续批准。

### 3.4 开发示例

以下为后续 mock 使用的拟定完整响应，未从真实外部系统取得。仅展现桥架场景，数量对应当前原型中春和庭的方案 12 米、实际 18 米；这些数据不表示业务统计结果。

```json
{
  "code": 0,
  "msg": "success",
  "requestId": "mock-context-001",
  "data": {
    "retrievedAt": "2026-09-20T09:42:00+08:00",
    "completeness": "COMPLETE",
    "missingParts": [],
    "installationWorkOrder": {
      "installationWorkOrderId": "AZ-260918-021",
      "purchaseOrderId": null,
      "serviceProviderId": "provider-anjia",
      "sourceSystem": "installation_management",
      "sourceVersion": "work-order-1",
      "sourceUpdatedAt": "2026-09-20T09:30:00+08:00"
    },
    "installationPlan": {
      "installationPlanId": "plan-021",
      "sourceSystem": "installation_management",
      "sourceVersion": "plan-1",
      "sourceUpdatedAt": "2026-09-18T10:00:00+08:00",
      "items": [{"installationItem":"桥架安装","plannedQuantity":12,"unit":"米","materialSupplier":"服务商","serviceScope":"供料及安装"}]
    },
    "installationDetailStatus": "SUBMITTED",
    "installationDetail": {
      "installationDetailId": "detail-021",
      "sourceSystem": "installation_management",
      "sourceVersion": "detail-1",
      "sourceUpdatedAt": "2026-09-20T09:30:00+08:00",
      "items": [{"installationItem":"桥架安装","installedQuantity":18,"unit":"米","materialSupplier":"服务商","serviceScope":"供料及安装"}]
    },
    "sourceMaterialIndexComplete": true,
    "sourceMaterials": [{
      "sourceMaterialId": "material-change-021",
      "sourceSystem": "installation_management",
      "sourceVersion": "material-1",
      "name": "现场变更确认单.pdf",
      "mediaType": "application/pdf",
      "sourceUpdatedAt": "2026-09-20T09:30:00+08:00"
    }]
  }
}
```

材料索引不包含原文或 AI 摘要。读取材料时使用材料 ID、所属来源与版本；材料内容读取方式由原始材料读取契约 §2—4 定义。

## 4. 失败与兜底

| 情况 | HTTP / code | 本系统处理 |
| --- | --- | --- |
| 工单编号缺失或格式非法 | 400 / 40001 | 提示参数错误，不自动重试 |
| 调用身份未验证 / 无权限 | 401 / 40101、403 / 40301 | 停止读取，不更换服务商参数重试 |
| 工单不存在 | 404 / 40401 | 显示关联记录不存在，不创建假工单 |
| 工单已取得但必要上下文不完整 | 200 / 0，`data.completeness=INCOMPLETE` | 展示缺失部分，停止依赖它的结论；保留可用记录 |
| 工单来源不可用 / 超时 | 503 / 50301、504 / 50401 | 明确当前取数失败；此前结果仅作为历史，不显示为最新 |
| 返回结构非法或关联记录属于其他工单 | 502 / 50201 | 不接收为有效上下文，保留调用标识定位 |

失败响应示例：

```json
{"code":50401,"msg":"安装工单来源读取超时，请稍后重试","data":null,"requestId":"mock-context-002"}
```

HTTP 状态、code 和 msg 是本项目适配后的约定，真实提供方原始响应需另行映射；msg 不暴露凭据或内部堆栈。仅 50301、50401 属于本接口可自动重试的临时错误。关联读取暂时失败但已返回不完整上下文时，不对整份成功响应自动重试；业务层按后续流程再次取数。

开发默认：每次读取最多等待 5 秒；遇上述临时错误，1 秒后最多重试 1 次，因此含重试的读取窗口最多 11 秒。权限、参数、资源不存在和结构错误不自动重试。组合多个提供方调用时须共用当次 5 秒限额。这些是本项目待实现的可调配置，尚未测量，也不表示原系统 SLA。

## 5. 依赖方与后续验证

- 安装资料整理：取得已有工单、方案和正式记录，减少重复录入；未提交的草稿不能充当正式安装明细。
- 安装资料核查：比较当前有效方案和正式明细，定位材料；未提交或上下文缺失时，不据此生成“可通过”的判断。
- 工单详情与处理事项：展示来源、版本和可用信息，分析版本不能代替原记录版本。

后续 mock 至少覆盖：完整上下文、明细尚未提交、已提交但明细缺失、方案缺失、项目字段缺失、索引不完整、没有材料、无权限、版本缺失、工单不存在、来源失败和关联工单不一致。验证重点包括 0 与 null 的区别，以及 COMPLETE 不能解释为审核通过。

业务角色走查：资料人员继续确认整理结果，核查人员继续查看差异与依据；上下文读取由系统完成，不增加人工点击取数或重复审核步骤。本契约没有新增业务写入动作。上述结论是设计走查，实际操作次数和耗时须在实现后验证。

真实对接须验证字段映射、权限、版本和完整性能力。本轮只完成文档契约，未实现 mock 或调用真实接口。


## 2026-09-27 本地服务商名录接口

GET `/api/admin/mock/external/installation/service-providers?page=1&pageSize=50`，沿用模拟来源会话鉴权，按 READ_WORK_ORDER 的服务商范围过滤。page 为正整数，pageSize 为 1—50。data={list,total,page,pageSize,retrievedAt}；每项包含 serviceProviderId、displayName、sourceSystem、sourceVersion。

首次生成从服务商事实投影名录；已有环境仅补缺失的、能由标准公司账号明确辨认的历史名称，不覆盖已有名录。消费端通过服务身份授权交集分页同步，不修改工单归属或历史记录。
