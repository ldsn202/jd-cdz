<!-- @meta docId="tc-config-detail" status="active" baseline="v1.0.0" -->
# 服务商接入配置 测试用例（用例详情）

> 上游（我引用）：[03-subprd-provider-config.md](../../05-prd/03-subprd-provider-config.md) §3、§5、§7、[integration-config-schema.md](../../03-foundation/03-05-schema/integration-config-schema.md) §2、§4—5、[configuration-apis.md](../../03-foundation/03-06-provided-apis/configuration-apis.md) §1—3、[common-contract.md](../../03-foundation/03-06-provided-apis/common-contract.md) §2、§4、[workbench-apis.md](../../03-foundation/03-06-provided-apis/workbench-apis.md) §2、[01-subprd-workbench-items.md](../../05-prd/01-subprd-workbench-items.md) §3
> 下游（引用我）：[tc-config.md](tc-config.md) 索引层

> **索引文件**: [tc-config.md](tc-config.md)（前置条件、字段分层、验收矩阵以索引层为准）
> 服务端基础地址 `http://localhost:8787`；写请求统一带 Header `Idempotency-Key`。

---

## 三、API 验证用例

### TC-CFG-01：读取配置详情（候选/生效/试转换/待确认问题字段直透）

> PRD：`03-subprd-provider-config.md` §7 验收#2、#3、#4
> 目标：验证 GET 配置详情返回的 candidateVersion / activeVersion / trial / openQuestions 与存储数据一致
> 执行方式：curl
**数据准备**：执行 [sql/TC-CFG-01.sql](sql/TC-CFG-01.sql)（仅依赖 SEED）。

**步骤**：
1. `curl "http://localhost:8787/api/admin/charging/work-items/wi-cfg-01/configuration"`
2. 解析响应 JSON。

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| HTTP 状态码 / code | 200 / 0 |
| data.configurationId | `cfg-01` |
| data.candidateVersion.versionId / versionNo | `cfgv-01-2` / 2 |
| data.candidateVersion.formatStatus / sourceFormatId / sourceFormatVersion | `PROVIDED` / `AJ-FMT` / `2026.03` |
| data.candidateVersion.rules | 长度 2；rules[0].targetField=`installedQuantity`；rules[1].parameters.steps 含 lookup 条目 `m→米` |
| data.activeVersion.versionId / versionNo | `cfgv-01-1` / 1 |
| data.trial.trialId / status | `ct-01-2` / `PASSED` |
| data.trial.checks | inputComplete、scopeValid、rulesCovered、outputsValid、meaningsResolved 全为 true |
| data.openQuestions | `[]`（空数组，非 null） |
| data.rowVersion | 3 |

**数据清理**：执行 [sql/TC-CFG-01.sql](sql/TC-CFG-01.sql)（无需清理）。
### TC-CFG-02：试转换 FAILED 禁止启用（42201，旧配置保持有效）

> PRD：`03-subprd-provider-config.md` §7 验收#8
> 目标：验证候选试转换为 FAILED 时启用接口返回 42201 且不切换生效指针
> 执行方式：curl
**数据准备**：执行 [sql/TC-CFG-02.sql](sql/TC-CFG-02.sql) 的"数据准备"段（cfg-02 生效版 cfgv-02-1，候选 cfgv-02-2 的试转换 ct-02-2 为 FAILED）。

**步骤**：
1. `curl -X POST "http://localhost:8787/api/admin/charging/work-items/wi-cfg-02/configuration-enablement" -H "Idempotency-Key: cfg02-enable-1" -H "Content-Type: application/json" -d '{"expectedWorkItemVersion":3,"expectedResponsibilityVersion":1,"comment":"申请启用","candidateVersionId":"cfgv-02-2","trialId":"ct-02-2","expectedConfigurationRowVersion":2,"expectedActiveVersionId":"cfgv-02-1"}'`
2. `curl "http://localhost:8787/api/admin/charging/work-items/wi-cfg-02/configuration"` 回查。

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤 1 HTTP 状态码 / code | 422 / 42201 |
| 步骤 1 data | null；msg 说明试转换不足的具体缺项 |
| 步骤 2 data.activeVersion.versionId | 仍为 `cfgv-02-1`（指针未切换） |
| 步骤 2 data.candidateVersion.versionId | 仍为 `cfgv-02-2`（候选保留供修订） |

**数据清理**：执行 [sql/TC-CFG-02.sql](sql/TC-CFG-02.sql) 的"数据清理"段。
### TC-CFG-03：试转换 NEEDS_INFORMATION / 尚无终态记录禁止启用

