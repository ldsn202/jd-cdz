<!-- @meta docId="tc-recon" status="active" baseline="v1.0.0" -->
# 业务对账 测试用例（索引层）

> **基线版本**: v1.0.0 | **最后更新**: 2026-09-20
> **编号前缀**: TC-REC-
> **基准 PRD**: [06-subprd-reconciliation.md](../../05-prd/06-subprd-reconciliation.md) §3、§5、§7
> **数据链路**: `work_item.current_reconciliation_id` → `reconciliation_record` / `billing_document` / `fee_basis_record` / `reconciliation_analysis_link` / `fee_verification_action` / `human_decision` / `analysis_input_snapshot` / `analysis_input_item`
> **预期来源**: 06-subprd-reconciliation.md §7 验收标准（唯一 oracle）
> **设计方法**: 等价类 + 边界值、决策表（视图状态映射）、状态迁移（问题组开闭）、场景法（核实往来/应收修订）
> **用例详情**: [tc-recon-用例详情.md](tc-recon-用例详情.md)
>
> 上游（我引用）：[06-subprd-reconciliation.md](../../05-prd/06-subprd-reconciliation.md) §7、[reconciliation-schema.md](../../03-foundation/03-05-schema/reconciliation-schema.md) §1—7、[reconciliation-apis.md](../../03-foundation/03-06-provided-apis/reconciliation-apis.md) §1—4、[common-contract.md](../../03-foundation/03-06-provided-apis/common-contract.md) §1—5
> 下游（引用我）：[../tc-main-jd-charging.md](../tc-main-jd-charging.md) 域登记（主索引尚未建立，建立时登记本域）

---

## 一、测试范围

| 用例编号 | 测试重点 | 验证方式 | PRD 依据（§7 验收#） |
|---------|---------|---------|---------------------|
| TC-REC-01 | 读取对账结果-有差异：契约字段、十进制字符串、差额方向服务商减京东 | API | #7 |
| TC-REC-02 | 应收修订产生新版本且不改对方账单（含旧指针失效 PREPARING/null） | API | #10、#7 |
| TC-REC-03 | 读取-核对一致 RECONCILED（八项检查全 true、规范零差额、不产生结算/付款/批准记录） | API | #12 |
| TC-REC-04 | 读取-总额相同但分项有差异仍 DIFFERENT（总额相同不掩盖分项差异） | API | #12、#6 |
| TC-REC-05 | 发起核实问题成功：返回 questionActionId、交接应收负责人 | API | #8 |
| TC-REC-06 | 服务商回复成功：保存在原问题组下、isClosed 不变、交回京东对账责任 | API | #9 |
| TC-REC-07 | 核实事实登记：FACT 保存并按依据关闭问题组；拒绝 reconciled=true | API | #11 |
| TC-REC-08 | 跨服务商越权被拒：不返回资源细节、写入不产生状态变化 | API | #13 |
| TC-REC-09 | 幂等与版本保护：同键同内容返回原结果、同键不同内容 40902、旧 reconciliationId 40901 | API | #14、#8 |
| TC-REC-11 | 分组对照渲染：双方原分项原样展示、同名行不合并 | UI | #1 |
| TC-REC-12 | 缺项如实呈现：null 占位不填零、不写成"未批准" | UI | #2 |
| TC-REC-13 | 单边项目保留：仅服务商一侧分项单独呈现、不强行配对 | UI | #3 |
| TC-REC-14 | Skill 解释与程序金额分离：AI 失败保留程序差额与真实进度、旧解释不冒充新版 | UI | #4 |
| TC-REC-15 | 核实往来留痕：一次提问两次回复一次事实按时间展示、保留各自比较版本 | UI | #5 |
| TC-REC-16 | 核对一致口径提示：总额相同但有未决争议仍显示有差异、无结算/付款入口 | UI | #6 |
| TC-REC-17 | 服务商原应收视图：本方应收分项与版本、待回复问题、无改账入口 | UI | §3.5（R5） |
| TC-REC-18 | 应收修订后打开旧问题：提示已有新比较、保留草稿、问题不改挂新版 | UI | #10、§3.5 |
| TC-REC-19 | 列表摘要：一次列表请求、摘要与详情一致、PREPARING/null、无权限不泄露 | UI | §7 补充验收 |

