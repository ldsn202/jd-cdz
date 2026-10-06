# 安装资料域表结构

> 版本：V1.0｜日期：2026-09-20｜状态：候选 DDL 本地 SQLite 核验；D1 与业务服务未实现
> 上游（我引用）：[处理事项域表结构](work-item-schema.md) §1、§2、§5、§8、[材料与分析证据域表结构](evidence-schema.md) §3—6、[安装资料 ER](../03-03-er/er-installation.md) §1—6、[安装工单上下文读取](../03-02-external-apis/installation-work-order-context.md) §2—5、[正式安装明细提交](../03-02-external-apis/installation-detail-submit.md) §2—5、[安装资料整理与提交](../03-04-business-flows/flow-installation-submission.md) §1—7、[变化接收与执行 ER](../03-03-er/er-change-execution.md) §5—6、[术语表](../03-01-glossary/glossary.md) §1—3、§5
> 下游（引用我）：[处理事项域表结构](work-item-schema.md) §2、[材料与分析证据域表结构](evidence-schema.md) §4、[变化接收与执行域表结构](execution-schema.md) §1—5、[表结构覆盖与一致性核对](coverage-review.md) §1—5、[安装资料与核查接口](../03-06-provided-apis/installation-apis.md) §1—4、[04-subprd-installation-materials.md](../../05-prd/04-subprd-installation-materials.md) §4、[05-subprd-installation-review.md](../../05-prd/05-subprd-installation-review.md) §4、[workbench-apis](../03-06-provided-apis/workbench-apis.md) §6—7

## 1. 范围与共同约定

本域采用六张表，候选 SQL 为 [installation-schema.sql](installation-schema.sql)，依次加载处理事项域、材料与证据域、本域。通用标识、时间、逻辑关联、未知值与合法删除约定沿用处理事项域 §1；SQLite 无专门规范，按通用工程规范和项目约定执行。本轮未运行正式迁移。

| ER 对象或需要 | 物理保存位置 |
| --- | --- |
| 安装方案、正式安装明细身份 | installation_plan、installation_detail；来源系统 + 原编号唯一，属于一个工单 |
| 本次完整工单上下文 | installation_context_snapshot；包含实际取得的方案、明细项目、独立版本、材料索引及缺项 |
| 同一资料事项的持续草稿 | installation_draft；一份当前版本指针和本地编辑版本 |
| 草稿保存及确认时的完整内容 | installation_draft_version；每个版本完整、固定，独立保留原分析和人工更正 |
| 一次正式明细提交 | installation_detail_submission；固定类型扩展，后续与 external_write_operation 共用同一 id |
| 真实提交进展和成功回执 | 后续执行域的 external_write_operation 统一保存；本域不另存一套执行状态 |
| 方案/明细的实际历史版本内容 | 已保存上下文的 context_json；AI 实际输入另由证据域保存，不靠当前来源重新拼历史 |

原系统已有明细可以完全没有本地草稿、确认或提交记录。不得伪造这些历史；原系统直接修订也按真实来源读取并核查。

**完整上下文与模型输入分开保存。** 本轮将尚未迁移的 installation_work_order.context_input_item_id 改名为 context_snapshot_id，目标改为 installation_context_snapshot.id。模型输入仅包含获准且实际送入的字段，证据仍指向 analysis_input_item。新字段与两个前域文档、候选 SQL 在同次更新，不保留双指针互相漂移。

所有表显式主键非空，UTC 毫秒由服务端写入，无默认成功、来源版本或当前时间。除草稿指针可受控推进外，本域历史禁止 UPDATE/DELETE；no_replace 同时拒绝主键或业务唯一键替换。重复请求先读取、比对并复用，不能使用 INSERT OR REPLACE。

## 2. 字段与索引

### installation_plan

原安装方案身份。来源读取服务登记；同一方案多次版本读取的实际内容由上下文快照保存。