> PRD：`03-subprd-provider-config.md` §7 验收#8
> 目标：验证 NEEDS_INFORMATION 与无终态记录两种状态下启用均返回 42201
> 执行方式：curl
**数据准备**：执行 [sql/TC-CFG-03.sql](sql/TC-CFG-03.sql) 的"数据准备"段（cfg-03 候选试转换为 NEEDS_INFORMATION；cfg-04 候选无任何试转换记录）。

**步骤**：
1. 对 wi-cfg-03 提交启用：`curl -X POST ".../work-items/wi-cfg-03/configuration-enablement" -H "Idempotency-Key: cfg03-enable-1" -d '{"expectedWorkItemVersion":2,"expectedResponsibilityVersion":1,"candidateVersionId":"cfgv-03-1","trialId":"ct-03-1","expectedConfigurationRowVersion":1,"expectedActiveVersionId":null}'`
2. 对 wi-cfg-04 提交启用（trialId 填候选当前可见的任意已保存记录编号；无记录时按页面禁用状态直接发请求，body 中 trialId 填空字符串以外的固定值 `"no-such-trial"`）。
3. 分别回查 GET configuration。

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤 1 HTTP / code | 422 / 42201（msg 指出含义未决） |
| 步骤 2 HTTP / code | 422 / 42201（msg 指出需先通过试转换） |
| 步骤 3 两者 data.activeVersion | 均为 null（不伪造生效配置） |

**数据清理**：执行 [sql/TC-CFG-03.sql](sql/TC-CFG-03.sql) 的"数据清理"段。
### TC-CFG-04：修订候选保存（202、新 HUMAN 候选、旧版本与旧试转换保留、自动安排试转换）

> PRD：`03-subprd-provider-config.md` §7 验收#9
> 目标：验证 PUT configuration-draft 保存新候选版本且不覆写旧版本、同事务安排 TRIAL_CONFIG 任务
> 执行方式：curl
**数据准备**：执行 [sql/TC-CFG-04.sql](sql/TC-CFG-04.sql)（仅依赖 SEED）。

**步骤**：
1. `curl -X PUT ".../work-items/wi-cfg-01/configuration-draft" -H "Idempotency-Key: cfg04-draft-1" -d '{"expectedWorkItemVersion":3,"expectedResponsibilityVersion":1,"expectedCandidateVersionId":"cfgv-01-2","rules":[{"ruleId":"actual-length","sourceFields":["/实装长度"],"targetField":"installedQuantity","operation":"PIPELINE","parameters":{"steps":[{"op":"field","path":"/实装长度"},{"op":"halfwidth"},{"op":"stripSuffix","value":"米"},{"op":"decimal"},{"op":"scale","factor":"100"}]},"conditions":[]}],"applicability":{"serviceProviderId":"sp-01","sourceSystem":"ANJIE-ERP","purpose":"INSTALLATION","businessScopeKey":"anjie-install-materials","formatStatus":"PROVIDED","sourceFormatId":"AJ-FMT","sourceFormatVersion":"2026.03","rowPath":"/rows","conditions":[],"basisReferences":["item-cfg-01-0a"],"unknownConditions":[]},"editNotes":[{"field":"rules[0].parameters.steps","reason":"原格式说明 2026.03 明确长度以厘米登记，追加厘米到米换算"}]}'`
2. 解析响应；随后 `curl ".../work-items/wi-cfg-01/configuration"` 与 `curl ".../configuration-trials/ct-01-2"` 回查。

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤 1 HTTP / data.status | 202 / `ACCEPTED` |
| data.candidateVersionId | 非空且 ≠ `cfgv-01-2`；data.jobId 非空；data.workItemId=`wi-cfg-01` |
| 步骤 2 candidateVersion.versionNo | 3；rules[0].parameters.steps 含追加的 scale 步骤 |
| 步骤 2 data.trial | null（新候选尚无终态，执行中不伪造通过） |
| 步骤 2 GET ct-01-2 | 200，status 仍为 `PASSED`（旧试转换保留可回看） |
| data.activeVersion.versionId | 仍为 `cfgv-01-1`（候选保存不切换生效指针） |

**数据清理**：执行 [sql/TC-CFG-04.sql](sql/TC-CFG-04.sql) 的"数据清理"段。
### TC-CFG-05：修改含义后旧试转换失效（用旧 trialId 启用被拒）

