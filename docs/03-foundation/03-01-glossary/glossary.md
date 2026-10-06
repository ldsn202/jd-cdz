# 京东充电桩工作台 2.0 · 术语表

> 版本：V1.12｜日期：2026-09-20｜状态：foundation 命名已核对
> 上游（我引用）：[BRD](../../01-brd/BRD-jd-charging.md) §1—4、[原型交互说明](../../02-prototype/interaction-spec.md) §1—3、[原型状态模块](../../02-prototype/assets/state.js) `roles` / `makeTask` / `transition`、[接口规范](../../../rules/coding-standards/09-api-design.md) §6、[原始材料读取](../03-02-external-apis/source-material-read.md) §2—3、[AI 推理与材料解析](../03-02-external-apis/ai-inference-material-parsing.md) §2—3、[正式安装明细提交](../03-02-external-apis/installation-detail-submit.md) §2—4、[京东账单读取](../03-02-external-apis/jd-bill-read.md) §3、§5、[服务商应收读取](../03-02-external-apis/provider-receivable-read.md) §3、[服务商资料与格式说明读取](../03-02-external-apis/provider-documents-format-read.md) §3、§5、[当前身份与业务权限取得](../03-02-external-apis/current-identity-permissions-read.md) §2—3、[原记录变化发现](../03-02-external-apis/source-record-changes-read.md) §1—3、[核查决定与补充记录同步](../03-02-external-apis/review-supplement-sync.md) §3—4
> 下游（引用我）：[外部依赖清单](../03-02-external-apis/external-dependency-list.md) §2—3、[安装工单上下文读取](../03-02-external-apis/installation-work-order-context.md) §1—3、[原始材料读取](../03-02-external-apis/source-material-read.md) §1—3、[购买订单与安装权益读取](../03-02-external-apis/purchase-order-installation-entitlements.md) §1—3、[服务商资料与格式说明读取](../03-02-external-apis/provider-documents-format-read.md) §1—5、[正式安装明细提交](../03-02-external-apis/installation-detail-submit.md) §1—5、[核查决定与补充记录同步](../03-02-external-apis/review-supplement-sync.md) §1—5、[京东账单读取](../03-02-external-apis/jd-bill-read.md) §1—3、§5、[服务商应收读取](../03-02-external-apis/provider-receivable-read.md) §1—3、§5、[计费条款与批准记录读取](../03-02-external-apis/billing-terms-approval-records-read.md) §1—5、[原记录变化发现](../03-02-external-apis/source-record-changes-read.md) §1—3、§5、[当前身份与业务权限取得](../03-02-external-apis/current-identity-permissions-read.md) §1—3、§5、[AI 推理与材料解析](../03-02-external-apis/ai-inference-material-parsing.md) §2—3、[处理事项实体关系](../03-03-er/er-work-item.md) §1—5、[材料与分析证据实体关系](../03-03-er/er-evidence.md) §1—4、[安装资料实体关系](../03-03-er/er-installation.md) §1—4、[双方账单与对账依据实体关系](../03-03-er/er-reconciliation.md) §1—5、[接入配置实体关系](../03-03-er/er-integration-config.md) §1—5、[身份与事项责任关系](../03-03-er/er-identity-responsibility.md) §1—3、[变化接收与执行关系](../03-03-er/er-change-execution.md) §1—5、[ER 范围与一致性总核对](../03-03-er/coverage-review.md) §2—6、[业务主流程与角色交接](../03-04-business-flows/flow-business-main.md) §1—7、[安装资料整理与提交](../03-04-business-flows/flow-installation-submission.md) §1—8、[业务流程覆盖与一致性总核对](../03-04-business-flows/coverage-review.md) §2—8、[处理事项域表结构](../03-05-schema/work-item-schema.md) §1—9、[材料与分析证据域表结构](../03-05-schema/evidence-schema.md) §1—7、[安装资料域表结构](../03-05-schema/installation-schema.md) §1—7、[双方账单与对账依据域表结构](../03-05-schema/reconciliation-schema.md) §1—7、[接入配置域表结构](../03-05-schema/integration-config-schema.md) §1—7、[foundation 全范围验收](../coverage-review.md) §1—5、[mainprd-jd-charging.md](../../05-prd/mainprd-jd-charging.md) §一—§七、[01-subprd-workbench-items.md](../../05-prd/01-subprd-workbench-items.md) 头部关联块、[02-subprd-orders-history.md](../../05-prd/02-subprd-orders-history.md) 头部关联块、[03-subprd-provider-config.md](../../05-prd/03-subprd-provider-config.md) 头部关联块、[04-subprd-installation-materials.md](../../05-prd/04-subprd-installation-materials.md) 头部关联块、[05-subprd-installation-review.md](../../05-prd/05-subprd-installation-review.md) 头部关联块、[06-subprd-reconciliation.md](../../05-prd/06-subprd-reconciliation.md) 头部关联块、[07-subprd-coordination.md](../../05-prd/07-subprd-coordination.md) 头部关联块；[mock开发主计划](../../07-delivery-plans/main-delivery-plan-jd-charging-mock.md) 上游清单

