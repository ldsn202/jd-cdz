# 接入配置域表结构

> 版本：V1.0｜日期：2026-09-20｜状态：候选 DDL 本地 SQLite 核验；转换服务及真实 D1 未实现
> 上游（我引用）：[处理事项域表结构](work-item-schema.md) §1、§3、§5、§8、[材料与分析证据域表结构](evidence-schema.md) §4—6、[接入配置 ER](../03-03-er/er-integration-config.md) §1—6、[配置确认流程](../03-04-business-flows/flow-configuration.md) §1—7、[服务商资料与格式说明读取](../03-02-external-apis/provider-documents-format-read.md) §2—5、[AI 推理与材料解析](../03-02-external-apis/ai-inference-material-parsing.md) §2—3、[当前身份与业务权限取得](../03-02-external-apis/current-identity-permissions-read.md) §2—3、[术语表](../03-01-glossary/glossary.md) §1、§4—5
> 下游（引用我）：[处理事项域表结构](work-item-schema.md) §3、§8、[材料与分析证据域表结构](evidence-schema.md) §4、[表结构覆盖与一致性核对](coverage-review.md) §1—5、[服务商接入配置接口](../03-06-provided-apis/configuration-apis.md) §1—3、[配置试转换与业务对账计算](../03-07-system-flows/sys-configuration-reconciliation.md) §1—3、[03-subprd-provider-config.md](../../05-prd/03-subprd-provider-config.md) §4

## 1. 范围与保存方式

本域五张表依次保存配置身份、完整候选、自动试转换、实际启用确认和唯一终态结果。候选 SQL 为 [integration-config-schema.sql](integration-config-schema.sql)，依次加载处理事项、材料与证据、安装资料、对账、本域。本轮不实施正式 migration。

主键、UTC 毫秒、逻辑关联及合法删除约定见处理事项域 §1。无物理外键，SQL 检查部分关联，服务端负责真实权限与业务条件；没有默认成功或伪造来源版本。SQLite 无单独语言规范，按现有通用工程规范与项目约定执行。

| 信息 | 保存位置与边界 |
| --- | --- |
| 归属、来源、用途与登记范围 | integration_config；登记范围用于识别同一配置，不能代替每次输入的适用性核实 |
| 原资料与原格式说明 | 固定 analysis_input_snapshot / analysis_input_item 及材料版本；配置不另造可改原说明 |
| AI 原建议 | analysis_result；每份候选保留建议起点 |
| 完整规则与人员修改 | integration_config_version；候选保存后固定，修改形成下一版本 |
| 当前编辑候选 | work_item.current_configuration_version_id；与配置当前生效版独立 |
| 后台试转换结果 | configuration_trial；无结果、失败与通过分别呈现，打开预览不产生新审批 |
| 人员确认及完整内容 | human_decision + configuration_enablement；保存确认不证明已生效 |
| 真实启用终态 | configuration_activation_result；与当前生效指针、事项状态及记录同事务保存 |

work_item.integration_config_id 绑定配置事项；未核实目标时可空，形成候选前必须绑定正确配置，非空后不可改挂。CONFIGURATION 事项不补造安装工单。两项新字段在尚未迁移的处理事项候选 SQL 和说明中同步登记；完整绑定与候选发布条件见 §6。

## 2. 字段与索引

### integration_config

服务商、来源、用途及业务范围内的一份配置身份；只受控更新当前生效指针，不保存可改规则。

| 字段 | 类型 | 必填 | 默认 | 含义 |
| --- | --- | --- | --- | --- |
| id | TEXT | 是 | — | 稳定本地标识，服务端生成。 |
| service_provider_id | TEXT | 是 | — | 配置所属服务商，历史不可改属。 |
| source_system | TEXT | 是 | — | 登记的资料来源，不接受任意 URL。 |
| purpose | TEXT | 是 | — | 安装资料转换或费用项目对应用途。 |
| business_scope_key | TEXT | 是 | — | 服务端登记的稳定业务范围身份，非文件名；范围规则保存在版本。 |
| current_version_id | TEXT | 否 | NULL | 当前生效 integration_config_version.id，无生效版时为空。 |
| current_activation_result_id | TEXT | 否 | NULL | 对应 APPLIED 生效结果，与当前版本一起切换。 |
| row_version | INTEGER | 是 | — | 本地配置并发版本，初版 1，更新加 1。 |
| gmt_create | INTEGER | 是 | — | 本地创建 UTC 毫秒。 |
| gmt_modified | INTEGER | 是 | — | 本地最后变更 UTC 毫秒。 |

