# 双方账单与对账依据域表结构

> 版本：V1.0｜日期：2026-09-20｜状态：候选 DDL 本地 SQLite 核验；真实 D1、对账服务未实现
> 上游（我引用）：[处理事项域表结构](work-item-schema.md) §1、§3、§5、§8、[材料与分析证据域表结构](evidence-schema.md) §4—6、[双方账单与对账依据 ER](../03-03-er/er-reconciliation.md) §1—6、[业务对账](../03-04-business-flows/flow-reconciliation.md) §1—7、[京东账单读取](../03-02-external-apis/jd-bill-read.md) §2—5、[服务商应收读取](../03-02-external-apis/provider-receivable-read.md) §2—5、[计费条款与批准记录读取](../03-02-external-apis/billing-terms-approval-records-read.md) §2—5、[术语表](../03-01-glossary/glossary.md) §1、§5
> 下游（引用我）：[处理事项域表结构](work-item-schema.md) §3、§8、[表结构覆盖与一致性核对](coverage-review.md) §1—5、[业务对账接口](../03-06-provided-apis/reconciliation-apis.md) §1—3、[配置试转换与业务对账计算](../03-07-system-flows/sys-configuration-reconciliation.md) §1—3、[06-subprd-reconciliation.md](../../05-prd/06-subprd-reconciliation.md) §4、[workbench-apis](../03-06-provided-apis/workbench-apis.md) §6—7

## 1. 范围与共同约定

本域采用五张表，候选 SQL 为 [reconciliation-schema.sql](reconciliation-schema.sql)。按处理事项、材料与分析证据、安装资料、本域顺序加载。主键、时间、逻辑关联及合法删除约定见处理事项域 §1；全部时间为服务端保存的 UTC 毫秒，无默认成功或来源版本。本轮未生成正式 migration。

| 逻辑对象 | 物理保存位置 |
| --- | --- |
| 京东账单、服务商原应收 | billing_document 区分 JD / PROVIDER 来源身份；实际版本内容为 analysis_input_item.data_json |
| 原账单分项 | 固定输入 data_json.items；用账单身份、来源版本及 billItemId 定位，不复制为可改本地账目 |
| 一次比较、比较组及成员 | reconciliation_record；分组和成员随完整比较一起固定 |
| 条款、费用批准记录 | fee_basis_record 来源身份及固定输入；不把工作台回复当原批准 |
| AI 差异解释 | 已有 analysis_result；由 reconciliation_analysis_link 绑定实际比较 |
| 核实问题、多次回复、已核实事实 | human_decision 保存内容及人员证据；fee_verification_action 绑定问题与当时比较 |

各表禁止普通 DELETE、历史 UPDATE 和替换式 INSERT。仅核实问题允许一次补写关闭依据，不能重写原问题。重复请求先读取已有记录并比较内容后复用，不通过 INSERT OR REPLACE 覆盖历史。

**程序比较可以先于 AI 解释展示。** work_item 增加可空 current_reconciliation_id，独立指向当前有效比较；AI 失败不丢失已完成计算。指针发布条件见 §6，不以最新创建时间选结果。

## 2. 字段与索引

### billing_document

账单或应收的固定来源身份，二者用 side 区分。来源适配服务登记；金额及实际版本保存在已封存输入中，本表不维护可改金额。

| 字段 | 类型 | 必填 | 默认 | 含义 |
| --- | --- | --- | --- | --- |
| id | TEXT | 是 | — | 稳定本地标识，由服务端生成。 |
| side | TEXT | 是 | — | 京东账单或服务商原应收。 |
| source_system | TEXT | 是 | — | 真实来源系统。 |
| source_id | TEXT | 是 | — | 原账单/应收编号，不是工单编号。 |
| service_provider_id | TEXT | 是 | — | 已核实的本地服务商归属，身份固定。 |
| gmt_create | INTEGER | 是 | — | 本地保存 UTC 毫秒。 |
| gmt_modified | INTEGER | 是 | — | 固定历史等于创建时间。 |

索引：

- uk_billing_document_jd：billing_document(source_system,source_id)，条件 side='JD'，唯一。用于同一京东原账单唯一，不靠更换服务商复制身份。
- uk_billing_document_provider：billing_document(source_system,service_provider_id,source_id)，条件 side='PROVIDER'，唯一。用于服务商应收按来源、服务商、原编号唯一。
- idx_billing_document_provider：billing_document(service_provider_id,side,id)。用于授权后定位该服务商双方账单身份。

### fee_basis_record

