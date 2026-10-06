# 材料与分析证据域表结构

> 版本：V1.0｜日期：2026-09-20｜状态：候选结构，本地 SQLite 核验；D1 和业务服务未实现
> 上游（我引用）：[处理事项域表结构](work-item-schema.md) §1、§2、§8、[材料与分析证据 ER](../03-03-er/er-evidence.md) §1—6、[能力调用 ER](../03-03-er/er-change-execution.md) §4、[原始材料读取](../03-02-external-apis/source-material-read.md) §2—5、[AI 推理与材料解析](../03-02-external-apis/ai-inference-material-parsing.md) §2—5、[安装核查与补充](../03-04-business-flows/flow-installation-review.md) §1—7、[术语表](../03-01-glossary/glossary.md) §1、§5、[安装资料域表结构](installation-schema.md) §3、[接入配置域表结构](integration-config-schema.md) §4
> 下游（引用我）：[安装资料域表结构](installation-schema.md) §1—7、[双方账单与对账依据域表结构](reconciliation-schema.md) §1—7、[接入配置域表结构](integration-config-schema.md) §1—7、[变化接收与执行域表结构](execution-schema.md) §1—5、[表结构覆盖与一致性核对](coverage-review.md) §1—5、[材料预览与上传接口](../03-06-provided-apis/material-apis.md) §1—3、[02-subprd-orders-history.md](../../05-prd/02-subprd-orders-history.md) §4、[04-subprd-installation-materials.md](../../05-prd/04-subprd-installation-materials.md) §4、[05-subprd-installation-review.md](../../05-prd/05-subprd-installation-review.md) §4、[sys-analysis-preparation](../03-07-system-flows/sys-analysis-preparation.md) §5；[mock T3.2子计划](../../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T3.2-backend-adapters.md) PRD双链·读

## 1. 范围与存储选择

候选 SQL：[evidence-schema.sql](evidence-schema.sql)，在处理事项域候选 SQL 后加载。本域沿用其 §1 的 SQLite、逻辑关联、UTC 毫秒、显式未知值、固定历史与受控删除约定。该技术栈无专门规范，按通用工程规范与项目约定执行；本轮不创建正式 migration。

本域六张物理表承载九类逻辑实体；work_item 已由前域定义。本次将解析块、分析发现及证据引用作为所属结果的固定 JSON 保存，避免一份已采用结果被逐条增删。代价是 JSON 内部结构、语义和引用须由服务端校验，不能只依赖 SQL 的顶层类型检查。

| ER 逻辑实体 | 存储位置与稳定寻址 |
| --- | --- |
| source_material | 同名表，本地 id 与来源编号分开 |
| source_material_version | 同名表，来源材料 + 确切版本唯一 |
| material_parsing | 同名表，id 对应 parseId |
| parsed_content_block | material_parsing.blocks_json，按 parseId + blockId 定位 |
| analysis_input_snapshot | 同名表，id 对应 inputSnapshotId |
| analysis_input_item | 同名表；id 为本地引用，snapshot_id + input_key 对应接口引用 |
| analysis_result | 同名表，按本地结果 id 固定历史 |
| analysis_finding | analysis_result.findings_json，按结果 id + findingId 定位 |
| evidence_reference | finding.evidenceRefs 数组，按结果 id + findingId + 数组位置固定读取 |

JSON 集合必须有界。原文件字节放受控文件存储，不放 D1 行或 JSON。解析、输入和结果超过实际运行环境行大小或请求限制时停止采用并保留失败；不得截断后仍标完整。解析/结果的容量配置与大文件分片策略须在实现前实测，当前没有生产容量承诺。

所有表包含 id、gmt_create、gmt_modified；均无自动当前时间或业务成功默认值。字段表中的“必填”为 NOT NULL，条件必填见说明及 SQL。正常写入使用 INSERT、明确限定的一次版本补齐 UPDATE；禁止 INSERT OR REPLACE。本域另以 no_replace 触发器拒绝主键或业务唯一键冲突，避免替换语义删除旧历史。重复请求须先比较原内容，复用或返回冲突。

## 2. 字段与索引

### source_material

文件的稳定来源身份。来源适配服务首次登记，文件预览与解析沿此身份查找；共享材料不强制归属单一服务商。