索引：

- uk_integration_config_scope：integration_config(service_provider_id,source_system,purpose,business_scope_key)，唯一。用于同一登记范围的配置身份唯一。
- idx_integration_config_provider：integration_config(service_provider_id,purpose,id)。用于授权后查找适用配置；查询结果不代表已匹配范围。

### integration_config_version

AI 建议起点或人工更正保存为整份固定候选，生效仍使用同一版本身份；不覆写旧规则。

| 字段 | 类型 | 必填 | 默认 | 含义 |
| --- | --- | --- | --- | --- |
| id | TEXT | 是 | — | 稳定本地标识，服务端生成。 |
| integration_config_id | TEXT | 是 | — | 所属配置。 |
| work_item_id | TEXT | 是 | — | 本次配置调整事项，不关联安装工单。 |
| version_no | INTEGER | 是 | — | 配置内本地连续版本号。 |
| parent_version_id | TEXT | 否 | NULL | 前一版本；首版为空，不代替原分析引用。 |
| analysis_result_id | TEXT | 是 | — | 本次建议起点；必须来自同配置事项的 INTEGRATION_CONFIGURATION 分析。 |
| origin | TEXT | 是 | — | 区分 AI 候选与人员更正。 |
| editor_identity_id | TEXT | 否 | NULL | HUMAN 必填实际编辑人；AI 为空。 |
| save_key | TEXT | 是 | — | 一次保存稳定编号，重试读取原结果。 |
| format_status | TEXT | 是 | — | 实际原格式说明状态，与是否能启用分开。 |
| source_format_id | TEXT | 否 | NULL | 已提供的真实格式标识；未提供或未知不伪造。 |
| source_format_version | TEXT | 否 | NULL | 原格式说明确切版本；未知保留空。 |
| applicability_json | TEXT | 是 | — | 服务商、来源、用途、格式及已核实业务条件、适用依据；rowPath 必填，定位原 rawJson 的明细对象或数组，空串表示根。 |
| rules_json | TEXT | 是 | — | 整份规则，保留 ruleId、原字段完整位置、目标字段、操作、参数和成立条件。 |
| open_questions_json | TEXT | 是 | — | 含义或范围等未决问题；不可用预览非空消除。 |
| rule_catalog_version | TEXT | 是 | — | 受控目标字段和转换操作登记清单版本。 |
| edit_notes_json | TEXT | 是 | — | 人工修改前后、原因与证据引用；AI 原输出保持。 |
| gmt_create | INTEGER | 是 | — | 本地创建 UTC 毫秒。 |
| gmt_modified | INTEGER | 是 | — | 固定历史等于创建时间。 |

索引：

- uk_integration_config_version_no：integration_config_version(integration_config_id,version_no)，唯一。用于配置内版本号不重复。
- uk_integration_config_version_save：integration_config_version(integration_config_id,save_key)，唯一。用于同次保存不重复生成版本。
- idx_integration_config_version_item：integration_config_version(work_item_id,gmt_create,id)。用于读取当前调整下全部候选。

### configuration_trial

后台自动执行确定候选的固定试转换结果；保存失败或缺项，查看结果不另触发业务审批。

