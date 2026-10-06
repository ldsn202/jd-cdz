# 处理事项域表结构

> 版本：V1.0｜日期：2026-09-20｜状态：候选 DDL 已做本地 SQLite 核验；D1 与业务服务未实现
> 上游（我引用）：[术语表](../03-01-glossary/glossary.md) §1、§3、§5、[处理事项 ER](../03-03-er/er-work-item.md) §1—5、[身份与责任 ER](../03-03-er/er-identity-responsibility.md) §1—4、[业务流程总核对](../03-04-business-flows/coverage-review.md) §2—8、[安装资料提交](../03-04-business-flows/flow-installation-submission.md) §1—5、[安装核查补充](../03-04-business-flows/flow-installation-review.md) §1—5、[履约协同与共用异常](../03-04-business-flows/flow-coordination-exceptions.md) §1—5、[核查决定与补充同步](../03-02-external-apis/review-supplement-sync.md) §2—5、[项目技术栈](../../../rules/Cloudflare支持技术栈.md) §1—2、[规范索引](../../../rules/coding-standards/README.md) “规范未覆盖技术栈时的回退口径”、[邻近建表规范](../../../rules/coding-standards/05-mysql-table.md) “建表规约”“索引规约”、[通用工程规范](../../../rules/coding-standards/08-engineering.md) “分层架构”“分层异常处理”、[安装资料域表结构](installation-schema.md) §3、[双方账单与对账依据域表结构](reconciliation-schema.md) §6、[接入配置域表结构](integration-config-schema.md) §1、§6
> 下游（引用我）：[材料与分析证据域表结构](evidence-schema.md) §1—7、[安装资料域表结构](installation-schema.md) §1—7、[双方账单与对账依据域表结构](reconciliation-schema.md) §1—7、[接入配置域表结构](integration-config-schema.md) §1—7、[身份、权限与责任域表结构](identity-schema.md) §1—4、[表结构覆盖与一致性核对](coverage-review.md) §1—5、[工作台查询接口](../03-06-provided-apis/workbench-apis.md) §1—5、[履约协同与共用异常接口](../03-06-provided-apis/coordination-apis.md) §1—4、[01-subprd-workbench-items.md](../../05-prd/01-subprd-workbench-items.md) §4、[02-subprd-orders-history.md](../../05-prd/02-subprd-orders-history.md) §4、[05-subprd-installation-review.md](../../05-prd/05-subprd-installation-review.md) §4、[07-subprd-coordination.md](../../05-prd/07-subprd-coordination.md) §4

## 1. 范围与必要通用约定

本域设计七张表：服务商和安装工单引用、处理事项、事项关联、人工决定、安装补充回复、处理记录。分析结果由下一域定义，当前仅保留引用；身份、配置、账单及外部写入也由各自分域展开。

候选 SQL：[work-item-schema.sql](work-item-schema.sql)。当前文件用于设计核验，尚未作为正式 migration 应用，不代表数据库已部署。

| 约定 | 本域采用方式 |
| --- | --- |
| 技术基线 | 按项目默认采用 D1 / SQLite；该技术栈无专门规范，按通用工程规范及项目约定执行。语法采用 SQLite，保留小写单数命名、业务唯一索引、逻辑关联及无级联删除要求 |
| 主键与引用 | 本地 ID 为服务端生成的稳定文本标识，明确 NOT NULL；来源编号与本地 ID 分开。来源身份至少由来源系统和记录类型内的原编号确定 |
| 时间 | gmt_create / gmt_modified 由服务端写 UTC 毫秒整数，无隐式当前时间默认值；源端时间另存，可未知。接口按既有带时区格式转换 |
| 版本 | 本地 row_version、responsibility_version 用正整数；源版本保持不透明文本。旧客户端使用带版本条件的写入，零行结果表示条件未满足 |
| JSON | 仅保存完整确认、结构化依据、材料或权限引用等有界内部结构；SQL 校验 JSON 及顶层类型，业务结构和引用由服务端校验；附件字节、令牌、密码不存入这些字段 |
| 未知值 | 使用 NULL，明确无列表项时使用 []。未知数量、权限或源状态不能转为零、空授权或成功 |
| 关系 | 不建物理外键；跨表存在性、同事项、同服务商及当前权限由事务内条件检查。此选择意味着 DDL 单独不能阻止孤立引用 |
| 历史 | 决定、关联和事件只追加；回复正文固定，仅可补一次成功时间。已完成事项保持固定，变化由后续事项承接；正常业务不物理删除 |
| 数据删除边界 | no_delete 触发器保护正常流程历史。保留期限与合法删除流程仍须在实施前明确，受控维护需另行审查，不能把这些触发器当作永久保留政策 |
| 默认值 | 只对明确的初始进展与本地版本给默认值；不默认责任人、完成原因或来源有效状态 |

