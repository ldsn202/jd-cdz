# PRD：安装核查与补充

> 状态：草稿｜基线版本：v1.0｜最后更新：2026-09-20
> 上游（我引用）：[mainprd-jd-charging.md](mainprd-jd-charging.md) §二、§五、§七、[术语表](../03-foundation/03-01-glossary/glossary.md) §1—4、[安装资料与核查接口](../03-foundation/03-06-provided-apis/installation-apis.md) §3—4、[材料预览与上传接口](../03-foundation/03-06-provided-apis/material-apis.md) §1、§3、[工作台查询接口](../03-foundation/03-06-provided-apis/workbench-apis.md) §2—4、[接口公共约定](../03-foundation/03-06-provided-apis/common-contract.md) §2—5、[材料与分析证据域表结构](../03-foundation/03-05-schema/evidence-schema.md) §2—5、[安装资料域表结构](../03-foundation/03-05-schema/installation-schema.md) §2—3、[处理事项域表结构](../03-foundation/03-05-schema/work-item-schema.md) §3、§5—6、[安装核查与补充流程](../03-foundation/03-04-business-flows/flow-installation-review.md) §1—7、[安装资料核查 Skill](../04-skills/install-evidence-finder/SKILL.md) §1—3、[原型页面清单](../02-prototype/page-list.md) §1、[原型交互说明](../02-prototype/interaction-spec.md) §1—3、[运行数据规则](../../rules/runtime-mock-data.md) §2—4、[ai-inference-material-parsing](../03-foundation/03-02-external-apis/ai-inference-material-parsing.md) §2.3.1
> 下游（引用我）：[mainprd-jd-charging.md](mainprd-jd-charging.md) §七；[五项评审记录](../00-process/00-02-progress/prd-review-five-issues-20260920.md) 判断与处理；[tc-review.md](../06-testcase/review/tc-review.md) 验收矩阵；开发计划引用见本关联块；[mock T4.2子计划](../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T4.2-business-integration.md) PRD双链·读
>
> ⚠️ 本文档描述的是目标态。与代码现状有出入时，以真实代码为准，按本文档的目标态补齐。

---

## §1 文档范围

本文档覆盖**安装核查与补充**（京东安装资料核查人员打开核查事项、核实正式明细与方案差异及 Skill 汇集的证据，到作出通过或退回决定、退回后服务商补充回复继续原事项、新分析可用后继续核查为止；不含服务商侧资料整理与正式提交，见 [04-subprd-installation-materials.md](04-subprd-installation-materials.md)；不含费用对账与付款，见 [06-subprd-reconciliation.md](06-subprd-reconciliation.md)）。

三条边界贯穿全文：

- **分析不代替审核决定。** 分析结果是核查参考，通过或退回由当前有权核查人作出；找到支持证据、AI 表述肯定、数值一致均不构成自动通过。
- **没有依据不能伪装已确认发现。** 无可靠证据引用时如实呈现缺项与待核实问题，不把分析缺项展示为已核实事实。
- **补充回复本身不代表原问题已解决。** 回复成功只表示收到回应，原问题是否解决仍由核查人按新分析核实。

### 需求清单

| # | 需求 | 需求简述 | 对应章节 |
|---|------|---------|---------|
| R1 | 差异与证据呈现 | 方案与正式明细逐项差异，支持/冲突/不足证据及原文定位与版本 | §3.1 |
| R2 | 费用依据核查 | 围绕费用相关差异核实依据，区分施工事实与费用批准 | §3.2 |
| R3 | 审核决定 | 通过或退回，版本条件与当前代次校验，同步原系统并回查 | §3.3 |
| R4 | 退回补充接续 | 退回生效后交服务商，回复继续原事项，不新建重复事项 | §3.4 |
| R5 | 分析失败恢复 | 失败真实呈现，人员重新分析或按缺项推进，不降级为固定答案 | §3.5 |
| R6 | 变化与代次保护 | 新版材料/明细到达后输入代次递增重新分析，拒绝过期结果 | §3.4、§3.6 |

---

## §2 页面布局

本功能块承载于三个原型场景页（[page-list.md](../02-prototype/page-list.md) §1）：安装核查详情（春和庭 `#task/bridge`）、费用依据核查（尚澜府 `#task/fee`）、分析失败恢复（锦绣里 `#task/failed`）。整页布局见 [mainprd-jd-charging.md](mainprd-jd-charging.md) §五。

