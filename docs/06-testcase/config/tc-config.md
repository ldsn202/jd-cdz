<!-- @meta docId="tc-config" status="active" baseline="v1.0.0" -->
# 服务商接入配置 测试用例（索引层）

> 上游（我引用）：[03-subprd-provider-config.md](../../05-prd/03-subprd-provider-config.md) §3、§5、§7、[integration-config-schema.md](../../03-foundation/03-05-schema/integration-config-schema.md) §1—6 表 `integration_config` / `integration_config_version` / `configuration_trial` / `configuration_enablement` / `configuration_activation_result`、[configuration-apis.md](../../03-foundation/03-06-provided-apis/configuration-apis.md) §1—3、[common-contract.md](../../03-foundation/03-06-provided-apis/common-contract.md) §2、§4—5、[work-item-schema.md](../../03-foundation/03-05-schema/work-item-schema.md) §3 `work_item`、§5 `human_decision`、[evidence-schema.md](../../03-foundation/03-05-schema/evidence-schema.md) §2 `analysis_input_snapshot` / `analysis_input_item` / `analysis_result`、[workbench-apis.md](../../03-foundation/03-06-provided-apis/workbench-apis.md) §2、[01-subprd-workbench-items.md](../../05-prd/01-subprd-workbench-items.md) §3 分析状态展示
> 下游（引用我）：[tc-main-jd-charging.md](../tc-main-jd-charging.md) 域登记（主索引尚未建立，建立后回写）

> **基线版本**: v1.0.0 | **最后更新**: 2026-09-20
> **编号前缀**: TC-CFG-
> **基准 PRD**: [03-subprd-provider-config.md](../../05-prd/03-subprd-provider-config.md) §7 验收标准（验收点 #1—#14）
> **用例详情**: [tc-config-用例详情.md](tc-config-用例详情.md)
> **数据链路**: `work_item` → `integration_config` → `integration_config_version` → `configuration_trial` → `configuration_enablement` / `configuration_activation_result`（读接口全部直透源表，无缓存/预计算表）
> **预期来源**: PRD 03-subprd-provider-config.md §3、§7；技术事实（字段名、状态码、枚举）取自 configuration-apis.md / common-contract.md / integration-config-schema.md
> **设计方法**: 决策表（启用前置条件组合）、状态迁移（候选/试转换/生效指针）、场景法（修订—试转换—启用链路、启用后持续转换）、边界值（空数组/null/首次启用）、错误推测（并发版本、越权、同键重试）

---

## 一、测试范围

| 用例编号 | 测试重点 | 验证方式 | PRD 依据 |
|---------|---------|---------|---------|
| TC-CFG-01 | 读取配置详情：候选/生效/试转换/待确认问题字段直透 | API | §7 验收#2、#3、#4 |
| TC-CFG-02 | 试转换 FAILED 禁止启用：42201 且生效指针不变 | API | §7 验收#8 |
| TC-CFG-03 | 试转换 NEEDS_INFORMATION / 尚无终态记录禁止启用：42201 | API | §7 验收#8 |
| TC-CFG-04 | 修订候选保存：202 受理、生成新 HUMAN 候选、旧候选与旧试转换保留、同事务安排试转换 | API | §7 验收#9 |
| TC-CFG-05 | 修改含义后旧试转换失效：用旧 trialId 启用被拒 42201 | API | §7 验收#9 |
| TC-CFG-06 | 首次启用成功：expectedActiveVersionId=null、200 APPLIED、指针切换与事项完成同事务、同键重试回原结果 | API | §7 验收#10 |
| TC-CFG-07 | 启用后同类新资料按已启用版本持续转换、不产生新人工配置事项 | 联调验证 | §7 验收#11 |
| TC-CFG-08 | 启用时配置版本已变化：40901、不切换生效指针 | API | §7 验收#13 |
| TC-CFG-09 | 无权限启用被拒：40301、配置状态不变 | API | §7 验收#12 |
| TC-CFG-11 | 接入事项列表渲染：2 条配置事项、无工单编号位 | UI | §7 验收#1 |
| TC-CFG-12 | 配置草稿区块展示：规则明细/字段对照/适用范围/来源格式 | UI | §7 验收#2 |
| TC-CFG-13 | 待确认问题展示：非空逐条展示 / 空数组展示"无待确认问题" | UI | §7 验收#3 |
| TC-CFG-14 | 无生效配置展示"当前无生效配置" | UI | §7 验收#4 |
| TC-CFG-15 | 试转换执行中展示，无通过标记、启用禁用 | UI | §7 验收#5 |
| TC-CFG-16 | 试转换 FAILED 展示具体失败问题、启用禁用 | UI | §7 验收#6 |
| TC-CFG-17 | 试转换结果刷新保留：同一份已保存结果、不产生新执行 | UI | §7 验收#7 |
| TC-CFG-18 | 新资料缺字段/未知值：形成待确认问题进入配置调整事项 | 联调验证 | §7 验收#14 |
| TC-CFG-19 | 格式变更重新处理：停止旧规则自动转换、形成/更新配置调整事项 | 联调验证 | §3.6（§7 未单列） |

## 二、前置条件（全部用例共用）