## 1. 核心业务概念

| 术语 | 定义 | 英文 / 代码命名 | 易混淆词 |
| --- | --- | --- | --- |
| 购买订单 | 用户购买充电桩及相关权益的交易记录，归属原订单系统 | purchase_order | 安装工单承载履约，购买订单承载交易 |
| 安装权益 | 购买订单所包含的安装服务约定，需核实对具体工单的适用范围与当前有效性 | installation_entitlement | 权益有效不代表实际施工完成，也不代表额外费用已批准 |
| 安装工单 | 组织一次安装履约及其资料、核查和协同的业务记录 | installation_work_order | 处理事项只描述其中需要办理的问题；配置事项也可独立于安装工单存在 |
| 处理事项 | 由当前责任人处理的资料确认、差异核查、费用核实、接入配置或协同工作 | work_item | 同一安装工单可有不同阶段的事项；补充回复继续原事项 |
| 身份引用 | 按可靠身份来源与稳定主体编号定位的人员或后台程序引用 | identity_reference | 不以姓名、角色或原系统账号单独代替主体，不在工作台注册新账号 |
| 当前身份 | 经服务端核实的一次人员或后台程序身份上下文，包含当次授权与原账号映射 | current_identity | 历史上下文只供追溯，不作为当前权限；后台程序不能代替人员作业务决定 |
| 业务权限 | 一次身份上下文中将允许动作与明确业务范围绑定的授权项 | business_permission | 动作与范围不得跨授权项拼接；角色名称、组织归属和数据可见不自动授予办理权 |
| 当前责任人 | 当前环节中有职责执行处理动作的人员 | assignee | 角色表示职责类别；当前责任人表示具体办理人 |
| 服务商 | 承接安装作业、拥有自身作业和应收记录的业务组织 | service_provider | 服务商人员是组织内的办理人；供料方可能另为物业等主体 |
| 安装方案 | 用于安排及核查安装工作的当前有效方案 | installation_plan | 正式安装明细描述实际完成情况，两者可能存在差异 |
| 安装资料草稿 | 从材料整理出的待确认安装信息，尚未正式提交 | installation_draft | 草稿不直接替代正式安装明细 |
| 安装资料草稿版本 | 同一草稿在保存或确认时固定的完整安装内容及其依据 | installation_draft_version | 编辑已确认内容须生成新版本，不能改写当时提交内容 |
| 安装明细提交记录 | 一次人员确认所对应的稳定提交内容、处理状态和原系统结果 | installation_detail_submission | 接口正常返回或人员已确认均不等于原系统已提交成功 |
| 正式安装明细 | 由责任人员核实并正式提交的实际安装记录 | installation_detail | 套餐额度、领料数量和费用数量分别有自身含义，不能直接当作实际安装数量 |
| 原始材料 | 供业务核实的表格、文件、照片或业务记录 | source_material | 分析结果是对材料的整理与解释；原始材料保留本身内容 |
| 原始材料版本 | 同一原文件在确切来源版本下的引用及已取得内容，保留原版本和内容摘要 | source_material_version | 来源版本与文件摘要分别保存，读取失败不代表空文件 |
| 材料解析结果 | 对一份确定材料版本形成的已保存解析内容、覆盖情况与实现版本 | material_parsing | 解析完成不等于证据充分，重新解析不覆盖旧结果 |
| 解析内容块 | 一次材料解析内带位置的文字、单元格或图片描述 | parsed_content_block | 位置属于对应解析与文件版本，图片描述不能当原文引文 |
| 分析输入代次 | 事项实际分析依赖发生变化时递增的编号，用于拒绝过期结果 | analysis_generation | 普通处理进度的行版本变化不自动使分析失效 |
| 分析输入快照 | 某事项一次分析实际使用的固定输入内容及配置版本 | analysis_input_snapshot | 保存内容而非只保存编号，不保证多个来源同时更新 |
| 分析输入项 | 输入快照内的一份结构化记录内容或一份确定的材料解析引用 | analysis_input_item | 输入编号只在本快照内唯一，记录与解析两种类型互斥 |
| 分析发现 | 一份分析结果中带类型、内容与依据的具体发现 | analysis_finding | 待核实问题可单独保留，没有依据不能伪装已确认发现 |
| 证据引用 | 指向支持某项判断的具体材料、位置及相应版本的引用 | evidence_reference | 找到相关材料仍需判断其是否足以支持当前业务结论 |
| 分析结果 | 系统对资料整理、差异、依据及待核实问题形成的结果 | analysis_result | 分析完成不代表人工审核通过 |
| 人工决定 | 责任人按业务职责作出的提交、通过、退回、异常处理等决定 | human_decision | 决定所依据的分析结果应可追溯，不能把 AI 建议记成人员已批准 |
| 补充回复 | 对原事项所提问题的回答及新增材料 | supplemental_response | 回复本身不代表原问题已解决，仍按原事项继续核实 |
| 处理记录 | 记录业务动作、执行人、说明与时间的过程信息 | activity_record | 当前状态表示此刻进展；处理记录保留此前发生过的动作 |
| 接入配置 | 已明确适用范围的字段含义、转换方式及费用项目对应关系 | integration_config | 配置草稿需确认后启用；已生效关系用于同类资料的后续处理 |
| 接入配置版本 | 一份接入配置中固定的字段含义、受控转换规则及适用条件 | integration_config_version | 原格式版本与本地配置版本分别保存，候选版本不自动生效 |
| 试转换记录 | 用确定配置版本和固定资料输入执行的一次转换及其验证结果 | configuration_trial | 查看预览不等于验证通过，单份资料通过不证明全部范围适用 |
| 变化读取配置 | 已登记的来源、服务商范围、取得方式、配置代次与接收位置 | change_feed | 更换范围或重建起点不得沿用未经核实的旧位置 |
| 变化接收批次 | 一次完整校验并可靠接收的非空变化批次及前后读取位置 | change_batch | 接收完成不代表下游分析或业务处理完成 |
| 原记录变化 | 来源记录新增、更新或明确移除的稳定提示 | source_change | 变化编号不等于原版本，提示不代替原文或业务成功回执 |
| 后台任务 | 已可靠保存、可恢复的一项后台处理工作及其目标与进展 | background_job | 区别于人员处理事项；失败重试不重复生成同类人员待办 |
| 执行尝试 | 后台任务的一次实际执行及程序身份、核验依据和结果 | execution_attempt | 执行中断不等于外部业务写入失败 |
| 能力调用 | 以稳定 runId 绑定确定输入、解析或分析操作及实现配置的一次逻辑调用 | capability_call | 一次调用可有多次尝试，只采用一份通过校验的结果 |
| 外部业务写入 | 由人员确认授权、以稳定编号登记完整请求并核实原系统结果的一次业务写操作 | external_write_operation | 与网络尝试分开；明细提交记录是其一种，不另造第二笔写入 |
| 版本 | 用于区分同一配置、材料、分析结果或账单先后内容的标识 | version | 不同对象分别记录版本；分析结果版本不能代替账单版本 |
| 京东账单 | 京东原账单系统形成的独立费用记录 | jd_bill | 与服务商应收分别形成，不因对方报送金额而自动改写 |
| 账单分项 | 原账单中独立记录的某项费用及其计费范围、金额 | bill_item | 与实际施工项目、另一方账单分项未必一一对应，不能仅按名称相同合并 |
| 服务商应收 | 服务商原系统维护的本方应收费用记录 | provider_receivable | 由服务商应收负责人按原职责维护，不能视为京东已认可的应付 |
| 计费条款 | 合同或费用约定中明确服务计费范围与条件的内容 | billing_term | 条款适用需要核实，找到条款不等于额外费用已获批准 |
| 费用批准记录 | 原业务流程中针对具体费用范围形成的批准、驳回等决定记录 | fee_approval_record | 施工签字与验收记录不自动具备费用批准含义，批准也不等于已付款 |
| 业务对账 | 按适用的项目对应与费用依据比较双方记录并处理差异 | business_reconciliation | 财务结算及付款按原流程继续，本期不执行这些操作 |
| 对账记录 | 某事项一次固定输入、适用关系与范围下形成的比较结果及缺项 | reconciliation_record | 由程序保存本次比较事实，不等于 AI 分析、费用批准或付款记录 |
| 对账分组 | 一次对账中按已确认适用关系组织的双方原分项集合及比较结果 | reconciliation_group | 不改写原分项，未找到对应的单边项目仍需保留 |
| 核对一致 | 在有效对应关系及核对范围内，双方费用比较结果一致 | reconciled | 总额相同不足以掩盖分项差异；核对一致不表示已结算或已付款 |
| 本环节完成 | 当前事项需要执行的处理已完成 | completed | 资料已提交、审核通过、异常已处理等均须保留具体完成原因；不能统一解读为整个安装业务结束 |

