# PRD：服务商接入配置

> 基线版本：v1.0｜最后更新：2026-09-20｜状态：草稿
> 上游（我引用）：[mainprd-jd-charging.md](mainprd-jd-charging.md) §五、§七、[glossary.md](../03-foundation/03-01-glossary/glossary.md) 术语「接入配置」「接入配置版本」「试转换记录」「服务商对接人员」、[configuration-apis.md](../03-foundation/03-06-provided-apis/configuration-apis.md) §1—3、[common-contract.md](../03-foundation/03-06-provided-apis/common-contract.md) §2、§4—5、[integration-config-schema.md](../03-foundation/03-05-schema/integration-config-schema.md) 表 `integration_config` / `integration_config_version` / `configuration_trial` / `configuration_enablement` / `configuration_activation_result`、[flow-configuration.md](../03-foundation/03-04-business-flows/flow-configuration.md) §1—5、[SKILL.md](../04-skills/provider-mapping-config/SKILL.md) §1—3、[page-list.md](../02-prototype/page-list.md) §1、[interaction-spec.md](../02-prototype/interaction-spec.md) §1、§3、[runtime-mock-data.md](../../rules/runtime-mock-data.md) §2、§4
> 下游（引用我）：[mainprd-jd-charging.md](mainprd-jd-charging.md) §七；[tc-config.md](../06-testcase/config/tc-config.md) 验收矩阵；开发计划待建立后登记；[mock T4.2子计划](../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T4.2-business-integration.md) PRD双链·读
>
> ⚠️ 本文档描述的是目标态。与代码现状有出入时，以真实代码为准，按本文档的目标态补齐。

---

## §1 文档范围

本文档覆盖**服务商接入配置**（从接入配置 Skill 形成候选配置，到服务商对接人员核实含义、试转换验证、一次确认启用，以及启用后同类资料的持续转换与变化重新处理；不含安装资料确认、安装核查与对账处理）。

每家服务商使用统一账号办理本公司的配置与资料工作，不再设公共接入对接账号。配置事项由所属公司的账号负责，其他服务商不能查看或修改。

### 需求清单

| # | 需求 | 需求简述 | 对应章节 |
|---|------|---------|---------|
| R1 | 接入事项列表 | 展示当前身份下的配置事项及状态、分析状态 | §3.1 |
| R2 | 配置草稿查看 | 展示候选版本的转换规则、字段对照、适用范围、待确认问题与来源格式状态 | §3.2 |
| R3 | 含义确认与修改 | 人员核实含义并修订规则或适用范围，保存为新的候选版本 | §3.3 |
| R4 | 试转换展示 | 展示当前候选的真实试转换结果；修改含义后旧结果失效，后台自动执行新试转换 | §3.4 |
| R5 | 启用约束 | 仅当存在同候选、同固定输入且 PASSED 的试转换时才可启用 | §3.5 |
| R6 | 启用后复用与变化处理 | 启用后同类资料由程序按已启用版本持续转换；格式变更、缺字段、未知值保留原数据与问题并重新处理配置 | §3.6 |

---

## §2 页面布局

本功能块含两个页面：接入事项列表（原型 `index.html#mapping`）与服务商接入配置详情（原型 `index.html#task/mapping`）。整页布局与角色入口见 mainprd §五。

```
┌──────────────────────────────────┐
│ 页面一：接入事项列表                │  ← 本文档 §3.1
│   ├ 筛选区与配置表格               │
│   └ 空态 / 分页                   │
├──────────────────────────────────┤
│ 页面二：服务商接入配置详情          │
│   ├ A. 配置概要                    │  ← §3.2
│   ├ B. 候选版本（规则/字段对照/范围）│  ← §3.2
│   ├ C. 待确认问题                  │  ← §3.2
│   ├ D. 试转换结果                  │  ← §3.4
│   └ E. 启用操作区                  │  ← §3.5
└──────────────────────────────────┘
```