| 字段 | 类型 | 必填 | 默认 | 含义 |
| --- | --- | --- | --- | --- |
| id | TEXT | 是 | — | 稳定本地标识，服务端生成。 |
| configuration_version_id | TEXT | 是 | — | 本次实际执行的完整候选版本。 |
| snapshot_id | TEXT | 是 | — | 实际试转换输入快照，与原建议输入分开。 |
| execution_key | TEXT | 是 | — | 一次试转换执行稳定编号，不以打开预览重新生成。 |
| transformer_version | TEXT | 是 | — | 实际转换实现版本。 |
| status | TEXT | 是 | — | 确定执行结果，运行中尚不插入终态记录。 |
| output_json | TEXT | 否 | NULL | 实际输出；执行失败无输出时为空，未知值保持 null。 |
| rule_results_json | TEXT | 是 | — | 每条规则的实际执行和校验状态、输出及缺失情况。 |
| issues_json | TEXT | 是 | — | 失败、未覆盖规则、单位或范围冲突。 |
| checks_json | TEXT | 是 | — | input_complete、scope_valid、rules_covered、outputs_valid、meanings_resolved 五项真实校验。 |
| gmt_create | INTEGER | 是 | — | 本地创建 UTC 毫秒。 |
| gmt_modified | INTEGER | 是 | — | 固定历史等于创建时间。 |

索引：

- uk_configuration_trial_execution：configuration_trial(execution_key)，唯一。用于执行重放不复制终态。
- idx_configuration_trial_version：configuration_trial(configuration_version_id,gmt_create,id)。用于读取该固定候选的历次实际验证。

### configuration_enablement

绑定一次原人员确认、完整候选与所看试转换；保存确认不等于已经生效。

| 字段 | 类型 | 必填 | 默认 | 含义 |
| --- | --- | --- | --- | --- |
| id | TEXT | 是 | — | 稳定本地标识，服务端生成。 |
| human_decision_id | TEXT | 是 | — | LOCAL / ENABLE_CONFIGURATION 决定，权限动作另为 ENABLE_INTEGRATION_CONFIG。 |
| configuration_version_id | TEXT | 是 | — | 人员本次确认的完整版本。 |
| trial_id | TEXT | 是 | — | 实际查看且同版本通过的试转换。 |
| expected_config_version | INTEGER | 是 | — | 人员确认时配置 row_version，用于启用竞争检查。 |
| expected_active_version_id | TEXT | 否 | NULL | 确认时原生效版本，首次启用为空。 |
| gmt_create | INTEGER | 是 | — | 本地创建 UTC 毫秒。 |
| gmt_modified | INTEGER | 是 | — | 固定历史等于创建时间。 |

索引：

- uk_configuration_enablement_decision：configuration_enablement(human_decision_id)，唯一。用于同次决定只绑定一次启用。
- idx_configuration_enablement_version：configuration_enablement(configuration_version_id,gmt_create,id)。用于追溯该版本的确认及尝试。

### configuration_activation_result

一次确认经执行后的唯一终态结果。APPLIED 与当前指针、事项完成在同一事务保存；REJECTED 保留实际拒绝原因。

| 字段 | 类型 | 必填 | 默认 | 含义 |
| --- | --- | --- | --- | --- |
| id | TEXT | 是 | — | 稳定本地标识，服务端生成。 |
| enablement_id | TEXT | 是 | — | 原固定启用确认；没有结果时按原请求回查。 |
| outcome | TEXT | 是 | — | 已生效或明确拒绝；不得把超时记为拒绝。 |
| reason_code | TEXT | 否 | NULL | REJECTED 必填明确拒绝原因；APPLIED 为空。 |
| detail_json | TEXT | 是 | — | 执行时条件检查依据或明确拒绝信息，不保存认证秘密。 |
| gmt_create | INTEGER | 是 | — | 本地创建 UTC 毫秒。 |
| gmt_modified | INTEGER | 是 | — | 固定历史等于创建时间。 |

索引：

- uk_configuration_activation_enablement：configuration_activation_result(enablement_id)，唯一。用于一次确认唯一终态，重放回查原结果。
- idx_configuration_activation_time：configuration_activation_result(gmt_create,id)。用于按时间查询配置启用结果。

## 3. 候选内容、版本与适用条件