| 字段 | 类型 | 必填 | 默认 | 含义 |
| --- | --- | --- | --- | --- |
| id | TEXT | 是 | — | 稳定本地编号；解析 id 对应 parseId，快照 id 对应 inputSnapshotId。 |
| source_system | TEXT | 是 | — | 可靠来源系统。 |
| source_material_id | TEXT | 是 | — | 来源内材料编号；未知版本仅停留在此索引，不制造未知版本记录。 |
| gmt_create | INTEGER | 是 | — | 本地创建 UTC 毫秒整数。 |
| gmt_modified | INTEGER | 是 | — | 固定历史等于创建时间。 |

索引：

- uk_source_material_source：source_material(source_system,source_material_id)，唯一。用于同来源同文件唯一，不按名称合并。

### source_material_version

确定的来源版本及一次核实的完整内容。读取服务登记或一次补齐，后续解析与原文预览读取；失败、当前可访问性和每次重读留给执行域。

| 字段 | 类型 | 必填 | 默认 | 含义 |
| --- | --- | --- | --- | --- |
| id | TEXT | 是 | — | 稳定本地编号；解析 id 对应 parseId，快照 id 对应 inputSnapshotId。 |
| source_material_id | TEXT | 是 | — | 本地 source_material.id；与来源编号字段同名时按所属表区分。 |
| source_version | TEXT | 是 | — | 非空且不透明的来源版本，仅判相等。 |
| read_state | TEXT | 是 | — | REFERENCED 尚未取得正文；VERIFIED 已核实完整字节与版本。 |
| name | TEXT | 否 | NULL | 此版本文件名，仅展示。 |
| media_type | TEXT | 否 | NULL | PDF、PNG、JPEG 或 XLSX 的实际 MIME；核实后必填。 |
| byte_length | INTEGER | 否 | NULL | 完整原字节数；核实后为正整数。 |
| content_sha256 | TEXT | 否 | NULL | 完整字节摘要；不替代来源版本或业务真实性。 |
| content_locator | TEXT | 否 | NULL | 受控文件存储中的固定对象引用，不存临时下载 URL、公开地址或令牌。 |
| retrieved_at | INTEGER | 否 | NULL | 本次取得完整原文的 UTC 毫秒；核实后必填。 |
| source_updated_at | INTEGER | 否 | NULL | 来源提供的更新时间，可未知；不由本地时间补造。 |
| gmt_create | INTEGER | 是 | — | 本地创建 UTC 毫秒整数。 |
| gmt_modified | INTEGER | 是 | — | 本地变更 UTC 毫秒；只有首次取得完整文件可更新。 |

索引：

- uk_source_material_version_source：source_material_version(source_material_id,source_version)，唯一。用于一份材料一个来源版本只保留一套核实内容。

### material_parsing

一次能力调用所采用的固定解析结果。解析服务校验后保存；预览定位与分析选取复用。调用失败不写本表。

| 字段 | 类型 | 必填 | 默认 | 含义 |
| --- | --- | --- | --- | --- |
| id | TEXT | 是 | — | 稳定本地编号；解析 id 对应 parseId，快照 id 对应 inputSnapshotId。 |
| run_id | TEXT | 是 | — | 后续 capability_call.run_id；一次解析调用最多采用一份结果。 |
| source_material_version_id | TEXT | 是 | — | 确切 source_material_version.id，必须已 VERIFIED。 |
| content_sha256 | TEXT | 是 | — | 实际送解析的原文件摘要，必须与固定版本一致。 |
| profile_id | TEXT | 是 | — | 已登记解析配置编号。 |
| implementation_version | TEXT | 是 | — | 调用实际使用的实现版本，与后续能力调用登记一致。 |
| completeness | TEXT | 是 | — | 解析覆盖完整性，不表示资料齐全或业务批准。 |
| units_json | TEXT | 是 | — | 原页面、图片、全部 sheet 清单及覆盖状态，至少一项。 |
| blocks_json | TEXT | 是 | — | 带位置的解析内容块；真实空白可为空数组。 |
| issues_json | TEXT | 是 | — | 未解析、位置不可靠等问题；INCOMPLETE 时至少一项。 |
| gmt_create | INTEGER | 是 | — | 本地创建 UTC 毫秒整数。 |
| gmt_modified | INTEGER | 是 | — | 固定历史等于创建时间。 |