以下字段表的“必填”指数据库 NOT NULL；有条件必填在说明和约束中进一步限定。所有表均包含 id、gmt_create、gmt_modified。

正常业务写入禁止 INSERT OR REPLACE。材料与证据域的替换反例证明：普通 no_delete / no_update 触发器不能独立覆盖 SQLite 的全部替换写入语义。本域现有核验只覆盖 INSERT、受控 UPDATE 与 DELETE；正式迁移前须在全部表结构总核对中补齐替换写入防护及反例，不将当前候选宣称为任意 SQL 下的历史防篡改机制。

## 2. 来源引用

### service_provider

保存服务商的权威身份引用。来源适配服务写入，事项及授权范围查询读取。不会因一张账单或一个同名组织另建服务商；其他系统编号须核实映射，不能按名称合并。

| 字段 | 类型 | 必填 | 默认 | 含义 |
| --- | --- | --- | --- | --- |
| id | TEXT | 是 | — | 本地稳定文本主键，由服务端生成；不使用显示名称或数组序号 |
| source_system | TEXT | 是 | — | 提供稳定记录身份的权威来源系统；名称变化不改来源身份 |
| source_id | TEXT | 是 | — | 该来源内的原编号，按不透明文本保存 |
| display_name | TEXT | 否 | NULL | 来源展示名称，可未知；不参与身份匹配 |
| source_version | TEXT | 否 | NULL | 真实来源版本，可未知；只判等，不按字典序比较新旧 |
| source_state | TEXT | 是 | 'UNKNOWN' | 本表已核实的来源状态；缺失或未知保持 UNKNOWN |
| verified_at | INTEGER | 否 | NULL | 最近一次可靠来源核实时间；读取失败不能更新为成功核实 |
| gmt_create | INTEGER | 是 | — | 本地首次保存时间，UTC 毫秒整数；不冒充源端业务发生时间 |
| gmt_modified | INTEGER | 是 | — | 本地最近变更时间，UTC 毫秒整数；固定历史表等于创建时间 |

索引：

- uk_service_provider_source：service_provider(source_system,source_id)。 用于同一权威来源的服务商只保留一个身份引用。

### installation_work_order

保存工单来源身份、当前关联和最近可靠上下文引用。来源适配服务写入，事项导航与提交条件检查读取；完整原内容由后续固定输入承载。

| 字段 | 类型 | 必填 | 默认 | 含义 |
| --- | --- | --- | --- | --- |
| id | TEXT | 是 | — | 本地稳定文本主键，由服务端生成；不使用显示名称或数组序号 |
| source_system | TEXT | 是 | — | 提供稳定记录身份的权威来源系统；名称变化不改来源身份 |
| source_id | TEXT | 是 | — | 该来源内的原编号，按不透明文本保存 |
| current_service_provider_id | TEXT | 否 | NULL | 当前来源明确关联的 service_provider.id；未知为 NULL；变更不迁移旧事项归属 |
| source_version | TEXT | 否 | NULL | 真实来源版本，可未知；只判等，不按字典序比较新旧 |
| source_state | TEXT | 是 | 'UNKNOWN' | 本表已核实的来源状态；缺失或未知保持 UNKNOWN |
| context_snapshot_id | TEXT | 否 | NULL | 逻辑引用 installation_context_snapshot.id，保存完整工单上下文；与实际模型输入分开，本表不存工单全文 |
| verified_at | INTEGER | 否 | NULL | 最近一次可靠来源核实时间；读取失败不能更新为成功核实 |
| gmt_create | INTEGER | 是 | — | 本地首次保存时间，UTC 毫秒整数；不冒充源端业务发生时间 |
| gmt_modified | INTEGER | 是 | — | 本地最近变更时间，UTC 毫秒整数；固定历史表等于创建时间 |

索引：

- uk_installation_work_order_source：installation_work_order(source_system,source_id)。 用于不同来源的相同编号分开，同来源不重复建引用。
- idx_installation_work_order_provider：installation_work_order(current_service_provider_id,id)。 用于按当前服务商定位工单引用，不据此授予权限。

两张表均按 (source_system, source_id) 唯一定位，表自身已区分服务商与工单类型。provider 的来源须为可靠登记来源；从其他系统取得的同名组织不能自动新建或合并。

来源更新先核实本次读取与当前采纳任务、记录身份及版本条件匹配；晚到的旧响应不得覆盖新结果，不按版本字符串或核实时间猜测远端先后。工单当前服务商可能变化；原事项仍保存当时 service_provider_id 并暂停不适用操作。新的事项使用当前核实关联，旧事项、决定和材料不迁给新服务商。UNKNOWN / REMOVED 均不能直接解释为业务取消；CANCELLED 须有真实来源依据。

