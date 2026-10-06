<!-- @meta docId="tc-workbench" status="active" baseline="v1.0.0" -->
# 待处理事项与工作台总览 — 测试用例（索引层）

> 上游（我引用）：[01-subprd-workbench-items.md](../../05-prd/01-subprd-workbench-items.md) §7、[work-item-schema.md](../../03-foundation/03-05-schema/work-item-schema.md)、[workbench-apis.md](../../03-foundation/03-06-provided-apis/workbench-apis.md)、[common-contract.md](../../03-foundation/03-06-provided-apis/common-contract.md)、[identity-schema.md](../../03-foundation/03-05-schema/identity-schema.md) `identity_reference` 表
> 下游（引用我）：[tc-main-jd-charging.md](../tc-main-jd-charging.md) 域登记（主索引随后由协调者创建）

> **基线版本**: v1.0.0 | **最后更新**: 2026-09-20
> **编号前缀**: TC-WB-
> **基准 PRD**: [01-subprd-workbench-items.md](../../05-prd/01-subprd-workbench-items.md) §7（验收#1—#14）
> **用例详情**: [tc-workbench-用例详情.md](tc-workbench-用例详情.md)
> **数据链路**: 源表 `work_item`、`service_provider`、`installation_work_order`、`identity_reference`；`analysisStatus`、`providerName`、`total`、`asOf` 为服务端计算字段，SQL 禁写
> **预期来源**: PRD §7 验收标准 + workbench-apis §1—2 接口契约；不以代码行为为 oracle（服务未实现，面向目标态）
> **设计方法**: 等价类 + 边界值、决策表、场景法、错误推测

---

## 一、测试范围

| 用例编号 | 测试重点 | 验证方式 | PRD 验收# |
|---------|---------|---------|----------|
| TC-WB-01 | 列表正常返回：三种类型事项的字段完整性与排序 | API | #1 |
| TC-WB-02 | 默认 responsibility=MINE 与 VISIBLE 切换 | API | #2 |
| TC-WB-03 | summary 计数（total/byStatus/byKind/asOf）与列表一致性 | API | #3 |
| TC-WB-04 | 组合筛选 kind + status 同参生效 | API | #4 |
| TC-WB-05 | keyword 匹配标题/工单编号/服务商名且不越权 | API | #5 |
| TC-WB-06 | session 契约：身份字段非空、不含凭据 | API | #9 |
| TC-WB-07 | providers 仅返回可见服务商；越权 providerId 不扩大范围 | API | #12 |
| TC-WB-08 | 权限先于分页：total 不泄露越权数据 | API | #13 |
| TC-WB-09 | 字段缺失项返回 null（assignee/workOrderId） | API | #14 |
| TC-WB-11 | 列表行渲染：中文标签与各字段直透 | UI | #1 |
| TC-WB-12 | 默认责任范围"我负责的"展示与切换 | UI | #2 |
| TC-WB-13 | 汇总区直透展示，不用当前页数量拼总数 | UI | #3 |
| TC-WB-14 | 组合筛选同时重查列表与汇总、页码重置 | UI | #4 |
| TC-WB-15 | 关键词搜索请求与结果呈现 | UI | #5 |
| TC-WB-16 | 分析失败标识与缺失字段兜底渲染 | UI | #6、#14 |
| TC-WB-17 | 空态：无权限与筛选无结果两种文案 | UI | #7、#11 |
| TC-WB-18 | 列表接口 503 真实呈现与重试 | UI | #8 |
| TC-WB-19 | 启动顺序、身份区展示、登录失效与深链接身份检查 | UI | #9、#10 |

## 二、前置条件（全部用例共用）

1. **服务与环境**：本系统服务按目标态实现并本地启动；`{BASE_URL}` 为服务地址（如 `http://localhost:8787`，以实际启动为准），页面地址 `{WEB_URL}#home`。
2. **种子数据**：在干净测试库执行 [sql/TC-WB-SEED.sql](sql/TC-WB-SEED.sql)，初始化身份引用、服务商与安装工单引用。
3. **身份模拟配置**（环境配置，不在 D1 种子里）：按 common-contract §1 的开发身份模拟，将测试凭据映射到 SEED 中的 `identity_reference`：
   - `{CRED_张三}` → `user-wb-reviewer`（角色 INSTALLATION_REVIEWER，授权范围：服务商 provider-dev-a，含 READ_WORK_ITEM / READ_WORK_ORDER，不含 READ_BILLING_RECORD）
   - `{CRED_王五}` → `user-wb-noperm`（身份可核实、无任何业务授权项）
   - `{CRED_失效}` → 无法通过身份核实的无效凭据
   - 凭据具体形式由身份提供方接入确认（current-identity-permissions-read §1 注明"凭据形式尚未定稿"），用例中以占位符表示。
