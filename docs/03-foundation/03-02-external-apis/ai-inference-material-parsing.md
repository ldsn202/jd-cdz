# AI 推理与必要的材料解析

> 版本：V1.2｜日期：2026-09-20｜状态：四包与本地运行工具已实现；模型实跑验收待授权
> 上游（我引用）：[外部依赖清单](external-dependency-list.md) §2—4、[原始材料读取](source-material-read.md) §2—5、[计费条款与批准记录读取](billing-terms-approval-records-read.md) §3、[当前身份与业务权限取得](current-identity-permissions-read.md) §2—3、[原记录变化发现](source-record-changes-read.md) §3、[术语表](../03-01-glossary/glossary.md) §1—5、[原型交互说明](../../02-prototype/interaction-spec.md) §1—3、[接口规范](../../../rules/coding-standards/09-api-design.md) §2—9、[技术栈约定](../../../rules/Cloudflare支持技术栈.md) §1—3
> 下游（引用我）：[本地运行工具](../../../code/skill-runtime/README.md) 运行与转换、[转换目录](../../04-skills/provider-mapping-config/references/rule-catalog.md) 配置结构、[处理事项实体关系](../03-03-er/er-work-item.md) §1—2、§4、[材料与分析证据实体关系](../03-03-er/er-evidence.md) §1—5、[术语表](../03-01-glossary/glossary.md) §1、[接入配置实体关系](../03-03-er/er-integration-config.md) §1—3、[变化接收与执行关系](../03-03-er/er-change-execution.md) §3—4、§6、[ER 范围与一致性总核对](../03-03-er/coverage-review.md) §2—6、[安装资料整理与提交](../03-04-business-flows/flow-installation-submission.md) §1—8、[业务对账](../03-04-business-flows/flow-reconciliation.md) §1—7、[配置确认](../03-04-business-flows/flow-configuration.md) §1—7、[材料与分析证据域表结构](../03-05-schema/evidence-schema.md) §1—7、[接入配置域表结构](../03-05-schema/integration-config-schema.md) §1—7、[业务 Skills](../../04-skills/README.md) §2—3、[变化接收与执行域表结构](../03-05-schema/execution-schema.md) §1—5、[材料预览与上传接口](../03-06-provided-apis/material-apis.md) §1—3、[受控后台执行与本地运行接口](../03-06-provided-apis/execution-apis.md) §1—5、[来源变化、自动准备与 Skill 分析](../03-07-system-flows/sys-analysis-preparation.md) §1—4、[installation-apis](../03-06-provided-apis/installation-apis.md) §5—6、[05-subprd-installation-review](../../05-prd/05-subprd-installation-review.md) 评审补充；[mock T1.2子计划](../../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T1.2-material-files.md) PRD双链·读、[mock T3.2子计划](../../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T3.2-backend-adapters.md) PRD双链·读

## 1. 技术依据与本轮选择

本地真实 AI 验证采用 **OpenCode CLI 作为业务 Skill 的运行环境，由独立 Node 任务程序启动和管理**。OpenCode 负责装载 Skill、调用已配置模型及允许的工具；Node 任务程序负责准备输入、启动进程、收集结果和执行校验。本文原称“Skill 执行器”的职责按这两个部分落实。

后台统一调用其他业务系统，核实关联、完整性与来源版本后形成固定输入；四个业务 Skill 不直接调用 MCP。程序承担试转换和确定性计算，Skill 承担规则生成与判断。人工确认后的业务写入继续由后台按身份、版本和事务规则执行。

业务来源与 AI 模式分别配置，支持业务数据 mock + AI real；纯交互测试仍可使用 AI mock。后续支持上传服务商实际文件进行验证。具体模型、中文业务表现、成本和时延待同一组材料实测后定稿。材料解析使用独立适配能力，须满足下文的位置与覆盖要求，不能用无定位的摘要代替。Workers AI 保留为候选模型或解析服务，不作为本地 Skill 运行环境。

