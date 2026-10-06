<!-- @meta docId="tc-review" status="active" baseline="v1.0.0" -->
# 安装核查与补充 — 测试用例（索引层）

> 上游（我引用）：[05-subprd-installation-review.md](../../05-prd/05-subprd-installation-review.md) §3、§5、§7、[installation-apis.md](../../03-foundation/03-06-provided-apis/installation-apis.md) §3—6、[material-apis.md](../../03-foundation/03-06-provided-apis/material-apis.md) §1、[workbench-apis.md](../../03-foundation/03-06-provided-apis/workbench-apis.md) §2—4、§7.1、[common-contract.md](../../03-foundation/03-06-provided-apis/common-contract.md) §2—5、[work-item-schema.md](../../03-foundation/03-05-schema/work-item-schema.md) §3、§5—6、[evidence-schema.md](../../03-foundation/03-05-schema/evidence-schema.md) §2、§8、[installation-schema.md](../../03-foundation/03-05-schema/installation-schema.md) §2
> 下游（引用我）：[tc-main-jd-charging.md](../tc-main-jd-charging.md) 域登记（待建立后登记）

> **基线版本**: v1.0.0 | **最后更新**: 2026-09-20
> **编号前缀**: TC-REV-
> **基准 PRD**: [05-subprd-installation-review.md](../../05-prd/05-subprd-installation-review.md) §7 验收标准
> **用例详情**: [tc-review-用例详情.md](tc-review-用例详情.md)
> **数据链路**: work_item / human_decision / supplemental_response / analysis_result / analysis_input_snapshot / analysis_input_item / material_parsing / source_material_version / installation_context_snapshot / external_write_operation（执行域只读投影）
> **预期来源**: PRD §7 验收标准（唯一权威）；Schema / API 契约仅辅助字段名、类型与状态码
> **设计方法**: 等价类+边界值、决策表（权限与版本条件）、状态迁移（退回-回复-恢复）、场景法（端到端接续链）

---

## 一、测试范围

| 用例编号 | 测试重点 | 验证方式 | PRD 依据 | SQL |
|---------|---------|---------|---------|-----|
| TC-REV-01 | 差异与证据呈现（当前代次分析、三分组证据、evidenceRefs） | API | §7 验收#1 | [01](sql/TC-REV-01.sql) |
| TC-REV-02 | 证据缺项如实呈现（NEEDS_INFORMATION、空 findings、2 条问题） | API | §7 验收#2 | [02](sql/TC-REV-02.sql) |
| TC-REV-03 | 费用依据核查（施工事实与费用批准疑点分离） | API | §7 验收#3 | [03](sql/TC-REV-03.sql) |
| TC-REV-04 | 审核通过受理链路（202、同事务保存、不声称已写入原系统） | API | §7 验收#6 | [04](sql/TC-REV-04.sql) |
| TC-REV-05 | 退回-回复接续全链（原事项、代次递增、只选成功回复、晚到旧结果不覆盖） | API | §7 验收#7、#8 | [05](sql/TC-REV-05.sql) |
| TC-REV-06 | 过期分析结果被拒（40901、不保存决定） | API | §7 验收#9 | [06](sql/TC-REV-06.sql) |
| TC-REV-07 | 无权限/非责任人/待分配三类决定被拒（40301 决策表） | API | §7 验收#11 | [07](sql/TC-REV-07.sql) |
| TC-REV-08 | 未决写入（40903）与幂等（同键重放、40902） | API | §7 验收#12 | [08](sql/TC-REV-08.sql) |
| TC-REV-09 | 证据原文版本校验（42201 / VERIFIED 字节 / 无权限 404） | API | §7 验收#13 | [09](sql/TC-REV-09.sql) |
| TC-REV-11 | 差异与证据区渲染（对照、分组、原文定位侧栏、SUPPORTED 不误标） | UI | §7 验收#1 | [11](sql/TC-REV-11.sql) |
| TC-REV-12 | 证据缺项如实展示（待核实、无预填结论） | UI | §7 验收#2 | [12](sql/TC-REV-12.sql) |
| TC-REV-13 | 费用依据核查渲染（疑点不消除、无批准按钮） | UI | §7 验收#3 | [13](sql/TC-REV-13.sql) |
| TC-REV-14 | 分析失败真实呈现（失败位置、已有资料、不开放审批） | UI | §7 验收#4 | [14](sql/TC-REV-14.sql) |
| TC-REV-15 | 失败恢复动作（原事项新分析、保留已有资料） | UI | §7 验收#5 | [15](sql/TC-REV-15.sql) |
| TC-REV-16 | 202 受理与决定进展呈现（五态区分、REVIEW_APPROVED 完成） | UI | §7 验收#6 | [16](sql/TC-REV-16.sql) |
| TC-REV-17 | 退回待回复与待分配呈现（绑定本轮退回、RESPONSIBILITY_UNRESOLVED 不放行） | UI | §7 验收#7 | [17](sql/TC-REV-17.sql) |
| TC-REV-18 | 新版材料到达代次保护（代次递增、旧结果失效、暂停旧决定） | UI | §7 验收#10 | [18](sql/TC-REV-18.sql) |