| 字段 | 类型 | 必填 | 默认 | 含义 |
| --- | --- | --- | --- | --- |
| id | TEXT | 是 | — | 稳定本地标识；草稿版本 id 即 confirmedDraftVersion，提交 id 即 submissionId。 |
| installation_work_order_id | TEXT | 是 | — | 所属本地 installation_work_order.id，身份固定。 |
| source_system | TEXT | 是 | — | 权威来源系统。 |
| source_id | TEXT | 是 | — | 来源内方案或明细编号；不按名称合并。 |
| gmt_create | INTEGER | 是 | — | 本地保存 UTC 毫秒整数。 |
| gmt_modified | INTEGER | 是 | — | 固定历史等于创建时间。 |

索引：

- uk_installation_plan_source：installation_plan(source_system,source_id)，唯一。用于原来源身份唯一。
- idx_installation_plan_order：installation_plan(installation_work_order_id,id)。用于读取同工单的历史关联身份。

### installation_detail

原正式安装明细身份。允许直接导入且无本地草稿或提交历史；正式内容由来源快照及提交成功证据保存。

| 字段 | 类型 | 必填 | 默认 | 含义 |
| --- | --- | --- | --- | --- |
| id | TEXT | 是 | — | 稳定本地标识；草稿版本 id 即 confirmedDraftVersion，提交 id 即 submissionId。 |
| installation_work_order_id | TEXT | 是 | — | 所属本地 installation_work_order.id，身份固定。 |
| source_system | TEXT | 是 | — | 权威来源系统。 |
| source_id | TEXT | 是 | — | 来源内方案或明细编号；不按名称合并。 |
| gmt_create | INTEGER | 是 | — | 本地保存 UTC 毫秒整数。 |
| gmt_modified | INTEGER | 是 | — | 固定历史等于创建时间。 |

索引：

- uk_installation_detail_source：installation_detail(source_system,source_id)，唯一。用于原来源身份唯一。
- idx_installation_detail_order：installation_detail(installation_work_order_id,id)。用于读取同工单的历史关联身份。

### installation_context_snapshot

一次实际上下文读取的固定记录，供页面核实、草稿依据及版本比较。来源适配服务核验后写入；字段不完整也保留原缺失状态，不把组合读取当成来源事务快照。

| 字段 | 类型 | 必填 | 默认 | 含义 |
| --- | --- | --- | --- | --- |
| id | TEXT | 是 | — | 稳定本地标识；草稿版本 id 即 confirmedDraftVersion，提交 id 即 submissionId。 |
| installation_work_order_id | TEXT | 是 | — | 本地工单引用。 |
| service_provider_id | TEXT | 是 | — | 本次来源核实的服务商；不把旧快照重新归属给新服务商。 |
| source_work_order_version | TEXT | 否 | NULL | 真实工单版本，未知为 NULL。 |
| installation_plan_id | TEXT | 否 | NULL | 已取得的本地方案身份，可为空。 |
| source_plan_version | TEXT | 否 | NULL | 该次方案版本，可未知。 |
| installation_detail_id | TEXT | 否 | NULL | 已取得的本地正式明细身份，可为空。 |
| source_detail_version | TEXT | 否 | NULL | 该次正式明细版本，可未知。 |
| detail_status | TEXT | 是 | — | 来源核实的提交状态；未知不能用于首次提交。 |
| completeness | TEXT | 是 | — | 读取完整性，对应 context_json.completeness。 |
| missing_parts_json | TEXT | 是 | — | 来源缺项清单，完整时 []；不得把未知值改为默认值。 |
| context_json | TEXT | 是 | — | 完整契约 data，包括工单、方案、明细、材料索引、来源版本与缺项。按原字段和值保存，不存认证包装。 |
| retrieved_at | INTEGER | 是 | — | 契约 retrievedAt 转为 UTC 毫秒，不能晚于本地保存。 |
| gmt_create | INTEGER | 是 | — | 本地保存 UTC 毫秒整数。 |
| gmt_modified | INTEGER | 是 | — | 固定历史等于创建时间。 |

索引：