```
┌─────────────────────────────────────┐
│ A. 事项上下文条                        │  ← 工单、服务商、明细/方案来源版本、分析状态
├─────────────────────────────────────┤
│ B. 差异与证据区                      │  ← 本文档 §3.1（费用场景 §3.2）
│    ├ 逐项差异（方案量 vs 实际量）      │
│    ├ 证据列表（支持/冲突/不足）        │
│    └ 原文定位（查看原文侧栏入口）      │
├─────────────────────────────────────┤
│ C. 待核实问题与补充往来区             │  ← 本文档 §3.4
├─────────────────────────────────────┤
│ D. 决定操作区                        │  ← 本文档 §3.3（通过/退回/转异常）
├─────────────────────────────────────┤
│ E. 失败与恢复提示区                  │  ← 本文档 §3.5（分析失败场景）
└─────────────────────────────────────┘
```

**联动规则**：决定受理或补充回复后，本页与待处理事项列表同时更新，先骨架屏后替换渲染；分析失败事项以真实失败状态进入待处理列表，不要求人员逐项触发 Skill。

---

## §3 区块详述

### 3.1 差异与证据呈现区

**数据来源**：`GET /api/admin/charging/work-items/{workItemId}` 返回的 `analysis`（`{resultId,runId,inputSnapshotId,analysisGeneration,status,summary,findings,openQuestions,validatedAt}`）与事项上下文字段。

**展示内容**：

| 内容 | 展示规则 |
|------|---------|
| 逐项差异 | 方案安装数量（plannedQuantity）与实际安装数量（installedQuantity）逐项对照，保留各自含义；方案量是比较依据，不记成实际完成量 |
| 证据分组 | findings 按 assessment 分支持（SUPPORTED）/冲突（CONFLICTING）/不足（INSUFFICIENT）三组展示；局部支持不能扩展为整单通过 |
| 原文定位 | 每条证据沿 evidenceRefs 定位：解析材料经 blockId 定位原 PDF 页、图片或 sheet/cellRange；业务记录经 jsonPointer 定位字段；点击打开原始证据侧栏经 `GET /api/admin/charging/material-versions/{materialVersionId}/content` 查看原文，材料来源版本随证据一并展示 |
| 证据类型标记 | IMAGE_DESCRIPTION 的 quote 为 null，页面标明是图片描述，不当原文引文 |
| 待核实问题 | `openQuestions` 逐条列出；NEEDS_INFORMATION 时至少一项，如实展示缺什么，不显示为已核实 |
| 分析代次 | 展示 `analysisGeneration` 对应结果；只展示当前有效结果，旧结果不覆盖新输入 |

**前端职责**：直接渲染接口字段，不做证据充分性判断、不合并冲突结论、不把 SUPPORTED 渲染成"已审核通过"。

### 3.2 费用依据核查

费用相关差异（如增量施工对应额外费用）在本功能块内只核实依据是否存在与适用，不核实金额是否应批准——费用批准按原职责另行办理，核查人无费用批准权。

| 核实点 | 展示与要求 |
|--------|-----------|
| 施工事实依据 | 施工验收签字等证明其实际覆盖的施工事实 |
| 费用批准疑点 | 涉及额外费用是否获批的问题，仅有施工验收签字仍不能消除该疑点；应补充适用依据或转业务异常处理 |
| 适用范围 | 找到计费条款或材料仅表示可以核实依据，适用范围与版本有效性仍由核查人判断 |
| 针对性 | 只针对存在该问题的事项，不要求每笔安装都补一份费用批准记录 |

### 3.3 决定操作区

核查人核实当前明细与依据后作出决定。`POST /api/admin/charging/work-items/{workItemId}/review-decisions`，需 DECIDE_INSTALLATION_REVIEW 及当前核查责任。正文继承 DecisionInput，必填 `action`：APPROVE / REQUEST_SUPPLEMENT；`analysisResultId` 必填且为当前代次。

