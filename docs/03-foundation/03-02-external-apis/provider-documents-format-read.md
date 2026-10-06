# 服务商资料与格式说明读取

> 版本：V1.0｜日期：2026-09-20｜状态：开发契约已核对，真实对接待核实
> 上游（我引用）：[外部依赖清单](external-dependency-list.md) §2—4、[原始材料读取](source-material-read.md) §2—4、[术语表](../03-01-glossary/glossary.md) §1—5、[原型交互说明](../../02-prototype/interaction-spec.md) §1—3、[接口规范](../../../rules/coding-standards/09-api-design.md) §2—8
> 下游（引用我）：[原记录变化发现](source-record-changes-read.md) §3、[接入配置实体关系](../03-03-er/er-integration-config.md) §1—5、[术语表](../03-01-glossary/glossary.md) §1、[ER 范围与一致性总核对](../03-03-er/coverage-review.md) §2—6、[配置确认](../03-04-business-flows/flow-configuration.md) §1—7、[接入配置域表结构](../03-05-schema/integration-config-schema.md) §1—7、[00-subprd-mock-data.md](../../05-prd/00-subprd-mock-data.md) §2.3；[mock T1.1子计划](../../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T1.1-source-generation.md) PRD双链·读、[mock T2.2子计划](../../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T2.2-provider-materials.md) PRD双链·读

## 1. 接口基本信息

| 项 | 本项目约定 |
| --- | --- |
| 用途 | 取得服务商授权的原始安装资料或配置资料，以及其原有字段说明，为整理与接入配置提供输入 |
| 提供方 | 服务商原系统或已完成授权导入的资料记录，实际方式待核实 |
| 逻辑调用 | `read_provider_documents_and_format` |
| 拟定 mock 请求 | `GET /api/admin/mock/external/sources/{sourceSystem}/service-providers/{serviceProviderId}/records/{sourceRecordId}/documents` |
| 鉴权 | 服务端验证调用身份、服务商范围及资料实际归属；路径中的服务商编号不能作为授权证明 |
| 只读边界 | 不修改原资料、不生成正式安装明细、不确认或启用接入配置 |

这是后台适配的开发约定，当前尚未实现。系统直连或授权导入均须保留实际来源与版本，不能把导入记录冒充提供方实时响应。导入动作、资料发现方式和前端上传入口由相应后续接口定义，本契约读取已经可定位的授权记录。

## 2. 请求参数

| 参数 | 类型 / 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| sourceSystem | 非空 string / path | 是 | 服务端已配置来源；导入方式使用已登记的导入来源，不能传任意 URL |
| serviceProviderId | 非空 string / path | 是 | 资料所属服务商编号 |
| sourceRecordId | 非空 string / path | 是 | 该来源内稳定的资料记录编号，由源系统或授权导入登记产生 |
| 访问上下文 | 服务端调用上下文 | 是 | 已验证的身份与范围，不接受客户端自报角色扩大权限 |

```text
GET /api/admin/mock/external/sources/provider_source_mock/service-providers/provider-mock/records/record-mock-001/documents
```

本接口取得该资料记录当前可用版本。需要回看指定文件版本时，按保存的材料引用调用原始材料读取。相同文件名、列名或记录编号不足以证明不同来源的资料相同。

资料用途由可信的原系统信息或授权导入登记确定，不能由请求参数随意改写。配置资料可独立于安装工单；安装资料关联尚未明确时保留未知，不将 CFG 类配置编号写成安装工单编号。

## 3. 返回结构

### 3.1 主体与原数据

成功为 HTTP 200，外层为 `code=0`、`msg="success"`、`data`、`requestId`；失败保持相同包装，`data=null`。下表为 data 内全部必返字段，可空字段显式为 null。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| retrievedAt | string | 本次取数时间，带时区 |
| sourceRecord | object | 来源记录，字段见下文 |
| contentComplete | boolean | 当前授权范围内的结构化内容及材料索引是否已完整取得，不含文件正文是否已下载 |
| rawJson | string / null | 来源为结构化记录时保留原 JSON 文本；没有此类内容为 null。不得先按本系统字段改写、汇总或转单位 |
| sourceMaterials | object[] | 原资料文件索引，复用原始材料读取所需字段 |
| formatStatus | string | `PROVIDED`：取得原格式说明；`NOT_PROVIDED`：确认该来源未提供；`UNKNOWN`：是否提供尚不明确或读取失败 |
| formatDefinition | object / null | 原格式说明，PROVIDED 时必有，其他状态为 null |
| completeness | string | `COMPLETE` / `INCOMPLETE`，表示本契约要求的数据是否已取得完整 |
| missingParts | string[] | 去重列出 `CONTENT`、`WORK_ORDER_ASSOCIATION`、`FORMAT_DEFINITION`、`FORMAT_ASSOCIATION`、`SOURCE_VERSION`、`CONFIGURATION_SCOPE`；完整时为空 |