- idx_installation_context_order：installation_context_snapshot(installation_work_order_id,gmt_create,id)。用于按工单读取每次上下文，时间排序不推断来源版本新旧。
- idx_installation_context_plan：installation_context_snapshot(installation_plan_id,source_plan_version,id)。用于定位某方案版本的实际读取内容。
- idx_installation_context_detail：installation_context_snapshot(installation_detail_id,source_detail_version,id)。用于定位正式明细版本与当时内容。

### installation_draft

同一资料整理事项的一份持续草稿，当前指针由保存服务按版本条件推进。新分析候选不直接覆盖人员编辑。

| 字段 | 类型 | 必填 | 默认 | 含义 |
| --- | --- | --- | --- | --- |
| id | TEXT | 是 | — | 稳定本地标识；草稿版本 id 即 confirmedDraftVersion，提交 id 即 submissionId。 |
| work_item_id | TEXT | 是 | — | 唯一所属安装资料整理事项。 |
| current_version_id | TEXT | 是 | — | 本草稿当前固定 installation_draft_version.id；不保存可变 items 副本。 |
| row_version | INTEGER | 是 | — | 本地编辑并发版本，从 1 开始；更新必须加 1。 |
| gmt_create | INTEGER | 是 | — | 本地保存 UTC 毫秒整数。 |
| gmt_modified | INTEGER | 是 | — | 本地最后更新 UTC 毫秒。 |

索引：

- uk_installation_draft_item：installation_draft(work_item_id)，唯一。用于同一事项最多一份持续草稿。

### installation_draft_version

一次保存的完整草稿内容。后台整理或人员保存产生固定新版本，原分析不被修改；与草稿指针更新在同一事务。

| 字段 | 类型 | 必填 | 默认 | 含义 |
| --- | --- | --- | --- | --- |
| id | TEXT | 是 | — | 稳定本地标识；草稿版本 id 即 confirmedDraftVersion，提交 id 即 submissionId。 |
| installation_draft_id | TEXT | 是 | — | 所属草稿 id；初版先写版本后建草稿。 |
| work_item_id | TEXT | 是 | — | 所属事项，与草稿及分析同范围。 |
| version_no | INTEGER | 是 | — | 草稿内连续本地序号，不代替来源版本。 |
| parent_version_id | TEXT | 否 | NULL | 上一当前草稿版本；初版为空。 |
| analysis_result_id | TEXT | 是 | — | 整理起点的 analysis_result.id，Skill 必为 INSTALLATION_EXTRACTION。 |
| context_snapshot_id | TEXT | 是 | — | 本次核实使用的完整安装上下文，允许尚有缺项。 |
| origin | TEXT | 是 | — | 本次保存来自后台候选还是人员编辑；人工更正不得显示为 AI 原文。 |
| editor_identity_id | TEXT | 否 | NULL | HUMAN 必填实际编辑人员；AI 为空，程序执行主体由执行记录保存。 |
| items_json | TEXT | 是 | — | 整份实际安装草稿，可有 null 与空列表，未知不填零；字段为 installedQuantity。 |
| source_materials_json | TEXT | 是 | — | 本次实际采用的确切材料来源与版本；尚缺材料在问题中说明。 |
| open_questions_json | TEXT | 是 | — | 仍未解决的事实、资料与关联问题；填满表单不代表必需材料已齐。 |
| edit_notes_json | TEXT | 是 | — | 字段位置、修改前后、原因和依据引用；系统核对人工修改并保留原值，不能让前端伪造。 |
| save_key | TEXT | 是 | — | 服务端保存动作的稳定编号；同草稿重放复用原内容。 |
| gmt_create | INTEGER | 是 | — | 本地保存 UTC 毫秒整数。 |
| gmt_modified | INTEGER | 是 | — | 固定历史等于创建时间。 |

索引：