| 决定 | 请求约束 | 生效与结束条件 |
|------|---------|--------------|
| 审核通过（APPROVE） | `questions` 必为空数组；不允许未解决缺项或不完整依据直接通过 | 同事务保存决定、REVIEW_SYNC 写入、后台任务和未决指针，返回 202；源端成功后才将通过记为完成（REVIEW_APPROVED） |
| 要求补充（REQUEST_SUPPLEMENT） | 额外必填 `questions`，为非空 `{findingId,question,requiredMaterialDescription}`[]；findingId 可 null（人工新增问题），question 非空 | 源端确认退回成功后，把有效退回绑定 active_supplement_request_id 并交给明确的服务商资料责任人；尚未取得责任人时保留待分配，不给同角色所有人员放行 |
| 转异常 | 写明无法通过或普通补充无法解决的原因，按原职责协调 | 业务处置记录，不调用通过或退回接口伪造外部状态；处置完成并记录结果后才能关闭，关闭不显示为审核已通过 |

**202 受理不等于原系统已成功。** 后续状态经 `GET /api/admin/charging/operations/{operationId}` 取得；页面如实区分尚未受理、明确拒绝、正在处理、结果未知、已成功五种含义，超时不换编号重提。

### 3.4 退回补充与原事项接续

**退回后继续原事项，不新建重复事项。** 服务商的确认与回复视图与京东侧复核共用同一事项。

服务商侧由 `POST /api/admin/charging/work-items/{workItemId}/supplements` 提交回复（服务商侧页面细节见 [04-subprd-installation-materials.md](04-subprd-installation-materials.md)）：需 SUBMIT_SUPPLEMENT 及当前资料责任，正文继承 DecisionInput，必填 `requestDecisionId`、`replyText`、`materialVersionIds`（string[] 可为空，但必须满足所提问题；有新附件必须先上传并取得确切版本）。所回复决定必须是本事项仍有效的退回，关联原外部操作 replyToOperationId，由后端查得。

| 环节 | 本侧展示与规则 |
|------|--------------|
| 待回复期间 | 事项为 WAITING_SUPPLEMENT，京东可查看进展，不在未解决的补充要求下直接通过 |
| 回复成功后 | 输入代次增加、重新准备分析，仍接续原核查事项；材料或分析失败不要求服务商重复提交已成功回复 |
| 新分析可用后 | 展示本轮问题、回复、新旧结果差异；不因收到回复或分析完成自动通过 |
| 仍需补充 | 形成新的退回要求；上一轮问题和回复保留，不能覆盖成最新文字 |
| 明细更正 | 涉及正式安装数量等更正按原系统明细修订路径办理，文字回复不能改写正式明细 |
| 新版材料到达 | 文件更换使相关事项输入代次增加并清空当前分析指针，实际重新生成结果，旧证据继续受限保留 |

### 3.5 分析失败恢复

分析失败以真实状态进入待处理列表（锦绣里场景）。失败可能是材料读取失败（没有可用分析）或有效分析中的业务缺项（NEEDS_INFORMATION），两者分别展示，不能把空结果当作没有差异。

| 失败情况 | 页面呈现 | 人员可执行动作 |
|---------|---------|--------------|
| 材料读取/解析失败 | 展示失败位置、失败原因与已取得的已有资料 | 重新分析（恢复读取与准备）；恢复后继续原事项，不要求重交资料 |
| 必需输入缺失或解析不足 | 状态 NEEDS_INFORMATION，列出具体缺口 | 按缺项推进：针对具体问题提出补充要求 |
| 回复成功但分析失败 | 保留成功回复，展示分析进展或失败原因 | 恢复分析即可，不要求服务商重交回复 |
| 分析处理中 | 展示处理中状态 | 等待，不能并行批准或退回 |

**失败恢复不降级为固定答案。** 分析不可用时不展示预填结论或模拟成功结果，不借 mock 成功文案代替真实恢复。

### 3.6 数据链路

> 端到端追踪：UI 元素 ← API 字段 ← 数据源。字段完整定义见接口文档，这里只写本功能块用到的。