## 2. 安装数量与范围用语

| 术语 | 定义 | 英文 / 代码命名 | 易混淆词 |
| --- | --- | --- | --- |
| 安装项目 | 实际施工内容的项目名称 | installation_item | 账单项目按计费口径组织，未必与施工项目逐项同名 |
| 权益服务范围 | 安装权益明确覆盖的服务内容 | covered_service_scope | 与方案要求、服务商实际施工范围分别核实 |
| 权益数量上限 | 安装权益明确包含的对应数量上限 | included_quantity | 不代表实际已使用数量；未知、零额度和明确不限量含义不同 |
| 方案安装数量 | 当前有效方案中对应安装项目的约定数量 | planned_quantity | 用于与实际安装数量对照，不能记成实际完成量 |
| 计费数量 | 费用项目按原计费口径记录的数量 | billed_quantity | 不等同于实际施工量，不能按账单金额倒算施工事实 |
| 实际安装数量 | 对应安装项目实际完成的数量 | installed_quantity | 领料量、套餐内数量、额外计费数量需要分别核实 |
| 单位 | 数量对应的计量单位 | unit | 数值相同而单位不同，不能直接比较 |
| 供料方 | 为某项施工提供材料的主体 | material_supplier | 安装服务商承担施工，不必同时承担全部供料 |
| 服务范围 | 服务商在该项目中实际承担的工作内容 | service_scope | 供料及安装、仅安装表达不同职责与计费范围 |