## 3. 处理事项

### work_item

保存人员待办的当前办理位置。业务服务创建并按版本更新，列表和详情读取；范围、业务身份和已完成结果不得随新消息改写。

| 字段 | 类型 | 必填 | 默认 | 含义 |
| --- | --- | --- | --- | --- |
| id | TEXT | 是 | — | 本地稳定文本主键，由服务端生成；不使用显示名称或数组序号 |
| service_provider_id | TEXT | 是 | — | 事项或事实所属 service_provider.id；服务端核实一致，历史归属固定 |
| installation_work_order_id | TEXT | 否 | NULL | installation_work_order.id；配置事项必须空，其他类型必须有 |
| item_kind | TEXT | 是 | — | 事项业务类型，取值见本节；异常是原类型的办理状态 |
| business_key | TEXT | 是 | — | 服务端按固定身份元组生成的 SHA-256 十六进制摘要；不得由浏览器随意生成 |
| business_identity_json | TEXT | 是 | — | 生成 business_key 的有序身份数组，供冲突核实；具体组成见本节 |
| creation_key | TEXT | 是 | — | 生成本次事项的可靠业务事实身份摘要；全表唯一，完成后仍防止同一原因重建 |
| title | TEXT | 是 | — | 用于列表展示的问题标题；不作为业务身份 |
| status | TEXT | 是 | 'PREPARING' | 本事项存储进展；与来源业务状态、外部执行状态分别保存 |
| assignee_identity_id | TEXT | 否 | NULL | identity_reference.id；仅允许 HUMAN，空表示待分配；角色名不能替代 |
| responsibility_version | INTEGER | 是 | 1 | 本地责任版本，初始 1；具体责任人变化时加 1，其他更新不变 |
| row_version | INTEGER | 是 | 1 | 本地事项版本，初始 1；每次业务更新加 1；与源版本、分析版本独立 |
| analysis_generation | INTEGER | 是 | 1 | 分析输入代次；材料、账单、依据或适用配置变化时加 1，普通进展/责任调整不加；发布结果须匹配此值，避免旧响应覆盖新输入 |
| current_analysis_result_id | TEXT | 否 | NULL | analysis_result.id；可空，非空必须属于本事项且匹配当前输入；旧结果另存 |
| current_reconciliation_id | TEXT | 否 | NULL | reconciliation_record.id；仅对账事项可有值；可靠比较独立于 AI 解释发布，历史保留 |
| integration_config_id | TEXT | 否 | NULL | 配置事项目标 integration_config.id；核实后首次绑定，非空后不可改挂 |
| current_configuration_version_id | TEXT | 否 | NULL | 当前编辑的 integration_config_version.id，必须属于本事项及目标配置；不代表当前生效版 |
| active_supplement_request_id | TEXT | 否 | NULL | 当前仍待回应的 REQUEST_SUPPLEMENT 决定；非空时只能属于未完成的安装核查 |
| pending_write_id | TEXT | 否 | NULL | external_write_operation.id；表示结果未明确的外部动作，非空时不能结束事项 |
| blocked_reason | TEXT | 否 | NULL | 当前无法办理的具体原因；BLOCKED 必填，非 BLOCKED 时服务端清空过期原因 |
| completion_code | TEXT | 否 | NULL | 具体完成含义；未完成时必须空，完成值须与事项类型匹配 |
| completion_basis_json | TEXT | 否 | NULL | 完成依据的结构化引用，含真实结果、版本及必要决定；对象非空的业务内容由服务端校验 |
| completion_decision_id | TEXT | 否 | NULL | 作出本次完成决定的 human_decision.id；自动核对一致等可空，不能造人工决定 |
| completed_at | INTEGER | 否 | NULL | 本地确认完成的时间；COMPLETED 必填，其余必须空 |
| gmt_create | INTEGER | 是 | — | 本地首次保存时间，UTC 毫秒整数；不冒充源端业务发生时间 |
| gmt_modified | INTEGER | 是 | — | 本地最近变更时间，UTC 毫秒整数；固定历史表等于创建时间 |

索引：

- uk_work_item_creation：work_item(creation_key)。 用于同一建单原因跨完成历史仍去重。
- uk_work_item_active_business：work_item(service_provider_id,item_kind,business_key) WHERE status<>'COMPLETED'。 用于同一业务问题最多一份未完成工作，允许保留完成历史。
- idx_work_item_assignee_status：work_item(assignee_identity_id,status,gmt_modified DESC,id DESC)。 用于当前责任人的待处理列表，按更新时间稳定分页。
- idx_work_item_provider_status：work_item(service_provider_id,status,gmt_modified DESC,id DESC)。 用于在已授权服务商范围内查询进展。
- idx_work_item_order：work_item(installation_work_order_id,item_kind,gmt_create,id)。 用于从工单进入各阶段事项及历史。

