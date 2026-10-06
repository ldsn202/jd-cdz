<!-- @meta docId="tc-orders" status="active" baseline="v1.0.0" -->
# 工单查询与处理追溯 — 测试用例（索引层）

> 上游（我引用）：[02-subprd-orders-history.md](../../05-prd/02-subprd-orders-history.md) §3、§5、§7、[workbench-apis.md](../../03-foundation/03-06-provided-apis/workbench-apis.md) §2—6、[material-apis.md](../../03-foundation/03-06-provided-apis/material-apis.md) §1、[common-contract.md](../../03-foundation/03-06-provided-apis/common-contract.md) §2—4、[work-item-schema.md](../../03-foundation/03-05-schema/work-item-schema.md) §2—7、[evidence-schema.md](../../03-foundation/03-05-schema/evidence-schema.md) §2—5、[installation-schema.md](../../03-foundation/03-05-schema/installation-schema.md) §3、[identity-schema.md](../../03-foundation/03-05-schema/identity-schema.md) §2、[execution-schema.md](../../03-foundation/03-05-schema/execution-schema.md) §2
> 下游（引用我）：[tc-main-jd-charging.md](../tc-main-jd-charging.md) 域登记（主索引由协调者随后创建后登记）

> **基线版本**: v1.0.0 | **最后更新**: 2026-09-20
> **编号前缀**: TC-ORD-
> **基准 PRD**: [02-subprd-orders-history.md](../../05-prd/02-subprd-orders-history.md) §7 验收标准
> **用例详情**: [tc-orders-用例详情.md](tc-orders-用例详情.md)
> **数据链路**: installation_work_order / service_provider / installation_context_snapshot / work_item / activity_record / human_decision / external_write_operation / source_material / source_material_version / material_parsing / analysis_input_snapshot / analysis_input_item / analysis_result（全部只读视图，无业务写入）
> **预期来源**: PRD §7 验收标准（唯一权威）；Schema / API 契约仅辅助字段名、类型与状态码
> **设计方法**: 等价类+边界值（分页/空态/空数组）、决策表（权益读取五态、权限拒绝）、场景法（版本切换、原文定位、异常重试）

---

## 一、测试范围

| 用例编号 | 测试重点 | 验证方式 | PRD 依据 | SQL |
|---------|---------|---------|---------|-----|
| TC-ORD-01 | 工单列表返回（字段、统计、无事项工单仍在列表） | API | §7 验收#1、补充#1 | [01](sql/TC-ORD-01.sql) |
| TC-ORD-02 | 越权访问被拒（他商工单 404、他商事项 404、无材料权限 /content） | API | §7 验收#2、#13 | [02](sql/TC-ORD-02.sql) |
| TC-ORD-03 | 工单详情聚合（context/材料索引/itemSummary、VISIBLE 事项、配置事项不出现） | API | §7 验收#3、补充#2、#4 | [03](sql/TC-ORD-03.sql) |
| TC-ORD-04 | 权益读取三态（UNAVAILABLE / FORBIDDEN / STALE，不填 0 权益） | API | §7 补充#3 | [04](sql/TC-ORD-04.sql) |
| TC-ORD-05 | 处理记录分页（倒序稳定、event_key 去重、字段直透） | API | §7 验收#4、#11 | [05](sql/TC-ORD-05.sql) |
| TC-ORD-06 | 处理记录 actor/occurredAt 为 null 直透 | API | §7 验收#5 | [06](sql/TC-ORD-06.sql) |
| TC-ORD-07 | 外部操作结果块（status 与 localContinuationStatus 分开返回） | API | §7 验收#12 | [07](sql/TC-ORD-07.sql) |
| TC-ORD-08 | 材料 REFERENCED（未知字段 null、/content 42201） | API | §7 验收#6 | [08](sql/TC-ORD-08.sql) |
| TC-ORD-09 | 空文件 blocks=[] 与解析不全 INCOMPLETE 的元数据区分 | API | §7 验收#7、#10 | [09](sql/TC-ORD-09.sql) |
| TC-ORD-11 | 工单列表渲染与空态文案 | UI | §7 验收#1 | [11](sql/TC-ORD-11.sql) |
| TC-ORD-12 | 服务商身份列表隔离与越权深链接提示 | UI | §7 验收#2 | [12](sql/TC-ORD-12.sql) |
| TC-ORD-13 | 工单详情四个信息区渲染 | UI | §7 验收#3 | [13](sql/TC-ORD-13.sql) |
| TC-ORD-14 | 处理记录时间线展示（含执行人未知/来源时间未知兜底） | UI | §7 验收#4、#5 | [14](sql/TC-ORD-14.sql) |
| TC-ORD-15 | 解析不全如实展示（issues 缺项、不显示"资料齐全"） | UI | §7 验收#10 | [15](sql/TC-ORD-15.sql) |
| TC-ORD-16 | 证据侧栏"原文未取得"与"文件内容为空"严格区分 | UI | §7 验收#6、#7 | [16](sql/TC-ORD-16.sql) |
| TC-ORD-17 | 证据侧栏材料版本切换（元数据/解析/原文换版本、权限逐次核实） | UI | §7 验收#8 | [17](sql/TC-ORD-17.sql) |
| TC-ORD-18 | 解析原文定位（evidenceRefs blockId → 内容块及 PDF 页位置） | UI | §7 验收#9 | [18](sql/TC-ORD-18.sql) |
| TC-ORD-19 | 接口超时/5xx 错误提示与重试（不伪装空列表） | UI | §7 验收#14 | [19](sql/TC-ORD-19.sql) |