| UI 元素 | API 字段 | 计算规则 | 数据源 |
|---------|----------|---------|--------|
| 差异对照行 | 上下文快照中方案 plannedQuantity 与明细 installedQuantity | 逐项对照，保留各自含义与单位，不互相换算 | `installation_context_snapshot.context_json` |
| 证据分组与内容 | `analysis.findings[].type / content / evidenceRefs` | 直透；仅返回已授权内容及当前有效结果 | `analysis_result.findings_json` |
| 原文定位 | evidenceRefs 的 `inputId / blockId / jsonPointer / quote` | 沿解析 blockId 定位原页/sheet/cellRange，或按 jsonPointer 定位记录字段；quote 与定位原内容一致 | `material_parsing.blocks_json`、`analysis_input_item.data_json` |
| 材料版本与原文 | `material-versions` 的 `sourceVersion / readState / parsing` | content 接口版本须 VERIFIED 按版本返回字节，未取得正文返回 42201 | `source_material_version` |
| 待核实问题 | `analysis.openQuestions` | 直透，NEEDS_INFORMATION 必有非空问题 | `analysis_result.open_questions_json` |
| 分析代次与状态 | `analysisGeneration`、`analysisStatus` | 直透；发布结果须匹配当前代次，旧响应不覆盖新输入 | `work_item.analysis_generation`、`work_item.current_analysis_result_id` |
| 决定进展 | `operations` 的 `status / receipt / verifiedAt` | 由执行事实计算，外部成功与本地接续分开显示 | `external_write_operation`（执行域） |
| 退回绑定 | 决定生效后事项 active_supplement_request_id | 服务端绑定当前有效退回；同一退回轮次至多一份成功回复 | `work_item.active_supplement_request_id`、`supplemental_response` |
| 补充往来 | 本轮问题、回复与新旧结果差异 | 服务端按决定与回复关联组织；前轮问题回复保留 | `human_decision`、`supplemental_response` |
| 事项状态联动 | 决定/回复/恢复后待处理列表更新 | 服务端真实状态流转 | `work_item`、`activity_record` |

### 3.7 异常与兜底

**服务端兜底**：接口异常按统一返回壳返回错误码，前端按下表执行渲染兜底。

| 场景 | 处理 |
|------|------|
| 尚无可用分析（analysis 为 null） | 展示准备中或失败的真实状态与已有资料，不显示预填结论 |
| 分析字段为 null 或缺项 | 如实展示"待核实"与缺项说明，不造值、不默认 |
| 版本变化（40901） | 保留人员已填意见，重读最新版本后重新确认 |
| 存在未决写入（40903） | 返回可读的原操作入口，继续查原结果，不并行重发 |
| 缺材料或依据（42201） | 返回缺项说明并如实展示，不造值 |
| 无决定权限（403/40301） | 停止动作，不隐藏为成功；有查看权限不等于有决定权限 |
| 材料版本不可见/不存在（404） | 提示无法查看，不返回资源细节 |
| 决定/回复请求超时 | 先按原 Idempotency-Key 或 operationId 回查，不盲目重发 |

---

## §4 本功能块使用的数据字段

| 表名 | 状态 | 本功能块使用字段 | 完整定义 |
|------|------|--------------|----------|
| `work_item` | 新建 | `item_kind`、`status`、`assignee_identity_id`、`row_version`、`responsibility_version`、`analysis_generation`、`current_analysis_result_id`、`active_supplement_request_id`、`pending_write_id`、`completion_code`、`completion_basis_json` | [work-item-schema.md](../03-foundation/03-05-schema/work-item-schema.md) §3 |
| `human_decision` | 新建 | `origin`、`action_type`、`request_key`、`actor_identity_id`、`expected_work_item_version`、`expected_responsibility_version`、`analysis_result_id`、`content_json` | 同上 §5 |
| `supplemental_response` | 新建 | `request_decision_id`、`submit_decision_id`、`reply_text`、`materials_json`、`success_verified_at` | 同上 §6 |
| `analysis_result` | 新建 | `snapshot_id`、`status`、`summary`、`findings_json`、`open_questions_json`、`validated_at` | [evidence-schema.md](../03-foundation/03-05-schema/evidence-schema.md) §2 |
| `analysis_input_snapshot` / `analysis_input_item` | 新建 | `analysis_generation`、`config_versions_json`、`input_key`、`input_kind`、`parsing_id`、`data_json` | 同上 §2 |
| `material_parsing` / `source_material_version` | 新建 | `blocks_json`、`units_json`、`source_version`、`read_state`、`content_sha256` | 同上 §2 |
| `installation_context_snapshot` | 新建 | `source_plan_version`、`source_detail_version`、`context_json`、`completeness`、`missing_parts_json` | [installation-schema.md](../03-foundation/03-05-schema/installation-schema.md) §2 |
| `external_write_operation` | 执行域 | 决定与回复的同步状态、回执、回查证据（经 operations 接口读取，本功能块不直写） | [work-item-schema.md](../03-foundation/03-05-schema/work-item-schema.md) §3（pending_write_id） |