### 3.1 类型、进展与结束原因

| item_kind | 含义 | 正常 completion_code |
| --- | --- | --- |
| INSTALLATION_PREPARATION | 安装资料整理与提交 | INSTALLATION_SUBMITTED |
| INSTALLATION_REVIEW | 安装核查与补充 | REVIEW_APPROVED |
| RECONCILIATION | 业务对账 | RECONCILED |
| CONFIGURATION | 接入配置确认 | CONFIGURATION_ENABLED |
| COORDINATION | 履约协同 | COORDINATION_RESOLVED |

各类型均可按真实结果以 EXCEPTION_RESOLVED 或 BUSINESS_STOPPED 结束；前者不会自动完成原业务，后者须证明原业务已停止。

status 取 PREPARING（准备结果）、READY（可按业务条件处理）、WAITING_SUPPLEMENT（待安装补充）、WAITING_REPLY（待费用回复）、PROCESSING（已确认动作或分析处理中）、EXCEPTION（业务异常处理中）、BLOCKED（当前无法办理）、COMPLETED（本环节结束）。失败原因与实际执行阶段继续保留在相关记录，不能只靠一个状态推断失败或成功。

当前责任可独立于分析准备：未完成事项 assignee_identity_id 为空时展示待分配，同时展示结果准备进展；不能把整个角色当作办理人。PROCESSING 不证明外部已成功。完整允许转换和各动作条件由后续接口与系统流程逐项定义。

### 3.2 如何识别同一个问题

business_identity_json 使用固定顺序数组：
`[serviceProviderId, itemKind, anchorType, anchorSystem, anchorId, problemType, problemSystem, problemId, requiredAction]`。

anchor 是可靠工单身份，或独立配置的已核实业务范围身份；problem 指要解决的原问题或阶段目标。requiredAction 区分应继续的业务动作，不能仅以同工单、同类型匹配后续。字符串按原值保留，结构按固定序列序列化后生成 business_key；命中同摘要仍比较原身份数组，不将摘要冲突当同一问题。

首次资料、正式明细核查、工单对账和已核实配置范围可各有明确阶段目标；同一对账中的具体费用问题存入后续对账域，不为每条回复重建事项。无法确认工单、服务商或问题关联时保留后台待核实工作，不能填假编号生成可办事项。

creation_key 按本次建单的可靠事实生成：来源系统、记录类型、原编号、确切变化版本或本地决定 ID、交接用途。不能用本次接收时间、随机数或通知投递次数代替原因。相同建单原因永久复用原结果；新的实质变化才可在原事项完成后产生新事项。

部分唯一索引保证同一 (service_provider_id, item_kind, business_key) 最多一个未完成事项；历史完成事项不占用此位置。已有匹配后续工作时复用，并追加关联。该索引只处理“身份相同”的去重，身份计算与业务归属仍由服务端核实。

### 3.3 当前结果与结束条件

COMPLETED 必须同时保存 completion_code、completed_at 和 completion_basis_json，且没有 pending_write_id；未完成时这些完成字段均为空。正常原因必须与 item_kind 对应。实际依据对象要包含结果类型、确切事实记录引用、版本及核实时间；JSON 格式正确不证明依据成立。

资料提交、审核、配置等人工路径引用 completion_decision_id 及真实执行结果；自动核对一致引用可靠比较记录及完整条件，无需伪造人工批准。EXCEPTION_RESOLVED 需保留处置决定及仍需办理的工作；BUSINESS_STOPPED 需停止记录及影响范围。具体匹配由服务端检查。completed_at 必须处于本地创建与最近变更时间之间；已核实成功时间同样遵守本地保存先后，源端未知时间另行保留为空。

修改当前责任人同时增加责任版本；每次事项更新增加事项版本。当前分析或依据变化同样增加事项版本，旧意见可保留但旧确认不授权新内容。已完成事项禁止原地改写，后续依据或协调结果存为新事实与关联工作。

## 4. 事项关联

### work_item_link

保存已有或新建后续工作的关联。交接服务写入，历史与“继续办理”入口读取；多个前序事项可以接续同一个仍有效的工作。