## 二、前置条件（全部用例共用）

1. 本地隔离测试库按顺序加载候选 DDL：`identity-schema.sql` → `work-item-schema.sql` → `evidence-schema.sql` → `installation-schema.sql` → `execution-schema.sql`（含历史保护触发器）。
2. 执行 [sql/TC-ORD-SEED.sql](sql/TC-ORD-SEED.sql) 初始化服务商（服务商甲/乙）、身份、三个工单（wo-ord-01 主测 / wo-ord-02 无事项 / wo-ord-03 服务商乙）、上下文快照、五个事项、材料四份（双版本/REFERENCED/空白/解析不全）、分析快照链与外部写入操作。
3. **历史保护触发器约定**：候选 DDL 对历史表装有 no_replace / no_delete 触发器，INSERT OR REPLACE 与 DELETE 会被 ABORT。全部 SQL 改用 `INSERT ... WHERE NOT EXISTS` 幂等插入；清理段不做行级 DELETE，测试数据统一 ord- 命名空间隔离，彻底还原通过**重建隔离测试库**完成。
4. 服务端 `http://localhost:8787`（以 09-deploy 实际配置为准）；身份凭据由开发登录身份模拟配置发放：京东核查张明（授权服务商甲范围，含 READ_WORK_ORDER/READ_WORK_ITEM/READ_SOURCE_MATERIAL）、服务商甲资料李工、服务商乙人员（越权对照）、无材料权限身份、授权范围内无工单身份（空态用）。
5. 测试文件存储存有 smv-ord-001-v1 / smv-ord-001-v2 对应字节（与 SEED content_sha256 一致），供 TC-ORD-17 及原文区核对。
6. 权益适配接口为外部 mock：TC-ORD-04 的 STALE 由本文件 SQL 构造工单侧条件，FORBIDDEN 由身份模拟配置、UNAVAILABLE 由 mock 故障注入驱动；TC-ORD-19 的 5xx/超时由环境故障注入驱动，均非 SQL 构造。
7. 外部写入操作落终态须按候选 DDL 状态机执行（INSERT 只能 REGISTERED，再 UPDATE 至终态），SEED 已按此写入 op-ord-01。

## 三、验收矩阵

### PRD §7 验收标准 14 条