- uk_installation_draft_version_number：installation_draft_version(installation_draft_id,version_no)，唯一。用于并发保存不能占用同一个版本序号。
- uk_installation_draft_version_save：installation_draft_version(installation_draft_id,save_key)，唯一。用于同一次保存不多建历史。
- idx_installation_draft_version_analysis：installation_draft_version(analysis_result_id,id)。用于追溯人工版本的原整理依据。
- idx_installation_draft_version_context：installation_draft_version(context_snapshot_id,id)。用于定位上下文变化影响的草稿版本。

### installation_detail_submission

一次人员确认的固定明细提交扩展。与后续 external_write_operation 共用 id；本表保存唯一的明细请求正文，不重复保存执行状态或回执。

| 字段 | 类型 | 必填 | 默认 | 含义 |
| --- | --- | --- | --- | --- |
| id | TEXT | 是 | — | 稳定本地标识；草稿版本 id 即 confirmedDraftVersion，提交 id 即 submissionId。 |
| human_decision_id | TEXT | 是 | — | 一次 LOCAL / SUBMIT_INSTALLATION 确认，最多一笔提交。 |
| draft_version_id | TEXT | 是 | — | 人员确认的固定版本 id，不随草稿当前版本漂移。 |
| work_item_id | TEXT | 是 | — | 原资料整理事项。 |
| installation_work_order_id | TEXT | 是 | — | 目标本地工单。 |
| service_provider_id | TEXT | 是 | — | 确认时服务商范围。 |
| target_source_system | TEXT | 是 | — | 真实目标来源，与工单权威来源一致；映射须受控核实。 |
| request_json | TEXT | 是 | — | 正式提交契约完整 body；源工单路径从固定工单引用取得，不能用本地 id 冒充来源编号。 |
| gmt_create | INTEGER | 是 | — | 本地保存 UTC 毫秒整数。 |
| gmt_modified | INTEGER | 是 | — | 固定历史等于创建时间。 |

索引：

- uk_installation_detail_submission_decision：installation_detail_submission(human_decision_id)，唯一。用于一个人员确认只绑定一笔稳定提交。
- idx_installation_detail_submission_order：installation_detail_submission(installation_work_order_id,gmt_create,id)。用于读取工单提交历史；未决保护由执行域跨入口统一实现。
- idx_installation_detail_submission_version：installation_detail_submission(draft_version_id,id)。用于追溯同一版本的不同有效确认与结果。

## 3. 来源身份、版本与完整上下文

### 3.1 身份与历史内容

方案和正式明细各自保留来源身份，已有记录改版不新建一个业务身份。另一来源的同号记录不自动合并；不同原编号之间的替换关系需要来源证据。工单可有多个历史方案/明细身份，当前读取结果只能指明一份当前方案和至多一份当前明细；多个无法辨明有效性的记录应报告来源冲突，不能挑选一份拼成有效上下文。

context_json 保存安装工单上下文读取契约的整个 data，包含 retrievedAt、completeness、missingParts、installationWorkOrder、installationPlan、installationDetailStatus、installationDetail、sourceMaterialIndexComplete、sourceMaterials。表中独立版本、状态、关联 id 和缺项字段是用于查询和约束的投影；来源适配服务必须逐项核实和原 JSON 一致，不能接受客户端自报“完整”。

上下文快照按实际读取事件固定，未对来源版本做唯一索引：同版本可能先读取不完整、后来补齐，或多次被确认引用。已知同一对象同版本的确定字段相互矛盾时须记录来源异常并停止相关确认，不能按取数时间自动覆盖。原版本不透明，只判相等；来源更新时间与本地时间分开。上下文取得完整也不证明多个来源同一时点一致。

方案 items 使用 plannedQuantity；正式明细 items 使用 installedQuantity。数量、单位、供料方和范围必须保留实际含义与未知值。无稳定来源行 id 时可按该固定快照中的数组位置定位，但不能把位置当跨版本业务行身份。同名或同数值项目是否对应由业务规则核实。

### 3.2 取得状态与当前引用