配置身份由已登记的服务商、来源、用途和 business_scope_key 共同确定。精确相同登记范围只建一份身份；不同范围仍可能重叠，不能靠唯一索引宣称已消除适用冲突。业务范围改变须核实是否仍属同一配置，不允许借同名文件或公司名扩大复用。

一份配置的 version_no 从 1 连续增加，parent_version_id 指向该配置前一版本。版本属于当次调整事项，建议分析必须同事项、同服务商且为 INTEGRATION_CONFIGURATION。跨次调整可以引用前一配置版本，原分析仍属于新事项；保存同一请求复用 save_key，竞争版本号时重新核实，不能覆盖已保存版本。

AI 重新生成的建议保留为新结果，不能静默取代人员当前候选。HUMAN 版本保存实际编辑人及修改前后、原因和证据；AI 版本不伪造人工编辑人。origin 只表明生成方式，不代表已核实、已启用或获得权限。

| 固定内容 | 结构及服务端校验 |
| --- | --- |
| applicability_json | serviceProviderId、sourceSystem、purpose、businessScopeKey 与配置身份一致；formatStatus、sourceFormatId、sourceFormatVersion 与版本投影一致；conditions 逐项保存适用字段、单位、业务关系和范围；basisReferences 引用实际说明或确认依据；unknownConditions 保留未明确条件 |
| rules_json | 每项 ruleId、sourceFields、targetField、operation、parameters、conditions；ruleId 非空且本版本唯一，原字段使用来源结构中的完整位置，不合并不同工作表同名列 |
| sourceFields | 每个源位置对应实际输入字段，保留字段原值及含义；不同格式可使用登记的定位方式，不能用无法解释的自由文本寻址 |
| targetField、operation | 必须在 rule_catalog_version 所登记的目标字段与转换方式中，参数符合对应结构；模型解释文字和文件文本不执行 |
| edit_notes_json | fieldPath、before、after、reason、basisReferences；服务端按实际版本差异生成/核实，人工更正不冒充 AI 原输出 |
| open_questions_json | 尚未确定的含义、缺失依据、范围与单位冲突；必需问题未解决时不允许通过试转换并启用 |

候选可以保留未知信息及空规则，但不因此取得可用状态。PROVIDED 保留真实格式编号，版本未知仍为空；NOT_PROVIDED 与 UNKNOWN 不造格式编号或版本。实际是否已提供、内容是否完整、与当前资料是否关联，须与固定原输入核实。

NOT_PROVIDED 不等于没有业务含义。可靠原资料及有权人员核实可支持有限范围的规则，仍须证明字段、单位与关系；UNKNOWN 表示说明情况待核实，不能当作未提供跳过。

电缆各段须为不重叠实际施工且单位一致才能相加；同一段桥架供料与安装不重复累计长度。费用对应关系不决定施工量口径。未知、真实零和不适用分别保留，不用转换默认值填补事实。首版受控目录为 charging-transform-1，定义见业务 Skills 的转换规则目录；首版执行器未支持跨行聚合，遇此需求保留待处理，不能伪装已支持。

AI 的 TRANSFORMATION_CONFIG.content.rules 直接形成 rules_json，parameters.steps 中 lookup.entries 保存必要对照表。程序试转换生成真实执行记录，人员无需把文字建议补写为转换逻辑。适用来源及业务范围由服务端结合固定输入核实后保存，AI 输出不直接切换生效指针。

## 4. 自动试转换及证据

候选保存后，由后台准备匹配该版本、实际输入和适用范围的试转换。试转换有独立固定输入，原建议分析保留自己的输入；不能把后续转换结果回填进原分析快照。原资料相同但候选改变，也生成新的试转换输入，明确实际候选版本。

analysis_input_snapshot.config_versions_json 中本次候选项包含 configurationId、configurationVersionId、usage=TRIAL_CANDIDATE。其他实际依赖也记录确切版本和用途，不冒充当前生效版本。SQL 检查候选项存在；服务检查无互相冲突的重复依赖、范围、实际版本及输入摘要一致。

