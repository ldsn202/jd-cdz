<!-- @meta docId="tc-install-detail" status="active" baseline="v1.0.1" -->
# 安装资料整理与提交（install）测试用例 — 用例详情

> **索引文件**: [tc-install.md](tc-install.md)
> **编号前缀**: TC-INS-
> **基准 PRD**: [04-subprd-installation-materials.md](../../05-prd/04-subprd-installation-materials.md) §7
> 上游（我引用）：同索引层（04 subprd §3/§5/§7、installation-schema §2/§4—5、evidence-schema §2—3、installation-apis §1—2、material-apis §1—3、workbench-apis §4、common-contract §2/§4—5）
> 下游（引用我）：[tc-install.md](tc-install.md) §一 测试范围

执行约定：服务端默认 `http://localhost:8787`；写请求统一带 Header `Idempotency-Key`；调用身份为种子资料员 `idt-tc-ins-clerk1`；SQL 校验用 sqlite3 在测试库执行。各用例"数据清理"均为重建测试库约定（见对应 SQL 文件末段），下文不再重复说明。

---

## 一、API 验证用例（01-09）

### TC-INS-01：草稿正常读取（3 行明细，1 行数量 null）

> PRD：`04-subprd-installation-materials.md` §7 验收#1、#3
> 目标：验证 GET installation-draft 对 3 行草稿逐字段直透，null 数量保持 null，缺项 2 条如实返回
> 执行方式：curl

**数据准备**：执行 [sql/TC-INS-SEED.sql](sql/TC-INS-SEED.sql)；事项 `wi-tc-ins-prep-1` 已有 AI 草稿 v1（3 行明细、行 2 数量 null、openQuestions 2 条）。对应 [sql/TC-INS-01.sql](sql/TC-INS-01.sql)

**步骤**：
1. `curl "http://localhost:8787/api/admin/charging/work-items/wi-tc-ins-prep-1/installation-draft"`，解析响应 JSON

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| HTTP 状态码 / code | 200 / 0 |
| data.draftId / draftVersionId / versionNo / rowVersion | `draft-tc-ins-001` / `dv-tc-ins-001` / 1 / 6 |
| data.items | 长度 3；items[0]={交流充电桩（7kW）安装, 2, 台, 京东采购供料, 车位立柱安装及接线调试}；items[1].installedQuantity 为 null（非 0、非缺失键）；items[2].installedQuantity=2 |
| data.openQuestions | 长度 2，含 q1（电缆数量冲突）与 q2（缺批准记录） |
| data.sourceMaterials / analysisResultId | 长度 2 且 sourceVersion 均 `mv-1` / `ar-tc-ins-001` |

### TC-INS-02：无草稿读取

> PRD：`04-subprd-installation-materials.md` §7 验收#4
> 目标：验证尚无草稿时 draftId 等为 null、数组为空，接口不编造可提交明细
> 执行方式：curl

**数据准备**：SEED 后执行 [sql/TC-INS-02.sql](sql/TC-INS-02.sql) 准备段；事项 `wi-tc-ins-prep-empty` 无任何草稿版本

**步骤**：
1. `curl "http://localhost:8787/api/admin/charging/work-items/wi-tc-ins-prep-empty/installation-draft"`

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| HTTP 状态码 / code | 200 / 0 |
| data.draftId / draftVersionId / versionNo / analysisResultId | 均为 null |
| data.items / sourceMaterials / openQuestions | 均为 []（空数组，非 null） |

### TC-INS-03：编辑保存生成 HUMAN 新版本

> PRD：`04-subprd-installation-materials.md` §7 验收#5
> 目标：验证完整列表 + editNotes 保存后返回 SAVED、versionNo 递增为 2、新版本 origin 为 HUMAN，原 v1 不改写
> 执行方式：curl + SQL 回查

**数据准备**：执行 [sql/TC-INS-SEED.sql](sql/TC-INS-SEED.sql)（对应 [sql/TC-INS-03.sql](sql/TC-INS-03.sql)）；`wi-tc-ins-prep-1` 当前草稿版本 `dv-tc-ins-001`，rowVersion=6、responsibilityVersion=2