**联动规则**：启用成功后，当前配置事项完成，接入事项列表重新加载；服务端对适用范围内的受影响输入登记重新处理任务，资料、核查、对账侧结果按各自子 PRD 呈现。

---

## §3 区块详述

### 3.1 接入事项列表

**数据来源**：`GET /api/admin/charging/work-items`（`kind=CONFIGURATION`），按当前账号的可见范围返回。

**布局**：标准表格，列为服务商、配置名称、处理状态、分析状态、责任人、更新时间、操作。服务商名称缺失时显示编号；配置名称隐藏固定的技术用途后缀 `installation-materials`。

**交互**：

- 按责任范围、处理状态、服务商及关键词筛选，关键词匹配配置标题或服务商名称；查询与重置返回第一页。
- 每页支持 10 / 20 / 50 条，展示总数、当前范围、页码与上一页/下一页；刷新保留当前筛选。
- 点击配置名称或“查看详情”进入配置详情；配置事项不显示工单编号。
- 无数据展示“暂无接入配置事项”；筛选无结果展示“没有符合筛选条件的记录”，提供清除筛选。
- 窄屏时筛选控件换行、表格横向滚动，操作列固定在右侧；输入框、选择框与查询按钮等高。

**前端职责**：处理状态与分析状态分别展示，不推断候选版本、试转换或启用状态。列表查询只读取已有数据，不触发分析。

### 3.2 配置草稿查看

**数据来源**：`GET /api/admin/charging/work-items/{workItemId}/configuration`。

详情页按区展示，数据全部来自该接口返回的 `candidateVersion`、`activeVersion`、`trial`、`openQuestions`：

| 区块 | 展示内容 | 来源字段 |
|------|---------|---------|
| A. 配置概要 | 当前候选版本号、当前生效版本号、来源格式状态 | `candidateVersion.versionNo`、`activeVersion.versionNo`、`candidateVersion.formatStatus` |
| B. 候选版本 | 逐条转换规则：原字段完整位置、目标字段、操作、参数、成立条件 | `candidateVersion.rules` |
| B. 字段对照 | 规则内 lookup 对照表（如枚举值对应关系） | `candidateVersion.rules[].parameters` |
| B. 适用范围 | 服务商、来源、用途、格式及已核实业务条件 | `candidateVersion.applicability` |
| C. 待确认问题 | 含义不清、缺依据、范围与单位冲突等未决问题 | `openQuestions` |
| D. 试转换结果 | 当前候选最近一次试转换的状态、输出、规则执行明细、问题、五项校验 | `trial`（结构见 §3.4） |

**展示规则**：

- 候选版本由接入配置 Skill 生成（AI 起点）或人员修订保存（人工更正），页面按返回原样展示，不区分来源改写内容。
- `activeVersion` 为 null 表示尚未启用过，展示"当前无生效配置"。
- `candidateVersion` 为 null 表示尚未形成候选，不展示规则区，只展示真实状态提示。
- 来源格式未提供或未知时，`sourceFormatId` / `sourceFormatVersion` 为 null，页面保留空值并展示对应说明，不显示伪造的格式编号。

### 3.3 人员确认与修改含义

**含义**：对接人员核实每条规则的原字段含义、目标字段与适用范围。核实发现问题时修订规则或适用范围并保存；保存生成新的候选版本（HUMAN 起点），不覆写旧版本。

**操作**：编辑后调用 `PUT /api/admin/charging/work-items/{workItemId}/configuration-draft`（契约见 §5.2）。

**规则**：

- 修改内容限定为受控规则目录内的目标字段、操作与参数；自由文本解释不作为可执行规则。
- 每处修改必须填写修改原因（`editNotes` 非空 `{field,reason}` 数组）。
- 保存成功后页面刷新展示新候选版本；旧候选与旧试转换结果保留供回看，不删除。
- **修改含义后旧的试转换结果自动失效**：旧试转换属于旧候选版本，新候选的试转换由后台自动执行（服务端在保存同事务内安排 TRIAL_CONFIG 任务），人员无需再点"运行 Skill"或"试转换"。