| 字段 | 类型 | 必填 | 默认 | 含义 |
| --- | --- | --- | --- | --- |
| id | TEXT | 是 | — | 本地稳定文本主键，由服务端生成；不使用显示名称或数组序号 |
| from_work_item_id | TEXT | 是 | — | 前序 work_item.id；保留原问题与结果 |
| to_work_item_id | TEXT | 是 | — | 接续 work_item.id；可复用已有工作；不能指向自身 |
| reason_code | TEXT | 是 | — | EXCEPTION_CONTINUATION、AFTER_COMPLETION_CHANGE 或 STAGE_HANDOFF |
| cause_key | TEXT | 是 | — | 本次交接的真实决定、来源变化或提交结果的稳定身份摘要 |
| basis_json | TEXT | 是 | — | 交接依据，保存原问题、所需动作及相关事实引用 |
| gmt_create | INTEGER | 是 | — | 本地首次保存时间，UTC 毫秒整数；不冒充源端业务发生时间 |
| gmt_modified | INTEGER | 是 | — | 本地最近变更时间，UTC 毫秒整数；固定历史表等于创建时间 |

索引：

- uk_work_item_link_cause：work_item_link(from_work_item_id,reason_code,cause_key)。 用于同一前序、原因和事实只关联一个接续结果。
- idx_work_item_link_target：work_item_link(to_work_item_id,gmt_create,id)。 用于从接续事项回看全部前序依据。

(from_work_item_id, reason_code, cause_key) 唯一，保证同一次交接只能指定一个后续结果；同目标允许多个前序关联，不用单个 parent_id 丢失其他依据。数据库禁止自指，跨表服务须防止循环、错服务商及关联无关问题。

EXCEPTION_CONTINUATION 表示异常关闭后仍需原业务；AFTER_COMPLETION_CHANGE 表示新事实影响已完成结论；STAGE_HANDOFF 表示资料提交等阶段成功后衔接下一环节。自动重试沿用同一 cause_key。转交失败只恢复关联和待办，不重新要求人员关闭异常或提交资料。真实停止且无需继续时不写虚假的后续关系。

## 5. 人工决定

### human_decision

保存一次被接受的人员确认或真实来源决定。确认服务或来源适配服务只追加，详情与外部执行读取；本表不保存执行成功状态。

| 字段 | 类型 | 必填 | 默认 | 含义 |
| --- | --- | --- | --- | --- |
| id | TEXT | 是 | — | 本地稳定文本主键，由服务端生成；不使用显示名称或数组序号 |
| work_item_id | TEXT | 是 | — | 所属 work_item.id；事实不可移到另一事项 |
| service_provider_id | TEXT | 是 | — | 事项或事实所属 service_provider.id；服务端核实一致，历史归属固定 |
| origin | TEXT | 是 | — | LOCAL 为工作台接受的确认；SOURCE 为真实原记录导入 |
| action_type | TEXT | 是 | — | 存储动作类型，见本节；不直接当成外部 API 或权限名称 |
| request_key | TEXT | 否 | NULL | 一次本地确认的稳定请求编号；LOCAL 必填且全局唯一，SOURCE 必须空 |
| actor_identity_id | TEXT | 否 | NULL | 实际人员或事件执行主体的 identity_reference.id；未知历史不补造 |
| identity_context_id | TEXT | 否 | NULL | 本地确认当时固定的 current_identity.id；来源导入必须空 |
| matched_grants_json | TEXT | 否 | NULL | 当次上下文内实际匹配的 grantId 数组；LOCAL 非空，SOURCE 为空值 |
| expected_work_item_version | INTEGER | 否 | NULL | 本地确认实际看到的事项版本；LOCAL 必填，源端未知时可空 |
| expected_responsibility_version | INTEGER | 否 | NULL | 本地确认看到的责任版本；LOCAL 必填，源端未知时可空 |
| analysis_result_id | TEXT | 否 | NULL | 固定的 analysis_result.id；本地审核通过和退回必填，不能引用另一事项或失效结果 |
| confirmed_at | INTEGER | 否 | NULL | 实际确认发生时间；来源未知时为空，不能以导入时间补填 |
| content_json | TEXT | 是 | — | 此次完整确认内容与依据引用；不能只保存修改的单个字段或最后一段意见 |
| source_system | TEXT | 否 | NULL | 提供稳定记录身份的权威来源系统；名称变化不改来源身份 |
| source_record_type | TEXT | 否 | NULL | 真实来源动作的记录类型；与 source_system、source_record_id 联合定位 |
| source_record_id | TEXT | 否 | NULL | 真实来源动作编号；SOURCE 必填，不使用标题替代 |
| source_actor_ref_json | TEXT | 否 | NULL | 来源实际提供但尚未映射的原操作者引用；无可靠信息时为空 |
| gmt_create | INTEGER | 是 | — | 本地首次保存时间，UTC 毫秒整数；不冒充源端业务发生时间 |
| gmt_modified | INTEGER | 是 | — | 本地最近变更时间，UTC 毫秒整数；固定历史表等于创建时间 |