## 3. 业务角色

京东侧统一使用“京东业务账号”，在同一账号下处理安装核查、业务对账和履约协同。每家服务商统一使用一个“服务商账号”，承担本公司的接入配置、资料及应收相关工作。下表职责用于说明业务动作，不要求分别登录；不同服务商的数据和操作范围隔离。

| 术语 | 定义 | 英文 / 代码命名 | 易混淆词 |
| --- | --- | --- | --- |
| 京东安装资料核查人员 | 核实安装事实、差异和证据，并作出审核决定的人员 | installation_reviewer | 资料核查与财务审批分属不同职责 |
| 京东业务对账人员 | 核实双方费用差异与业务依据的人员 | business_reconciler | 原型 finance 指业务对账身份，不表示拥有全部财务权限 |
| 服务商资料人员 | 核实、提交安装资料及补充回复的人员 | provider_document_clerk | 资料提交权限不自动包含修改应收权限 |
| 服务商应收负责人 | 核实费用并有权维护本方原应收记录的人员 | provider_receivable_owner | 只维护本方原账目，无权直接修改京东账单 |
| 服务商对接人员 | 确认本方字段含义及接入关系的人员 | provider_integration_contact | 配置启用责任按原职责明确，不能据角色名称推导新的全员审批 |
| 京东物流履约协同人员 | 协调安装安排、入场条件及相关阻碍的人员 | fulfillment_coordinator | 不自动承担资料审核或全部费用核实职责 |

