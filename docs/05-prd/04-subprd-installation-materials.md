# PRD：安装资料整理与提交

> 状态：草稿｜基线版本：v1.0｜最后更新：2026-09-20
> 上游（我引用）：[mainprd-jd-charging.md](mainprd-jd-charging.md) §二、§五、§七、[术语表](../03-foundation/03-01-glossary/glossary.md) §1—2、[安装资料与核查接口](../03-foundation/03-06-provided-apis/installation-apis.md) §1—2、[材料预览与上传接口](../03-foundation/03-06-provided-apis/material-apis.md) §1—3、[接口公共约定](../03-foundation/03-06-provided-apis/common-contract.md) §2、§4—5、[工作台查询接口](../03-foundation/03-06-provided-apis/workbench-apis.md) §4、[安装资料域表结构](../03-foundation/03-05-schema/installation-schema.md) §4—5、[材料与分析证据域表结构](../03-foundation/03-05-schema/evidence-schema.md) §2—3、[安装资料整理与提交流程](../03-foundation/03-04-business-flows/flow-installation-submission.md) §1—5、[安装资料整理 Skill](../04-skills/install-detail-extractor/SKILL.md) §1—2、[原型页面清单](../02-prototype/page-list.md) §1、[原型交互说明](../02-prototype/interaction-spec.md) §1、[运行数据规则](../../rules/runtime-mock-data.md) §2—4
> 下游（引用我）：[mainprd-jd-charging.md](mainprd-jd-charging.md) §七；[tc-install.md](../06-testcase/install/tc-install.md) 验收矩阵；开发计划引用见本关联块；[mock T4.2子计划](../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T4.2-business-integration.md) PRD双链·读
>
> ⚠️ 本文档描述的是目标态。与代码现状有出入时，以真实代码为准，按本文档的目标态补齐。

---

## §1 文档范围

本文档覆盖**安装资料整理与提交**（服务商资料人员查看 Skill 整理的安装资料草稿、修订并确认正式提交、上传实际文件，到原系统提交结果明确并交接京东核查为止；不含京东侧核查决定、退回与补充回复，见 [05-subprd-installation-review.md](05-subprd-installation-review.md)）。

**安装资料草稿不直接替代正式安装明细。** 草稿是待确认的安装信息；正式安装明细只在责任人确认并经原系统提交成功后才成立。

### 需求清单

| # | 需求 | 需求简述 | 对应章节 |
|---|------|---------|---------|
| R1 | 草稿查看 | 展示明细行、依据定位、缺项与冲突说明 | §3.1 |
| R2 | 草稿修订与版本 | 人员编辑生成新草稿版本，原分析与已确认版本不改写 | §3.2 |
| R3 | 确认并正式提交 | 版本条件校验、一次确认一笔提交、重复请求幂等 | §3.3 |
| R4 | 提交进展与结果未知回查 | 六种进展如实区分，结果未知按原编号回查 | §3.3 |
| R5 | 实际文件上传 | 后端接收保存登记版本，进入与来源材料相同的解析分析流程 | §3.4 |
| R6 | 核查事项自动产生 | 提交成功后服务端自动产生京东侧核查事项，去重不重复创建 | §3.3 |

---

## §2 页面布局