索引：

- uk_human_decision_request：human_decision(request_key) WHERE origin='LOCAL'。 用于本地同一次确认不重复保存。
- uk_human_decision_source：human_decision(source_system,source_record_type,source_record_id) WHERE origin='SOURCE'。 用于来源同一业务动作不重复导入。
- idx_human_decision_item：human_decision(work_item_id,gmt_create,id)。 用于回看该事项历次人员确认。
- idx_human_decision_provider：human_decision(service_provider_id,gmt_create,id)。 用于在授权服务商范围内查询历史决定。

LOCAL 必须有稳定 request_key、人员身份、当时上下文、实际匹配的非空授权项、事项和责任版本、确认时间及完整内容。SOURCE 必须有真实 source_system + source_record_type + source_record_id，不造本地上下文；原操作者或原确认时间未知时允许空。可靠映射后的身份仅用于引用，原 source_actor_ref_json 保持原信息。

action_type 保存：SUBMIT_INSTALLATION、APPROVE、REQUEST_SUPPLEMENT、SUBMIT_SUPPLEMENT、REQUEST_FEE_VERIFICATION、REPLY_FEE_VERIFICATION、RECORD_FEE_FACTS、ENABLE_CONFIGURATION、OPEN_EXCEPTION、CLOSE_EXCEPTION、COMPLETE_COORDINATION、STOP_WORK。SOURCE_UNMAPPED 仅允许来源导入尚未解释的动作，不能用于批准或驱动业务完成。

本地 APPROVE / REQUEST_SUPPLEMENT 必须绑定有效分析；其他依赖分析或配置试转换的动作按其分域检查。业务决定内容包含相应完整表单、固定输入或候选版本、问题或材料引用，不能只凭 content_json 是对象就放行。

request_key 重复时先返回已核实的同一确认；同号改内容拒绝，不用 UPDATE 或 REPLACE 覆盖。来源同一动作导入也去重。若来源回执对应本地已发出动作，应经 external_write_operation 关联原决定，不再导入另一份人员确认；来源三元组索引不能独自解决本地与外部重复映射。

人工决定与外部执行分开。即使执行拒绝或结果未知，本次确认仍是历史事实；执行尝试、结果与回查由后续执行域承接，不更新本表为“成功决定”。当前权限撤回也不改原 actor_identity_id。

## 6. 安装补充回复

### supplemental_response

保存安装核查的一次回复正文、材料及两份决定关联。补充服务保存固定内容，源端结果处理仅补写成功核实时间；执行失败与尝试由外部写入域保存。

| 字段 | 类型 | 必填 | 默认 | 含义 |
| --- | --- | --- | --- | --- |
| id | TEXT | 是 | — | 本地稳定文本主键，由服务端生成；不使用显示名称或数组序号 |
| work_item_id | TEXT | 是 | — | 所属 work_item.id；事实不可移到另一事项 |
| service_provider_id | TEXT | 是 | — | 事项或事实所属 service_provider.id；服务端核实一致，历史归属固定 |
| request_decision_id | TEXT | 是 | — | 已成功生效且当前有效的原退回 human_decision.id |
| submit_decision_id | TEXT | 是 | — | 本次确认提交的 SUBMIT_SUPPLEMENT human_decision.id；一份决定最多一份回复 |
| reply_text | TEXT | 是 | — | 回应当前问题的事实说明；无新增材料时也允许提交 |
| materials_json | TEXT | 是 | — | 已保存的材料版本引用数组；无文件为 []，不是未知内容的占位附件 |
| success_verified_at | INTEGER | 否 | NULL | 本地核实源端成功的时间投影；初始空，可一次转为整数，之后不可撤销 |
| gmt_create | INTEGER | 是 | — | 本地首次保存时间，UTC 毫秒整数；不冒充源端业务发生时间 |
| gmt_modified | INTEGER | 是 | — | 本地最近变更时间，UTC 毫秒整数；固定历史表等于创建时间 |

索引：

- uk_supplemental_response_submission：supplemental_response(submit_decision_id)。 用于一份补充提交决定最多一份回复。
- uk_supplemental_response_success：supplemental_response(request_decision_id) WHERE success_verified_at IS NOT NULL。 用于同一安装退回轮次最多一份成功回复。
- idx_supplemental_response_item：supplemental_response(work_item_id,gmt_create,id)。 用于读取原事项的历次补充。

request_decision_id、submit_decision_id 和回复必须属于同一 work_item 与 service_provider。前者为已成功生效、仍待回复的退回，后者为实际提交此次内容的 SUBMIT_SUPPLEMENT。资料修订须走正式明细路径，不靠 reply_text 覆盖安装数量。