| 试转换内容 | 保存与检查 |
| --- | --- |
| execution_key、transformer_version | 固定一次执行和实际转换实现；恢复同次调用复用稳定编号，同号不同内容拒绝 |
| output_json | 实际输出及字段值；失败无结果为 NULL，空对象不能被服务当作有效转换 |
| rule_results_json | ruleId、status、inputReferences、outputReferences、issues；记录实际运行及字段校验，未运行规则保留 NOT_EXECUTED，不能默认通过 |
| issues_json | 具体读取失败、资料缺项、未覆盖规则、单位冲突或范围不符；失败与待信息至少有一项 |
| checks_json | input_complete、scope_valid、rules_covered、outputs_valid、meanings_resolved，保存真实检查结果，不能由客户端宣称通过 |

PASSED 要求：快照 COMPLETE、格式情况已明确、已提供的格式版本已知、无必需未决含义、规则非空、每条规则有且仅有一份 PASSED 结果、输出存在、无问题且五项检查均为 JSON true。FAILED 保存确定执行失败，NEEDS_INFORMATION 保存仍待资料或业务含义。运行中由后续后台执行记录表达，不能先插 PASSED 占位。

服务端仍须验证输入真实存在且覆盖所需字段、完整版本与单位、每条规则实际执行、输出合法及适用依据充分。SQL 检查记录结构不能证明执行真实发生。本轮反例确认：未登记的操作名若被写入方错误标成通过，存储层仍可能接受；后续必须在受控执行器和启用服务阻止。

同一输入通过只证明该输入的结果，不能扩大为全部未来资料适用。规则未覆盖时补实际输入或收窄有依据的范围；范围条件未知、多配置重叠命中时停止相关自动转换，不选择“最近创建”的配置。查看试转换供核实或技术重试，不新增业务审批。

## 5. 启用确认、结果与历史

configuration_enablement 引用 LOCAL / ENABLE_CONFIGURATION 的实际人工作业、完整候选、同版本 PASSED 试转换及人员看到的配置并发版本/原生效版本。权限名称 ENABLE_INTEGRATION_CONFIG 按身份契约验证，不把存储动作名直接当权限。

试转换输入、当前资料和原格式在确认时仍须有效，人员必须为当前有权责任人。服务端核实 human_decision.content_json 包含所确认的完整版本、范围、试转换和差异；有分析引用时须为候选原分析。历史成功试转换不授予权限，也不证明当前输入未变。

| 情况 | 保存和恢复 |
| --- | --- |
| 确认已接受、终态未取得 | 保留原确认，按 request_key / enablement_id 查原动作；不因页面超时写 REJECTED，也不换内容盲重发 |
| 条件全部成立且已切换 | 保存 APPLIED，当前版本与当前结果一起推进，原生效版保留；本轮事项完成 |
| 权限、责任、候选或配置条件变化，明确未执行 | 保存 REJECTED 及原因，保留候选与意见；核实变化后按新的有效内容确认 |
| 临时故障且无确定结果 | 保留无终态状态，由后续后台执行域恢复；实际失败尝试另记，不伪造终态 |
| 已生效但通知、显示或下游处理失败 | 回查已保存 APPLIED，仅恢复失败环节，不重新要求启用 |
| 重复确认或结果重放 | 同一次决定与同一启用结果各自唯一，返回实际已保存内容；不使用替换写入 |

结果固定后不能从 REJECTED 改为 APPLIED。明确拒绝后需要新的有效确认；技术失败尚无终态时继续原动作。服务须避免已有未决确认时接受互相冲突的新内容，先查明原动作。

配置当前指针不能直接填写：必须引用本配置 APPLIED 结果及其版本，expected_config_version 与原 row_version 相同，expected_active_version_id 与原生效版相同，row_version 加 1。候选生成不会切换当前版，旧确认在并发新版生效后不能覆盖它。