索引：

- uk_material_parsing_run：material_parsing(run_id)，唯一。用于相同 runId 重复响应不产生另一采用结果。
- idx_material_parsing_version：material_parsing(source_material_version_id,gmt_create,id)。用于按材料版本读取解析历史。

### analysis_input_snapshot

一次实际分析输入的封存记录。分析准备服务先写全部输入项、最后写快照；同一事务提交后才可用于调用。

| 字段 | 类型 | 必填 | 默认 | 含义 |
| --- | --- | --- | --- | --- |
| analysis_generation | INTEGER | 是 | 1 | 封存时事项的分析输入代次；发布时须与 work_item.analysis_generation 一致，独立于普通进展更新的 row_version |
| id | TEXT | 是 | — | 稳定本地编号；解析 id 对应 parseId，快照 id 对应 inputSnapshotId。 |
| work_item_id | TEXT | 是 | — | 所属 work_item.id，不因补充另造事项。 |
| service_provider_id | TEXT | 是 | — | 当时事项 service_provider.id；服务端核实一致，不代表共享材料的唯一所有者。 |
| expected_work_item_version | INTEGER | 是 | — | 固定输入时的事项 row_version；用于发布条件核验。 |
| skill | TEXT | 是 | — | 四类已登记 Skill 之一。 |
| skill_version | TEXT | 是 | — | 本次固定 Skill 版本。 |
| output_schema_version | TEXT | 是 | — | 该 Skill 的输出结构版本。 |
| config_versions_json | TEXT | 是 | — | 本次实际使用的接入配置等固定编号、版本、范围；无依赖为 []，未知不可省略。 |
| required_input_state | TEXT | 是 | — | 按登记规则检查必需输入的结果，缺失或解析不足为 INCOMPLETE，无法核实为 UNKNOWN。 |
| input_issues_json | TEXT | 是 | — | 缺项、不完整及未知状态；非 COMPLETE 必须列明。 |
| input_item_count | INTEGER | 是 | — | 封存时输入项数量，与本快照已有输入行数一致。 |
| content_sha256 | TEXT | 是 | — | 对实际输入、配置和版本形成的确定摘要，由服务端按固定序列化规范计算。 |
| gmt_create | INTEGER | 是 | — | 本地创建 UTC 毫秒整数。 |
| gmt_modified | INTEGER | 是 | — | 固定历史等于创建时间。 |

索引：

- idx_analysis_input_snapshot_item：analysis_input_snapshot(work_item_id,gmt_create,id)。用于读取事项历次输入快照，不按摘要自动合并不同准备事件。

### analysis_input_item

快照的一份实际输入。准备服务与封存事务写入；证据按快照与 input_key 定位，工单上下文按本地 id 引用。

| 字段 | 类型 | 必填 | 默认 | 含义 |
| --- | --- | --- | --- | --- |
| id | TEXT | 是 | — | 稳定本地编号；解析 id 对应 parseId，快照 id 对应 inputSnapshotId。 |
| snapshot_id | TEXT | 是 | — | 所属 analysis_input_snapshot.id；在同一事务中先写输入，再插入快照。 |
| input_key | TEXT | 是 | — | RECORD 的 records.inputId 或 PARSED_MATERIAL 的 parseId，共用快照内命名空间。 |
| input_kind | TEXT | 是 | — | 业务记录或固定解析引用，两个分支互斥。 |
| record_type | TEXT | 否 | NULL | RECORD 必填；原记录变化契约登记的记录类别。 |
| source_system | TEXT | 否 | NULL | RECORD 必填；原记录来源。 |
| source_record_id | TEXT | 否 | NULL | RECORD 必填；来源内编号。 |
| source_version | TEXT | 否 | NULL | RECORD 的真实源版本，可未知；解析分支为空。 |
| data_json | TEXT | 否 | NULL | RECORD 必填 object，保存本次实际输入字段；PARSED_MATERIAL 为空。 |
| parsing_id | TEXT | 否 | NULL | PARSED_MATERIAL 必填 material_parsing.id，且 input_key 等于该值。 |
| retrieved_at | INTEGER | 是 | — | 本次取得记录或选用已有解析的本地 UTC 毫秒；不改写解析的原读取时间。 |
| gmt_create | INTEGER | 是 | — | 本地创建 UTC 毫秒整数。 |
| gmt_modified | INTEGER | 是 | — | 固定历史等于创建时间。 |