4. **用例间隔离**：本域表受 no_delete 触发器保护（work-item-schema.md §1），不支持逐行 DELETE。**每个用例执行前重建测试库（重新执行 migration + SEED），再执行该用例 SQL 的"数据准备"段**；"数据清理"段因此只作说明，不含 DELETE 语句。
5. **SQL 方言**：SQLite / D1；幂等写法为 `INSERT ... SELECT ... WHERE NOT EXISTS`（no_replace 触发器禁止使用 INSERT OR REPLACE）；时间字段为 UTC 毫秒整数，基准值 1789862400000（2026-09-20T00:00:00Z）。

## 三、验收矩阵（PRD §7 验收#1—#14 全覆盖）

| PRD 验收# | 验收场景 | API 用例 | UI 用例 | 覆盖状态 |
|-----------|---------|---------|---------|---------|
| #1 | 列表正常渲染（三种 kind，字段与接口一致） | TC-WB-01 | TC-WB-11 | ✅ |
| #2 | 默认责任范围 responsibility=MINE | TC-WB-02 | TC-WB-12 | ✅ |
| #3 | 汇总展示（total/byStatus 直透，不拼当前页） | TC-WB-03 | TC-WB-13 | ✅ |
| #4 | 组合筛选 kind + status 同参重查、页码重置 | TC-WB-04 | TC-WB-14 | ✅ |
| #5 | 关键词搜索（已授权标题/工单编号/服务商名） | TC-WB-05 | TC-WB-15 | ✅ |
| #6 | 分析失败标识（analysisStatus=BLOCKED 不当完成） | — | TC-WB-16 | ⚠️ BLOCKED 数据构造方式 `[待确认-需产品明确]`，见 TC-WB-16 |
| #7 | 空列表（total=0，两种空态文案） | — | TC-WB-17 | ✅ |
| #8 | 加载失败（503/50301 真实呈现、重试、不清空） | — | TC-WB-18 | ✅ |
| #9 | 启动顺序（session 先于 summary/work-items，字段非空） | TC-WB-06 | TC-WB-19 | ✅ |
| #10 | 登录失效（401/40101 不发列表请求、恢复真实登录） | — | TC-WB-19 | ✅ |
| #11 | 无业务权限身份（身份区正常、列表区无可办理内容） | — | TC-WB-17 | ✅ |
| #12 | 越权服务商筛选（providers 仅可见、越权 providerId 不扩大范围） | TC-WB-07 | — | ⚠️ 越权 providerId 返回 200 空集还是 404 未唯一，`[待确认-需产品明确]`，见 TC-WB-07 |
| #13 | 权限先于分页（total 不泄露越权数据） | TC-WB-08 | — | ✅ |
| #14 | 字段缺失兜底（assignee=null 待分配、workOrderId=null 不显示） | TC-WB-09 | TC-WB-16 | ✅ |

## 四、[待确认] 汇总

| # | 位置 | 内容 |
|---|------|------|
| 1 | TC-WB-07 | PRD §3.7 对越权 providerId 写"服务端按权限过滤或返回 404"，两种行为未唯一确定，需产品明确唯一预期 |
| 2 | TC-WB-16 | analysisStatus=BLOCKED 由服务端按分析失败事实计算，当前 schema 未提供可通过 SQL 构造的持久化入口，需产品/研发明确构造方式 |
| 3 | 前置条件 §二.3 | 开发身份模拟凭据的具体形式未定稿，用例以 `{CRED_*}` 占位，执行时按实际接入替换 |

## 五、版本历史

| 版本 | 日期 | 变更说明 |
|------|------|---------|
| v1.0.0 | 2026-09-20 | 初版：18 条用例（API 9 条 / UI 9 条）覆盖 01-subprd-workbench-items.md §7 全部 14 条验收标准 |