计费条款或真实费用决定的来源身份；正文、范围、版本和状态保存在固定输入。可跨工单共享，不强制绑定一个服务商。

| 字段 | 类型 | 必填 | 默认 | 含义 |
| --- | --- | --- | --- | --- |
| id | TEXT | 是 | — | 稳定本地标识，由服务端生成。 |
| record_kind | TEXT | 是 | — | 原计费条款或原费用批准记录；不以工作台答复代替。 |
| source_system | TEXT | 是 | — | 权威来源系统。 |
| source_id | TEXT | 是 | — | 该记录类别下的来源编号。 |
| gmt_create | INTEGER | 是 | — | 本地保存 UTC 毫秒。 |
| gmt_modified | INTEGER | 是 | — | 固定历史等于创建时间。 |

索引：

- uk_fee_basis_record_source：fee_basis_record(record_kind,source_system,source_id)，唯一。用于固定条款/批准记录身份，不按标题合并。

### reconciliation_record

程序按一份固定输入生成的整次对账。分组、成员、依据和结论一起固定，更新产生新记录；由确定性比较服务写入。

| 字段 | 类型 | 必填 | 默认 | 含义 |
| --- | --- | --- | --- | --- |
| id | TEXT | 是 | — | 稳定本地标识，由服务端生成。 |
| work_item_id | TEXT | 是 | — | 原对账事项，同版变化不另建待办。 |
| installation_work_order_id | TEXT | 是 | — | 本次目标工单。 |
| service_provider_id | TEXT | 是 | — | 本次服务商。 |
| snapshot_id | TEXT | 是 | — | 本次固定 analysis_input_snapshot.id，包含实际账目和依据输入。 |
| execution_key | TEXT | 是 | — | 这次比较执行的稳定编号，重复接续复用；不是 AI runId。 |
| comparator_version | TEXT | 是 | — | 实际确定性计算与校验实现版本，包含十进制和对应关系使用规则。 |
| status | TEXT | 是 | — | 核对一致、有差异或仍待信息；不代表付款、结算或费用批准。 |
| currency | TEXT | 否 | NULL | 本次可比币种；未知为空。 |
| tax_basis | TEXT | 是 | — | 核实的相同税口径，不自动换算。 |
| jd_amount | TEXT | 否 | NULL | 所选京东账单在本次目标工单范围的可核实金额，十进制字符串；未知为空。 |
| provider_amount | TEXT | 否 | NULL | 服务商同范围金额，保持原精度和方向；未知为空。 |
| difference_amount | TEXT | 否 | NULL | 程序按服务商减京东计算的同范围差额；不可比时为空，零规范为字符串 0。 |
| selected_bills_json | TEXT | 是 | — | 每项 billingDocumentId + inputItemId；固定双方实际原记录和版本，禁止同身份加入两次。 |
| groups_json | TEXT | 是 | — | 整份分组集合：groupId、状态、对应依据、双方合计、差额、成员。 |
| basis_inputs_json | TEXT | 是 | — | 每项 feeBasisId + inputItemId，指向本次输入的条款或费用决定。 |
| basis_lookup_json | TEXT | 是 | — | 实际费用依据查询范围、取得时点、工单版本、列表完整性和缺项；空列表不冒充无批准。 |
| checks_json | TEXT | 是 | — | 各项核对检查的事实结果，字段见 §4；由服务端产生，不能由客户端宣布通过。 |
| open_issues_json | TEXT | 是 | — | 尚未解决的缺项、差异、范围冲突和业务争议，保留具体问题与引用。 |
| gmt_create | INTEGER | 是 | — | 本地保存 UTC 毫秒。 |
| gmt_modified | INTEGER | 是 | — | 固定历史等于创建时间。 |

索引：

- uk_reconciliation_record_execution：reconciliation_record(execution_key)，唯一。用于同一次比较恢复不重复采用结果。
- idx_reconciliation_record_item：reconciliation_record(work_item_id,gmt_create,id)。用于读取原事项历次比较与人员当时依据。
- idx_reconciliation_record_snapshot：reconciliation_record(snapshot_id,id)。用于追溯同输入的比较实现与分析关联。

### reconciliation_analysis_link

固定对账与已采用 AI 解释之间的关联。分析完成后追加，不改动已保存的比较金额；一个解释归属一次比较。