submit_decision_id 全表唯一，一次确认至多一份回复；服务端在同一事务中保证每份已接受的 SUBMIT_SUPPLEMENT 确认恰好有一份回复。success_verified_at 非空的同一 request_decision_id 最多一条；失败尝试保留回复并通过执行记录区分，不能把空成功时间直接解释为失败。

success_verified_at 是执行域成功事实的本地查询投影，使用本地核实时间，不冒充源端接收时间。只有可关联原确认及回复内容的成功回执才能补写，与外部结果、当前退回关闭及分析接续同一持久化步骤完成；之后不得清空或改写。源端成功的历史导入按真实退回与提交动作建立对应决定，不伪造本地身份。

部分唯一索引防止两个成功回复；原动作结果未知时不接收另一份并行回复，需要 pending_write_id、当前轮次及后续执行域的工单级保护共同落实。普通费用问答另由对账域保存，不能套用“一轮一个成功回复”的限制。

## 7. 处理记录

### activity_record

保存事项时间线中的事件引用及实际进展。业务服务或后台处理在事实保存时追加，历史页读取；不把所有业务结果复制成第二套权威记录。

| 字段 | 类型 | 必填 | 默认 | 含义 |
| --- | --- | --- | --- | --- |
| id | TEXT | 是 | — | 本地稳定文本主键，由服务端生成；不使用显示名称或数组序号 |
| work_item_id | TEXT | 是 | — | 所属 work_item.id；事实不可移到另一事项 |
| event_key | TEXT | 是 | — | 在本事项内定位同一实际事件的稳定编号；重放不多记一条 |
| event_type | TEXT | 是 | — | 事件类别，见本节；记录进展与作业务决定分别处理 |
| actor_identity_id | TEXT | 否 | NULL | 实际人员或事件执行主体的 identity_reference.id；未知历史不补造 |
| fact_type | TEXT | 否 | NULL | 被引用事实类型，非自行保存的进展须与 fact_id 一起填写 |
| fact_id | TEXT | 否 | NULL | 对应事实记录的稳定本地编号；详情从原事实读取，不能用文字替代结果 |
| occurred_at | INTEGER | 否 | NULL | 实际事件时间；来源未知可以空，列表仍可按本地保存时间排序 |
| details_json | TEXT | 是 | — | 进展正文、转交前后责任或事件展示摘要；不覆盖原业务事实与凭据 |
| gmt_create | INTEGER | 是 | — | 本地首次保存时间，UTC 毫秒整数；不冒充源端业务发生时间 |
| gmt_modified | INTEGER | 是 | — | 本地最近变更时间，UTC 毫秒整数；固定历史表等于创建时间 |

索引：

- uk_activity_record_event：activity_record(work_item_id,event_key)。 用于同一事项同一事实事件重放不多记记录。
- idx_activity_record_item_time：activity_record(work_item_id,gmt_create,id)。 用于按本地保存时间与 ID 读取稳定时间线。

event_type 区分事项创建、分析完成、人员确认、源端结果、进展保存、责任变化、后续关联和来源变化。除 PROGRESS_SAVED 外均引用实际 fact_type + fact_id；事件摘要不作为审核成功、付款或源端写入证明。

进展保存使用实际人员和时间，details_json 保存非空进展正文、未解决问题及必要依据；不因此生成新的批准或结束事项。责任转交事件保留旧、新人员、转交依据及实际执行主体；来源导入人员未知时保留未知，后台程序不冒充业务确认人。

event_key 从同一实际事实及事件含义生成，按事项唯一；一份源端结果可有多次不同真实状态变化，但同一结果重复送达不多记一次。原记录时间未知时 occurred_at 为空，列表按 gmt_create + id 稳定排序并明确这是本地接收时间。

## 8. 跨表条件与事务边界

接入配置目标与当前候选由 integration_config_id、current_configuration_version_id 绑定。首次补齐目标须核实原业务身份，候选发布须匹配当前事项、配置和输入；新候选不修改配置当前生效指针。启用确认、真实结果、配置指针与事项完成按配置域 §6 同事务执行。

对账当前结果由 current_reconciliation_id 指向；目标须属于本事项，匹配当前固定输入及来源/配置版本，按 row_version 条件在事务中发布。当前 AI 解释须通过 reconciliation_analysis_link 关联该次比较；计算先完成、解释失败时可以只发布比较，不用旧解释顶替。跨表指针条件仍由后续服务实施，见对账域 §6。