---

## §5 接口契约

### `GET /api/admin/charging/work-items/{workItemId}`

> 完整契约见 [workbench-apis.md](../03-foundation/03-06-provided-apis/workbench-apis.md) §3，这里只写本功能块的业务说明。

- **本区域使用的响应字段**：§2 list 单项字段，以及 `analysis` / `pendingOperation` / `completion` / `allowedActions` / `blockedReasons` / `relatedItems`
- **业务说明**：`analysis` 仅返回已授权内容及当前有效结果；`allowedActions` 按当前权限、责任和状态计算，仅供展示，提交时重新检查；status 与分析状态分开，不能把分析结束当成人员事项完成

### `POST /api/admin/charging/work-items/{workItemId}/review-decisions`

> 完整契约见 [installation-apis.md](../03-foundation/03-06-provided-apis/installation-apis.md) §3。

- **权限**：DECIDE_INSTALLATION_REVIEW 及当前核查责任
- **请求正文**：继承 DecisionInput，必填 `action`（APPROVE / REQUEST_SUPPLEMENT）；`analysisResultId` 必填且为当前代次。REQUEST_SUPPLEMENT 额外必填 `questions`，为非空 `{findingId,question,requiredMaterialDescription}`[]，findingId 可 null，question 非空；APPROVE 的 `questions` 必为空数组
- **成功返回**：同事务保存决定、REVIEW_SYNC 写入、后台任务和未决指针，返回公共 202；HTTP 202 不得显示"提交已成功写入原系统"

### `POST /api/admin/charging/work-items/{workItemId}/supplements`

> 完整契约见 [installation-apis.md](../03-foundation/03-06-provided-apis/installation-apis.md) §4。

- **权限**：SUBMIT_SUPPLEMENT 及当前资料责任
- **请求正文**：继承 DecisionInput，必填 `requestDecisionId`、`replyText`、`materialVersionIds`（string[] 可为空，但必须满足所提问题）
- **成功返回**：公共 202；原系统成功后固定回复成功事实，输入代次增加、重新准备分析，仍接续原核查事项

### `GET /api/admin/charging/material-versions/{materialVersionId}` 与 `.../content`

> 完整契约见 [material-apis.md](../03-foundation/03-06-provided-apis/material-apis.md) §1。

- **业务说明**：证据原文查看使用；版本须 VERIFIED 才可取 content，未取得正文返回 42201；每次核实权限，禁止公开存储 URL

### `GET /api/admin/charging/operations/{operationId}`

> 完整契约见 [workbench-apis.md](../03-foundation/03-06-provided-apis/workbench-apis.md) §4。

- **本区域使用的响应字段**：`status` / `receipt` / `verifiedAt` / `localContinuationStatus`
- **业务说明**：超时按原 Idempotency-Key 重放查受理结果，存在 operationId 时继续查该操作，不换编号强行重提

---

## §6 管理台配置

本功能块无管理端可配项。硬编码项：进展含义文案、失败提示文案、枚举取值——不可配。

---

## §7 验收标准

### 区块展示

| # | 场景 | 输入条件 | 预期结果 |
|---|------|---------|----------|
| 1 | 差异与证据呈现 | 事项含方案 12 米/明细 18 米差异，findings 含 SUPPORTED、CONFLICTING、INSUFFICIENT 各一条 | 逐项差异正确对照；证据按支持/冲突/不足分组；每条证据带来源材料版本与原文定位，点击打开原文侧栏沿 blockId 定位原页；SUPPORTED 不显示为"已审核通过" |
| 2 | 证据缺项如实展示 | 分析为 NEEDS_INFORMATION，openQuestions 2 条，findings 为空 | 逐条列出需补材料或字段，展示为待核实，不伪装为已确认发现 |
| 3 | 费用依据核查 | 尚澜府场景，费用差异仅有施工验收签字证据 | 展示该证据仅覆盖施工事实；费用批准疑点仍在待核实问题中，不消除 |
| 4 | 分析失败真实呈现 | 锦绣里场景，材料读取失败 | 展示真实失败状态、失败位置与已有资料；不降级为固定答案，不显示预填结论或模拟成功；处理中不能审批 |
| 5 | 失败恢复动作 | 读取失败恢复后分析可用 | 原事项展示新分析结果；保留失败前已有资料，不要求服务商重交资料 |