**步骤**：
1. `curl -X PUT "http://localhost:8787/api/admin/charging/work-items/wi-tc-ins-prep-1/installation-draft" -H "Idempotency-Key: ik-tc-ins-03" -H "Content-Type: application/json" -d '{"expectedWorkItemVersion":6,"expectedResponsibilityVersion":2,"expectedDraftVersionId":"dv-tc-ins-001","items":[{"installationItem":"交流充电桩（7kW）安装","installedQuantity":2,"unit":"台","materialSupplier":"京东采购供料","serviceScope":"车位立柱安装及接线调试"},{"installationItem":"电缆敷设","installedQuantity":52,"unit":"米","materialSupplier":"服务商供料","serviceScope":"配电箱至车位"},{"installationItem":"漏电保护开关安装","installedQuantity":2,"unit":"个","materialSupplier":"服务商供料","serviceScope":"配电箱内"}],"editNotes":[{"itemIndex":1,"field":"installedQuantity","reason":"与服务商核对确认为 52 米"}]}'`
2. `sqlite3 测试库 "SELECT origin,version_no,parent_version_id FROM installation_draft_version WHERE installation_draft_id='draft-tc-ins-001' ORDER BY version_no;"`
3. `sqlite3 测试库 "SELECT items_json FROM installation_draft_version WHERE id='dv-tc-ins-001';"`

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| HTTP 状态码 / data.status | 200 / `SAVED`（仅本地保存，不表示已提交） |
| data.draftId / versionNo / draftVersionId | `draft-tc-ins-001` / 2 / 非空且 ≠ `dv-tc-ins-001` |
| 步骤 2 查询 | 两行：v1 origin=`AI`、parent=null；v2 origin=`HUMAN`、parent=`dv-tc-ins-001` |
| 步骤 3 查询 | items_json 仍为原 3 行且行 2 installedQuantity 为 null（原版本不改写） |

### TC-INS-04：草稿版本保护（40901）

> PRD：`04-subprd-installation-materials.md` §7 验收#7
> 目标：验证用旧 expectedDraftVersionId 保存返回 40901 且不生成新版本
> 执行方式：curl + SQL 回查

**数据准备**：SEED 后执行 [sql/TC-INS-04.sql](sql/TC-INS-04.sql) 准备段；`draft-tc-ins-04` 当前版本 `dv-tc-ins-04-2`（versionNo=2），事项 rowVersion=3

**步骤**：
1. `curl -X PUT "http://localhost:8787/api/admin/charging/work-items/wi-tc-ins-04/installation-draft" -H "Idempotency-Key: ik-tc-ins-04" -H "Content-Type: application/json" -d '{"expectedWorkItemVersion":3,"expectedResponsibilityVersion":1,"expectedDraftVersionId":"dv-tc-ins-04-1","items":[{"installationItem":"电缆敷设","installedQuantity":48,"unit":"米","materialSupplier":"服务商供料","serviceScope":"配电箱至车位"}],"editNotes":[{"itemIndex":0,"field":"installedQuantity","reason":"复核为 48 米"}]}'`
2. `sqlite3 测试库 "SELECT count(*) FROM installation_draft_version WHERE installation_draft_id='draft-tc-ins-04';"`

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| HTTP 状态码 / code / data | 409 / 40901 / null |
| 步骤 2 查询 | 2（不生成新版本） |

### TC-INS-05：未决写入保护（40903）

> PRD：`04-subprd-installation-materials.md` §7 验收#8
> 目标：验证事项存在未决外部写入时，保存草稿与再次提交均返回 40903，不产生新草稿版本或新提交
> 执行方式：curl + SQL 回查

**数据准备**：SEED 后执行 [sql/TC-INS-05.sql](sql/TC-INS-05.sql) 准备段；`wi-tc-ins-05` 持有未决写入 `sub-tc-ins-05`（PROCESSING），事项 rowVersion=4