`sourceRecord` 必返字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| sourceSystem、serviceProviderId、sourceRecordId | 非空 string | 均与请求一致，且已核实实际归属 |
| sourceVersion | string / null | 此次原资料记录版本，不能用接入配置版本替代 |
| sourceUpdatedAt | string / null | 原记录带时区更新时间，未知为 null |
| purpose | string | `INSTALLATION`：具体安装资料；`CONFIGURATION`：授权用于接入配置的资料；`UNKNOWN`：用途无法核实 |
| configurationPurpose | string / null | 来源明确声明配置所服务的业务用途：`INSTALLATION` / `RECONCILIATION`；未知为 null，不能由本接口按资料名称推断 |
| businessScopeKey | string / null | 来源明确声明的稳定业务范围键，与服务商、来源系统、configurationPurpose共同确定接入配置范围；未知为 null，列CONFIGURATION_SCOPE |
| installationWorkOrderId | string / null | 权威关联的安装工单；配置资料可为空，安装资料未知时保留 null |
| sourceFormatId、sourceFormatVersion | string / null | 原资料所声明的格式及其版本，尚未取得则 null |

`rawJson` 是原始内容，不是本接口的字段结构；其内部原字段名和值类型保持不变，例如中文列名、字符串编号、null 和零值。传输层字段仍使用 camelCase。文件型原资料不得伪装为 rawJson，也不能只用文件名填入内容。

每个材料索引必返 `sourceSystem`、`sourceMaterialId`、`sourceVersion`、`name`、`mediaType`、`sourceUpdatedAt`，含义与原始材料读取一致。版本和更新时间可为 null，其余为非空 string。正文通过材料编号、来源和确切版本读取，不在本接口重复传大文件。

### 3.2 原格式说明

PROVIDED 时，formatDefinition 至少包含非空 notes、非空 fields 或非空说明文件列表中的一项；不能把没有任何说明内容的空对象标为已取得。formatDefinition 的字段均必返：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| formatId | 非空 string | 原格式标识，不能用服务商名称替代 |
| sourceVersion | string / null | 格式说明自身的版本，与资料记录版本分别保存 |
| notes | string / null | 原系统或服务商明确给出的适用范围、跨字段关系等说明；未提供则 null |
| fields | object[] | 已有的字段说明，见下文；只有说明文件时可以为空 |
| sourceMaterials | object[] | 格式说明文件索引，与 §3.1 的索引结构相同；无文件时为空 |

fields 每项必返 `fieldKey`（非空 string，原字段标识）、`label`（非空 string，原字段名称）、`meaning`（string / null，原有业务含义）、`unit`（string / null，原声明单位）。字段标识按原数据结构的完整位置区分，不能将不同工作表的同名列合并。没有结构化说明时保留空数组并提供已取得的说明文件，不在读取层执行 OCR 后冒充原有字段说明。

原资料声明的格式编号与版本应当与返回说明一致；未知或不一致时列出 FORMAT_ASSOCIATION，不用旧说明强行解释新资料。格式未提供时无需伪造格式编号。原说明存在但未知字段含义时，meaning 保留 null；“原资料已读全”不表示“含义已经确认”。

### 3.3 完整性和使用边界

| 情况 | 契约要求 |
| --- | --- |
| 原数据或材料索引只取得一部分 | contentComplete=false，列出 CONTENT，不把截断内容作为完整输入 |
| 授权范围内确实无结构化内容及文件 | rawJson=null、sourceMaterials=[]，contentComplete=true；不据此生成安装事实 |
| 未提供格式说明 | NOT_PROVIDED、formatDefinition=null；不因此伪造含义或自动确认配置 |
| 是否有格式说明未知 / 读取说明失败 | UNKNOWN、formatDefinition=null，列出 FORMAT_DEFINITION |
| 格式说明取得，但无法核实它适用于当前资料 | 列出 FORMAT_ASSOCIATION，保留原数据；暂停依赖该说明的转换 |
| purpose=INSTALLATION 但关联工单未知，或 purpose=UNKNOWN | 列出 WORK_ORDER_ASSOCIATION；具体安装资料不能进入正式提交流程 |
| purpose=CONFIGURATION，未关联工单 | 工单字段为 null 属正常状态，不生成假工单 |
| 已取得的资料、格式或材料索引缺版本 | 对应版本为 null，列出 SOURCE_VERSION；不能假装版本已固定 |

missingParts 为空才标为 COMPLETE。无原格式说明、字段含义为空与接口读取失败分别处理；缺失业务含义交给接入配置 Skill 整理待确认问题。字段说明、配置草稿、经人员确认的生效配置是不同内容，本接口不输出“已确认”“可启用”或转换规则。