### 数据与接口

| # | 场景 | 输入条件 | 预期结果 |
|---|------|---------|----------|
| 6 | 审核通过链路 | 当前代次 analysisResultId，APPROVE 且 questions 为空 | 202 受理；源端成功后事项以 REVIEW_APPROVED 完成；202 受理页不显示"已写入原系统" |
| 7 | 退回后原事项接续 | REQUEST_SUPPLEMENT 成功，服务商提交 supplements | 有效退回绑定 active_supplement_request_id；回复继续原事项，不新建重复事项；同一退回轮次至多一份成功回复 |
| 8 | 回复后重新分析 | 回复源端成功 | 输入代次（analysis_generation）增加、重新准备分析，仍接续原核查事项；不因收到回复自动通过；前轮问题与回复保留 |
| 9 | 过期分析结果被拒 | 用非当前代次的 analysisResultId 提交通过或退回 | 服务端拒绝（40901），不保存决定；提示重读最新版本后重新确认 |
| 10 | 新版材料到达拒绝旧结果 | 核查期间新材料版本到达使输入代次增加 | 旧当前分析失效或明确标为旧依据，暂停基于旧内容的批准或退回；重新分析后人员只核实受影响内容 |
| 11 | 无权限决定被拒 | 无 DECIDE_INSTALLATION_REVIEW 或非当前核查责任人提交决定 | 返回 403/40301，不保存决定，不隐藏为成功；待分配事项不给同角色所有人员放行 |
| 12 | 未决写入与幂等 | 事项存在未决写入时再次提交决定；同 Idempotency-Key 同内容重放 | 前者返回 40903 及原操作入口；后者返回原结果不建第二笔决定，同键不同内容返回 40902 |
| 13 | 证据原文版本校验 | 打开 readState 为 REFERENCED 的材料 content | 返回 42201，不返回字节；VERIFIED 版本按版本返回原文，每次核实权限 |

### 评审补充：场景、补充输入与状态

- §2 的春和庭、尚澜府、锦绣里是三种详情场景，均为 INSTALLATION_REVIEW；五类kind不扩展。统一核查组件按当前分析及失败事实显示内容，同一事项可以同时涉及费用依据和读取失败，恢复后workItemId和kind均不变。详见工作台接口 §7.1。
- §3.4 的 WAITING_SUPPLEMENT 专指源端退回成功且本地接续已提交之后。退回202受理后为 PROCESSING，核查人仍负责，服务商尚不能回复；原系统成功但本地接续失败继续 PROCESSING 并显示交接受阻。待分配不向所有资料人员开放。状态、责任、未决指针与允许动作的完整映射见安装接口 §5。
- 成功回复按 AI 契约 §2.3.1 固定为 SUPPLEMENTAL_RESPONSE RECORD（replyText、原问题关联、确切附件版本、成功核实事实），原问题为 INSTALLATION_REVIEW RECORD，附件另入 parsedMaterials。已有 supplemental_response 与 analysis_input_item 承载，不新增表；202或失败回复不作为成功补充输入。证据表结构 §8 与分析系统流程 §5 明确保存和封存位置。

| 新增验收场景 | 预期结果 |
| --- | --- |
| 同事项由费用疑点进入解析失败再恢复 | 全程 kind=INSTALLATION_REVIEW；不新建类型或事项，不按标题路由 |
| 退回202受理、外部未知、外部成功但本地接续失败 | 均保持未决保护，不能提前显示可补充或开放审核按钮；按operationId恢复 |
| 退回成功但资料责任人未知 | WAITING_SUPPLEMENT、assignee=null、RESPONSIBILITY_UNRESOLVED；其他同角色人员不能提交 |
| 回复仅有文字、没有附件且源端已成功 | 新快照包含replyText及原问题记录，quantity等正式明细不被文字覆盖 |
| 同轮存在拒绝尝试和成功回复；成功接续重复执行 | 只选成功回复进新输入，保留拒绝历史，代次只增加一次；附件只能引用确切版 |
| 旧分析晚于回复新输入返回 | 旧结果留历史，不覆盖新代次当前指针 |