2026-09-20 核对官方资料所得：

| 官方能力 | 本项目采用方式 |
| --- | --- |
| OpenCode 通过原生 skill 工具按需读取 SKILL.md | 为任务提供指定版本的业务 Skill，并明确要求装载；实际运行须核对装载和工具调用记录。[官方说明](https://opencode.ai/docs/skills/) |
| OpenCode run 支持指定 Agent、工作目录和 JSON 事件输出 | Node 任务程序启动 CLI；JSON 事件用于运行进展，业务结果另行校验。[命令说明](https://opencode.ai/docs/cli/) |
| Markdown 转换列有 PDF、PNG/JPEG、XLSX 格式 | 可用于解析候选验证，格式被支持不代表本项目全部证据要求已满足。[格式清单](https://developers.cloudflare.com/workers-ai/features/markdown-conversion/supported-formats/) |
| 图片转换采用检测与描述，PDF 按页提取文本或结构 | 图片描述不能直接充当精确 OCR；扫描件和表格须另做可读性验证。[转换机制](https://developers.cloudflare.com/workers-ai/features/markdown-conversion/how-it-works/) |
| 转换绑定返回文档文本、类型及错误等信息 | 官方所列返回结构没有本项目要求的逐块页码、sheet 和单元格定位；这是依据返回字段作出的适配判断，不能直接宣称转换结果支持精确取证。[返回结构](https://developers.cloudflare.com/workers-ai/features/markdown-conversion/usage/binding/) |

四个业务 Skill 包及 Node 命令行运行/校验/转换工具已实现。首次真实 OpenCode 调用已装载 Skill，但因任务目录权限失配无业务产物；路径已修复，重跑等待外部模型授权。程序测试和本地 Agent 应用验证已通过，证据与限制见业务 Skills 验证记录。OCR、表格解析、HTTP 运行服务及工作台接入尚未实现。

## 2. 接口与输入

| 项 | 本项目约定 |
| --- | --- |
| 逻辑调用 | `run_ai_capability` |
| 拟定 mock 请求 | `POST /api/admin/mock/external/ai-runs` |
| operation | PARSE_MATERIAL / ANALYZE_SKILL，分别解析单份材料、分析一份已固定输入 |
| 调用身份 | 已授权的后台程序，拥有相应材料读取和分析准备权限；浏览器不能直接指定模型、提示词或来源 URL |
| 执行边界 | 只产生解析或分析候选结果，不调用正式提交、审核、改账或付款接口 |
| 处理形式 | 后台执行并取得完整结果；前端的“分析中”和结果查询由后续本系统接口承担，本接口不混入页面待办状态 |

### 2.1 公共请求字段

所有字段必填，可空项按 operation 使用。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| runId | 非空 string | 本次能力调用的稳定编号，由后台生成；同编号不得换输入 |
| operation | string | 上述两种取值 |
| profileId | 非空 string | 服务端登记的解析器或模型配置，包含实现版本、超时、输入上限及输出约束；不能传任意供应商地址 |
| parseInput | object / null | PARSE_MATERIAL 必有，ANALYZE_SKILL 为 null |
| analysisInput | object / null | ANALYZE_SKILL 必有，PARSE_MATERIAL 为 null |

同 runId 重复请求先核实身份与输入一致性，复用已经保存的结果；相同编号不同输入返回冲突。调用结果不确定时保留尝试记录，最多按 §5 的预算重试；供应商可能再次计次，不宣称其原生支持幂等。一次调用只采用一个经校验结果，不因重复响应反复更新事项。runId 同时绑定已解析的配置与实现版本；配置变化需要新的调用编号，不复用旧结果冒充新实现。

### 2.2 材料解析输入

parseInput 的必填字段为：sourceSystem、sourceMaterialId、sourceVersion、mediaType、contentSha256、contentBase64 均为非空 string，byteLength 为正整数。字段含义、支持类型和 2 MiB 开发上限沿用原始材料读取 §3；调用前重新检查材料权限、确切版本、完整字节及摘要。

PDF、PNG、JPEG、XLSX 分别解析，不执行文件中的宏、外链、公式脚本或指令。超限、加密、损坏、不支持的格式不得静默截取内容后标为完整。原始文件与解析结果分开保存，解析不改写原文件。

### 2.3 Skill 分析输入

| analysisInput 字段 | 类型 | 说明 |
| --- | --- | --- |
| skill | string | INTEGRATION_CONFIGURATION / INSTALLATION_EXTRACTION / INSTALLATION_EVIDENCE / RECONCILIATION_EXPLANATION |
| skillVersion | 非空 string | 后台登记的 Skill 版本，固定其指令、输入选取规则及输出校验 |
| outputSchemaVersion | 非空 string | 与该 Skill 版本绑定的输出结构版本，不接受模型自行新增字段 |
| inputSnapshotId | 非空 string | 后台保存的不可变输入快照，包含本次实际送入的记录、材料解析及必要的配置版本 |
| records | object[] | 已授权的原系统记录或本系统固定业务事实，见下文；不能用名字或编号代替实际内容 |
| parsedMaterials | object[] | 已保存并核实来源的 §3.1 解析结果；不接受没有原文版本的自由文本冒充解析结果 |

records 每项必有 inputId、recordType、sourceSystem、sourceRecordId、sourceVersion、data。前四项为非空 string；sourceVersion 为 string / null；data 为实际业务字段对象。recordType 沿用原记录变化发现 §3.2。records.inputId 与 parsedMaterials.parseId 在本次快照内统一唯一，供引用；data 仅保留此任务需要且当前身份可使用的字段，不发送身份凭据等无关内容。

inputSnapshotId 对应的内容由后台固化并逐项核对，请求不能只复用编号却更换数据。来源缺版本或内容不完整时保留原缺失状态；允许生成“还需哪些信息”的结果，不能补造事实后继续确认。原材料与记录文字均视为业务数据，不提升为系统指令；不允许它们改变 Skill 范围或要求调用写入工具。

### 2.3.1 安装补充回复的固定输入

使用已有 `recordType=SUPPLEMENTAL_RESPONSE` 与 RECORD 输入分支，不新增自由文本入口。后台先核实 supplemental_response.success_verified_at 非空，关联同事项、同服务商的原退回及外部成功回执；尚未成功的回复不纳入成功补充输入。原问题另以 INSTALLATION_REVIEW 记录送入，data 保留 requestDecisionId、工单、服务商、questions 与本轮外部操作关联，防止模型把回复用于另一轮问题。

| records 字段 | 本系统回复映射 |
| --- | --- |
| inputId | 后台生成的快照内唯一标识，例如 supplement:{本地回复id} |
| recordType | SUPPLEMENTAL_RESPONSE |
| sourceSystem | charging_workbench，明确表示本系统保存的回复事实，不冒充原服务商系统 |
| sourceRecordId | supplemental_response.id |
| sourceVersion | 固定正文版本 `supplement-v1:{id}`；内容不可改写，新增回复使用新id。这是本地事实版本，不能代替外部记录版本；成功前不生成该输入 |
| data | 固定下表字段，不只给一个回复编号 |

`data` 必返：`responseId`、`workItemId`、`installationWorkOrderId`、`serviceProviderId`、`requestDecisionId`、`submitDecisionId`、`replyText`、`materialVersionIds`、`externalOperationId`、`successVerifiedAt`、`completeness`、`missingParts`。编号与正文为非空string；工单与服务商使用与本快照其他输入一致的来源编号，后台从已核实本地关联映射。materialVersionIds 为 string[]（允许无附件），successVerifiedAt 为本地核实时间转带时区字符串，非源端提交时间。只有正文与关联齐全才 COMPLETE、missingParts=[]；附件解析不足另由 parsedMaterials 的完整性报告，不把缺失材料补为成功。

文本证据定位 `{inputId,blockId:null,jsonPointer:"/replyText",quote:原文片段}`；正文中指令依旧视为数据。附件先按 materialVersionIds 核实权限及确切版本，固定解析后进入 parsedMaterials；回复只说“已修改”不能改写正式安装明细，须另外取得权威新版明细。模型判断时同时看到原问题、原正式明细、相关成功回复和对应新材料。

来源系统导入的回复保留原 sourceSystem/sourceRecordId/sourceVersion；未知外部版本保持null，不用本地版本规则补造。若同一回复同时有本地与外部表示，按外部操作编号及固定内容核实后仅选一份规范输入，保留原系统版本证据；正文冲突或无法去重须列缺项。

### 2.4 本地 OpenCode 运行方式

```text
工作台 → 本地 API → Node 任务程序 → OpenCode CLI → 已配置的大模型
                         │              ├─ 装载本次业务 Skill
                         │              └─ 读取任务材料、调用允许的工具或脚本
                         └─ 校验结果 → API 保存分析结果 → 工作台展示待处理事项
```

| 部分 | 具体职责 |
| --- | --- |
| 本地 API | 依据业务事件安排分析，核实权限并固定输入；经本地 HTTP 接口与任务程序交换任务和结果 |
| Node 任务程序 | 为 runId 准备独立目录、已登记版本的 Skill 和输入；启动 CLI，处理超时与退出，收集事件和结果；执行结构与引用检查，再交 API 核验和保存 |
| OpenCode CLI | 按任务指令装载 Skill，结合输入调用模型，并使用明确允许的文件读取、工具或脚本能力，产出候选结果 |
| 业务 Skill | 提供 SKILL.md、必要的 references/ 和 scripts/，分别描述接入配置、资料整理、资料核查或对账解释的方法与约束 |

任务目录拟包含 `.opencode/skills/<skill-name>/SKILL.md`、该 Skill 的依赖文件、`opencode.json`、`input/` 和 `output/result.json`。任务程序按 skillVersion 准备固定内容，登记 CLI 版本、模型配置与实际使用的 Skill 版本。现有 `.agent/skills/` 用于项目开发辅助，四类业务 Skill 包须另行实现。

拟使用的启动形式（角色与工作目录由服务端登记配置提供）：

```text
opencode run --agent <业务分析角色> --dir <本次任务目录> --format json
```

任务说明由 Node 程序写入 stdin，模型及工具权限通过任务配置提供，密钥由本地环境安全提供。`--format json` 返回运行事件流；任务程序还须读取 `output/result.json`，按 §3 校验业务结果。CLI 正常退出只表示进程结束，不能直接标为分析成功。业务字段和证据引用校验不依赖模型自检。

API Worker 不直接创建本地子进程或读取任务目录；CLI 运行在独立 Node 进程中。任务仅能读取授权输入、使用已登记的分析工具并写候选输出；不能直接提交安装资料、审核、改账或付款。工作目录、工具权限与输出范围的限制须用实际运行验证，目录分开本身不构成权限隔离。未来部署需另定可运行 CLI 的环境，本轮不声明可将 CLI 直接部署为 Worker。

用户打开工作台即可查看后台已准备的判断结果；尚未完成时显示分析中，失败时提供真实失败状态。用户无需手动打开终端、选择 Skill 或逐项发起分析。

### 2.5 上传服务商文件的本地验证

本地验证须支持从工作台上传服务商 Excel、安装照片、施工单或账单，在已支持的格式范围内完成“上传 → 解析 → Skill 分析 → 证据展示 → 人工处理”。上传入口、存储与事项关联在后续本系统接口和 PRD 中落实，本轮尚未实现。

上传时确定服务商、工单或对应业务范围，后台保存原文件、内容摘要与本地版本。上传文件使用明确的导入来源标识，不能冒充已从服务商正式接口取得的数据；解析结果仍遵守 §3.1 的页码、sheet、单元格及覆盖要求。字段对应不明时由接入配置 Skill 提供建议，人员确认后复用对应规则。

真实验证使用实际上传内容重新分析，不套用固定结论。京东侧账单、合同或批准依据仍须另外提供；缺少必要依据时返回 NEEDS_INFORMATION。混用 mock 依据的测试须在验收记录中注明范围，不能作为完整业务核对已通过的证据。

验收分别核对材料是否读全、字段和证据是否对应、判断是否受原文支持，以及人员能否在工作台直接完成处理；修订并重新上传后应产生新输入版本和新分析。以人工核对结果逐项比较，不因文件上传成功或 CLI 正常退出就宣称业务可用。

## 3. 输出与校验

外层成功为 HTTP 200、code=0、msg="success"、data、requestId；失败 data=null。data 全部必返：runId、operation、profileId、implementationVersion、inputSnapshotId、parsing、analysis。前三项与请求一致；implementationVersion 为本次实际使用的实现或模型配置版本，非空 string；解析时 inputSnapshotId=null，分析时与请求一致。两种结果只返回对应对象，另一项为 null。

### 3.1 解析结果 parsing

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| parseId | 非空 string | 已保存的不可变解析结果编号，与来源、文件摘要及实现版本绑定 |
| sourceSystem、sourceMaterialId、sourceVersion、contentSha256 | 非空 string | 与原请求完全一致，摘要不替代业务版本 |
| completeness | string | COMPLETE / INCOMPLETE，描述已核实的解析覆盖情况 |
| units | object[] | 每个原 PDF 页面、图片或 XLSX sheet 的覆盖情况；不能只返回成功部分 |
| blocks | object[] | 带位置的已识别内容块，见下文 |
| issues | string[] | 未读内容、无法定位、公式值未知或需要核实的问题，不能隐去解析限制 |

每个 unit 必有 unitId（非空 string）、kind（PDF_PAGE / IMAGE / SHEET）、index（从 1 开始的整数）、name（string / null）、status（COMPLETE / FAILED / UNREADABLE）。SHEET 的 name 必为原 sheet 名，其余可为 null。units 必须与实际文件的页面、图片或全部 sheet 清单相符，由解析程序核实覆盖，不能仅凭模型自称“已读完”。

每个 block 必有 blockId、unitId、kind、text、cellRange、formula、cachedValue。前两项为非空 string，分别是本解析内唯一块编号及已有 unit 引用。kind 为 TEXT / TABLE_CELL / IMAGE_DESCRIPTION；text 为识别内容或说明，非空 string。cellRange 为 string / null，TABLE_CELL 必有可核实的原单元格地址，其他类型为 null。formula、cachedValue 为原公式和原缓存值的 string / null，仅 TABLE_CELL 可用，不执行或假定缓存仍有效。页码由 unit.index 给出，sheet 由 unit.name 给出；不能让分析模型自行编造位置。

图片描述必须标为 IMAGE_DESCRIPTION，不能当作逐字引文。OCR 结果可标 TEXT，但仍需保留原图供人员核实。无法给出可靠位置的候选内容不得伪造 unit 或单元格，应列入 issues 并标 INCOMPLETE。COMPLETE 只表示约定范围已解析；空白材料可以 blocks=[]，不表示业务资料充分。

### 3.2 分析结果 analysis

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| skill、skillVersion、outputSchemaVersion、inputSnapshotId | 非空 string | 与请求一致，不能把旧分析挂在新快照上 |
| status | string | ANALYZED / NEEDS_INFORMATION；不使用审核通过、费用批准或付款状态 |
| summary | 非空 string | 面向当前人员的结果概述，事实与待核实问题分开 |
| findings | object[] | 候选信息，字段与类型见下文 |
| openQuestions | string[] | 尚需核实或补充的问题；NEEDS_INFORMATION 时非空 |

每个 finding 必返 findingId（本结果内唯一非空 string）、type、content、evidenceRefs。type 与 Skill 对应，content 只允许下表列出的字段，字段均必返。没有可引用依据时不得输出已确认事实，只列待核实问题。

| skill / finding.type | content 字段及含义 |
| --- | --- |
| INTEGRATION_CONFIGURATION / TRANSFORMATION_CONFIG | ruleCatalogVersion、purpose、sourceFormatId、sourceFormatVersion：非空 string；rowPath：明细对象或数组的 JSON Pointer，空串表示根；rules：可执行规则数组。精确结构见下文；一份分析最多一份完整配置 |
| INSTALLATION_EXTRACTION / INSTALLATION_FACT | installationItem：非空 string；installedQuantity：有限非负 number / null；unit、materialSupplier、serviceScope：string / null。使用实际安装含义，不拿权益上限、计费数量替代 |
| INSTALLATION_EVIDENCE / EVIDENCE_CHECK | topic、explanation：非空 string；assessment：SUPPORTED / CONFLICTING / INSUFFICIENT，仅说明材料支持关系，SUPPORTED 不代表人工审核通过 |
| RECONCILIATION_EXPLANATION / FEE_EXPLANATION | topic、explanation：非空 string；解释计费疑点与依据，不另造应付或应收金额字段 |

evidenceRefs 为非空数组，每项 evidenceRef 必返 inputId、blockId、jsonPointer、quote。inputId 为本次 records.inputId 或 parsedMaterials.parseId；其余为 string / null。引用记录时 jsonPointer 必须定位到实际 data 中的原字段，blockId=null；引用材料时 blockId 必须存在于该解析结果，jsonPointer=null。quote 若非空必须与实际文本相符；IMAGE_DESCRIPTION 的 quote 必须为 null，并显示为模型描述，不能伪装原文签字或条款。

校验分为两层：程序核对字段、类型、枚举、唯一标识、输入版本及引用确实存在；业务验证再检查解释是否受原文支持。引用存在不保证推理正确；不确定或冲突必须显式保留，人员仍核实证据。

### 3.3 可执行转换配置

TRANSFORMATION_CONFIG.content 使用 `ruleCatalogVersion=charging-transform-1`；purpose 为 INSTALLATION / RECONCILIATION，sourceFormatId 和 sourceFormatVersion 固定实际输入格式。rowPath 定位原 rawJson 中的明细对象或数组，规则路径相对于选中的每一行。rules 每项固定 `ruleId,sourceFields,targetField,operation,parameters,conditions`：operation 为 PIPELINE，parameters 为 `{steps:[...]}`，conditions 为 `{path,equals}`[]。sourceFields 与取值算子读取的原行 JSON Pointer 必须一致。

实际支持的算子、参数、用途目标和完整示例见 [转换规则目录](../../04-skills/provider-mapping-config/references/rule-catalog.md)。规则中包含必要的值对照表；没有已实现的算子时返回具体缺口，不能用自然语言解释代替代码。必需信息缺失时可以返回有依据的部分规则并标 NEEDS_INFORMATION；完全无法生成规则时 findings=[]。

候选采用后，rules 原样保存到 integration_config_version.rules_json；ruleCatalogVersion 保存到 rule_catalog_version；rowPath 作为必需属性，与格式、用途和已核实服务商范围共同保存在 applicability_json，不能让模型凭空指定服务商或启用状态。对照表 entries 保存在规则 parameters 内，随规则版本固定。已有生效版保留，修订生成下一版本。

程序按配置实际执行原始样例，记录逐行、逐规则结果和失败原因；结果保存于 configuration_trial。模型不能自行输出 trialPassed 或已启用。结构合法、样例转换正确、业务含义和适用范围明确分别检查，人员确认的对象是这份完整配置及实际结果。

### 3.4 四类能力的责任范围

- 接入配置 Skill 生成可执行转换逻辑，程序拿实际输入进行试转换，人员确认后由程序持续执行；已生效的规则不每次重新让模型猜测。
- 安装资料整理 Skill 形成待确认草稿；草稿不直接提交为正式安装明细。
- 安装资料核查 Skill 查找差异证据并说明支持关系，不发出审核动作。
- 对账差异解释 Skill 解释疑点。确定性的合计、差额和已确认项目对应由程序执行，并保留双方原记录；模型不代替算账或判定结算。

必需输入缺失或其解析不完整时，status 必须为 NEEDS_INFORMATION，并在 openQuestions 说明缺项；必需输入清单由已登记 Skill 规则确定，不由模型自行放宽。

源数据、解析结果或 Skill 配置变化后，重新固定输入并分析；发布前核对当前事项和输入版本，旧结果不得覆盖新输入。必要材料失败或未读全时只能发布明确标注缺项的结果，不能把“没读到”写成“没有批准”。

## 4. 开发示例

### 4.1 解析调用

沿用原始材料读取中的完整 PNG 字节。它只有接口测试用途，不承载施工事实；下述为 mock 预期响应，未执行 OCR。

```json
{"runId":"parse-run-mock-001","operation":"PARSE_MATERIAL","profileId":"mock-parser-v1","parseInput":{"sourceSystem":"installation_management","sourceMaterialId":"material-image-001","sourceVersion":"image-1","mediaType":"image/png","byteLength":69,"contentSha256":"e878950f8091ec010cf5cc723bdea027a8539cf7147cfea199c2f666232dcd4e","contentBase64":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC"},"analysisInput":null}
```

```json
{"code":0,"msg":"success","requestId":"mock-ai-parse-001","data":{"runId":"parse-run-mock-001","operation":"PARSE_MATERIAL","profileId":"mock-parser-v1","implementationVersion":"mock-parser-1","inputSnapshotId":null,"parsing":{"parseId":"parse-mock-001","sourceSystem":"installation_management","sourceMaterialId":"material-image-001","sourceVersion":"image-1","contentSha256":"e878950f8091ec010cf5cc723bdea027a8539cf7147cfea199c2f666232dcd4e","completeness":"COMPLETE","units":[{"unitId":"image-1","kind":"IMAGE","index":1,"name":null,"status":"COMPLETE"}],"blocks":[],"issues":["测试图片没有可用业务内容"]},"analysis":null}}
```

### 4.2 分析调用

只提供已有费用条款文字及其未知状态，不假定已取得双方有效账单。内容沿用计费依据契约，来源编号均为开发示例。

```json
{"runId":"analysis-run-mock-001","operation":"ANALYZE_SKILL","profileId":"mock-model-v1","parseInput":null,"analysisInput":{"skill":"RECONCILIATION_EXPLANATION","skillVersion":"skill-mock-1","outputSchemaVersion":"fee-explanation-1","inputSnapshotId":"snapshot-mock-001","records":[{"inputId":"term-input-001","recordType":"BILLING_TERM","sourceSystem":"contract_system","sourceRecordId":"TERM-MOCK-001","sourceVersion":"term-1","data":{"recordText":"基础安装服务费用已包含设备搬运，不另行计取入场搬运费用。","applicability":"UNKNOWN","effectiveStatus":"UNKNOWN"}}],"parsedMaterials":[]}}
```

```json
{"code":0,"msg":"success","requestId":"mock-ai-analysis-001","data":{"runId":"analysis-run-mock-001","operation":"ANALYZE_SKILL","profileId":"mock-model-v1","implementationVersion":"mock-model-1","inputSnapshotId":"snapshot-mock-001","parsing":null,"analysis":{"skill":"RECONCILIATION_EXPLANATION","skillVersion":"skill-mock-1","outputSchemaVersion":"fee-explanation-1","inputSnapshotId":"snapshot-mock-001","status":"NEEDS_INFORMATION","summary":"已有基础安装包含搬运的条款，适用范围和账单口径仍需核实。","findings":[{"findingId":"finding-mock-001","type":"FEE_EXPLANATION","content":{"topic":"入场搬运费用范围","explanation":"条款写明基础安装包含设备搬运；当前有效状态和适用关系未知，暂不能据此判定单列费用应撤销。"},"evidenceRefs":[{"inputId":"term-input-001","blockId":null,"jsonPointer":"/recordText","quote":"基础安装服务费用已包含设备搬运，不另行计取入场搬运费用。"}]}],"openQuestions":["核实条款对本工单及费用的适用范围与有效性。","取得双方当前有效账单及计费口径后继续核对。"]}}}
```

## 5. 错误、失败恢复与真实接入条件

| 情况 | HTTP / code | 本系统处理 |
| --- | --- | --- |
| 参数或 operation 非法、分支输入不符、未登记配置 | 400 / 40001 | 修正后台调用，不接受任意提示词或模型 URL |
| 身份未验证 / 无分析及相应数据读取权限 | 401 / 40101、403 / 40301 | 停止发送内容，不借模型绕过来源权限 |
| 相同 runId 对应不同输入 | 409 / 40901 | 拒绝覆盖，保留原调用与结果 |
| 材料版本、摘要或已存输入快照不符 | 409 / 40902 | 重新取数并建立正确输入，不将新旧材料拼接 |
| 文件或模型输入超过配置上限 | 413 / 41301 | 拆分须保留覆盖清单与来源；未实现可靠拆分时提示超限，不静默截断 |
| 文件格式不支持、加密或无法完整读取 | 415 / 41501 | 提示材料处理条件；解析可部分取得时按 INCOMPLETE 返回并列出失败单元 |
| 供应商限流 | 429 / 42901 | 进入有界重试，不循环调用 |
| 供应商不可用 / 超时 | 503 / 50301、504 / 50401 | 保留原事项、输入与处理意见，显示分析未完成 |
| 模型拒绝、输出被截断、结构不符或伪造引用 | 502 / 50201 | 不发布为有效结果，保存诊断标识，不靠删字段或伪造引用凑成成功 |

```json
{"code":50201,"msg":"分析输出未通过结构或证据引用校验，尚未形成可用结果","data":null,"requestId":"mock-ai-invalid-001"}
```

解析开发预算每次 30 秒，推理每次 60 秒；仅 42901、50301、50401 可在满足提供方等待要求后最多再试一次。总预算分别为 61 秒、121 秒；等待至少 1 秒且超过剩余预算时不再重试；每次执行不得超过单次上限及总预算剩余时间。超时控制由后台任务执行，页面不等待同一个请求一直挂起。以上参数为 mock／单次推理适配的开发默认值。OpenCode 可能包含多次模型与工具调用，真实 CLI 配置须单独登记整项任务的有界超时、取消和重试预算，经实测后启用，不能直接用单次模型时限宣称整项任务已验证。对结构错误或业务缺项不循环重问模型；人员可在材料修复后继续原事项。

正式接入前须用同一组已核实材料验证：PDF 逐页覆盖与扫描页、图片文字与描述区别、XLSX 全 sheet 和单元格对应、公式与缓存值、损坏或加密文件、缺失及矛盾依据、虚构引用、结构不符、输入截断、旧分析晚到和提示文字试图改变指令。四类 Skill 分别验证结果与人工判断一致性，不能用“返回了 JSON”作为业务质量验收。

本轮明确能力开发约定和本地 OpenCode CLI 运行方案；Node 任务程序、上传入口、四类业务 Skill、具体模型与解析器接入、真实材料质量、调用成本和延迟、输入容量、权限范围及失败恢复仍待实现和实测。开发期 mock 与真实模式须显式区分，真实失败不能返回固定 mock 结论。未安装依赖、调用模型或推进其他 foundation 类别。