## 二、前置条件（全部用例共用）

**种子数据**：执行 [sql/TC-REV-SEED.sql](sql/TC-REV-SEED.sql) 初始化服务商、三个场景工单/事项、身份、材料与解析。

1. 服务端 `http://localhost:{port}` 与前端已启动；测试身份模拟可发放李核查（DECIDE_INSTALLATION_REVIEW+核查责任）、陈核查（有权限无责任）、王资料（SUBMIT_SUPPLEMENT+资料责任）、赵查看（仅查看）四类凭据。
2. 数据库为独立测试库：候选 DDL 的 no_replace / no_delete 触发器**不得启用**（SEED 的 INSERT OR REPLACE 与各用例清理 DELETE 与其冲突）；所有测试 ID 带 `rev` 前缀，与业务数据隔离。
3. 测试文件存储存有 smv-yanshou-v1 对应字节（与 SEED content_sha256 一致），供 TC-REV-09 及原文侧栏用例核对。
4. 源端结果（退回/回复成功或拒绝、新材料到达、失败恢复）应经外部 mock 接口真实驱动；无驱动入口时执行各 SQL 文件中的【mock 替代段】直接落终态，并在执行记录中注明替代方式。
5. 多步场景用例（TC-REV-05、08、15、16、18）的清理段含占位编号（如 `<退回decisionId>`），执行时以步骤实际返回值替换。

## 三、验收矩阵

### PRD §7 验收标准 13 条

| PRD 依据 | 验收场景 | API 用例 | UI 用例 | 覆盖状态 |
|---------|---------|---------|---------|---------|
| §7 验收#1 | 差异逐项对照、证据三分组、原文定位与版本、SUPPORTED 不显示为已通过 | TC-REV-01 | TC-REV-11 | ✅（版本展示数据来源见待确认#3） |
| §7 验收#2 | NEEDS_INFORMATION 缺项逐条列出、展示为待核实 | TC-REV-02 | TC-REV-12 | ✅ |
| §7 验收#3 | 费用差异仅施工验收签字：证据仅覆盖施工事实、批准疑点不消除 | TC-REV-03 | TC-REV-13 | ✅ |
| §7 验收#4 | 材料读取失败真实呈现：失败位置、已有资料、不降级、处理中不能审批 | — | TC-REV-14 | ✅（API 侧 analysisStatus=BLOCKED 由详情字段承载，并入 TC-REV-14 检查） |
| §7 验收#5 | 读取失败恢复后原事项展示新分析、保留已有资料、不要求重交 | — | TC-REV-15 | ✅ |
| §7 验收#6 | APPROVE 202 受理；源端成功后 REVIEW_APPROVED 完成；受理页不声称已写入 | TC-REV-04 | TC-REV-16 | ✅ |
| §7 验收#7 | 有效退回绑定 active_supplement_request_id；回复接续原事项不新建；一轮至多一份成功回复 | TC-REV-05 | TC-REV-17 | ✅（一轮一份成功回复由 uk_supplemental_response_success 部分唯一索引保证，SQL 层验证） |
| §7 验收#8 | 回复源端成功后代次增加、重新准备分析、接续原事项；前轮问题与回复保留 | TC-REV-05 | — | ✅ |
| §7 验收#9 | 非当前代次 analysisResultId 提交被拒（40901）、不保存决定 | TC-REV-06 | TC-REV-18 步骤3 | ✅ |
| §7 验收#10 | 新版材料到达使代次增加；旧结果失效或标旧依据；暂停基于旧内容的决定 | — | TC-REV-18 | ✅ |
| §7 验收#11 | 无 DECIDE 权限或非当前责任人提交被拒（403/40301）；待分配不放行同角色 | TC-REV-07 | TC-REV-17 步骤3 | ✅ |
| §7 验收#12 | 未决写入再提交返回 40903 及原操作入口；同键同内容重放返回原结果；同键不同内容 40902 | TC-REV-08 | — | ✅（40903 入口承载字段、重放状态码见待确认#1、#2） |
| §7 验收#13 | REFERENCED 版本 content 返回 42201；VERIFIED 按版本返回字节；每次核实权限 | TC-REV-09 | — | ✅ |