> PRD：`03-subprd-provider-config.md` §7 验收#9
> 目标：验证属于旧候选的 PASSED 试转换不能作为新候选的启用依据
> 执行方式：curl
**数据准备**：执行 [sql/TC-CFG-05.sql](sql/TC-CFG-05.sql) 的"数据准备"段（当前候选推进到 cfgv-01-3，其无 PASSED 试转换）。

**步骤**：
1. `curl -X POST ".../work-items/wi-cfg-01/configuration-enablement" -H "Idempotency-Key: cfg05-enable-1" -d '{"expectedWorkItemVersion":4,"expectedResponsibilityVersion":1,"candidateVersionId":"cfgv-01-3","trialId":"ct-01-2","expectedConfigurationRowVersion":2,"expectedActiveVersionId":"cfgv-01-1"}'`
2. `curl ".../work-items/wi-cfg-01/configuration"` 回查。

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤 1 HTTP / code | 422 / 42201（试转换非本候选） |
| 步骤 2 data.activeVersion.versionId | 仍为 `cfgv-01-1` |
| 步骤 2 data.candidateVersion.versionId | `cfgv-01-3`（新候选保留） |

**数据清理**：执行 [sql/TC-CFG-05.sql](sql/TC-CFG-05.sql) 的"数据清理"段。
### TC-CFG-06：首次启用成功（expectedActiveVersionId=null、APPLIED、同事务、同键重试）

> PRD：`03-subprd-provider-config.md` §7 验收#10
> 目标：验证首次启用同事务完成指针切换与事项完成；同键重试返回原动作实际结果
> 执行方式：curl
**数据准备**：执行 [sql/TC-CFG-06.sql](sql/TC-CFG-06.sql) 的"数据准备"段（cfg-06 从未启用，候选 cfgv-06-1 有 PASSED 试转换 ct-06-1）。

**步骤**：
1. `curl -X POST ".../work-items/wi-cfg-06/configuration-enablement" -H "Idempotency-Key: cfg06-enable-1" -d '{"expectedWorkItemVersion":2,"expectedResponsibilityVersion":1,"comment":"含义与试转换结果已核实","candidateVersionId":"cfgv-06-1","trialId":"ct-06-1","expectedConfigurationRowVersion":1,"expectedActiveVersionId":null}'`
2. 原键原内容重发同一请求。
3. `curl ".../work-items/wi-cfg-06/configuration"` 与 `curl ".../work-items?kind=CONFIGURATION&providerId=sp-01"` 回查。

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤 1 HTTP / data.status | 200 / `APPLIED` |
| 步骤 2 响应 | 与步骤 1 返回同一 decisionId 与 `APPLIED`（原动作实际结果，不重复写入） |
| 步骤 3 data.activeVersion.versionId | `cfgv-06-1`（指针已切换） |
| 步骤 3 列表中 wi-cfg-06 的 status | `COMPLETED`（事项完成与指针切换同事务生效） |
| configuration_enablement 记录（辅助 SQL 核对） | expected_active_version_id 为 NULL（首次启用） |

**数据清理**：执行 [sql/TC-CFG-06.sql](sql/TC-CFG-06.sql) 的"数据清理"段。
### TC-CFG-07：启用后同类新资料走已启用版本（不产生新人工配置事项）

> PRD：`03-subprd-provider-config.md` §7 验收#11
> 目标：验证启用后到达的同类新资料由程序按已启用版本持续转换并记录实际所用版本
> 执行方式：联调验证（资料域上传链路 + 后台任务真实执行）
**数据准备**：执行 [sql/TC-CFG-07.sql](sql/TC-CFG-07.sql)（仅依赖 SEED，cfg-01 生效版 cfgv-01-1）。

**步骤**：
1. 经资料域上传链路送入一条同类新资料（来源 ANJIE-ERP、格式 AJ-FMT 2026.03、含"实装长度=２１.００米、单位=米"）。
2. 等待后台转换完成。
3. `curl ".../work-items?kind=CONFIGURATION&providerId=sp-01"` 回查事项列表；SQL 辅助核对新资料处理快照。

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤 3 列表 | 不新增任何 CONFIGURATION 事项（人员不逐单确认配置） |
| 新资料的转换结果 | 按 cfgv-01-1 规则产出 installedQuantity=`"21"`、unit=`"米"` |
| 实际所用版本记录 | 该资料的分析输入快照 config_versions_json 含 `{"configurationId":"cfg-01","configurationVersionId":"cfgv-01-1"}`（对外查询口径 [待确认-需产品明确]，当前以 SQL 辅助核对） |