### 3.4 试转换执行与结果刷新保留

**数据来源**：`GET /api/admin/charging/work-items/{workItemId}/configuration` 返回的 `trial`，或 `GET /api/admin/charging/configuration-trials/{trialId}`。

**展示结构**：`{trialId,configurationVersionId,inputSnapshotId,status,output,ruleResults,issues,checks}`。

| 试转换状态 | 页面呈现 |
|-----------|---------|
| 尚无终态（后台执行中） | 展示"试转换执行中"，不展示伪造的通过标记 |
| `PASSED` | 展示输出与逐条规则执行结果，启用操作按 §3.5 放开 |
| `FAILED` | 展示 `issues` 中具体失败原因（读取失败、未覆盖规则、单位冲突等），启用保持禁用 |
| `NEEDS_INFORMATION` | 展示仍待资料或业务含义的具体问题，引导先处理待确认问题 |

**硬性规则**：

- **试转换失败不能成为成功候选**。FAILED / NEEDS_INFORMATION / 执行中均不可启用。
- `checks` 五项（`inputComplete`、`scopeValid`、`rulesCovered`、`outputsValid`、`meaningsResolved`）由服务端真实校验返回，前端不自行判定、不填 true。
- 查看预览不等于试转换已通过；页面展示的是后台真实执行并保存的记录。
- **结果刷新保留**：刷新页面或重新进入，展示该候选最近一次已保存的试转换结果；打开预览不产生新执行、不生成新业务审批。
- 同一输入通过只证明该输入的结果，页面不得据此提示"全部资料适用"。

### 3.5 启用约束与启用事务

**启用入口**：详情页 E 区"确认启用"操作。

**前置约束**（全部成立才可提交，缺一展示具体原因）：

| 条件 | 不满足时页面反馈 |
|------|----------------|
| 存在当前候选版本 | 展示"尚未形成候选配置" |
| 必需待确认问题均已解决 | 列出未解决问题，启用禁用 |
| 存在本候选、本次固定输入且 `PASSED` 的试转换记录 | 展示"需先通过试转换"，启用禁用 |
| 当前用户具备 `ENABLE_INTEGRATION_CONFIG` 权限且为当前对接责任人 | 隐藏/禁用启用入口；越权提交返回 40301 |
| 页面所读版本未变化 | 提交返回 40901，提示刷新后重新核实 |

**启用事务**：人员一次确认调用 `POST /api/admin/charging/work-items/{workItemId}/configuration-enablement`。服务端在同一事务内完成：保存人员决定与 `configuration_enablement`、写入 `APPLIED` 生效结果、切换 `integration_config` 当前生效指针、完成当前配置事项及处理记录。任何条件核对零行命中即整批回滚。

- 试转换不足（非 PASSED、非本候选、非本次输入）返回 42201，旧配置保持有效。
- 候选或配置版本已变化返回 40901，旧生效版不被覆盖。
- 确认后结果未取得时展示"启用确认中"，人员不换内容盲目重发；同键重试返回原动作实际结果。
- **配置草稿需确认后启用；候选版本不自动生效**。候选保存、AI 重新分析均不切换生效指针。

### 3.6 启用后持续转换与变化重新处理

| 后续情况 | 系统行为 |
|---------|---------|
| 同类新资料到达且适用条件满足 | 程序按当前生效版本持续转换，记录本次实际所用版本；人员不逐单确认配置 |
| 出现新的未确认候选 | 候选不参与生产转换；仍适用原版的资料继续按原版处理 |
| 格式变更（来源格式版本变化） | 停止受影响资料按旧规则自动转换，形成或更新配置调整事项，由对接人员重新处理配置 |
| 新资料缺必需字段 | 保留原数据与具体缺项问题，不补造默认值；对应规则标记未验证，待处理 |
| 出现未知枚举值 / 未知业务含义 | 保留原值与问题，未知值不转为零或默认值；生成待确认问题进入配置事项 |
| 多份配置命中同一用途与范围 | 暂停有冲突的转换并保留冲突事实，不自动选择最新创建者 |