电缆分段是否可相加、桥架供料与安装是否对应同一段施工，均须保留原说明和业务确认。不能只因数值相同就认定同段，也不能在读取时把材料数量与人工数量累加为实际施工量。

### 3.4 开发示例

以下为独立配置资料的开发响应，仅展示原字段和说明，不填入实际施工数量；未从真实提供方取得。

```json
{
  "code": 0,
  "msg": "success",
  "requestId": "mock-provider-001",
  "data": {
    "retrievedAt": "2026-09-20T12:00:00+08:00",
    "sourceRecord": {
      "sourceSystem": "provider_source_mock",
      "serviceProviderId": "provider-mock",
      "sourceRecordId": "record-mock-001",
      "sourceVersion": "record-1",
      "sourceUpdatedAt": null,
      "purpose": "CONFIGURATION",
      "installationWorkOrderId": null,
      "sourceFormatId": "format-mock-001",
      "sourceFormatVersion": "format-1",
      "configurationPurpose": "INSTALLATION",
      "businessScopeKey": "installation-materials"
    },
    "contentComplete": true,
    "rawJson": "{\"桥架材料\":null,\"桥架安装\":null}",
    "sourceMaterials": [],
    "formatStatus": "PROVIDED",
    "formatDefinition": {
      "formatId": "format-mock-001",
      "sourceVersion": "format-1",
      "notes": "两列分别记录同一段桥架的供料和安装，具体数量未在本记录中提供。",
      "fields": [
        {"fieldKey":"桥架材料","label":"桥架材料","meaning":"该段桥架的供料记录","unit":"米"},
        {"fieldKey":"桥架安装","label":"桥架安装","meaning":"该段桥架的安装记录","unit":"米"}
      ],
      "sourceMaterials": []
    },
    "completeness": "COMPLETE",
    "missingParts": []
  }
}
```

示例 COMPLETE 只说明原资料与原说明已经取得完整。原值 null 继续保留为缺少实际数量，不能转成零或用于生成正式安装明细。

## 4. 失败与兜底

| 情况 | HTTP / code | 本系统处理 |
| --- | --- | --- |
| 参数缺失、格式非法或来源未配置 | 400 / 40001 | 修正参数，不尝试任意来源地址 |
| 身份未验证 / 无权限 | 401 / 40101、403 / 40301 | 停止读取，不通过改服务商编号或缓存绕过 |
| 授权范围内资料记录不存在 | 404 / 40401 | 显示资料未找到，不创建假资料补齐 |
| 原记录取得但资料或说明不完整 | 200 / 0，INCOMPLETE | 保留可用资料及缺项；不据此启用配置或提交正式明细 |
| 来源不可用 / 超时，原记录无法取得 | 503 / 50301、504 / 50401 | 标明当前失败，旧内容只作为历史 |
| 返回归属不符、非法结构 / 枚举、重复字段标识或 rawJson 非法 | 502 / 50201 | 拒绝作为有效输入，保留 requestId 定位，不暴露其他服务商资料 |
| 结构化正文超过开发读取上限 | 413 / 41301 | 提示超限，不截断后标记完整 |

```json
{"code":40301,"msg":"当前身份无权读取该服务商资料","data":null,"requestId":"mock-provider-002"}
```

开发默认：组合取数单次最多 5 秒，仅 50301 / 50401 在 1 秒后重试 1 次，含重试最多 11 秒；返回不完整结果时不循环重试。rawJson 的 UTF-8 字节初始上限为 2 MiB，生产容量须据实际资料核实；文件正文继续采用原始材料读取的配置。这些配置尚未做运行验证。

失败后保留原事项、人员填写内容及已有配置。取得新资料或格式变化不等于旧配置自动适用；后续流程只更新受影响的分析与待确认项，不要求所有角色重审全部资料。

## 5. 依赖方与后续验证

- 安装资料整理：读取服务商实际资料，保留原值与依据，生成待核实草稿；读取层不提前完成业务转换。
- 接入配置：使用原字段、说明与材料生成可执行转换规则及必要对照表，程序试转换后由人员确认启用；本读取接口无启用动作。
- 原文查看：文件复用原始材料读取，预览仍保留页面意见；说明文件读取成功不代表配置已经确认。

角色走查：服务商对接人员只处理需要确认的字段含义；资料人员只核实当前安装资料。系统自动取得已授权资料，不要求人工重复下载、录入或逐次启动 Skill。

后续 mock 覆盖：独立配置资料、关联明确与未知的安装资料、结构化原字段保留、文件资料、未提供与读取失败的格式说明、字段含义为空、格式版本不匹配、同名列不同位置、部分结果、跨服务商权限、来源失败和超限。真实接入还须核实授权导入或直连方式、实际字段、来源版本及完整性能力。

本轮仅定义文档契约，mock、真实服务商接口和导入功能均未实现或联调。