**数据清理**：执行 [sql/TC-CFG-07.sql](sql/TC-CFG-07.sql) 的"数据清理"段。
### TC-CFG-08：启用时配置版本已变化（40901，不切换生效指针）

> PRD：`03-subprd-provider-config.md` §7 验收#13
> 目标：验证页面所读配置版本被并发修改后启用返回 40901 且不覆盖旧生效版
> 执行方式：curl
**数据准备**：执行 [sql/TC-CFG-08.sql](sql/TC-CFG-08.sql) 的"数据准备"段（模拟并发将 cfg-01 推进到 row_version=3）。

**步骤**：
1. 按页面所读旧版本提交：`curl -X POST ".../work-items/wi-cfg-01/configuration-enablement" -H "Idempotency-Key: cfg08-enable-1" -d '{"expectedWorkItemVersion":3,"expectedResponsibilityVersion":1,"candidateVersionId":"cfgv-01-2","trialId":"ct-01-2","expectedConfigurationRowVersion":2,"expectedActiveVersionId":"cfgv-01-1"}'`
2. `curl ".../work-items/wi-cfg-01/configuration"` 回查。

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤 1 HTTP / code | 409 / 40901（msg 提示刷新后重新核实） |
| 步骤 2 data.activeVersion.versionId | 仍为 `cfgv-01-1`（旧生效版不被覆盖） |
| 步骤 2 data.rowVersion | 3（返回当前真实版本供重新核实） |

**数据清理**：执行 [sql/TC-CFG-08.sql](sql/TC-CFG-08.sql) 的"数据清理"段。
### TC-CFG-09：无权限启用被拒（40301，配置状态不变）

> PRD：`03-subprd-provider-config.md` §7 验收#12
> 目标：验证无 ENABLE_INTEGRATION_CONFIG 权限或非当前对接责任人直接请求启用返回 40301
> 执行方式：curl
**数据准备**：执行 [sql/TC-CFG-09.sql](sql/TC-CFG-09.sql)（仅依赖 SEED）；使用身份模拟配置发放的无权限身份凭据。

**步骤**：
1. 以无权限身份凭据提交：`curl -X POST ".../work-items/wi-cfg-01/configuration-enablement" -H "Idempotency-Key: cfg09-enable-1" -d '{"expectedWorkItemVersion":3,"expectedResponsibilityVersion":1,"candidateVersionId":"cfgv-01-2","trialId":"ct-01-2","expectedConfigurationRowVersion":2,"expectedActiveVersionId":"cfgv-01-1"}'`
2. 以有权限身份 `curl ".../work-items/wi-cfg-01/configuration"` 回查。

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤 1 HTTP / code | 403 / 40301 |
| 步骤 2 data.activeVersion.versionId | 仍为 `cfgv-01-1`；data.rowVersion 仍为 2（无任何写入） |

**数据清理**：执行 [sql/TC-CFG-09.sql](sql/TC-CFG-09.sql) 的"数据清理"核验段。

---

## 四、UI 验证用例

### TC-CFG-11：接入事项列表渲染（2 条配置事项、无工单编号位）

> PRD：`03-subprd-provider-config.md` §7 验收#1
> 目标：验证列表直透渲染接口字段，配置事项不显示工单编号位
> 执行方式：浏览器 UI
**数据准备**：执行 [sql/TC-CFG-11.sql](sql/TC-CFG-11.sql) 的"数据准备"段（wi-cfg-01 分析可用 + wi-cfg-11b 无分析结果）。

**步骤**：
1. 以服务商对接人员身份打开接入事项列表页（`index.html#mapping`）。
2. 同时 `curl ".../work-items?kind=CONFIGURATION"` 取得接口返回逐字段对照。

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 列表行数 | 2 行（wi-cfg-01、wi-cfg-11b） |
| 标题 | `安捷充电-安装资料接入配置确认`、`安捷充电-费用项目对应接入配置确认`，与接口 title 一致 |
| 服务商名 | 两行均为"安捷充电安装服务有限公司"，与接口 providerName 一致 |
| 状态 / 分析状态 | 与接口 status / analysisStatus 完全一致；wi-cfg-01 行 AVAILABLE 无额外标识，wi-cfg-11b 行 NOT_READY 标识"结果准备中"（01-subprd-workbench-items §3） |
| 工单编号位 | 两行均不显示（workOrderId 为 null） |

**数据清理**：执行 [sql/TC-CFG-11.sql](sql/TC-CFG-11.sql) 的"数据清理"段。
### TC-CFG-12：配置草稿区块展示（规则明细/字段对照/适用范围/来源格式）