| 字段 | 类型 | 必填 | 默认 | 含义 |
| --- | --- | --- | --- | --- |
| id | TEXT | 是 | — | 稳定本地标识，由服务端生成。 |
| reconciliation_id | TEXT | 是 | — | reconciliation_record.id。 |
| analysis_result_id | TEXT | 是 | — | 同事项、同输入快照且 Skill 为对账解释的结果。 |
| gmt_create | INTEGER | 是 | — | 本地保存 UTC 毫秒。 |
| gmt_modified | INTEGER | 是 | — | 固定历史等于创建时间。 |

索引：

- uk_reconciliation_analysis_result：reconciliation_analysis_link(analysis_result_id)，唯一。用于一份解释不挂到另一份比较。
- idx_reconciliation_analysis_record：reconciliation_analysis_link(reconciliation_id,gmt_create,id)。用于读取同次比较的历史解释。

### fee_verification_action

费用核实问题、回复或事实记录对原人工决定及当时比较的绑定。动作内容在 human_decision 保留；只有问题可一次补写解决依据。

| 字段 | 类型 | 必填 | 默认 | 含义 |
| --- | --- | --- | --- | --- |
| id | TEXT | 是 | — | 稳定本地标识，由服务端生成。 |
| human_decision_id | TEXT | 是 | — | 对应一份实际人员动作，每份决定只绑定一次。 |
| reconciliation_id | TEXT | 是 | — | 操作者当时实际看到的比较，可与原问题的比较不同，但仍属同事项。 |
| action_kind | TEXT | 是 | — | 分别对应 REQUEST_FEE_VERIFICATION、REPLY_FEE_VERIFICATION、RECORD_FEE_FACTS。 |
| question_action_id | TEXT | 否 | NULL | REPLY 必填原 QUESTION；FACT 可指向所核实的问题；QUESTION 为空。 |
| is_closed | INTEGER | 是 | — | 0 未解决；仅 QUESTION 可由实际依据改为 1；不表示对账事项完成。 |
| closed_by_kind | TEXT | 否 | NULL | COMPARISON 或 HUMAN_FACT；其他动作始终为空。 |
| closed_by_id | TEXT | 否 | NULL | 可靠比较 id 或本问题实际 FACT 动作 id。 |
| close_basis_json | TEXT | 否 | NULL | 具体问题为何已解决及所用字段/材料/事实引用；关闭时必有 object。 |
| closed_at | INTEGER | 否 | NULL | 本地核实问题解决时间，关闭时必填。 |
| gmt_create | INTEGER | 是 | — | 本地保存 UTC 毫秒。 |
| gmt_modified | INTEGER | 是 | — | 仅关闭原核实问题时一次推进；其他内容固定。 |

索引：

- uk_fee_verification_decision：fee_verification_action(human_decision_id)，唯一。用于同一人员确认不重复保存问题/回复。
- idx_fee_verification_question：fee_verification_action(question_action_id,gmt_create,id)。用于读取原问题下的多次实际回复与事实。
- idx_fee_verification_comparison：fee_verification_action(reconciliation_id,id)。用于读取当次比较的人员核实过程。

## 3. 来源身份、原账与金额

京东账单按来源系统与原账单编号唯一；服务商应收按来源系统、服务商和原应收编号唯一。不同服务商的同号应收不能混用，同一京东账单不能靠换服务商复制。归属变动需核实真实来源关系，不修改历史账单身份或把旧记录移给另一服务商。

选用记录保留双方各自的来源版本和取得时点。版本字符串仅判等，不按字母或数值排序推断新旧。来源更换编号须提供替换关系；回复“已修改”不能代替可靠新版。相同版本不同读取完整度可以保留各次实际输入；同版本确定事实相互矛盾时记录来源异常。

账单可能覆盖多个工单。必须保存完整原账的关联范围与分项，目标工单金额依据可靠分项归属及原业务范围取得。不能丢掉其他工单行后宣布原账完整，不能用整单总额或平均分摊冒充目标金额。共同费用、未明确归属的行及缺失金额保留未知，单边项目保留待匹配。

金额字段使用 TEXT 十进制字符串，保留原精度和正负方向；SQL 只检查格式，不执行金额加减。接受可选正负号、整数及带小数部分的普通十进制格式，拒绝科学计数、NaN、空白、千分位和不完整小数。未知为 NULL，已知零保留为零；计算所得差额为零时规范为字符串 "0"。

| 计算或核实 | 后续服务要求 |
| --- | --- |
| 比较组差额 | 该组服务商原分项合计减京东原分项合计；每个原分项只计入一次 |
| 工单差额 | 同币种、税口径与范围下，服务商目标工单金额减京东目标工单金额 |
| 原总额与分项 | 保留原总额，完整且范围一致时检查总分；不以本地求和覆盖原总额 |
| 数量和单价 | 保留原字段，不无条件用数量乘单价改写原金额；计费数量与安装数量分开 |
| 精度与换算 | 使用十进制计算；当前没有已确认的容差、汇率、税额换算规则，不擅自舍入制造相等 |