本功能块承载于「安装资料确认」页（原型基线：[桂语庭 #task/draft](../02-prototype/page-list.md) §1）。整页布局见 [mainprd-jd-charging.md](mainprd-jd-charging.md) §五。

```
┌─────────────────────────────────────┐
│ A. 事项上下文条                        │  ← 工单、服务商、方案版本、提交状态
├─────────────────────────────────────┤
│ B. 草稿明细区                        │  ← 本文档 §3.1
│    ├ 明细行（项目/数量/单位/供料方/范围）│
│    ├ 依据定位（查看原文入口）          │
│    └ 缺项与冲突说明                  │
├─────────────────────────────────────┤
│ C. 编辑与版本操作区                  │  ← 本文档 §3.2（保存草稿新版本）
├─────────────────────────────────────┤
│ D. 上传入口                          │  ← 本文档 §3.4
├─────────────────────────────────────┤
│ E. 确认提交与进展区                  │  ← 本文档 §3.3
└─────────────────────────────────────┘
```

**联动规则**：保存草稿、提交或上传后，本页与待处理事项列表同时更新，先骨架屏后替换渲染；提交成功后服务端自动产生京东侧核查事项，不要求服务商资料人员再做任何操作。

---

## §3 区块详述

### 3.1 草稿明细与依据定位区

**数据来源**：`GET /api/admin/charging/work-items/{workItemId}/installation-draft` 返回的 `items` / `sourceMaterials` / `openQuestions` 与 `analysisResultId` 对应分析发现。

**展示内容**：

| 内容 | 展示规则 |
|------|---------|
| 明细行 | 逐行展示 `installationItem`、`installedQuantity`、`unit`、`materialSupplier`、`serviceScope`；未知字段保持 null 展示为"待核实"，不填零 |
| 依据定位 | 每行关联证据引用，点击打开原始证据侧栏，沿解析 blockId 定位原 PDF 页、图片或 sheet/cellRange；IMAGE_DESCRIPTION 标明是图片描述，不当原文引文 |
| 缺项与冲突 | `openQuestions` 逐条列出需补哪份材料或哪个字段；数量相互冲突的行如实展示冲突，不任挑一份 |
| 版本标识 | 展示 `versionNo` 与草稿来源（后台整理 / 人员编辑）；人工更正不得显示为 AI 原文 |

**前端职责**：直接渲染接口字段，不做数量换算、不补全缺项、不把方案安装数量、计费数量或权益数量上限当作实际安装数量展示。

### 3.2 修订与草稿版本

人员可编辑明细的业务字段（项目、数量、单位、供料方、服务范围），不能更改证据原文、分析结论或来源版本。

| 规则 | 内容 |
|------|------|
| 完整列表提交 | `PUT` 正文 `items` 为完整明细列表，不能只提交改动行 |
| 修改理由 | 实质修改必须在 `editNotes` 中给出 `{itemIndex,field,reason}`，itemIndex 为本次完整列表从 0 开始的行位置 |
| 数量精度 | 数量须通过有限值及十进制往返精度检查；无法准确表达时服务端拒绝，不静默四舍五入 |
| 版本保护 | **编辑已确认内容须生成新版本。** 保存以当前分析和上下文生成 HUMAN 草稿新版本并更新草稿指针；原分析结果与已确认版本不改写 |
| 保存不等于提交 | 返回 `status:"SAVED"` 仅表示本地保存，不表示已确认提交，更不表示已写原系统 |
| 未决保护 | 事项存在未决外部写入时禁止保存新草稿版本（40903）；页面保留未保存意见，不能换版本绕过 |

### 3.3 确认提交与进展区

人员核对完整提交内容后一次确认提交。`POST /api/admin/charging/work-items/{workItemId}/installation-submissions` 正文继承 DecisionInput 并必填 `draftVersionId`。

**接口正常返回或人员已确认均不等于原系统已提交成功。** 受理返回公共 202 后，后续状态从 `GET /api/admin/charging/operations/{operationId}` 取得；外部成功须有当前操作匹配的正式明细回执。页面进展如实区分六种情况：

| 页面进展 | 判断依据 | 人员动作 |
|---------|---------|---------|
| 尚未受理 | 校验未通过或尚未发出写入 | 看具体原因，修正内容或核实权限 |
| 原系统明确拒绝 | 有可靠结果证明未写入 | 按原因核实后按新提交重新确认 |
| 正在处理 | 原系统仍在处理本次提交 | 查看进展，可离开后再回来 |
| 结果暂时无法确定 | 请求可能已执行，无可靠终态 | 保留原确认，不重新填写、不换编号重提 |
| 已证实提交成功 | 取得可关联本次确认的正式明细及版本 | 本环节完成，可查看提交内容和结果 |
| 已提交，核查衔接中 | 明细成功但核查事项准备暂未完成 | 无需重交，等待恢复 |

**提交成功后服务端自动产生京东侧核查事项**；后续事项以提交编号或可靠正式明细版本去重，衔接失败只恢复本地，不重复提交正式明细、不创建重复核查事项。服务商资料事项仅在可靠提交成功后完成；进入核查不表示安装审核通过。

### 3.4 上传入口

服务商资料人员可从本页上传实际文件（PDF、PNG、JPEG 或 XLSX），`POST /api/admin/charging/uploads`，multipart/form-data，`purpose` 为 `INSTALLATION_MATERIAL`，指定事项时必填 `workItemId` 与 `expectedWorkItemVersion`。

| 规则 | 内容 |
|------|------|
| 先存后记 | 服务端先完整保存文件字节并校验 MIME 与摘要，再保存材料记录、输入关联及任务；来源记为 LOCAL_UPLOAD |
| 返回受理 | 返回 HTTP 202 `data={uploadId,materialVersionId,workItemId,jobId,status}`，status 为 RECEIVED；202 不表示解析完成 |
| 相同解析流程 | 上传文件登记版本后由后台自动安排解析与分析，与来源读取材料进入相同的解析、整理链路，不因上传而跳过校验 |
| 不补造缺项 | 上传只是准备材料；缺项、无法解析、位置不可靠在 `issues` 中如实列出，不补造缺失的账单、依据或批准记录，不自动成为正式提交 |

上传状态经 `GET /api/admin/charging/uploads/{uploadId}` 查询，status 为 RECEIVED / PREPARING / READY / BLOCKED；READY 后新文件使相关事项输入代次增加并重新准备分析，旧证据继续受限保留。

### 3.5 数据链路

> 端到端追踪：UI 元素 ← API 字段 ← 数据源。字段完整定义见接口文档，这里只写本功能块用到的。

| UI 元素 | API 字段 | 计算规则 | 数据源 |
|---------|----------|---------|--------|
| 明细行五字段 | `items[].installationItem / installedQuantity / unit / materialSupplier / serviceScope` | 直透；installedQuantity 为有限非负 number/null，未知保持 null | `installation_draft_version.items_json` |
| 草稿版本号与来源 | `versionNo`、草稿 origin | 直透；HUMAN 版本人工更正不显示为 AI 原文 | `installation_draft_version.version_no / origin` |
| 依据定位 | `analysisResultId` → 发现 evidenceRefs | 沿解析 blockId 定位原页/sheet/cellRange | `analysis_result.findings_json`、`material_parsing.blocks_json` |
| 缺项与冲突 | `openQuestions` | 直透，不造值 | `installation_draft_version.open_questions_json` |
| 材料预览 | `sourceMaterials[].sourceMaterialId / sourceVersion` | 后端解析确切引用为本地材料版本；content 接口按版本返回字节 | `source_material_version` |
| 提交进展 | `operations` 的 `status / receipt / verifiedAt / localContinuationStatus` | 由执行事实计算，外部成功与本地接续分开显示 | `external_write_operation`（执行域） |
| 上传状态 | `uploads` 的 `status / issues` | 由材料记录及任务状态计算，不另造成功状态 | `source_material_version`、后台任务 |
| 事项状态联动 | 保存/提交/上传后待处理列表更新 | 服务端真实状态流转 | `work_item`、`activity_record` |

### 3.6 异常与兜底

**服务端兜底**：接口异常按统一返回壳返回错误码，前端按下表执行渲染兜底。

| 场景 | 处理 |
|------|------|
| 尚无草稿（draftId 为 null） | 展示整理中或失败的真实状态与已有资料，不能编造可提交明细 |
| 草稿字段为 null | 展示"待核实"，保留待核实问题，不填零、不默认 |
| 保存版本冲突（40901） | 保留人员输入，重读最新版本后重新确认，不丢弃未保存内容 |
| 存在未决写入（40903） | 返回可读的原操作入口，引导继续查原结果 |
| 缺材料或依据（42201） | 返回缺项说明并如实展示，不造值 |
| 提交超时/网络异常 | 先按原 Idempotency-Key 或 operationId 回查，不盲目重发 |
| 上传超限/格式或范围缺项（413/422） | 保留表单，明确限制或缺项，不静默截断 |
| 材料读取或分析失败 | 展示失败位置与已有资料；恢复读取和整理，不把失败当成"没有问题" |

---

## §4 本功能块使用的数据字段

| 表名 | 状态 | 本功能块使用字段 | 完整定义 |
|------|------|--------------|----------|
| `installation_draft` | 新建 | `work_item_id`、`current_version_id`、`row_version` | [installation-schema.md](../03-foundation/03-05-schema/installation-schema.md) §2 |
| `installation_draft_version` | 新建 | `version_no`、`parent_version_id`、`analysis_result_id`、`context_snapshot_id`、`origin`、`items_json`、`source_materials_json`、`open_questions_json`、`edit_notes_json`、`save_key` | 同上 §2 |
| `installation_detail_submission` | 新建 | `human_decision_id`、`draft_version_id`、`work_item_id`、`installation_work_order_id`、`service_provider_id`、`request_json` | 同上 §2 |
| `source_material`、`source_material_version` | 新建 | 来源身份、`source_version`、`read_state`、`name`、`media_type`、`byte_length`、`content_sha256` | [evidence-schema.md](../03-foundation/03-05-schema/evidence-schema.md) §2 |
| `external_write_operation` | 执行域 | 提交状态、回执、回查证据（经 operations 接口读取，本功能块不直写） | [installation-schema.md](../03-foundation/03-05-schema/installation-schema.md) §5.3 |

> 京东核查事项的产生与处理字段见 [05-subprd-installation-review.md](05-subprd-installation-review.md)。

---

## §5 接口契约

### `GET /api/admin/charging/work-items/{workItemId}/installation-draft`

> 完整契约见 [installation-apis.md](../03-foundation/03-06-provided-apis/installation-apis.md) §1，这里只写本功能块的业务说明。

- **本区域使用的响应字段**：`draftId` / `draftVersionId` / `versionNo` / `rowVersion` / `items` / `sourceMaterials` / `openQuestions` / `analysisResultId`（见 §3.5 数据链路）
- **尚无草稿时**：`draftId` 等为 null、数组为空；页面如实展示，不能编造可提交明细
- **前端额外计算**：仅格式化展示，不做任何业务判断

### `PUT /api/admin/charging/work-items/{workItemId}/installation-draft`

- **请求正文**：`{expectedWorkItemVersion,expectedResponsibilityVersion,expectedDraftVersionId,items,editNotes}`，全部必填
- **权限**：CONFIRM_INSTALLATION_DRAFT 与当前资料责任
- **成功返回**：HTTP 200 `{draftId,draftVersionId,versionNo,workItemId,rowVersion,status:"SAVED"}`；无草稿、旧版本、未决写入分别返回 42201/40901/40903

### `POST /api/admin/charging/work-items/{workItemId}/installation-submissions`

- **请求正文**：继承 DecisionInput，必填 `draftVersionId`；客户端不得提交"已校验"标记，外部请求由后端重新组装
- **权限**：CONFIRM_INSTALLATION_DRAFT 与 SUBMIT_INSTALLATION_DETAIL，同一当前上下文完整范围授权
- **成功返回**：公共 202；HTTP 202 不得显示"提交已成功写入原系统"

### `GET /api/admin/charging/operations/{operationId}`

> 完整契约见 [workbench-apis.md](../03-foundation/03-06-provided-apis/workbench-apis.md) §4。

- **本区域使用的响应字段**：`status` / `receipt` / `verifiedAt` / `localContinuationStatus`
- **业务说明**：超时按原 Idempotency-Key 重放查受理结果，存在 operationId 时继续查该操作，不换编号强行重提

### `POST /api/admin/charging/uploads` 与 `GET /api/admin/charging/uploads/{uploadId}`

> 完整契约见 [material-apis.md](../03-foundation/03-06-provided-apis/material-apis.md) §2—3。

- **本区域使用的输入字段**：`file` / `providerId` / `purpose=INSTALLATION_MATERIAL` / `workItemId` / `expectedWorkItemVersion` / `replacesMaterialVersionId`
- **本区域使用的响应字段**：`uploadId` / `materialVersionId` / `jobId` / `status` / `issues`
- **Header**：Idempotency-Key 必填；回放同键须同文件摘要与元信息

### `GET /api/admin/charging/material-versions/{materialVersionId}` 与 `.../content`

> 完整契约见 [material-apis.md](../03-foundation/03-06-provided-apis/material-apis.md) §1。

- **业务说明**：依据定位与原文预览使用；版本须 VERIFIED 才可取 content，未取得正文返回 42201；每次核实权限

---

## §6 管理台配置

| 配置项 | 管理端页面 | 生效方式 |
|--------|-----------|---------|
| 上传文件大小与类型限制 | 部署配置 | 接口按部署配置读取并校验，超限返回 413/41301 |

硬编码项：进展含义文案、空态文案、枚举取值——不可配。

---

## §7 验收标准

### 区块展示

| # | 场景 | 输入条件 | 预期结果 |
|---|------|---------|----------|
| 1 | 正常草稿渲染 | 草稿含 3 行明细，1 行数量 null | 五字段正确展示；null 行展示"待核实"，不填零 |
| 2 | 依据定位 | 明细行有关联证据引用 | 打开原始证据侧栏，沿 blockId 定位到原页/sheet/cellRange；图片描述标明是描述 |
| 3 | 缺项与冲突 | openQuestions 含 2 条待核实问题 | 逐条如实列出需补材料或字段，不显示为已核实 |
| 4 | 无草稿 | draftId 为 null | 展示整理中/失败真实状态，无可提交明细 |
| 5 | 编辑生成新版本 | 修改一行数量并填写 editNotes 保存 | 返回 SAVED，versionNo 递增，origin 为 HUMAN；原分析版本不改写，人工更正不显示为 AI 原文 |
| 6 | 进展如实区分 | 提交后分别处于处理中/结果未知/成功 | 三种进展文案与操作引导各不相同；202 受理页不显示"已提交成功" |

### 数据与接口

| # | 场景 | 输入条件 | 预期结果 |
|---|------|---------|----------|
| 7 | 草稿版本保护 | 用旧的 expectedDraftVersionId 保存 | 返回 40901，不生成新版本；人员未保存内容保留 |
| 8 | 未决写入保护 | 事项存在未决外部写入时保存草稿或再次提交 | 返回 40903 及原操作入口，不产生新草稿版本或新提交 |
| 9 | 重复提交幂等 | 同 Idempotency-Key 同内容重放提交 | 返回原结果，不建第二笔提交记录；同键不同内容返回 40902 |
| 10 | 结果未知回查 | 提交请求超时，原系统结果未明 | 按原 Idempotency-Key 或 operationId 经 operations 接口回查，不换编号重提；页面展示"结果暂时无法确定"，不判失败 |
| 11 | 提交成功自动核查事项 | 外部 SUCCEEDED 且有匹配正式明细回执 | 资料事项按完成条件结束，服务端自动产生京东侧核查事项；相同提交或明细版本去重，不重复创建；衔接失败只恢复本地 |
| 12 | 上传进入相同解析流程 | 上传一份 INSTALLATION_MATERIAL XLSX | 202 返回 RECEIVED；文件登记 LOCAL_UPLOAD 版本后进入与来源材料相同的解析与整理分析；解析缺项在 issues 如实列出，不补造缺失账单或依据 |