启用后对适用范围内受影响且尚未完成的资料整理、安装核查或对账事项登记重新处理任务，输入代次随实际依赖变化增加；已完成的业务结论与历史决定不改写。

### 3.7 数据链路

> 端到端追踪：UI 元素 ← API 字段 ← 计算规则 ← 数据源。字段完整定义见 configuration-apis.md §1—3，这里只写本功能块用到的。

| UI 元素 | API 字段 | 计算规则 | 数据源 |
|---------|----------|---------|--------|
| 事项列表行 | `GET /work-items` list 单项 `title`/`status`/`analysisStatus`/`providerName` | 直透，kind=CONFIGURATION 由服务端筛选 | `work_item` 及责任关联 |
| 候选版本号 | `candidateVersion.versionNo` | 直透 | `integration_config_version.version_no` |
| 生效版本号 | `activeVersion.versionNo` | 直透，无生效为 null | `integration_config.current_version_id` 指向的版本 |
| 来源格式状态 | `candidateVersion.formatStatus` | 直透枚举 | `integration_config_version.format_status` |
| 规则明细（原字段/目标字段/操作/参数/条件） | `candidateVersion.rules[]` | 直透，受控规则数组 | `integration_config_version.rules_json` |
| 适用范围 | `candidateVersion.applicability` | 直透 | `integration_config_version.applicability_json` |
| 待确认问题 | `openQuestions` | 直透，空数组展示"无待确认问题" | `integration_config_version.open_questions_json` |
| 试转换状态 | `trial.status` | 直透（PASSED/FAILED/NEEDS_INFORMATION），无记录为 null | `configuration_trial.status` |
| 试转换输出 | `trial.output` | 直透，失败无输出为 null | `configuration_trial.output_json` |
| 规则执行明细 | `trial.ruleResults` | 直透，未执行规则保留 NOT_EXECUTED | `configuration_trial.rule_results_json` |
| 试转换问题 | `trial.issues` | 直透 | `configuration_trial.issues_json` |
| 五项校验 | `trial.checks`（camelCase 映射存储字段） | 服务端真实校验结果，前端不判定 | `configuration_trial.checks_json` |
| 启用结果 | 启用接口 200 `data.status=APPLIED` | 服务端同事务保存后返回 | `configuration_activation_result.outcome` |
| 并发版本号 | `rowVersion`、`responsibilityVersion` | 直透，用于写请求条件 | `work_item.row_version`、`integration_config.row_version` |

### 3.8 异常与兜底

| 场景 | 处理 |
|------|------|
| 候选/生效/试转换为 null | 对应区块展示真实空态说明，不渲染占位内容 |
| `openQuestions` 为空数组 | 待确认问题区展示"无待确认问题" |
| 接口超时/异常 | 错误提示 + 重试；不展示缓存的成功结果 |
| 试转换执行中刷新 | 展示执行中状态，不生成新执行任务 |
| 启用提交返回 40901 | 保留页面输入，提示刷新后重新核实与确认 |
| 启用提交返回 42201 | 展示具体缺项（试转换不足/含义未决），回到候选处理 |
| 启用提交返回 40301 | 提示无启用权限，停止动作，不伪装为成功 |
| 来源格式未知（`formatStatus` 为 UNKNOWN） | 展示"格式说明情况待核实"，不当作未提供跳过 |

---

## §4 本区域使用的数据字段