### §7 评审补充场景

| 补充场景 | 用例 | 覆盖状态 |
|---------|------|---------|
| 同事项由费用疑点进入解析失败再恢复：全程 kind=INSTALLATION_REVIEW、不新建事项 | TC-REV-14、TC-REV-15 | ✅ |
| 退回 202 受理、外部未知、本地接续失败均保持未决保护，不提前开放动作 | TC-REV-16（进展五态）、TC-REV-08（40903） | ✅ |
| 退回成功但资料责任人未知：WAITING_SUPPLEMENT、assignee=null、RESPONSIBILITY_UNRESOLVED | TC-REV-07 行c、TC-REV-17 步骤3 | ✅ |
| 回复仅文字无附件且源端成功：新快照含 replyText 与原问题记录，明细不被文字覆盖 | TC-REV-05 步骤3—4 | ✅ |
| 同轮存在拒绝尝试和成功回复：只选成功回复进新输入、保留拒绝历史、代次只增一次 | TC-REV-05 步骤3—4 | ✅ |
| 旧分析晚于回复新输入返回：旧结果留历史、不覆盖新代次当前指针 | TC-REV-05 步骤5 | ✅ |

## 四、[待确认-需产品明确] 清单

| # | 问题 | 出处 | 影响用例 |
|---|------|------|---------|
| 1 | 幂等重放（同 Idempotency-Key 同内容）的 HTTP 状态码：common-contract §2 只写"返回原结果"，未明确重放返回 202 还是 200 | common-contract.md §2 | TC-REV-08 步骤3 |
| 2 | 40903 响应中"原操作入口"的承载字段：公共错误壳 data=null，operationId 放在 msg 还是扩展字段未定义 | common-contract.md §4 | TC-REV-08 步骤1 |
| 3 | 证据来源材料版本的展示数据来源：PRD §3.1 要求"材料来源版本随证据一并展示"，但 workbench-apis §3 的 findings 结构未含版本字段（需经 evidenceRefs→material_parsing→source_material_version 链取得，或由详情接口额外返回） | 05-subprd §3.1 vs workbench-apis §3 | TC-REV-11 |
| 4 | 无 READ_SOURCE_MATERIAL 权限请求材料 content 的返回：按 common-contract §3"不可见编号与不存在统一 404"推定为 404/40404；若按 §4"可见但无操作权限 40301"口径则不同 | common-contract.md §3、§4 | TC-REV-09 步骤3 |
| 5 | analysis_input_item.record_type 的登记取值：INSTALLATION_PLAN / INSTALLATION_DETAIL 为测试占位，evidence-schema §4.1 要求取"既有契约登记值"，登记清单未在所读文档中展开 | evidence-schema.md §4.1 | 全部含 RECORD 输入项的 SQL |
| 6 | 服务商提交 supplements 时 DecisionInput.analysisResultId 的取值：installation-apis §4 未列该字段必填，按公共约定"其余按各域规则"推定为可 null | installation-apis.md §4、common-contract.md §2 | TC-REV-05 步骤3、TC-REV-07 行c |

## 五、版本历史

| 版本 | 日期 | 变更说明 |
|------|------|---------|
| v1.0.0 | 2026-09-20 | 初版：17 条用例（API 9 + UI 8）覆盖 05-subprd-installation-review §7 全部 13 条验收标准及 6 条评审补充场景 |