**步骤**：
1. `curl -X PUT "http://localhost:8787/api/admin/charging/work-items/wi-tc-ins-05/installation-draft" -H "Idempotency-Key: ik-tc-ins-05a" -H "Content-Type: application/json" -d '{"expectedWorkItemVersion":4,"expectedResponsibilityVersion":1,"expectedDraftVersionId":"dv-tc-ins-05-1","items":[{"installationItem":"交流充电桩（7kW）安装","installedQuantity":2,"unit":"台","materialSupplier":"京东采购供料","serviceScope":"车位立柱安装及接线调试"},{"installationItem":"电缆敷设","installedQuantity":52,"unit":"米","materialSupplier":"服务商供料","serviceScope":"配电箱至车位"},{"installationItem":"漏电保护开关安装","installedQuantity":2,"unit":"个","materialSupplier":"服务商供料","serviceScope":"配电箱内"}],"editNotes":[]}'`（items 沿用当前完整列表，无实质修改时 editNotes 为空数组）
2. `curl -X POST "http://localhost:8787/api/admin/charging/work-items/wi-tc-ins-05/installation-submissions" -H "Idempotency-Key: ik-tc-ins-05b" -H "Content-Type: application/json" -d '{"expectedWorkItemVersion":4,"expectedResponsibilityVersion":1,"draftVersionId":"dv-tc-ins-05-1"}'`
3. `sqlite3 测试库 "SELECT (SELECT count(*) FROM installation_draft_version WHERE installation_draft_id='draft-tc-ins-05'),(SELECT count(*) FROM installation_detail_submission WHERE work_item_id='wi-tc-ins-05');"`

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤 1 / 步骤 2 HTTP 与 code | 均为 409 / 40903 |
| 40903 响应内容 | `data.pendingOperation.operationId`=`sub-tc-ins-05`、`pendingOperation.status`=`PROCESSING`（载体字段已裁决，见索引 §四 #1） |
| 步骤 3 查询 | 1, 1（草稿仍 1 个版本，提交仍 1 笔） |

### TC-INS-06：提交受理与重复提交幂等

> PRD：`04-subprd-installation-materials.md` §7 验收#9（兼验 #6 的 202 受理语义）
> 目标：验证确认提交返回公共 202 且持久化 operationId；同键同内容重放返回原结果不建第二笔；同键不同内容返回 40902
> 执行方式：curl + SQL 回查

**数据准备**：SEED 后执行 [sql/TC-INS-06.sql](sql/TC-INS-06.sql) 准备段；`wi-tc-ins-06` 草稿 `dv-tc-ins-06-1` 字段齐全、无待决问题，尚无提交

**步骤**：
1. `curl -X POST "http://localhost:8787/api/admin/charging/work-items/wi-tc-ins-06/installation-submissions" -H "Idempotency-Key: ik-tc-ins-06" -H "Content-Type: application/json" -d '{"expectedWorkItemVersion":3,"expectedResponsibilityVersion":1,"draftVersionId":"dv-tc-ins-06-1"}'`，记录返回的 operationId
2. 原样重放步骤 1（同 Idempotency-Key、同正文）
3. 同 Idempotency-Key 但正文加 `"comment":"改内容"` 再发一次
4. `sqlite3 测试库 "SELECT count(*) FROM installation_detail_submission WHERE work_item_id='wi-tc-ins-06';"`

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤 1 HTTP / data.status | 202 / `ACCEPTED`（不得表示已写入原系统） |
| 步骤 1 data.operationId / decisionId / jobId | 均为非空 string |
| 步骤 2 HTTP / data.operationId | 202 / 与步骤 1 相同 |
| 步骤 3 HTTP / code | 409 / 40902 |
| 步骤 4 查询 | 1（不建第二笔提交记录） |

### TC-INS-07：结果未知回查（operations）

> PRD：`04-subprd-installation-materials.md` §7 验收#10
> 目标：验证结果未明时 operations 接口如实返回 RESULT_UNKNOWN 且无回执；按原 Idempotency-Key 重放查得原受理结果，不换编号重提
> 执行方式：curl + SQL 回查

**数据准备**：SEED 后执行 [sql/TC-INS-07.sql](sql/TC-INS-07.sql) 准备段；操作 `sub-tc-ins-07` 处于 RESULT_UNKNOWN（原受理请求键 `ik-tc-ins-07`）