1. **种子数据**：先执行 [sql/TC-CFG-SEED.sql](sql/TC-CFG-SEED.sql)，初始化服务商 `sp-01`、已启用配置 `cfg-01`（生效版 `cfgv-01-1`、当前候选 `cfgv-01-2`、PASSED 试转换 `ct-01-2`）及配置事项 `wi-cfg-01`。SEED 使用 `INSERT OR REPLACE`；但配置域与证据域历史表受候选 DDL 触发器保护（禁止 DELETE/UPDATE/替换写入），SEED 与各用例 SQL 只能在**全新库**上执行一次——每条用例执行后按"删除本地库文件 → 重载各域 DDL → 重跑 SEED"恢复基线。全部 SQL 已在 SQLite 候选 DDL 上逐一实测通过（2026-09-20）。
2. **环境**：服务端 `http://localhost:8787`、前端 `http://localhost:5173`（以 09-deploy 实际启动端口为准）；本地 SQLite/D1 已加载各域候选 DDL。
3. **身份与权限**：权限不由 SQL 构造。对接责任人身份与无权限身份由开发登录的身份模拟配置发放凭据（common-contract.md §1）；TC-CFG-09 使用无 `ENABLE_INTEGRATION_CONFIG` 权限的身份凭据。
4. **写请求公共约束**：所有 PUT/POST 必须带非空 Header `Idempotency-Key`；正文只含契约已声明字段（common-contract.md §2）。
5. **执行顺序**：每条用例执行自己的 `sql/TC-CFG-NN.sql`「数据准备」段，验证后执行同文件「数据清理」段；依赖 SEED 的用例在执行前确认 SEED 已加载。

## 三、字段分层（SQL 构造边界）

- **输入源字段（允许 SQL 写入）**：上述六张表及 `work_item`、`analysis_input_snapshot`、`analysis_input_item`、`analysis_result`、`human_decision` 的全部存储字段——本域读接口对这些表直透，无服务端实时计算字段。
- **禁写边界**：被测写动作（PUT 草稿、POST 启用）的**产物行**（新候选版本、新试转换、enablement、activation_result、指针切换结果）不得由 SQL 预置后充当断言依据；必须由接口调用真实产生，断言后由清理段删除。历史启用事实（SEED 中 `car-01-1` 链）是已固定的过去事实，不是被测动作产物。

## 四、验收矩阵

| PRD 依据 | 验收场景 | API 用例 | UI 用例 | 覆盖状态 |
|---------|---------|---------|---------|---------|
| §7 验收#1 | 接入事项列表渲染（2 条、无工单编号位） | — | TC-CFG-11 | ✅ |
| §7 验收#2 | 配置草稿展示与 candidateVersion 一致 | TC-CFG-01 | TC-CFG-12 | ✅ |
| §7 验收#3 | 待确认问题逐条展示 / 空数组"无待确认问题" | TC-CFG-01（空数组侧） | TC-CFG-13 | ✅ |
| §7 验收#4 | activeVersion 为 null 展示"当前无生效配置" | — | TC-CFG-14 | ✅ |
| §7 验收#5 | 试转换执行中：无通过标记、启用禁用 | TC-CFG-03（无终态侧） | TC-CFG-15 | ✅ |
| §7 验收#6 | FAILED 展示具体失败问题、启用禁用 | TC-CFG-02 | TC-CFG-16 | ✅ |
| §7 验收#7 | PASSED 刷新保留、不产生新执行 | — | TC-CFG-17 | ✅ |
| §7 验收#8 | 无 PASSED 试转换禁止启用：42201、旧配置保持 | TC-CFG-02、03 | TC-CFG-15、16（禁用侧） | ✅ |
| §7 验收#9 | 修改含义后旧试转换失效、后台自动新试转换、新 PASSED 前不可启用 | TC-CFG-04、05 | — | ✅ |
| §7 验收#10 | 启用成功：200 APPLIED、指针切换、事项完成同事务 | TC-CFG-06 | — | ✅ |
| §7 验收#11 | 启用后新资料走已启用版本、不产生新人工配置事项 | TC-CFG-07 | — | ✅（联调验证） |
| §7 验收#12 | 无权限启用被拒：40301、配置状态不变 | TC-CFG-09 | — | ✅ |
| §7 验收#13 | 启用时版本已变化：40901、不切换指针 | TC-CFG-08 | — | ✅ |
| §7 验收#14 | 缺字段/未知值：形成待确认问题进入配置调整事项 | TC-CFG-18 | — | ✅（联调验证） |
| §3.6 格式变更行 | 格式变更停止旧规则自动转换、形成/更新调整事项 | TC-CFG-19 | — | ✅（联调验证；§7 未单列，依据 §3.6 行为条款） |

## 五、[待确认] 清单

| # | 条目 | 位置 | 说明 |
|---|------|------|------|
| 1 | 资料侧"记录本次实际所用版本"的对外查询口径 | TC-CFG-07 | PRD 验收#11 要求记录实际所用版本；配置域可读证据为 `analysis_input_snapshot.config_versions_json`（integration-config-schema.md §4），资料域是否提供 API 断言字段需产品明确 |
| 2 | 验收#14 中"保留原数据、不补默认值、未知值不转零"的资料侧断言归属 | TC-CFG-18 | 该断言发生在资料/核查域数据上，本域用例只覆盖"形成待确认问题进入配置调整事项"；资料侧断言是否并入本用例需产品明确 |
| 3 | PUT 草稿在无 `editNotes` 或 `editNotes=[]` 时的错误码 | 未生成用例 | common-contract.md §4 仅给 40001/40002 通用口径，PRD §3.3 只写"editNotes 非空"，具体码位需产品明确后再补用例 |

## 六、版本历史

| 版本 | 日期 | 变更说明 |
|------|------|---------|
| v1.0.0 | 2026-09-20 | 初版：18 条用例（API 01—09、UI 11—19）覆盖 03-subprd-provider-config.md §7 全部 14 条验收点 + §3.6 格式变更行为 |