索引：

- uk_analysis_input_item_key：analysis_input_item(snapshot_id,input_key)，唯一。用于记录 inputId 与 parseId 在同一快照内共同唯一。
- idx_analysis_input_item_parsing：analysis_input_item(parsing_id,snapshot_id)。用于查受解析或材料变化影响的快照。
- idx_analysis_input_item_source：analysis_input_item(source_system,record_type,source_record_id,snapshot_id)。用于查受来源记录变化影响的快照。

### analysis_result

一次分析调用经结构与引用校验后采用的固定输出。分析服务保存，人员页面和历史决定读取。当前显示由 work_item 的指针控制。

| 字段 | 类型 | 必填 | 默认 | 含义 |
| --- | --- | --- | --- | --- |
| id | TEXT | 是 | — | 稳定本地编号；解析 id 对应 parseId，快照 id 对应 inputSnapshotId。 |
| run_id | TEXT | 是 | — | 后续 capability_call.run_id；同一调用最多采用一份输出。 |
| work_item_id | TEXT | 是 | — | 必须与输入快照的事项一致。 |
| snapshot_id | TEXT | 是 | — | 唯一一份固定输入快照；Skill 与配置版本从该快照读取。 |
| profile_id | TEXT | 是 | — | 本次登记的模型配置。 |
| implementation_version | TEXT | 是 | — | 本次实际模型/适配实现版本。 |
| status | TEXT | 是 | — | 分析状态，不使用批准、付款或审核完成状态。 |
| summary | TEXT | 是 | — | 面向当前人员的结果概述，明确事实与缺项。 |
| findings_json | TEXT | 是 | — | 固定 findings，包含每条发现 content 及全部 evidenceRefs；无可靠依据可为空。 |
| open_questions_json | TEXT | 是 | — | 待核实问题；NEEDS_INFORMATION 时至少一项。 |
| validated_at | INTEGER | 是 | — | 服务端完成结构和引用校验的 UTC 毫秒，不代表业务批准。 |
| gmt_create | INTEGER | 是 | — | 本地创建 UTC 毫秒整数。 |
| gmt_modified | INTEGER | 是 | — | 固定历史等于创建时间。 |

索引：

- uk_analysis_result_run：analysis_result(run_id)，唯一。用于相同调用只能采用一份结果，重复响应复用原记录。
- idx_analysis_result_item：analysis_result(work_item_id,gmt_create,id)。用于读取事项历次分析及人工决定当时依据。
- idx_analysis_result_snapshot：analysis_result(snapshot_id,gmt_create,id)。用于定位同一快照的不同调用结果。

## 3. 材料、解析与原文定位

### 3.1 确切版本与文件取得

来源尚未给出版本时，只登记 source_material，并在输入缺项或执行失败中保留原因。取得确切来源版本后可登记 REFERENCED；只有核实完整字节、实际类型、来源版本对应和摘要，才一次补齐为 VERIFIED，也允许首次直接插入已核实版本。REFERENCED 的内容字段全部为空。

固定内容含文件名、类型、字节数、摘要、受控文件引用及取得时间。VERIFIED 后任何 UPDATE 均被拒绝；同来源版本重读取得另一摘要是异常，不能覆盖。source_updated_at 是来源时间，可空，不和本地创建时间强行排序。解析创建不得早于版本核实，选用解析不得早于解析保存，结果校验不得早于快照封存；SQL 检查这些本地时间关系。

content_locator 指向保存的固定内容对象，文件存储实现尚未选择或接通。记录 locator 并不证明文件真的存在；只有文件写入成功且重新校验后才能保存 VERIFIED。当前文件被移除、权限变化或缓存不可用由后续执行/访问检查记录，不能将 VERIFIED 解释为“此刻所有人可读”。原件不可取得时明确提示，不能用新版本替换旧引用。

### 3.2 解析整体结构

units_json 与 blocks_json 原样承接 AI 契约。服务端在保存前检查以下内部结构；SQL 只保证数组、非空单元列表、INCOMPLETE 必有问题，以及已核实文件和摘要对应。