## 4. 固定比较内容与结束条件

下列 JSON 是完整固定记录中的约定结构。表格只定义字段职责，深层存在性、枚举、授权、内容一致性及实际算术必须由服务端验证。

| 字段 | 内容及规则 |
| --- | --- |
| selected_bills_json | 数组；每项 billingDocumentId、inputItemId。必须是本快照中的实际 RECORD 输入，来源及 JD_BILL / PROVIDER_RECEIVABLE 类型匹配。每个账单身份及输入最多选一次，不能将同账不同版本一起计入 |
| groups_json | 数组；每组 groupId、status、mappingBasis、jdAmount、providerAmount、differenceAmount、members。status 为 MATCHED、DIFFERENCE、UNMATCHED 或 NEEDS_INFORMATION；金额为十进制字符串或 null。mappingBasis 保留实际生效配置版本及适用依据，未知为 null |
| groups_json.members | 每项 inputItemId、billItemId；指向所选账单的真实分项。同次比较中此二元组合最多出现一次，左右账单同名行不因此合并；不能按名称强行对应 |
| basis_inputs_json | 数组；每项 feeBasisId、inputItemId，引用本快照中的 BILLING_TERM 或 FEE_APPROVAL_RECORD。身份、类别和来源一致 |
| basis_lookup_json | object；保存 lookupScope、retrievedAt、installationWorkOrderVersion、termListComplete、approvalListComplete、missingParts，按读取契约保留实际查询条件、时间和缺失信息。数组为空也必须保存查询范围与列表完整性 |
| checks_json | 以下八项具名布尔值，由服务重新验证后生成；客户端不能自行宣称通过 |
| open_issues_json | 数组；问题标识、具体原因、关联分项/原问题和所需依据。保留缺项、范围冲突、金额差异和业务争议 |

| 检查项 | true 的实际含义 |
| --- | --- |
| source_current | 双方来源有效且属于本次核实的当前版本 |
| scope_confirmed | 目标工单归属、完整业务范围与所选记录集合明确 |
| currency_tax_confirmed | 双方可比币种与含税口径相同 |
| items_complete | 必需分项齐全，没有遗漏或重复计入 |
| mapping_confirmed | 项目对应关系已确认且对当前范围适用 |
| total_checks_passed | 同范围原总额与分项检查成立 |
| groups_balanced | 所有适用比较组与工单可比金额无未解决差额 |
| issues_resolved | 核实问题、缺项、冲突和争议已由可靠依据解决 |

MATCHED 要求完整快照、双方已知来源版本、两侧记录、非空且全部一致的比较组、可比金额、规范零差额、空未决问题及八项 true；不增加“批准自动结束”动作。不完整输入不能核对一致，空分组也不能被解释为已确认零费用。DIFFERENCE 须有可比差额及未决问题，总差额为零仍可能有组间差异。NEEDS_INFORMATION 须保留未决问题，金额无法取得或比较时为空。

**SQL 接受了结构正确的结果，不证明金额和业务判断正确。** 本地反例确认：若写入方谎报检查通过，SQL 仍可保存错误算术。服务须从固定原分项重新计算，核实完整覆盖、对应依据、税口径及问题状态后写入；本轮没有实现该计算服务。

查询列表完整、内容完整、条款适用、费用已批准是不同条件。费用决定须核实真实状态、费用项目、发生时间与金额/数量限制。施工验收签字不代替费用批准；今天失效的条款是否适用历史费用须按当时事实核实。不能因空列表就断言没有批准，也不强制全部工单补批准。

## 5. 问题、回复与解决依据

QUESTION、REPLY、FACT 分别绑定 LOCAL 人工决定 REQUEST_FEE_VERIFICATION、REPLY_FEE_VERIFICATION、RECORD_FEE_FACTS。一个实际人员动作只能绑定一次；内容、人员、授权及当时依据由原 human_decision 保留。

REPLY 必须指向同事项仍开放的 QUESTION，FACT 可以指向具体问题，也可记录本事项独立事实。回复不能指向自己或另一回复。问题与回复可各自引用不同轮比较，保留实际看到的版本，原问题不改挂新版。人工决定引用了 AI 结果时，该结果须明确关联本次比较；同一份解释不能随意复用到另一比较。

问题关闭仅允许一次由 0 变为 1，保留 closed_at、close_basis_json 和解决依据：