## 4. 四类 Skill

| 术语 | 定义 | 英文 / 代码命名 | 易混淆词 |
| --- | --- | --- | --- |
| 接入配置 Skill | 辅助理解服务商资料，形成配置草稿与待确认问题 | integration_configuration_skill | 已生效关系的日常执行由程序承担 |
| 安装资料整理 Skill | 从分散材料形成带依据、缺项与冲突说明的安装草稿 | installation_extraction_skill | 正式资料仍由责任人确认提交 |
| 安装资料核查 Skill | 围绕安装差异查找相关证据，提供核查参考 | installation_evidence_skill | 人工核查决定保留，不能以找到材料直接判定通过 |
| 对账差异解释 Skill | 查找计费条款及相关记录，解释费用疑点 | reconciliation_explanation_skill | 已确认关系的金额计算与正式业务决定分别处理 |

## 5. 命名使用约定

1. 中文正文使用本表“术语”列；页面可以使用语义明确的短标签，例如“待处理事项”“安装核查”。
2. 英文列为概念与内部命名基准，采用小写加下划线。HTTP JSON 字段按接口规范转换为 camelCase，如 `planned_quantity → plannedQuantity`、`installed_quantity → installedQuantity`；枚举值使用 UPPER_SNAKE_CASE。同一概念在不同层的命名映射不改变含义。表名与字段在后续表结构文档中明确，本表不要求每个术语各建一张表。
3. 同一含义不另起名称。确需调整时，修改本表并同步实际引用文档。
4. 原型保持现有实现，不在本轮批量改名。后续正式代码按本表命名，原型简写按下表理解。

| 原型当前写法 | 本表对应含义 | 后续设计需保留的区别 |
| --- | --- | --- |
| task | 处理事项 `work_item` | 与安装工单分开；配置事项无需伪装成安装工单 |
| order | 安装工单编号或原型中的事项关联编号 | 正式设计分别说明工单关联和独立配置事项关联 |
| owner | 当前责任人 `assignee` 的原型角色简写 | 正式人员身份与角色需明确，不能把角色字符串当用户账号 |
| docs | 原始材料及其证据引用 | 材料内容、引用位置和版本分别说明 |
| status | 原型简化的进展字段 | 待人员处理、等待补充、分析中与业务完成含义不同；状态转换留给业务流程及后续设计 |
| done | 当前环节完成 | 结合具体处理记录区分正式提交、核查通过、异常处理完成、核对一致等结果 |
| canApprove | 原型中固定场景的按钮可用条件 | 正式设计按有效依据、业务规则及权限确定；不能照搬成 AI 已作出业务批准 |

本轮只统一概念与名字。接口字段、表结构、权限规则和完整状态转换在相应文档中逐项定义。