| 来源状态 | 快照保存 | 提交含义 |
| --- | --- | --- |
| 证实未提交 | detail_status=NOT_SUBMITTED，明细 id、版本及原对象为空 | 可按首次提交条件继续核实，expectedDetailVersion 才可为 null |
| 已提交且取得当前明细 | SUBMITTED，保存原身份、版本与实际内容 | 只有允许修订且当前版本仍成立时可提交 |
| 已提交但没取得内容/版本 | SUBMITTED，保留缺项、已知身份与未知版本 | 暂停依赖这些信息的确认 |
| 提交状态无法核实 | UNKNOWN，快照不完整 | 不得作为“首次提交” |
| 方案或材料索引不完整 | 保留实际内容和缺项 | 先处理必要缺项，不用旧方案或空索引补全 |
| 来源拒绝访问或工单读取失败 | 记录执行错误，本次不产生可用上下文 | 不伪装为空数据或普通缺项 |

SQL 检查 COMPLETE 的必要投影、缺项列表空与非空、NOT_SUBMITTED 无明细、关联方案/明细属于同一工单。它不验证 context_json 内部所有字段；测试保留“{} 可直接写入”的反例，明确适配服务与权限校验必须存在。

installation_work_order.context_snapshot_id 是最近可靠且适用的上下文引用。更新时核实同一工单、来源身份、当前服务商、已读取的版本及预期本地条件；不能盲选 gmt_create 最大值。来源服务商变化不迁移旧快照或旧决定。原始内容及缓存同样受当前权限约束。

模型准备从完整上下文中选取必要且获准的字段，写入 analysis_input_item.data_json；只引用这份实际模型输入作分析证据。服务端保留选取关系，草稿的 context_snapshot_id 明确当时核实依据；不要求整份上下文都发送给 AI。原文/原记录查看可以回到该上下文，并核验人员的当前权限。

## 4. 草稿与编辑并发

### 4.1 完整版本

草稿初建须至少一份版本；先插入 installation_draft_version 的初版，再插入 installation_draft，必须同一事务提交。每个版本对应本事项的 INSTALLATION_EXTRACTION 分析，保留其固定 id；新的人工内容不会覆盖 analysis_result。

items_json 每行使用 installationItem、installedQuantity、unit、materialSupplier、serviceScope，与正式明细的实际安装含义一致。草稿可保存尚未核实的 null、空项目列表及 open_questions；服务端校验结构、字段类型与缺项，未知不填零。方案量、权益上限、计费数量不能直接作为 installedQuantity。

source_materials_json 保存 sourceSystem、sourceMaterialId、sourceVersion 三个非空字段组成的确切引用，无文件为 []。无法取得必要材料或版本时在问题中保留，不能制造“未知版本”附件。材料对应关系与实际解析仍沿证据域追溯。

HUMAN 版本必须记录实际 editor_identity_id；AI 版本的此字段为空，程序身份从执行记录查。edit_notes_json 记录本版本相对 parent_version_id 的变化：项目在固定数组中的位置、字段、旧值、新值、实际核实依据及必要说明。服务端生成差异，不能让人员修改被标成 AI 提取，也不要求为每个字段额外填一张审批表。

### 4.2 保存顺序

1. 读取草稿当前 row_version 和 current_version_id，核验当前编辑权限、事项未结束及未决写入。
2. 插入新固定版本：version_no=上一版本+1，parent_version_id=读取到的当前版本；完整保存当前全部内容。
3. 带旧 row_version 条件推进草稿指针和版本；更新必须恰好一行。
4. 写入必要处理记录，同一原子事务提交。任何失败全部回滚。

SQL 防止重复版本、越级父版本和跨草稿指针。带条件 UPDATE 返回零行仍需将整个保存事务判为失败；不能留下新版本后再在事务外报错。单独运行 INSERT 仍可能产生未被采用版本，DDL 不自动把多语句变成一个事务。

新分析完成时，候选仍保存在新的 analysis_result。若人员正在编辑，不直接改写其当前草稿；展示变化并按预期编辑版本合并后保存。无法满足旧版本条件时保留人员未保存内容并提示冲突，不自动丢弃。save_key 相同且内容相同才可复用原结果，同号换内容拒绝。