- COMPARISON：同事项的实际可靠比较，并说明哪些变化解决了该问题。某个问题解决时，整次比较仍可能有其他差异，无须整次 MATCHED 才能关闭单个问题。
- HUMAN_FACT：确实针对该问题的 FACT，保留有权人员核实的事实及证据。服务须验证内容足以解决原问题，不能只检查对象非空。

问题关闭后不接受新回复，不覆盖旧回复；后续新问题单独记录。关闭问题不自动批准费用、结束整个对账或执行付款。可靠新版足够解决问题时自动记录依据，无须让原应收负责人再回复一次“已修改”。

## 6. 约束分工、发布与事务

| 数据库候选已约束 | 后续服务必须核实 |
| --- | --- |
| 账单身份唯一，来源输入类型及本快照关联 | 原来源身份、授权范围、版本可靠性、账单有效状态 |
| 比较与事项、工单、服务商、快照及 Skill 范围一致 | 全部实际数据是否覆盖本次比较范围，是否为当前可发布输入 |
| 不重复选账单、不重复使用同一输入分项，组标识唯一 | billItemId 确实存在、全部必需分项覆盖、对应关系合理且适用 |
| 基本十进制字符串与 MATCHED 结构条件 | 十进制算术、原总分检查、实际一致条件；JSON 深层金额同样须校验 |
| AI 结果同事项同快照及唯一比较归属 | 该解释实际收到并使用这次固定比较，不能仅同快照就认为解释对象一致 |
| 问答同事项、开放问题、动作类型、单次关闭依据引用 | 当前有权责任人、事实有效、解决依据充分及并发时问题仍开放 |
| 历史不更新、不删除、不替换 | 数据保留期限与受控合法删除机制，防止普通业务绕过历史保护 |

1. 来源读取服务按实际记录形成固定输入与来源身份，再由确定性比较服务保存整份 comparison。execution_key 在同一次执行恢复时保持稳定；AI 重试不换算账执行身份，也不改已存金额。
2. 发布 current_reconciliation_id 时校验目标属于本事项，快照匹配当前输入、来源和配置仍有效；按事项 row_version 条件更新并检查实际更新行数。此跨表指针约束由后续服务事务实施，本轮 SQL 未实现。
3. 同一事务保存比较、问题解决依据、必要事项状态/责任和历史记录；新输入、并发决定或责任变化使发布条件失效时，保留历史结果，不推进当前指针。已完成事项不重写，影响旧结论的真实变化按事项关联创建或接续后续工作。
4. 有当前计算、AI 尚未完成或失败时，页面展示可靠计算及真实进度，不使用旧解释冒充新版。AI 结果只有经结构、证据与实际比较输入验证后，才能追加关联并发布 current_analysis_result_id。
5. 人员提交问答/事实时，在同一事务校验身份、责任版本、原问题开放状态和实际看到的比较，保存 human_decision 与 fee_verification_action、推进必要交接和记录。同一次提交重试复用稳定 request_key。
6. 回复已保存而通知或分析失败，只恢复后续执行；来源改账结果未知时等权威来源确认，不由工作台代写原应收。

## 7. 角色走查与验收边界

| 路径 | 数据与操作检查 |
| --- | --- |
| 人员打开工作台 | 直接读取当前比较、疑点及可用解释；无新增手动启动 Skill 或重填账单 |
| 京东提出核实 | 一次原问题绑定当时比较和实际决定，已有依据可直接记录事实；不重复审核全部分项 |
| 服务商回复或修订 | 回复保留原问题；需要改账仍在原系统按职责办理，取得新版后自动比较，无强制重复上传或回复 |
| 可靠新版已经一致 | 程序核实全条件后记录完成，不再要求一次结束审批 |
| 金额相同但仍有争议 | 保留原问题和未决原因，不按总额相同结束 |
| AI 失败或旧响应晚到 | 保留可靠计算和历史；旧解释不能顶替当前，成功的人工作业不重做 |

原型仍有对账结束条件简化，本域候选不证明原型或真实链路已达标。角色计数是设计中的业务决定数，旧系统完整点击次数与实际效率未测。

本域本地约束测试与结构检查证明候选 SQL 可在本地 SQLite 加载、文档字段/索引一致及所测反例被拒绝。真实 D1、十进制服务、权限、事务、通知、来源接入和正式迁移均未实现。测试中的金额仅用于格式与精度反例，不作为新增业务数据。

本域已纳入 foundation 全范围核对；后续实现按本系统接口、系统流程及 PRD 接续。
