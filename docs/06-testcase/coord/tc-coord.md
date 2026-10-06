<!-- @meta docId="tc-coord" status="active" baseline="v1.0.1" -->
# 履约协同与异常 测试用例（索引层）

> **基线版本**: v1.0.1 | **最后更新**: 2026-09-20
> **编号前缀**: TC-COO-
> **基准 PRD**: [07-subprd-coordination.md §7](../../05-prd/07-subprd-coordination.md)
> **用例详情**: [tc-coord-用例详情.md](tc-coord-用例详情.md)
> **设计方法**: 场景法、决策表（停止决定/越权拒绝矩阵）、状态迁移（EXCEPTION/COMPLETED）、错误推测（幂等/版本竞争）
> 上游（我引用）：[07-subprd-coordination.md](../../05-prd/07-subprd-coordination.md) §3、§5、§7、[work-item-schema.md](../../03-foundation/03-05-schema/work-item-schema.md) §3—7 `work_item` / `work_item_link` / `human_decision` / `activity_record`、[coordination-apis.md](../../03-foundation/03-06-provided-apis/coordination-apis.md) §1—4、[workbench-apis.md](../../03-foundation/03-06-provided-apis/workbench-apis.md) §3—4、[common-contract.md](../../03-foundation/03-06-provided-apis/common-contract.md) §2—4、[identity-schema.md](../../03-foundation/03-05-schema/identity-schema.md) §2、[execution-schema.md](../../03-foundation/03-05-schema/execution-schema.md) §2 `external_write_operation`
> 下游（引用我）：[../tc-main-jd-charging.md](../tc-main-jd-charging.md) 域登记（主索引待生成后登记）

---

## 一、测试范围

| 用例编号 | 测试重点 | 验证方式 | PRD 依据（§7 验收#） |
|---------|---------|---------|---------------------|
| TC-COO-01 | 协同详情数据：analysis=null、blockedReasons、relatedItems 直透 | API | 验收#1 |
| TC-COO-02 | 进展连续保存 3 次留痕，事项不完成 | API | 验收#2 |
| TC-COO-03 | 进展保存幂等：同键同内容原结果、同键不同内容 40902 | API | 验收#9 |
| TC-COO-04 | 过期 expectedWorkItemVersion 提交被拒 40901 | API | 验收#10 |
| TC-COO-05 | 完成协同：COORDINATION_RESOLVED、可追溯、不改写核查/对账事项 | API | 验收#3、#11、#14 |
| TC-COO-06 | 异常登记：转 EXCEPTION、原问题与依据保留 | API | 验收#4 |
| TC-COO-07 | 异常处理完成需接续：followupWorkItemIds 与 EXCEPTION_CONTINUATION 落库 | API | 验收#5、#11、#12 |
| TC-COO-08 | 异常处理完成无后续：不生成虚假接续、核实依据保留 | API | 验收#6 |
| TC-COO-09 | 停止决定：成功可追溯 / 缺依据 42201 / 未决写入 40903 / 越权 40301 / 不可见 40404 | API | 验收#7、#8、#11、#13 |
| TC-COO-11 | 协同详情渲染：无分析空态文案、相关事项、工单入口 | UI | 验收#1 |
| TC-COO-12 | 保存进展交互：空描述前端阻止、保存后时间线追加、不显示完成 | UI | 验收#2 |
| TC-COO-13 | 完成协同展示：完成原因为本次履约阻碍处理完成，不显示安装业务结束 | UI | 验收#3 |
| TC-COO-14 | 异常登记交互：提交后转异常视图、原问题与依据可见 | UI | 验收#4 |
| TC-COO-15 | 接续入口：「继续办理原业务」链接与 #task/ 路由、「回看异常结果」 | UI | 验收#5 |
| TC-COO-16 | 无后续展示：无继续办理链接、核实依据展示、不判断业务结束 | UI | 验收#6 |
| TC-COO-17 | 停止展示：BUSINESS_STOPPED 可追溯，不显示为阻碍已解决 | UI | 验收#7 |
| TC-COO-18 | 错误兜底：40901 保留输入、40301 提示不伪装成功、40404 深链不泄露 | UI | 验收#8、#10 |

## 二、前置条件（全部用例共用）

1. **种子数据**：先执行 [sql/TC-COO-SEED.sql](sql/TC-COO-SEED.sql)（服务商/工单/身份/授权，INSERT OR REPLACE 可重复执行）。
2. **测试库约定**：按 work-item-schema.sql 等候选 DDL 建表，但**不含历史保护触发器**（`tr_*_no_delete`、`guard_*_no_replace`、immutable 触发器）——这些触发器会阻断 SEED 的 INSERT OR REPLACE 与清理段的 DELETE；触发器行为本身不属于本域 PRD 验收范围。
3. **服务端**：开发模式启动，BASE_URL 以 `docs/09-deploy` 为准，本文步骤写作 `http://localhost:8787`；身份由服务端身份模拟配置按 SEED 中 identity_reference 发放开发凭据。
4. **身份映射**：张协同 `id-coord-zhang`（履约协同，含 COMPLETE_FULFILLMENT_COORDINATION + RECORD_EXCEPTION_RESULT）；李核查 `id-review-li`（核查 + RECORD_EXCEPTION_RESULT）；王对账 `id-recon-wang`；赵无权 `id-noperm-zhao`（仅 READ_WORK_ITEM，用于 40301）。
5. **写请求**统一带 Header `Idempotency-Key` 与 `Content-Type: application/json`。