## 二、前置条件（全部用例共用）

1. 本地隔离测试库已按顺序加载 `work-item-schema.sql` → `evidence-schema.sql` → `installation-schema.sql` → `reconciliation-schema.sql`（候选 DDL，含历史保护触发器）。
2. 执行 [sql/TC-REC-SEED.sql](sql/TC-REC-SEED.sql) 初始化服务商、工单、对账事项（wi-rec-01 城南/wi-rec-02 远程）、双方账单身份、条款与批准记录身份。
3. 服务端 `http://localhost:8787`（以 09-deploy 实际配置为准）；身份凭据由开发登录身份模拟配置发放：京东对账员 `id-jd-recon-01`、城南应收负责人 `id-pv-recon-01`。
4. 历史保护表不可 DELETE/UPDATE/REPLACE：清理段仅还原 `work_item.current_reconciliation_id` 指针；场景数据以 rec- 命名空间隔离，彻底还原重建测试库。

## 三、验收矩阵

| PRD 依据 | 验收场景 | API 用例 | UI 用例 | 覆盖状态 |
|---------|---------|---------|---------|---------|
| §7#1 | 分组对照渲染，同名行不合并 | TC-REC-01 | TC-REC-11 | ✅ |
| §7#2 | 缺项如实呈现，null 不填零、不写"未批准" | TC-REC-02（PREPARING/null 接口面） | TC-REC-12 | ✅ |
| §7#3 | 单边项目保留，不强行配对 | — | TC-REC-13 | ✅ |
| §7#4 | Skill 解释与程序金额分离，旧解释不冒充新版 | — | TC-REC-14 | ✅ |
| §7#5 | 核实往来留痕，保留人员与各自比较版本 | TC-REC-06 | TC-REC-15 | ✅ |
| §7#6 | 总额相同但有未决争议不显示核对一致、无结算/付款入口 | TC-REC-04 | TC-REC-16 | ✅ |
| §7#7 | 读取对账结果：契约字段、十进制字符串；无可靠计算为 null | TC-REC-01、TC-REC-02 | TC-REC-19 | ✅ |
| §7#8 | 发起核实问题：200+questionActionId、交接；旧 reconciliationId 40901 | TC-REC-05、TC-REC-09 | — | ✅ |
| §7#9 | 服务商回复：保存在原问题组、isClosed 不变、交回京东责任 | TC-REC-06 | TC-REC-15 | ✅ |
| §7#10 | 应收修订产生新版本且不改对方账单；回复"已修改"不产生新版本 | TC-REC-02 | TC-REC-17、TC-REC-18 | ✅ |
| §7#11 | 事实登记：FACT 保存并按依据关闭问题组；拒绝 reconciled=true | TC-REC-07 | — | ✅（拒绝路径精确错误码 [待确认]） |
| §7#12 | 核对一致判定：全一致+八项检查→RECONCILED；总额相同不掩盖分项差异；不生成结算/付款/批准记录 | TC-REC-03、TC-REC-04 | TC-REC-16 | ✅ |
| §7#13 | 跨服务商越权被拒（PRD 原文允许 40301 或 40404） | TC-REC-08 | — | ✅ |
| §7#14 | 幂等与版本保护：同键同内容原结果、同键不同内容 40902、40901 保留输入 | TC-REC-09 | — | ✅ |
| §7 补充验收 | 列表摘要：单次请求、摘要与详情一致、PREPARING/null、FORBIDDEN 不泄露 | — | TC-REC-19 | ✅ |

## 四、[待确认] 清单

| # | 位置 | 内容 |
|---|------|------|
| 1 | TC-REC-07 步骤 B | 请求体携带 `reconciled=true` 被拒时 HTTP 400 的具体 code（40001 字段缺失/非法 还是 40002 枚举非法），PRD 与 common-contract §4 未精确到该字段 → [待确认-需产品明确]；当前用例只断言 HTTP 400 + data=null + 无 FACT 落库 |

## 五、版本历史

| 版本 | 日期 | 变更说明 |
|------|------|---------|
| v1.0.0 | 2026-09-20 | 初版：18 条用例（API 9 + UI 9）覆盖 §7 全部 14 条验收 + 补充验收；SQL 经本地 sqlite3 候选 DDL 全量加载验证通过 |