**步骤**：
1. `curl "http://localhost:8787/api/admin/charging/operations/sub-tc-ins-07"`
2. 按原键重放：`curl -X POST "http://localhost:8787/api/admin/charging/work-items/wi-tc-ins-07/installation-submissions" -H "Idempotency-Key: ik-tc-ins-07" -H "Content-Type: application/json" -d '{"expectedWorkItemVersion":3,"expectedResponsibilityVersion":1,"draftVersionId":"dv-tc-ins-07-1"}'`
3. `sqlite3 测试库 "SELECT count(*) FROM installation_detail_submission WHERE work_item_id='wi-tc-ins-07';"`

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤 1 HTTP / data.status | 200 / `RESULT_UNKNOWN` |
| 步骤 1 data.receipt / verifiedAt | null / null |
| 步骤 1 data.localContinuationStatus | `NOT_READY`（外部结果未定，本地接续尚未开始；已裁决，见索引 §四 #2） |
| 步骤 2 HTTP / data.operationId | 202 / `sub-tc-ins-07`（原受理结果，不换编号） |
| 步骤 3 查询 | 1 |

### TC-INS-08：提交成功自动产生核查事项

> PRD：`04-subprd-installation-materials.md` §7 验收#11
> 目标：验证外部 SUCCEEDED 且有匹配正式明细回执后，资料事项按完成条件结束、服务端自动产生京东侧核查事项；同一回执重复投递去重不重复创建
> 执行方式：curl + SQL 回查（外部结果由 mock 原系统供给）

**数据准备**：SEED 后执行 [sql/TC-INS-08.sql](sql/TC-INS-08.sql) 准备段；`sub-tc-ins-08` 处于 PROCESSING，并带有可驱动的 WRITE_EXTERNAL 任务 `job-tc-ins-write-08`；执行时由任务回报源端成功回执（明细 `DET-SRC-8801` / 版本 `detv-101`，关联 submissionId `sub-tc-ins-08`），随后重复投递一次该回执

**步骤**：
1. 触发 WRITE_EXTERNAL 任务执行，使 mock 原系统返回上述成功回执；随后以同一提交编号/明细版本重复投递一次该回执
2. `curl "http://localhost:8787/api/admin/charging/operations/sub-tc-ins-08"`
3. `curl "http://localhost:8787/api/admin/charging/work-items/wi-tc-ins-08"`
4. `sqlite3 测试库 "SELECT count(*) FROM work_item WHERE installation_work_order_id='wo-tc-ins-08' AND item_kind='INSTALLATION_REVIEW';"`
5. `sqlite3 测试库 "SELECT count(*) FROM work_item_link WHERE from_work_item_id='wi-tc-ins-08' AND reason_code='STAGE_HANDOFF';"`

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤 2 data.status / receipt / verifiedAt | `SUCCEEDED` / 非 null 且关联本次提交 / 非 null |
| 步骤 3 data.status / completion.code | `COMPLETED` / `INSTALLATION_SUBMITTED` |
| 步骤 4 查询 | 1（重复投递不重复创建核查事项） |
| 步骤 5 查询 | 1 |

### TC-INS-09：上传登记版本并进入相同解析流程

> PRD：`04-subprd-installation-materials.md` §7 验收#12
> 目标：验证上传 INSTALLATION_MATERIAL XLSX 返回 202 RECEIVED、登记 LOCAL_UPLOAD 已核实版本、READY 后事项输入代次增加；缺项在 issues 如实列出
> 执行方式：curl + SQL 回查

**数据准备**：执行 [sql/TC-INS-SEED.sql](sql/TC-INS-SEED.sql)（对应 [sql/TC-INS-09.sql](sql/TC-INS-09.sql)）；`wi-tc-ins-prep-1` rowVersion=6；本地备有可正常解析的 XLSX 样本 `tc-ins-补充明细.xlsx`

**步骤**：
1. `curl -X POST "http://localhost:8787/api/admin/charging/uploads" -H "Idempotency-Key: ik-tc-ins-09" -F "file=@tc-ins-补充明细.xlsx" -F "providerId=sp-tc-ins-anjia" -F "purpose=INSTALLATION_MATERIAL" -F "workItemId=wi-tc-ins-prep-1" -F "expectedWorkItemVersion=6"`，记录 uploadId 与 materialVersionId
2. `sqlite3 测试库 "SELECT sm.source_system,v.read_state FROM source_material sm JOIN source_material_version v ON v.source_material_id=sm.id WHERE v.id='<materialVersionId>';"`
3. 轮询 `curl "http://localhost:8787/api/admin/charging/uploads/<uploadId>"` 直至 status 到达终态（等待时限 [待确认-需产品明确]）
4. `curl "http://localhost:8787/api/admin/charging/work-items/wi-tc-ins-prep-1"`

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤 1 HTTP / data.status | 202 / `RECEIVED`（不表示解析完成） |
| 步骤 1 data.uploadId / materialVersionId / jobId / workItemId | 前三个为非空 string；workItemId=`wi-tc-ins-prep-1` |
| 步骤 2 查询 | `LOCAL_UPLOAD`, `VERIFIED`（先完整保存文件并校验后再登记） |
| 步骤 3 终态 | `READY`（可正常解析样本）；issues 为数组，有问题时逐条 {code,description} 如实列出，不补造缺失账单或依据 |
| 步骤 4 data.analysisGeneration | 2（较上传前 +1，重新准备分析） |