## 三、字段分层（计算字段禁写门）

**SQL 可写（输入源字段）**：`service_provider` / `installation_work_order` 全部字段；`work_item` 的 status、assignee_identity_id、row_version、responsibility_version、analysis_generation、title、blocked_reason、pending_write_id、current_analysis_result_id；`human_decision`（历史决定事实）；`activity_record`（历史事件）；`work_item_link`（历史关联）；`external_write_operation`（未决写入状态）；identity 三表。

**SQL 禁写（被测动作的服务端输出）**：被测事项的 `work_item.completion_code` / `completion_basis_json` / `completion_decision_id` / `completed_at`；被测动作产生的 `human_decision`（OPEN_EXCEPTION / CLOSE_EXCEPTION / COMPLETE_COORDINATION / STOP_WORK）、`activity_record`（PROGRESS_SAVED / DECISION_CONFIRMED / FOLLOWUP_LINKED）、`work_item_link`（EXCEPTION_CONTINUATION 新关联）；响应中的 `followupWorkItemIds`。

**例外说明**：TC-COO-01/11 中 `wi-pre-done-01/11` 的完成字段、TC-COO-07/08/15/16 中 `hd-open-*` 的 OPEN_EXCEPTION 决定，均为与被测动作无关的**历史前置事实**，属于合法输入，不违反禁写门。

## 四、验收矩阵

| PRD 依据 | 验收场景 | API 用例 | UI 用例 | 覆盖状态 |
|---------|---------|---------|---------|---------|
| §7 验收#1 | 协同详情渲染，analysis=null 不补造内容 | TC-COO-01 | TC-COO-11 | ✅ |
| §7 验收#2 | 进展多次保存留痕，事项不显示完成 | TC-COO-02 | TC-COO-12 | ✅ |
| §7 验收#3 | 完成协同，完成原因保留、不显示安装业务结束 | TC-COO-05 | TC-COO-13 | ✅ |
| §7 验收#4 | 异常登记，转 EXCEPTION 且原问题与依据保留 | TC-COO-06 | TC-COO-14 | ✅ |
| §7 验收#5 | 异常关闭后「继续办理原业务」与「回看异常结果」 | TC-COO-07 | TC-COO-15 | ✅ |
| §7 验收#6 | 无后续工作不生成虚假接续、展示核实依据 | TC-COO-08 | TC-COO-16 | ⚠️ "无须继续"核实条件 `[待确认-需产品明确]` |
| §7 验收#7 | 停止决定展示，原因与依据可追溯 | TC-COO-09 | TC-COO-17 | ✅ |
| §7 验收#8 | 越权 40301、不可见 40404 | TC-COO-09 | TC-COO-18 | ✅ |
| §7 验收#9 | 进展保存幂等，同键不同内容 40902 | TC-COO-03 | — | ✅ |
| §7 验收#10 | 版本竞争 40901，保留输入重读确认 | TC-COO-04 | TC-COO-18 | ✅ |
| §7 验收#11 | 完成原因可追溯（协同完成/异常关闭/停止） | TC-COO-05、07、09 | TC-COO-13、15、17 | ✅ |
| §7 验收#12 | 异常关闭接续落库、同事务、失败回滚 | TC-COO-07 | — | ⚠️ 回滚路径需故障注入 `[待确认-需开发提供注入手段]` |
| §7 验收#13 | 停止决定权限与后果（42201/40903/成功可追溯） | TC-COO-09 | TC-COO-18 | ✅ |
| §7 验收#14 | 协同不代审核，核查/对账事项保持原状态 | TC-COO-05 | — | ✅ |

## 五、[待确认] 汇总

1. `[待确认-需产品明确]` "原业务无须继续"的服务端核实条件与数据构造方式（影响 TC-COO-08/16 前提）。
2. `[待确认-需产品明确]` `completion.basis`（completion_basis_json）的具体字段结构未在 PRD/接口契约定义，用例只断言非空对象与可追溯关联。
3. `[待确认-需产品明确]` EXCEPTION / BUSINESS_STOPPED 等状态与完成码的前端展示文案未在 PRD 给出字面值，UI 用例按语义判定（不出现"阻碍已解决""安装业务结束"类文案）。
4. `[待确认-需开发提供注入手段]` 验收#12"关联写入失败则整批回滚"需服务端故障注入能力方可执行。

## 六、版本历史

| 版本 | 日期 | 变更说明 |
|------|------|---------|
| v1.0.1 | 2026-09-20 | T3.5 执行回写：异常关闭 `followupRequired` 字段裁决落定，TC-COO-08 预期同步 |
| v1.0.0 | 2026-09-20 | 初版：17 条用例（API 9 条 + UI 8 条）覆盖 §7 全部 14 条验收标准 |