> PRD：`03-subprd-provider-config.md` §7 验收#2
> 目标：验证详情页 A/B/C/D 区按 candidateVersion 字段原样展示
> 执行方式：浏览器 UI
**数据准备**：执行 [sql/TC-CFG-12.sql](sql/TC-CFG-12.sql)（仅依赖 SEED）。

**步骤**：
1. 列表点击"安捷充电-安装资料接入配置确认"进入详情页。

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| A 区 候选版本号 / 生效版本号 | 2 / 1 |
| A 区 来源格式状态 | PROVIDED 对应展示，格式编号 `AJ-FMT`、版本 `2026.03`，无伪造编号 |
| B 区 规则明细 | 2 条：actual-length（原字段 `/实装长度` → installedQuantity，PIPELINE，4 步参数，无条件）；unit-lookup（`/单位` → unit，含 lookup 步骤） |
| B 区 字段对照 | lookup 对照表展示 `m→米`、`米→米` 两条 |
| B 区 适用范围 | 服务商 sp-01 对应名称、来源 ANJIE-ERP、用途 INSTALLATION、格式 AJ-FMT 2026.03、rowPath `/rows` |
| D 区 试转换 | 状态 PASSED，输出含 installedQuantity=`"18.5"`、unit=`"米"`，逐条规则执行结果 2 条均 PASSED |

**数据清理**：无（只读）。
### TC-CFG-13：待确认问题展示（非空逐条 / 空数组"无待确认问题"）

> PRD：`03-subprd-provider-config.md` §7 验收#3
> 目标：验证 openQuestions 非空逐条展示、空数组展示"无待确认问题"
> 执行方式：浏览器 UI
**数据准备**：执行 [sql/TC-CFG-13.sql](sql/TC-CFG-13.sql) 的"数据准备"段（wi-cfg-13 候选带 2 条问题；空数组侧用 SEED 的 wi-cfg-01）。

**步骤**：
1. 打开 wi-cfg-13 详情页，查看 C 区。
2. 打开 wi-cfg-01 详情页，查看 C 区。

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| wi-cfg-13 C 区 | 逐条展示 2 条问题：「用量」无定义、「规格」值「国标」缺单位与适用范围依据 |
| wi-cfg-01 C 区 | 展示"无待确认问题"，不渲染占位内容 |

**数据清理**：执行 [sql/TC-CFG-13.sql](sql/TC-CFG-13.sql) 的"数据清理"段。
### TC-CFG-14：无生效配置展示

> PRD：`03-subprd-provider-config.md` §7 验收#4
> 目标：验证 activeVersion 为 null 时展示"当前无生效配置"
> 执行方式：浏览器 UI
**数据准备**：执行 [sql/TC-CFG-14.sql](sql/TC-CFG-14.sql) 的"数据准备"段（cfg-14 从未启用）。

**步骤**：
1. 打开 wi-cfg-14 详情页，查看 A 区。

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| A 区 生效版本位 | 展示"当前无生效配置"，不渲染任何版本号 |

**数据清理**：执行 [sql/TC-CFG-14.sql](sql/TC-CFG-14.sql) 的"数据清理"段。
### TC-CFG-15：试转换执行中展示（无通过标记、启用禁用）

> PRD：`03-subprd-provider-config.md` §7 验收#5
> 目标：验证候选已保存但无终态试转换时展示执行中且启用禁用
> 执行方式：浏览器 UI
**数据准备**：执行 [sql/TC-CFG-15.sql](sql/TC-CFG-15.sql) 的"数据准备"段（cfgv-15-1 无任何试转换记录）。

**步骤**：
1. 打开 wi-cfg-15 详情页，查看 D 区与 E 区。

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| D 区 | 展示"试转换执行中"；不出现任何通过标记或伪造的 checks 全 true |
| E 区"确认启用" | 禁用，并提示"需先通过试转换" |

**数据清理**：执行 [sql/TC-CFG-15.sql](sql/TC-CFG-15.sql) 的"数据清理"段。
### TC-CFG-16：试转换 FAILED 展示（具体失败问题、启用禁用）

> PRD：`03-subprd-provider-config.md` §7 验收#6
> 目标：验证 FAILED 试转换展示 issues 具体失败原因且启用保持禁用
> 执行方式：浏览器 UI
**数据准备**：执行 [sql/TC-CFG-16.sql](sql/TC-CFG-16.sql) 的"数据准备"段（ct-16-1 FAILED，单位冲突）。