| 表名 | 状态 | 本区域使用字段 | 完整定义 |
|------|------|--------------|----------|
| `integration_config` | 新建 | `id`、`service_provider_id`、`current_version_id`、`current_activation_result_id`、`row_version` | [integration-config-schema.md](../03-foundation/03-05-schema/integration-config-schema.md) §2 |
| `integration_config_version` | 新建 | `id`、`version_no`、`origin`、`format_status`、`source_format_id`、`source_format_version`、`applicability_json`、`rules_json`、`open_questions_json`、`rule_catalog_version`、`edit_notes_json` | 同上 §2 |
| `configuration_trial` | 新建 | `id`、`configuration_version_id`、`snapshot_id`、`status`、`output_json`、`rule_results_json`、`issues_json`、`checks_json` | 同上 §2 |
| `configuration_enablement` | 新建 | `human_decision_id`、`configuration_version_id`、`trial_id`、`expected_config_version`、`expected_active_version_id` | 同上 §2 |
| `configuration_activation_result` | 新建 | `enablement_id`、`outcome`、`reason_code` | 同上 §2 |
| `work_item` | 既有扩展 | `integration_config_id`、`current_configuration_version_id`、`row_version` | [work-item-schema.md](../03-foundation/03-05-schema/work-item-schema.md) §3、§8 |

---

## §5 接口契约

> 完整契约见 [configuration-apis.md](../03-foundation/03-06-provided-apis/configuration-apis.md) §1—3 与 [common-contract.md](../03-foundation/03-06-provided-apis/common-contract.md) §2、§4，这里只写本功能块的业务说明。接口路径与字段逐字照抄契约。

### 5.1 `GET /api/admin/charging/work-items/{workItemId}/configuration`

- **权限**：READ_WORK_ITEM 及资料权限
- **本区域使用的响应字段**：`configurationId`、`candidateVersion`、`activeVersion`、`trial`、`openQuestions`、`rowVersion`、`responsibilityVersion`（见 §3.7）
- **前端额外计算**：无；仅格式化展示

### 5.2 `PUT /api/admin/charging/work-items/{workItemId}/configuration-draft`

- **权限**：ENABLE_INTEGRATION_CONFIG 与当前对接责任
- **请求体**：`expectedWorkItemVersion`、`expectedResponsibilityVersion`、`expectedCandidateVersionId`、`rules`、`applicability`、`editNotes`（非空 `{field,reason}`[]）
- **响应**：HTTP 202，`{configurationId,candidateVersionId,jobId,workItemId,rowVersion,status:"ACCEPTED"}`；保存 HUMAN 候选新版本并同事务安排 TRIAL_CONFIG 后台任务
- **页面行为**：受理后刷新候选展示，试转换区展示执行中；不显示"已生效"

### 5.3 `GET /api/admin/charging/configuration-trials/{trialId}`

- **权限**：关联配置事项与全部输入的读取权限
- **响应**：trial 完整结构，同 §1 trial
- **页面行为**：用于试转换结果查看；待执行状态从配置详情及其关联任务读取，不伪造 PASSED

### 5.4 `POST /api/admin/charging/work-items/{workItemId}/configuration-enablement`

- **权限**：ENABLE_INTEGRATION_CONFIG 与当前具体责任
- **请求体**：DecisionInput（`expectedWorkItemVersion`、`expectedResponsibilityVersion`、`comment`）加必填 `candidateVersionId`、`trialId`、`expectedConfigurationRowVersion`、`expectedActiveVersionId`（可 null）
- **响应**：公共 200（status=APPLIED）；失败按公共错误（40901 / 42201 / 40301）
- **写请求公共约束**：Header `Idempotency-Key` 必填；同键同内容返回原结果，同键不同内容 409

---

## §6 管理台配置

本功能块无管理端可配项。受控规则目录（目标字段、转换操作、参数结构）由服务端按 `rule_catalog_version` 版本化管理，硬编码项：空态文案、校验提示文案——不可配。

---

## §7 验收标准

### 区块展示

