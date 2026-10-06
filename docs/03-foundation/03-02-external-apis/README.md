# 03-02-external-apis 依赖的外部接口

> 上游（我引用）：[运行数据规则](../../../rules/runtime-mock-data.md) §2—4
> 下游（引用我）：[mock 数据 PRD](../../05-prd/00-subprd-mock-data.md) §2—4；[mock T0.1子计划](../../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T0.1-mock-runtime.md) PRD双链·读、[mock开发主计划](../../07-delivery-plans/main-delivery-plan-jd-charging-mock.md) 上游清单

本系统要调用的、别人提供的接口。每个接口一份文档，写清怎么调、失败怎么办。本系统自己对外提供的接口不在这里，在 `03-06-provided-apis/`。

## 当前进度

- [外部依赖清单](external-dependency-list.md)：本期需要的数据能力与只读、写入边界。
- [安装工单上下文读取](installation-work-order-context.md)：第一份契约已核对；mock 和真实对接均未实现。
- [原始材料读取](source-material-read.md)：第二份契约已核对；按来源、材料编号及版本读取完整文件。
- [购买订单与安装权益读取](purchase-order-installation-entitlements.md)：第三份契约已核对；明确订单关联、权益适用性与安装范围。
- [服务商资料与格式说明读取](provider-documents-format-read.md)：第四份契约已核对；保留原字段、资料用途与原格式说明。
- [正式安装明细提交](installation-detail-submit.md)：第五份契约已核对；明确人员确认、条件写入、重复提交及结果待确认的处理。
- [核查决定与补充记录同步](review-supplement-sync.md)：第六份契约已核对；通过、退回及补充接续原事项。
- [京东账单读取](jd-bill-read.md)：第七份契约已核对；保留独立分项、原总额、工单范围和版本。
- [服务商应收读取](provider-receivable-read.md)：第八份契约已核对；保留原分项和修订版本，新版接续原对账事项。
- [计费条款与批准记录读取](billing-terms-approval-records-read.md)：第九份契约已核对；保留原记录、适用范围及材料版本，区分未查到和未批准。
- [原记录变化发现](source-record-changes-read.md)：第十份契约已核对；明确读取位置、重复变化、补查恢复与原事项接续。
- [当前身份与业务权限取得](current-identity-permissions-read.md)：第十一份契约已核对；明确可信身份、动作与范围绑定、当前责任人及后台执行身份，真实机制待核实。
- [AI 推理与必要的材料解析](ai-inference-material-parsing.md)：第十二份开发契约已核对；区分解析覆盖、证据定位与业务结论，具体模型和解析实现待实测。

十二项外部依赖开发契约已核对，foundation 七类设计已完成；mock 与真实对接尚未实现。真实提供方能力、字段和运行证据在接入阶段逐项验证，本目录随实际证据同步修订。

本目录的请求和返回先定义为项目开发约定。没有真实响应时，示例必须标明“开发示例”；实际地址、鉴权和原始字段保持待核实。不得把设计约定写成原系统既有能力。

## 模拟接口要求

后续 mock 数据通过本目录对应的模拟接口提供，由本系统实际导入、处理并向前端返回。接口示例仅说明契约，不能直接复制为前端固定数据。读接口须支持契约规定的查询条件；写接口须实际修改模拟来源状态，并让后续读取、版本与变化发现保持一致。多服务商数据规模、生成校验和操作闭环由独立 mock 数据 PRD 约束。

## 文件命名

```
<系统名>-<接口用途>.md        例：push-service-send.md、sms-code-send.md
```

## 文件结构

| 章节 | 内容 |
|------|------|
| 接口基本信息 | 提供方系统、接口地址、请求方式、鉴权方式 |
| 请求参数 | 参数名 / 类型 / 必填 / 说明 |
| 返回结构 | 字段名 / 类型 / 必返与可空 / 说明；有真实响应时附脱敏返回，尚未取得时明确标注开发示例 |
| 失败与兜底 | 超时时间、重试策略、失败后业务怎么兜底 |
| 依赖方 | 本系统哪些功能在用这个接口 |

## 示例

```markdown
# 消息推送接口（push-service-send）

## 接口基本信息
- 提供方：公司统一推送平台
- 地址：POST https://push.internal.example.com/send
- 鉴权：Header 带 `X-App-Key`，找推送平台负责人申请

## 请求参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| userId | string | 是 | 接收人 |
| title | string | 是 | 推送标题，最长 20 字 |
| content | string | 是 | 推送正文，最长 50 字 |

## 返回结构
| 字段 | 类型 | 说明 |
|------|------|------|
| code | int | 0 成功，非 0 失败 |
| msgId | string | 推送单号，排查问题时用 |

```json
{ "code": 0, "data": { "msgId": "msg_20260822_001" } }
```

## 失败与兜底
- 超时 3s，重试 1 次；仍失败则该条任务标记为"未提醒"，记错误日志，不再重试

## 依赖方
- 任务到期提醒功能
```