| 对象 | 必须保存与核实的内容 |
| --- | --- |
| units 每项 | unitId 唯一；kind 为 PDF_PAGE / IMAGE / SHEET；index 为从 1 开始的整数；name 可空但 SHEET 必有原 sheet 名；status 为 COMPLETE / FAILED / UNREADABLE |
| 单元覆盖 | 与实际完整文件的全部页面、图片或 sheet 一致；不能只返回成功页。索引与名称属于实际文件，不由模型补造 |
| blocks 每项 | blockId 在本解析内唯一，unitId 存在；kind 为 TEXT / TABLE_CELL / IMAGE_DESCRIPTION；text 非空 |
| 表格字段 | cellRange 为原单元格位置；仅 TABLE_CELL 可有 formula、cachedValue，分别保存原公式与缓存，不执行或默认缓存正确 |
| 其他字段 | 非 TABLE_CELL 的 cellRange、formula、cachedValue 必须 null；不能省略接口必返键 |
| 完整性 | 未读、位置不可靠或必需识别失败须 INCOMPLETE 并记录 issues；COMPLETE 允许空白文件 blocks=[]，不表示业务信息充分 |

material_parsing.id 对应原 parseId；不把外部来源的任意未登记 parseId 直接写入。每份解析来自一次 PARSE_MATERIAL 调用，run_id、profile_id、implementation_version 和确定输入必须与后续 capability_call 一致。不同实现生成新调用和解析；多个响应只采用第一份有效输出，其余记录诊断。跨解析与分析两表的 run_id 操作互斥由执行域检查，本域两张独立唯一索引不能单独证明该条件。

## 4. 固定输入与封存事务

接入配置试转换使用独立固定快照，在 config_versions_json 记录 configurationId、configurationVersionId、usage=TRIAL_CANDIDATE。原建议分析保留自己的输入，不能回填候选后的试转换内容；配置版本及其他依赖的范围、实际字段与摘要须一致，详见接入配置域 §4。

### 4.1 输入项的两个分支

RECORD 保存实际 record_type、source_system、source_record_id、source_version、data_json 与取得时间；源版本未知可以 NULL，不能补一个本地时间戳冒充来源版本。record_type 取既有契约登记值，服务端检查本 Skill 允许的类型和字段。只有本次实际送入的数据可被引用。

PARSED_MATERIAL 只保存确切 parsing_id，input_key 必须等于该解析 id；记录字段全部为空。SQL 检查解析已存在。复用解析时再次核验当前业务范围和权限，不能因为曾解析过便绕过授权。

snapshot_id + input_key 对所有输入项统一唯一，因此某个 records.inputId 与另一个 parseId 重号会被拒绝；相同解析不能重复加入同一快照，不同快照可各自引用。全局本地 id 单独供工单上下文等引用，不能拿一个接口 inputId 跨快照查询。

### 4.2 封存与恢复

准备服务必须在同一原子事务中执行：

1. 服务端固定所需输入、Skill、配置版本及事项 row_version，完成权限、完整性和结构校验。
2. 以新的快照 id 插入全部 analysis_input_item；尚无内容时允许零项，并明确缺项状态。
3. 插入 analysis_input_snapshot。触发器核对输入行数与本地时间顺序；插入即封存。
4. 同时保存后续分析准备任务；任一语句失败全部回滚，提交后才允许发起能力调用。

快照存在后，触发器禁止新增输入项；已有输入不可修改或删除。输入集合不能在调用后扩大。输入准备跨网络等待在事务前完成，不能持有数据库事务等待模型或文件来源。

当前没有物理外键，输入项的暂存关系允许在快照之前插入。**若绕过规定事务直接提交输入项，可留下孤立行。** 本域 SQL 没有把多语句提交自动变为事务；服务实现必须保证封存、任务和输入一起提交，并在采用前验证快照已存在。孤立输入不得作为工单上下文或证据提供给用户。

content_sha256 由服务端对固定输入内容生成：使用 UTF-8 编码的固定数组封装，包含事项和服务商、事项版本、Skill 及结构版本、config_versions_json 原字符串、输入状态与问题原字符串，以及按 input_key 排序的各输入项字段原值。记录包含保存的 data_json 原字符串，解析包含 parsing_id 和固定解析的全部内容与实现版本。序列化规则版本须与 Skill 输入约定固定；数字精度和 Unicode 处理在实现中测试。摘要仅帮助比对，同号重放仍须比较确定输入；摘要不证明授权、来源真实性或多系统同时点一致性。