原事项存在未决外部写入时，禁止插入新草稿版本或推进已暂存版本；页面可保留本地未保存意见，但不能换版本绕过原动作。提交终态核实后按原系统允许条件继续修订，已完成事项的新范围由关联事项承接。

## 5. 一次人员确认与一次提交

### 5.1 固定请求

installation_detail_submission.request_json 是明细提交类型的唯一权威请求正文。human_decision.content_json 保留当时完整确认事实，必须与其相同；后续 external_write_operation 对此正文引用与校验，不再维护可独立修改的副本。

请求包含 submissionId、humanDecisionId、installationDraftId、confirmedDraftVersion、expectedWorkOrderVersion、expectedPlanVersion、expectedDetailVersion、完整 items 与 sourceMaterials。confirmedDraftVersion 使用固定草稿版本 id（非空字符串）；version_no 仅用于本地排序。

JSON 比对采用固定的服务端序列化格式与字段顺序。SQL json() 归一化空白后按文本比较，不能独自识别对象键顺序不同但语义相同的任意客户端 JSON。因此正文由服务端从已保存版本组装，人员请求不能直接携带自由拼装的正式写入 body。数字保持实际值和约定精度，不用 SQLite 浮点计算施工量或费用。

SQL 已检查完整 items 至少一项且不超过既有开发上限 100 项；各行安装项目、单位、供料方、范围非空，installedQuantity 为有限非负数，禁止夹带 plannedQuantity。浮点有限性检查仅排除溢出成无穷的数字，不构成允许的业务量级上限；业务量级、精度和零数量的适用条件由原系统及服务端规则核实。

### 5.2 受理前的同一范围

固定提交必须满足：

- 草稿当前版本、人员实际确认版本和全部 items/材料引用相同，草稿无未解决问题。
- 工单、服务商、事项与草稿上下文一致；人员确认动作是 LOCAL / SUBMIT_INSTALLATION，分析依据与草稿整理起点一致。
- 工单及方案的预期版本均已知；首次提交已证实 NOT_SUBMITTED，修订引用原明细的确切版本。
- 当前事项及责任版本与确认时一致，当前责任人和当次权限允许提交，来源工单仍属于同一服务商。
- 原材料、方案、明细、安装权益及必要依据仍适用；context COMPLETE 和填满表单不能代替当前业务条件。
- 原系统允许该次写入，具备条件写入、去重及可关联回查；本地约束不能阻止原系统其他入口并发修改。

SQL 实现以上同范围、内容、版本和动作的部分结构条件；真实人员身份、当前责任人、授权和源端条件仍须服务端核验。NEEDS_INFORMATION 的原分析可以作为人工补齐的历史起点，只有其实际必要缺项已被解决才能提交；不能机械要求每次人工编辑都重跑 AI，也不能跳过未取得的必要材料。

### 5.3 与执行域只保留一笔操作

本域提交 id、对外 submissionId、后续 external_write_operation.id 使用同一稳定编号。execution 域须为 SUBMIT_INSTALLATION 类型一对一关联本表，保存状态、回查证据、执行尝试及唯一工单未决保护；本表不另存 PENDING / SUCCEEDED。

登记提交时必须同事务保存人工确认、此固定请求扩展、外部操作、必要执行/恢复任务和未决保护，再发出任何外部调用。SQL 已检查 work_item.pending_write_id，但这只覆盖当前事项；同工单的核查、补充和另一个资料事项须由后续执行域统一锁定，当前候选不能独立满足跨入口并发保护。

同一个确认只有一笔提交；不同有效确认可再次确认同一草稿版本，但前一笔必须已经可靠终结，不能因超时重新建确认或编号。重放读取原操作，不按它已成功改变的旧预期版本重新判失败。no_replace 拒绝重复插入不等于 API 直接报错，服务端应在权限核实后返回已保存的同内容操作。

### 5.4 结果与正式明细版本