**步骤**：
1. 打开 wi-cfg-16 详情页，查看 D 区与 E 区。

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| D 区 状态 | FAILED |
| D 区 问题列表 | 展示"输入单位为米，规则追加英尺换算比例，单位冲突"（UNIT_CONFLICT） |
| D 区 输出区 | 无输出内容（output 为 null），不展示伪造结果 |
| E 区"确认启用" | 禁用 |

**数据清理**：执行 [sql/TC-CFG-16.sql](sql/TC-CFG-16.sql) 的"数据清理"段。
### TC-CFG-17：试转换结果刷新保留（不产生新执行）

> PRD：`03-subprd-provider-config.md` §7 验收#7
> 目标：验证刷新页面展示同一份已保存试转换结果，不产生新执行记录
> 执行方式：浏览器 UI
**数据准备**：执行 [sql/TC-CFG-17.sql](sql/TC-CFG-17.sql)（仅依赖 SEED，ct-01-2 PASSED）。

**步骤**：
1. 打开 wi-cfg-01 详情页，记录 D 区试转换编号与输出内容。
2. 刷新页面，重新查看 D 区。
3. `curl ".../work-items/wi-cfg-01/configuration"` 核对 trial.trialId。

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 刷新后 D 区 | 与刷新前完全同一份结果（ct-01-2，输出 installedQuantity=`"18.5"`、unit=`"米"`） |
| 步骤 3 trial.trialId | 仍为 `ct-01-2` |
| 试转换记录数（辅助 SQL） | `SELECT COUNT(*) FROM configuration_trial WHERE configuration_version_id='cfgv-01-2'` 仍为 1 |

**数据清理**：无（只读）。
### TC-CFG-18：新资料缺字段/未知值 → 形成待确认问题进入配置调整事项

> PRD：`03-subprd-provider-config.md` §7 验收#14
> 目标：验证启用后到达的缺字段/未知值资料触发待确认问题与配置调整事项
> 执行方式：联调验证（资料域上传链路 + 后台任务真实执行）
**数据准备**：执行 [sql/TC-CFG-18.sql](sql/TC-CFG-18.sql)（仅依赖 SEED）。

**步骤**：
1. 经资料域上传链路送入一条适用 cfg-01 但缺"实装长度"字段、单位列为未登记值"英尺"的新资料。
2. 等待后台处理完成。
3. `curl ".../work-items?kind=CONFIGURATION&providerId=sp-01"` 找到新增的配置调整事项，`curl ".../work-items/{新事项id}/configuration"` 查看待确认问题。

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 步骤 3 列表 | 新增 1 条 CONFIGURATION 配置调整事项 |
| 新事项 openQuestions | 含具体缺项问题（缺"实装长度"）与未知值问题（"英尺"未登记对照）；未知值不被转为零或默认值 |
| 资料保留原值 | 原数据与具体问题保留、不补默认值（资料侧断言见资料域对应用例；是否并入本用例 [待确认-需产品明确]） |

**数据清理**：执行 [sql/TC-CFG-18.sql](sql/TC-CFG-18.sql) 的"数据清理"段。
### TC-CFG-19：格式变更重新处理（停止旧规则自动转换、形成/更新配置调整事项）

> PRD：`03-subprd-provider-config.md` §3.6（§7 未单列，依据 §3.6 行为条款）
> 目标：验证来源格式版本变化后停止按旧规则自动转换并形成/更新配置调整事项
> 执行方式：联调验证（资料域上传链路 + 后台任务真实执行）
**数据准备**：执行 [sql/TC-CFG-19.sql](sql/TC-CFG-19.sql)（仅依赖 SEED，cfg-01 生效版绑定格式 AJ-FMT 2026.03）。

**步骤**：
1. 经资料域上传链路送入一条来源格式为 AJ-FMT 2026.09 的新资料。
2. 等待后台处理完成。
3. `curl ".../work-items?kind=CONFIGURATION&providerId=sp-01"` 查看配置调整事项。

**预期结果**：

| 检查项 | 预期 |
|:---|:---|
| 旧规则自动转换 | 该资料不按 cfgv-01-1 自动转换（无按旧版产出的转换结果） |
| 步骤 3 列表 | 形成或更新 1 条配置调整事项，待对接人员重新处理配置 |
| 历史结果 | cfgv-01-1 及其历史试转换、启用记录不被改写 |

**数据清理**：执行 [sql/TC-CFG-19.sql](sql/TC-CFG-19.sql) 的"数据清理"段。