---

## 二、UI 验证用例（11-19）

### TC-INS-11：草稿明细区渲染

> PRD：`04-subprd-installation-materials.md` §7 验收#1
> 目标：验证 3 行明细五字段正确展示，null 数量行展示"待核实"不填零
> 执行方式：浏览器 UI

**数据准备**：执行 [sql/TC-INS-SEED.sql](sql/TC-INS-SEED.sql)（对应 [sql/TC-INS-11.sql](sql/TC-INS-11.sql)），以资料员身份进入

**步骤**：
1. 打开「安装资料确认」页（事项 `wi-tc-ins-prep-1`，原型路由 `#task/draft`），查看草稿明细区与版本标识

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 明细行数 | 3 行 |
| 行 1 / 行 3 | 交流充电桩（7kW）安装 / 2 / 台 / 京东采购供料 / 车位立柱安装及接线调试；漏电保护开关安装 / 2 / 个 / 服务商供料 / 配电箱内 |
| 行 2 数量列 | 展示"待核实"，不显示 0、不留空白 |
| 版本标识 | versionNo=1，来源显示"后台整理"（AI 草稿不标为人员编辑） |

### TC-INS-12：依据定位侧栏

> PRD：`04-subprd-installation-materials.md` §7 验收#2
> 目标：验证点击明细行证据引用打开原始证据侧栏，沿 blockId 定位原页/sheet/cellRange，图片描述标明是描述
> 执行方式：浏览器 UI

**数据准备**：执行 [sql/TC-INS-SEED.sql](sql/TC-INS-SEED.sql)（对应 [sql/TC-INS-12.sql](sql/TC-INS-12.sql)）；证据引用指向 parse-tc-ins-001（b1/b2/b3）与 parse-tc-ins-002（c1）

**步骤**：
1. 打开「安装资料确认」页（`wi-tc-ins-prep-1`），点击行 1 的依据定位入口查看侧栏
2. 在行 1 证据列表中打开施工现场照片（块 b3）的引用
3. 点击行 2 的依据定位入口

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤 1 侧栏 | 定位到《桂语庭施工单扫描件.pdf》第 1 页块 b1 对应原文位置 |
| 步骤 2 | 明确标明该条为图片描述（IMAGE_DESCRIPTION），无原文引文（quote 为空），不当作原文引用展示 |
| 步骤 3 侧栏 | 定位到《桂语庭安装明细表.xlsx》sheet"安装明细"单元格区域 B5:F5 |

### TC-INS-13：缺项与冲突展示

> PRD：`04-subprd-installation-materials.md` §7 验收#3
> 目标：验证 openQuestions 2 条逐条如实列出需补材料或字段，不显示为已核实
> 执行方式：浏览器 UI

**数据准备**：执行 [sql/TC-INS-SEED.sql](sql/TC-INS-SEED.sql)（对应 [sql/TC-INS-13.sql](sql/TC-INS-13.sql)）

**步骤**：
1. 打开「安装资料确认」页（`wi-tc-ins-prep-1`），查看缺项与冲突说明区

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 缺项列表 | 恰好 2 条：q1 电缆敷设数量冲突（45 米与 52 米）、q2 缺配电箱改造批准记录 |
| 冲突行展示 | 行 2 数量保持"待核实"，两个冲突数量来源如实说明，不任挑一份填入 |
| 已核实标识 | 2 条问题均不显示为已核实/已解决 |

### TC-INS-14：无草稿页面

> PRD：`04-subprd-installation-materials.md` §7 验收#4
> 目标：验证无草稿事项页面展示整理中真实状态，无可提交明细
> 执行方式：浏览器 UI