| 执行域结果 | 本域读取与衔接 |
| --- | --- |
| PENDING / PROCESSING | 确认与请求固定，等待原动作；不再发另一笔明细 |
| PENDING / RESULT_UNKNOWN | 按原编号只读回查，不以一般工单暂未查到明细判失败 |
| REJECTED | 有可靠证据证明未写入；保留原确认及拒绝结果，再按允许条件重新核实 |
| SUCCEEDED | 外部操作保存可关联本次请求的正式明细来源、编号、确切版本和 verifiedAt；内容必须与本次确认对应 |
| 成功后核查接续失败 | 成功事实不回退；恢复本地核查事项及分析，不重写明细 |

SUCCEEDED 的明细 id/版本由执行域回执指向 installation_detail 的原身份和确切来源版本，不能只保存“当前明细”。可关联原请求与明细读取内容共同构成成功依据，旧成功回执不随后来的修订更新。原明细正式项目来自原系统；仅有本地草稿不能伪造原系统成功内容。

服务商资料事项仅在可靠提交成功后完成；京东核查事项独立接续，不表示安装审核通过。后续事项以提交编号或可靠正式明细版本去重；执行域需保留成功与本地接续状态，避免重复要求人员办理。

## 6. 约束分工与角色走查

| 内容 | 数据库可验证 | 后续服务端/执行域必须验证 |
| --- | --- | --- |
| 来源身份和上下文 | 来源唯一、关联工单、状态投影及已知版本条件 | 原响应全部字段、投影一致性、真实来源及当前有效性 |
| 草稿 | 每事项一份、固定版本、顺序、父版本、分析类型、局部未决保护 | 实际编辑人、完整数组结构、自动差异、旧页面冲突与原子保存 |
| 正式提交内容 | 一确认一提交、当前版本、已确认全文一致、实际量及必要字段 | 材料来源/版本、字段精度、业务允许范围、空值解决依据 |
| 人员决定 | 动作类别与本地范围/版本匹配 | 可信身份、当前具体责任人、当次授权、来源账号和撤权 |
| 并发与恢复 | 本域不能单独防止另一事项写同工单 | 跨入口唯一未决动作、任务持久化、源端条件写入和可靠回查 |
| 历史 | 固定版本与来源引用保留，不允许正常删除或替换 | 当前权限、合法保存期、受控删除与敏感内容展示 |

服务商资料人员读取已整理草稿、核实差异、确认一次；系统负责保存版本与提交恢复。京东核查人员接收真实正式明细和已准备的证据，无需服务商在旧系统再录一遍。原系统已有明细直接接入核查，不补造一次资料提交。存储结构未增加业务角色、人工审批或重复填写。

查询按工单/事项读取当前指针，再按版本读取内容与依据；跨域查询分步完成，避免超过三表联查。历史页面只能按当前权限访问，禁止以历史快照绕过源数据范围。

正常流程的不可删不等于无限期保留。全域保存期限、合法删除与文件清理在实施前统一定义；不能级联删掉当时的人工决定，也不能用普通数据库替换消除拒绝或提交历史。

## 7. 验证与后续

本域本地 SQLite 检查覆盖来源隔离、完整上下文与模型输入分离、草稿未知值、连续保存、版本冲突、待确认写入、一确认一提交、首次/修订区别、已保存全文一致、有限实际量、历史与事务回滚。结构反例明确 JSON 顶层检查无法证明来源内容可靠。

已发现并修正两个反例：1e999 形式的合法 JSON 数字可能超出有限数值范围；已有候选版本在外部写入开始后仍可能推进当前草稿。补齐数值上界检查与草稿推进时的未决/完成状态检查后重跑。

本地检查不等于 D1、服务端事务、文件/模型接入或真实业务提交已完成。安装上下文替换了前域候选指针，未改变原型或 BRD 正文，两个前域仍须回归验证。

本域已纳入 foundation 全范围核对；后续实现按本系统接口、系统流程及 PRD 接续。