expected_work_item_version 表示固定输入时读到的事项版本。发布分析须和后台任务当时的预期事项版本及最新输入代次共同核对；本轮未定义任务领取/版本推进 SQL，不能把它当作只需一次简单相等判断的完整发布算法。若准备时无业务材料，可封存空快照并输出 NEEDS_INFORMATION，不能把空快照标为“材料齐全”；必需输入规则由服务端校验。

### 4.3 与前域引用对接

| 前域字段 | 本域目标及服务端检查 |
| --- | --- |
| installation_work_order.context_snapshot_id | installation_context_snapshot.id；完整来源上下文由安装域独立保存，分析输入项只保存实际送入的获准字段 |
| work_item.current_analysis_result_id | analysis_result.id；结果、快照与当前事项一致，属于可发布输入，尚有效；不可仅凭结果创建时间选最大值 |
| human_decision.analysis_result_id | 当时已展示并有效的 analysis_result.id；未来失效不改历史引用 |
| supplemental_response.materials_json | 精确材料版本引用，来源、编号、版本和本地 id 互相核实；无文件为 []，材料未知版须先取得可靠版本或保留缺项，不虚构成功附件 |

安装域已用 installation_context_snapshot 保存完整来源读取，并以 context_snapshot_id 引用。它不依赖分析快照；模型准备从中选取实际需要且获准的字段，分析证据仍只指向本次 analysis_input_item.data_json。草稿另存其上下文引用，以便核实来源版本。完整上下文不会因分析需要被自动发送给模型。

## 5. 分析结果、发现与证据

analysis_result 保存已采用候选，不保存网络调用失败。status 仅为 ANALYZED 或 NEEDS_INFORMATION；summary 不等于审核决定。结构、类型、引用或输入版本不合格时保留执行失败，不写一个伪成功结果。

服务端逐项校验 findings_json：

| finding.type | content 允许的字段及含义 |
| --- | --- |
| TRANSFORMATION_CONFIG | ruleCatalogVersion、purpose、sourceFormatId、sourceFormatVersion 与 rules；规则按 charging-transform-1 执行，不能只保存字段解释；采用后形成完整候选并真实试转换 |
| INSTALLATION_FACT | installationItem 非空；installedQuantity 有限非负或 null；unit、materialSupplier、serviceScope 为字符串或 null；含义为实际安装 |
| EVIDENCE_CHECK | topic、explanation 非空；assessment 为 SUPPORTED / CONFLICTING / INSUFFICIENT；支持关系不代表人工批准 |
| FEE_EXPLANATION | topic、explanation 非空；金额来自确定性对账，模型不能另造正式账目 |

finding.type 必须和快照 Skill 对应，findingId 在当前结果唯一，不接受额外未登记字段。每条 finding 必须至少一条 evidenceRef；没有可靠引用时保存 findings=[] 与明确 openQuestions。SQL 的 JSON 顶层检查不验证这些条件，测试故意证明空 evidenceRefs 可直接写入，从而明确服务端是必需环节。

每条 evidenceRef 保留 inputId、blockId、jsonPointer、quote 四个键：

- inputId 只能在该结果的 snapshot_id 下按 input_key 查找，不能跨快照借用同号输入。
- RECORD：blockId=null，jsonPointer 非 null 并能在保存的 data_json 上解析；正确处理转义、数组下标及空指针，不把 JSON Pointer 当 SQLite JSON path 拼接。
- PARSED_MATERIAL：jsonPointer=null，blockId 非空且在此解析 blocks_json 内存在，再沿 unitId 定位原 PDF 页、图片或 sheet/cellRange。
- quote 若非空须与定位原内容一致；IMAGE_DESCRIPTION 的 quote 必须 null，页面标明是描述。引用存在不能代替业务支持性核实。

完整保存 summary、findings 与 questions，同一结果不原位修改。后来的材料补充形成新快照与新结果；人工历史决定仍引用旧结果。NEEDS_INFORMATION 必有非空问题；必需输入缺失、不完整或未知时只能采用此状态。数据库只检查问题数组非空，问题内容真实性与空白字符串仍须服务端验证。