**数据准备**：SEED 后执行 [sql/TC-INS-02.sql](sql/TC-INS-02.sql) 准备段（对应 [sql/TC-INS-14.sql](sql/TC-INS-14.sql)）；`wi-tc-ins-prep-empty` 无草稿，status=PREPARING

**步骤**：
1. 打开「安装资料确认」页（事项 `wi-tc-ins-prep-empty`）

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 状态区 | 展示"整理中"真实状态 |
| 明细区 | 无任何明细行，不编造可提交明细 |
| 确认提交入口 | 不可用（无可提交内容） |

### TC-INS-15：编辑保存后版本标识更新

> PRD：`04-subprd-installation-materials.md` §7 验收#5（UI 侧）
> 目标：验证页面编辑保存后版本号递增、来源显示"人员编辑"，人工更正不显示为 AI 原文；先骨架屏后替换渲染
> 执行方式：浏览器 UI

**数据准备**：执行 [sql/TC-INS-SEED.sql](sql/TC-INS-SEED.sql)（对应 [sql/TC-INS-15.sql](sql/TC-INS-15.sql)）；`wi-tc-ins-prep-1` 当前版本 versionNo=1

**步骤**：
1. 打开「安装资料确认」页（`wi-tc-ins-prep-1`），将行 2 数量改为 52，填写修改理由"与服务商核对确认为 52 米"，点击保存
2. 观察保存过程中的加载表现与保存后的版本标识

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 保存过程 | 先骨架屏后替换渲染，本页与待处理事项列表同步更新 |
| 版本标识 | versionNo=2，来源显示"人员编辑" |
| 行 2 数量 / 依据定位 | 显示 52 / 证据引用仍指向原解析位置，人工更正内容不显示为 AI 原文 |

### TC-INS-16：提交进展三态如实区分

> PRD：`04-subprd-installation-materials.md` §7 验收#6
> 目标：验证处理中/结果未知/成功三种进展文案与操作引导各不相同；受理页不显示"已提交成功"
> 执行方式：浏览器 UI

**数据准备**：SEED 后执行 [sql/TC-INS-16.sql](sql/TC-INS-16.sql) 准备段；`wi-tc-ins-16a`（处理中）、`wi-tc-ins-16b`（结果未知）、`wi-tc-ins-16c`（已证实成功）三事项就绪

**步骤**：
1. 依次打开「安装资料确认」页 `wi-tc-ins-16a`、`wi-tc-ins-16b`、`wi-tc-ins-16c`，查看确认提交与进展区

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 16a 进展区 | 显示"正在处理"类文案，引导查看进展、可离开后再回来；不显示"已提交成功" |
| 16b 进展区 | 显示"结果暂时无法确定"，引导保留原确认、查原结果；不显示为失败 |
| 16c 进展区 | 显示"已证实提交成功"，本环节完成，可查看提交内容和结果 |
| 三态对比 | 三种文案与操作引导互不相同 |

### TC-INS-17：结果未知页面不换编号重提

> PRD：`04-subprd-installation-materials.md` §7 验收#10（UI 侧）
> 目标：验证结果未知时页面保留原确认、提供原操作查看入口，不提供换编号重新提交入口
> 执行方式：浏览器 UI

**数据准备**：SEED 后执行 [sql/TC-INS-17.sql](sql/TC-INS-17.sql) 准备段；`wi-tc-ins-17` 提交 `sub-tc-ins-17` 为 RESULT_UNKNOWN

**步骤**：
1. 打开「安装资料确认」页（`wi-tc-ins-17`），查看确认提交与进展区

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 进展文案 | 显示"结果暂时无法确定"，不判失败 |
| 原确认内容 | 已提交明细内容保持可见，不被清空、不要求重新填写 |
| 操作入口 | 提供查看原操作（sub-tc-ins-17）进展的入口；无换编号重新提交入口 |

---

## 三、版本历史

| 版本 | 日期 | 变更说明 |
|------|------|---------|
| v1.0.1 | 2026-09-20 | T3.1 执行回写：裁决 40903 载体字段（`pendingOperation`）与 RESULT_UNKNOWN 的 `localContinuationStatus=NOT_READY`；TC-INS-08 准备段补入执行所需的 WRITE_EXTERNAL 任务 |
| v1.0.0 | 2026-09-20 | 初版：API 9 条 + UI 7 条，覆盖 §7 全部 12 条验收点 |