| # | 场景 | 输入条件 | 预期结果 |
|---|------|---------|----------|
| 1 | 接入事项列表渲染 | 对接人员身份下有 2 条配置事项 | 标题、服务商名、状态、分析状态正确展示；无工单编号位 |
| 2 | 配置草稿展示 | 事项存在候选版本 | 规则明细、字段对照、适用范围、来源格式状态与 `candidateVersion` 字段一致 |
| 3 | 待确认问题展示 | `openQuestions` 非空 | 逐条展示问题；为空数组时展示"无待确认问题" |
| 4 | 无生效配置 | `activeVersion` 为 null | 展示"当前无生效配置"，不渲染版本号 |
| 5 | 试转换执行中 | 候选已保存、终态未返回 | 展示"试转换执行中"，无通过标记，启用禁用 |
| 6 | 试转换失败展示 | 最近试转换为 FAILED | 展示具体失败问题，启用保持禁用 |
| 7 | 试转换结果刷新保留 | 候选已有 PASSED 记录，刷新页面 | 展示同一份已保存结果，不产生新执行记录 |

### 数据与接口

| # | 场景 | 输入条件 | 预期结果 |
|---|------|---------|----------|
| 8 | 试转换通过前禁止启用 | 候选无 PASSED 试转换（未执行/FAILED/NEEDS_INFORMATION） | 启用入口禁用；直接请求启用接口返回 42201，旧配置保持有效 |
| 9 | 修改含义后旧试转换结果失效 | 候选已有 PASSED，人员修订规则并保存 | 生成新候选版本；旧试转换保留但不作为新候选依据；后台自动安排新试转换，新结果 PASSED 前不可启用 |
| 10 | 启用成功 | 候选有同版本同输入 PASSED 记录，权限与版本条件成立 | 返回 200 APPLIED；当前生效指针切换到本候选；事项完成与处理记录同事务保存 |
| 11 | 启用后新资料走已启用版本 | 启用完成后到达同类新资料且条件满足 | 程序按已启用版本持续转换并记录实际所用版本，不产生新的人工配置事项 |
| 12 | 无权限启用被拒 | 当前用户无 ENABLE_INTEGRATION_CONFIG 或非当前对接责任人 | 启用入口禁用/隐藏；直接请求返回 40301，配置状态不变 |
| 13 | 启用时版本已变化 | 页面所读候选/配置版本后发生变化 | 返回 40901，不切换生效指针；提示刷新后重新核实 |
| 14 | 新资料缺字段或未知值 | 启用后到达的资料缺必需字段或含未知枚举值 | 保留原数据与具体问题，不补默认值、未知值不转零；形成待确认问题进入配置调整事项 |


## 2026-09-27 原始资料与真实 Excel 上传

配置事项详情独立展示“业务资料与原文件”：服务商原始 JSON、来源字段含义、原文件和人员上传文件。京东可读、所属服务商可读写，其他服务商不可见。查看不依赖分析结果；没有附件而只有 JSON 时明确标示资料形态。

所属服务商上传真实 XLSX 后，系统保存文件及摘要，离线解析各工作表并显示原始数据行。首行为字段名、第二行起为数据；不接受空字段名、重复字段名、公式和异构工作表，最大 10 MB、10000 行。字段意义仅使用明确说明，未知含义进入待核实。

最近上传的 Excel 用于该事项的下一次映射，旧候选清除。责任人点击“运行分析”后，Skill 基于这份文件提出候选；确定性程序执行转换并展示原字段到目标字段的关系及每行输出，零值保留为零。失败显示原因，不替换为旧 mock 样例或固定成功结果。历史原文件保留可下载；京东可读取同份输入与映射结果。规则启用仍遵循原有试转换及确认约束。

验收覆盖：真实上传字节、解析、固定输入、保存后映射结果、再次上传使用新文件、京东可读、跨服务商拒绝、未点击不分析。


## 2026-09-27 当前演示要求

映射事项顶部必须提供“下载 Excel 样表”“选择 Excel 安装明细表”“上传 Excel”，上传后展示原始行。运行分析后以中文展示 Excel 原列、平台字段、转换方式、实际转换输出。技术参数和原始 JSON 默认折叠；文件单元格依据和业务记录依据均按固定输入校验，不能因有效依据来自文件而阻止启用。京东可读材料与结果，所属服务商负责上传、触发及启用。