| PRD 依据 | 验收场景 | API 用例 | UI 用例 | 覆盖状态 |
|---------|---------|---------|---------|---------|
| §7 验收#1 | 工单列表渲染：编号/服务商/当前阶段/进行中事项数正确，分页可用 | TC-ORD-01 | TC-ORD-11 | ✅ |
| §7 验收#2 | 列表权限隔离：仅本商工单；他商编号深链接 404 | TC-ORD-02 | TC-ORD-12 | ✅ |
| §7 验收#3 | 工单详情四个信息区齐全；各阶段事项在列，配置事项不出现 | TC-ORD-03 | TC-ORD-13 | ✅ |
| §7 验收#4 | 处理记录按创建时间和 id 倒序展示动作/执行人/说明/时间 | TC-ORD-05 | TC-ORD-14 | ✅ |
| §7 验收#5 | actor/occurredAt 为 null 显示"执行人未知""来源时间未知"，按本地保存时间排序 | TC-ORD-06 | TC-ORD-14 | ✅ |
| §7 验收#6 | readState=REFERENCED 显示"原文未取得"态与已有元数据，不显示空文件态 | TC-ORD-08 | TC-ORD-16 | ✅ |
| §7 验收#7 | VERIFIED 且 blocks=[] 显示"文件内容为空"，与读取失败明确区分 | TC-ORD-09 | TC-ORD-16 | ✅ |
| §7 验收#8 | 两个已保存版本切换后元数据/解析/原文均换为所选版本，权限逐次核实 | — | TC-ORD-17 | ✅（交互行为，UI 验证） |
| §7 验收#9 | 证据引用含 blockId，侧栏定位到对应内容块及 PDF 页位置 | — | TC-ORD-18 | ✅（交互行为，UI 验证；定位链数据由 SEED 验证） |
| §7 验收#10 | completeness=INCOMPLETE 列出 issues 缺项，不显示"资料齐全" | TC-ORD-09 | TC-ORD-15 | ✅ |
| §7 验收#11 | activities 分页倒序稳定、无重复事件（event_key 去重） | TC-ORD-05 | — | ✅ |
| §7 验收#12 | operations 返回真实 status 与 localContinuationStatus，两者分开显示 | TC-ORD-07 | — | ✅（localContinuationStatus 具体计算条件见待确认#1） |
| §7 验收#13 | 无 READ_SOURCE_MATERIAL 请求 /content 返回公共错误，无存储地址泄露 | TC-ORD-02 步骤3 | — | ✅（404/403 口径见待确认#2） |
| §7 验收#14 | work-items/activities 超时或 5xx：错误提示与重试，不伪装空列表 | — | TC-ORD-19 | ✅（故障注入为环境操作） |

### §7 补充验收：工单聚合 4 条

| 补充场景 | 用例 | 覆盖状态 |
|---------|------|---------|
| 有授权工单但没有事项：列表仍有该行，activeKinds=[]、activeItemCount=0，不标安装完成 | TC-ORD-01（wo-ord-02 行）、TC-ORD-11 | ✅ |
| 多阶段不同责任人可见事项：统计覆盖 VISIBLE 全范围，不因默认 MINE 丢事项，不计无权事项 | TC-ORD-03（itemSummary 与 VISIBLE 列表） | ✅ |
| 权益读取失败/无权/版本变更：分别 UNAVAILABLE/FORBIDDEN/STALE，不填 0 权益、不展示旧版 | TC-ORD-04 | ✅ |
| 无分析结果但工单有材料：按上下文材料索引展示有权项，不依赖 findings | TC-ORD-03（materialReferences 含未导入项 materialVersionId=null） | ✅ |

## 四、[待确认-需产品明确] 清单

| # | 问题 | 出处 | 影响用例 |
|---|------|------|---------|
| 1 | localContinuationStatus 的具体计算条件：workbench-apis §4 只写"由实际保存事实计算"，未给出各枚举值的成立规则，用例只能断言枚举合法性与字段分离，无法断言确定取值 | workbench-apis.md §4 | TC-ORD-07 |
| 2 | 无 READ_SOURCE_MATERIAL 请求 /content 的返回口径：PRD §7 验收#13 写"404/403"两种；按 common-contract §3"不可见编号与不存在统一 404"推定为 404/40404，若按 §4"可见但无操作权限 40301"则不同 | 02-subprd §7#13 vs common-contract §3、§4 | TC-ORD-02 步骤3 |

## 五、版本历史

| 版本 | 日期 | 变更说明 |
|------|------|---------|
| v1.0.0 | 2026-09-20 | 初版：18 条用例（API 9 + UI 9）覆盖 02-subprd-orders-history §7 全部 14 条验收标准及 4 条补充验收；全部 SQL 经内存 SQLite 加载真实候选 DDL 验证通过（含幂等重跑） |