历史规则拟重新使用时，复制其规则形成当前调整的新候选，核实当前条件并准备匹配试转换，作一次新确认；不直接恢复旧指针。资料整理、核查、对账每次使用记录确切版本，配置改版不改原明细、原账或历史人工决定。

## 6. 事务与约束分工

| 候选数据库已检查 | 服务端仍须实现 |
| --- | --- |
| 配置身份唯一、已绑定事项不能改挂配置 | 真实来源/服务商、business_scope_key 登记、不同范围交叠与当前访问权限 |
| 版本序号/前版、AI 与人工起点、规则标识和固定历史 | 原值/人工差异真实性，受控字段和操作清单，含义及范围成立 |
| 试转换与候选、事项及固定输入一致，基本通过结构 | 必需原资料非空、来源版本可信、实际规则覆盖和输出正确性 |
| 确认引用同版本通过结果与原人工作业 | 当前候选、当前责任、ENABLE_INTEGRATION_CONFIG、输入/格式变化与完整确认内容 |
| APPLIED 对应预期配置版本，当前指针只选本配置成功结果 | 确认、条件核实、结果、指针、事项完成及 activity_record 同事务原子提交 |
| 历史拒绝 UPDATE/DELETE/REPLACE | 合法删除政策与受控实施；普通业务不得绕开历史保护 |

1. 保存新候选、按事项 row_version 条件发布 current_configuration_version_id，并登记自动试转换任务，须按后续服务事务统一执行。指针目标必须属于当前事项和配置，不能按版本最大值替代人员正在编辑的候选。integration_config_id 首次补齐也须核实原 business_identity_json，非空后不可改挂。
2. 启用时，重新核实当前候选、试转换、输入、格式、身份与责任；旧候选、旧输入或撤权使条件失效时，保存明确拒绝结果，不切换配置。必要信息尚不可得时保留处理中并恢复原动作。
3. APPLIED 插入、配置条件更新、事项完成及记录必须一起成功。SQL 不自动把整套业务步骤组成事务；仅插入 APPLIED 后单独提交仍可能造出不一致，服务不得这样执行。零行条件更新必须回滚其余写入；后续 D1 实现须专门验证该边界，不能只依赖 batch 名称。
4. 同次重试先读取 request_key 与结果，并比对固定内容。若指针后来已被另一版更新，仍返回原动作的实际历史结果及当前状态，不把原成功改成失败。
5. 新版生效后只重新核实有依据的影响范围。未完成业务保留原编辑，已完成业务保留原结论并关联后续工作；后台分发失败只恢复接续，不再次要求配置确认。
6. 每次真正使用仍核实授权、来源、用途、格式与业务条件。配置当前生效并非所有输入都适用，识别到不适用时阻止相关转换，保留未受影响业务。

## 7. 必要性走查与验证边界

| 角色路径 | 减少的重复工作与保留的决定 |
| --- | --- |
| 对接人员打开事项 | 直接看到候选、原文与自动试转换，不逐次选择 Skill |
| 修正含义 | 保留旧版和原建议，只修受影响内容；后台准备新试转换 |
| 核实并启用 | 一次完整业务决定，无第二名 AI 审批人；失败恢复不重复确认成功动作 |
| 后续资料条件不变 | 系统复用已生效的确切版本，资料/核查/对账人员按原职责处理结果 |
| 格式变化或适用冲突 | 仅受影响范围待核实，不让全部角色重审所有业务 |
| 回看历史 | 原规则、试转换、确认与终态均保留，不被当前配置重写 |

本地 SQLite 测试覆盖固定候选、试转换绑定、失败与缺项、同次确认重放、并发旧版及历史保护。字段/索引与双向引用另做结构检查。样例仅用于约束反例，不是新增业务量或实测提效数据。

未实现：真实转换执行器、受控操作登记内容、权限服务、原资料接入、完整事务、D1 运行、后台任务、原型差距及正式迁移。本域存下 PASSED 或 APPLIED 的结构不证明真实转换或启用完成。

本域已纳入 foundation 全范围核对；后续实现按本系统接口、系统流程及 PRD 接续。