发布当前结果时重新核实事项、授权、当前资料与配置条件；晚到结果可作为已采用的历史输出保存，但不能自动更新当前指针。当前输入变化时，服务端使旧当前结果失效或明确标为旧依据，暂停新的依赖分析的决定；已完成事项的历史不被覆盖，后续核查走新关联事项。

## 6. 约束分工与必要性走查

| 环节 | SQL 已覆盖 | 后续服务端必须覆盖 |
| --- | --- | --- |
| 文件版本 | 唯一来源版本、内容字段组合、摘要格式、一次核实后固定 | 来源身份、完整字节及实际摘要、可靠版本对应、存储存在与读取权限 |
| 解析保存 | 同 runId 一份、版本已核实且摘要相等、顶层 JSON 及缺项 | 全部单元覆盖、块位置、公式字段、解析实现与能力调用一致 |
| 输入封存 | 分支互斥、共享命名空间唯一、封存行数与禁止追加 | 同事项/服务商、来源范围、必需输入清单、摘要计算、整个事务及后续任务 |
| 采用分析 | 已存在快照、事项一致、输入不足只能缺项状态、runId 唯一 | 操作互斥、Skill/模型版本、发现结构、证据定位与引文、无效输出隔离 |
| 更新工作台 | 本域不直接修改 work_item 或人工决定 | 条件发布、当前输入代次、事项版本、读取权限、撤权与过期判断 |
| 原文查看 | 固定版本与解析位置可追溯 | 当前授权同样覆盖缓存、摘要、解析和历史；原件不可得不偷换新版 |

按角色走查：京东核查人员从分析发现直接查看原文并决定；服务商在原事项补充后自动产生新输入与分析；对账人员回看当时条款字段；对接人员核实字段建议。存储封存、摘要和位置检查均由系统承担，不新增人工确认环节或重复填写版本。

查询按受授权事项/结果先取得 JSON 引用，再分步查本快照输入、解析与版本，避免超过三表联查。列表不扫描全文 JSON；若未来需要跨结果全文检索，应另行设计索引和授权，不临时使用全表模糊查找。

固定历史约束只面向正常业务流程。保留期限、合法删除、敏感数据清理与文件存储回收须统一设计；不能无限保存，也不能通过删材料级联删除人员决定。受控维护与源端删除不是普通业务 DELETE。

## 7. 验证范围与后续步骤

本域检查器在独立内存 SQLite 同时加载处理事项域与本域 SQL，验证身份与版本唯一、文件核实、快照封存、事务回滚、同输入引用、结果状态、历史固定及替换写入反例。字段/索引清单、文档双向引用和原型保护另做核对。

这些检查不证明真实 D1 兼容、模型效果、生产事务封装、文件存储、JSON 深层验证或来源权限已实现。技术语法核对使用 [SQLite JSON 官方文档](https://www.sqlite.org/json1.html) 与 [SQLite 触发器官方文档](https://www.sqlite.org/lang_createtrigger.html)；JSON 以 TEXT 保存并显式校验，不依赖 JSONB。

本域已纳入 foundation 全范围核对；后续实现按本系统接口、系统流程及 PRD 接续。

## 8. 补充回复的快照映射

AI 契约 §2.3.1 的本系统回复映射沿用 analysis_input_item：input_kind=RECORD、record_type=SUPPLEMENTAL_RESPONSE、source_system=charging_workbench、source_record_id=supplemental_response.id、source_version=supplement-v1:{id}、data_json 为该节明确的回复对象、parsing_id=NULL。无须新增表、列或 input_kind。封存后正文和关联不可更新；所有证据按当前 snapshot_id + input_key 的 data_json 定位 `/replyText`。

原退回作为另一个 INSTALLATION_REVIEW RECORD，source_record_id=human_decision.id、source_version=review-v1:{id}，data 保留原问题、关联、动作及成功回执编号；仅选源端已成功的 REQUEST_SUPPLEMENT。本地固定版本与原系统未知版本区分，来源导入动作保持真实来源身份与版本。

附件不塞进 reply_text 或伪造解析：固定 source_material_version → material_parsing → PARSED_MATERIAL 输入。准备服务核实回复成功标记、事项/服务商/工单/退回关联及读取权限后，选取实际输入并封存；失败或未决回复仅保留业务历史。新快照不得读取上一代同 input_key 的正文，旧结果不得发布覆盖新代次。