| 必须核实的条件 | 数据库当前能保证什么 | 后续服务端必须做什么 |
| --- | --- | --- |
| 同一事项范围 | 固定事项归属、部分唯一索引 | 检查服务商、工单、问题、决定、回复和依据真实关联；不能仅比较两段显示名称 |
| 当前人员有权决定 | LOCAL 身份、上下文及授权引用不可空 | 核实 HUMAN、当前责任人、当次完整动作与范围授权、撤权、源端账号及资料版本 |
| 当前分析有效 | 本地审核有分析引用 | 检查分析属于该事项且匹配当前输入，未失败、未过期；不能用旧指针批准新内容 |
| 安装补充轮次 | 一个提交确认一份回复，一轮最多一份成功回复 | 已生效退回、有效轮次、同服务商、未决写入保护；决定与回复一起保存 |
| 完成依据成立 | 类型与原因组合、必要字段、未知写入不能完成 | 核实源端成功或全部核对条件、真实停止依据及未完成业务接续 |
| 多条事实一致保存 | 唯一、CHECK 和触发器拒绝违反本表条件的写入 | 用支持原子提交的方式保存决定、对应内容、事项更新及必要执行任务；任何关联写入均以同一确认与版本条件为前提 |
| 重复请求 | request_key、creation_key、cause_key、event_key 唯一 | 比较固定内容并复用原结果；同号不同内容拒绝；冲突不能当作新请求静默吞掉 |
| 跨域引用 | 七域候选表及 cross-domain-guards.sql 已形成 | 组合保护核实关键身份、分析、提交与未决引用；深层 JSON 和实时授权由服务层校验，正式存储联测通过后开放运行写入 |

D1 的 batch 可用于多条语句的事务提交；语句错误会终止或回滚整批。**带版本条件的 UPDATE 影响零行本身不是 SQL 错误**，不能无条件继续插入决定、回复或成功事件。后续写入须在 SQL 内共用前置条件，或把条件失败转为能使整批失败的约束，并验证各语句结果；不能在 batch 提交后再依赖应用异常“回滚”。[D1 batch 官方说明](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)

本轮仅验证 SQLite 条件更新、字段与索引行为；不提供可被误当成生产服务的事务封装。外部网络调用不能与本地表伪装成一个数据库事务：先保存固定确认及执行任务，再按既有契约核实外部结果。完成后交接暂失败时保留成功事实，只恢复后续工作。

## 9. 验收、必要性与下一步

| 场景 | 本域支持方式 |
| --- | --- |
| 人员打开工作台 | 按具体 assignee 和状态读取事项，结果由 current_analysis_result_id 关联，不新增手动启动 Skill |
| 原资料提交后进入核查 | 不同阶段事项通过可靠成功事实关联；资料成功不等于审核通过 |
| 京东退回、服务商补充、京东继续 | 原事项保留，问题与回复有固定关联，成功后只更新当前分析与责任 |
| 异常处置完成但业务未完成 | 原完成原因固定，复用或生成精确后续工作，多前序依据不会丢失 |
| 原工单重新分配服务商 | 当前来源引用与旧事项历史分开，不迁移旧决定；无权人员不可据旧记录办理 |
| 无需继续或已完成后重复通知 | 停止依据保留；唯一建单原因与交接原因阻止同一事实重复生成工作 |
| 配置或履约无安装分析 | 配置不要求伪造工单；履约决定可无分析，人员职责不增加 |

必要性结论：本域新增的是存储关系和限制，未增加业务角色、审批或重复填写。业务事实与历史可追溯，原型的简化状态不会直接变成生产完成条件。

执行 `PHASE-14/tests/test-work-item-schema.py` 可在独立内存 SQLite 验证候选 DDL。当前约束测试与文档字段/索引核对结果保存在任务验收证据；未创建真实 D1 数据库，未执行正式 migration，未证明鉴权、跨表事务或业务接口已实现。

本域已纳入 foundation 全范围核对；后续实现按本系统接口、系统流程及 PRD 接续。

## 10. 技术核实依据

- [D1 SQL 与 JSON 支持](https://developers.cloudflare.com/d1/sql-api/sql-statements/)：本域使用 SQLite SQL 与 JSON 顶层校验，实际 D1 环境兼容性仍须运行验证。
- [SQLite CREATE TABLE](https://www.sqlite.org/lang_createtable.html)：文本主键显式 NOT NULL；CHECK 对 NULL 不自动报错，条件必填必须写明确的非空条件。
- [SQLite 部分唯一索引](https://www.sqlite.org/partialindex.html)：只对未完成事项或成功回复建立条件唯一约束。
- [D1 外键说明](https://developers.cloudflare.com/d1/sql-api/foreign-keys/)：D1 具备外键能力；本域按项目约定采用逻辑关联，未将产品能力缺失作为理由。
