<!-- @meta docId="tc-install" status="active" baseline="v1.0.1" -->
# 安装资料整理与提交（install）测试用例 — 索引层

> **基线版本**: v1.0.1 | **最后更新**: 2026-09-20
> **编号前缀**: TC-INS-
> **基准 PRD**: [04-subprd-installation-materials.md](../../05-prd/04-subprd-installation-materials.md) §7
> **用例详情**: [tc-install-用例详情.md](tc-install-用例详情.md)
> **设计方法**: 决策表 + 状态迁移 + 边界值 + 场景法
> 上游（我引用）：[04-subprd-installation-materials.md](../../05-prd/04-subprd-installation-materials.md) §3、§5、§7，[installation-schema.md](../../03-foundation/03-05-schema/installation-schema.md) §2、§4—5，[evidence-schema.md](../../03-foundation/03-05-schema/evidence-schema.md) §2—3，[installation-apis.md](../../03-foundation/03-06-provided-apis/installation-apis.md) §1—2，[material-apis.md](../../03-foundation/03-06-provided-apis/material-apis.md) §1—3，[workbench-apis.md](../../03-foundation/03-06-provided-apis/workbench-apis.md) §4，[common-contract.md](../../03-foundation/03-06-provided-apis/common-contract.md) §2、§4—5
> 下游（引用我）：[tc-main-jd-charging.md](../tc-main-jd-charging.md) 域登记（TC 主索引尚未建立，待建立后登记双向引用）

---

## 一、测试范围

| 用例编号 | 测试重点 | 验证方式 | PRD 依据 |
|---------|---------|---------|---------|
| TC-INS-01 | 草稿正常读取：3 行明细直透、null 数量保持 null、缺项 2 条 | API | §7 验收#1、#3 |
| TC-INS-02 | 无草稿读取：draftId 等 null、数组为空 | API | §7 验收#4 |
| TC-INS-03 | 编辑保存生成 HUMAN 新版本，原版本不改写 | API | §7 验收#5 |
| TC-INS-04 | 草稿版本保护：旧 expectedDraftVersionId 保存返回 40901 | API | §7 验收#7 |
| TC-INS-05 | 未决写入保护：保存草稿与再次提交均返回 40903 | API | §7 验收#8 |
| TC-INS-06 | 提交受理 202 与重复提交幂等（40902） | API | §7 验收#9（兼 #6 受理语义） |
| TC-INS-07 | 结果未知回查：operations 返回 RESULT_UNKNOWN，原键重放不换编号 | API | §7 验收#10 |
| TC-INS-08 | 提交成功自动产生核查事项，重复回执去重 | API | §7 验收#11 |
| TC-INS-09 | 上传 INSTALLATION_MATERIAL 登记 LOCAL_UPLOAD 版本并进入相同解析流程 | API | §7 验收#12 |
| TC-INS-11 | 草稿明细区渲染：五字段、null 行"待核实"不填零 | UI | §7 验收#1 |
| TC-INS-12 | 依据定位侧栏：blockId 定位原页/sheet/cellRange，图片描述标明 | UI | §7 验收#2 |
| TC-INS-13 | 缺项与冲突逐条如实展示 | UI | §7 验收#3 |
| TC-INS-14 | 无草稿页面展示整理中真实状态 | UI | §7 验收#4 |
| TC-INS-15 | 编辑保存后版本标识更新、人工更正不显示为 AI 原文 | UI | §7 验收#5 |
| TC-INS-16 | 提交进展三态（处理中/结果未知/成功）文案如实区分 | UI | §7 验收#6 |
| TC-INS-17 | 结果未知页面：不换编号重提，保留原确认 | UI | §7 验收#10 |

## 二、前置条件（全部用例共用）

1. 服务端已启动（默认 `http://localhost:8787`，以实际启动端口为准），数据库按候选 DDL 建表（依次加载 work-item / identity / evidence / installation / execution 各 schema.sql）。
2. 在**重建后的空库**执行 [sql/TC-INS-SEED.sql](sql/TC-INS-SEED.sql) 初始化共用种子数据（服务商"安家安装"、工单"桂语庭"、资料事项 `wi-tc-ins-prep-1` 及 3 行 AI 草稿）。
3. 候选 DDL 全部业务表带 no_replace/no_delete 触发器：SEED 与场景 SQL 只能在空库各执行一次；任一写操作用例（03/06/09/15）执行后如需运行其他用例，须重建库并重跑 SEED。各用例 SQL 的"数据清理"段同此约定。
4. 写操作请求统一携带 Header `Idempotency-Key`；调用身份为种子资料员 `idt-tc-ins-clerk1`（已授 CONFIRM_INSTALLATION_DRAFT 与 SUBMIT_INSTALLATION_DETAIL）。
5. 每条用例的数据准备 = SEED + 对应 `sql/TC-INS-NN.sql` 的"数据准备"段（无额外准备的用例如 01/03/09/11/12/13/15 仅依赖 SEED）。

## 三、验收矩阵

| PRD 依据 | 验收场景 | API 用例 | UI 用例 | 覆盖状态 |
|---------|---------|---------|---------|---------|
| §7 验收#1 | 正常草稿渲染：五字段正确、null 行"待核实"不填零 | TC-INS-01 | TC-INS-11 | ✅ |
| §7 验收#2 | 依据定位：blockId 定位原页/sheet/cellRange，图片描述标明 | — | TC-INS-12 | ✅ |
| §7 验收#3 | 缺项与冲突：2 条 openQuestions 逐条如实列出 | TC-INS-01 | TC-INS-13 | ✅ |
| §7 验收#4 | 无草稿：展示整理中/失败真实状态，无可提交明细 | TC-INS-02 | TC-INS-14 | ✅ |
| §7 验收#5 | 编辑生成新版本：SAVED、versionNo 递增、origin HUMAN、原版本不改写 | TC-INS-03 | TC-INS-15 | ✅ |
| §7 验收#6 | 进展如实区分：三态文案各异，202 受理不显示"已提交成功" | TC-INS-06 | TC-INS-16 | ✅ |
| §7 验收#7 | 草稿版本保护：旧版本保存 40901，不生成新版本 | TC-INS-04 | — | ✅ |
| §7 验收#8 | 未决写入保护：保存/再提交 40903 及原操作入口 | TC-INS-05 | — | ✅（原操作入口载体字段已裁决，见 §四 #1） |
| §7 验收#9 | 重复提交幂等：同键同内容返回原结果，同键不同内容 40902 | TC-INS-06 | — | ✅ |
| §7 验收#10 | 结果未知回查：operations 回查不换编号，页面不判失败 | TC-INS-07 | TC-INS-17 | ✅（RESULT_UNKNOWN 时 localContinuationStatus 取值已裁决，见 §四 #2） |
| §7 验收#11 | 提交成功自动产生核查事项，去重不重复创建 | TC-INS-08 | — | ✅ |
| §7 验收#12 | 上传进入相同解析流程：202 RECEIVED、LOCAL_UPLOAD、issues 如实 | TC-INS-09 | — | ✅（上传准备终态等待时限 [待确认-需产品明确]） |

## 四、[待确认] 汇总

| # | 条目 | 出处 | 裁决 |
|---|------|------|------|
| 1 | 40903 响应中"原操作入口"的载体字段名（PRD §3.6 只写"返回可读的原操作入口"） | TC-INS-05 | 已裁决（2026-09-20，T3.1）：统一错误壳 `data` 保持 null，另加顶层字段 `pendingOperation={operationId,status}`；T3.1 实现与 TC-INS-05 已同步 |
| 2 | operations 在 status=RESULT_UNKNOWN 时 localContinuationStatus 的唯一预期取值 | TC-INS-07 | 已裁决（2026-09-20，T3.1）：`NOT_READY`（外部结果未定，本地接续尚未开始） |
| 3 | 上传后准备终态（READY/BLOCKED）的等待时限 SLA | TC-INS-09 | 待确认：依赖解析链路（AI 服务/任务程序）交付后按实测确定 |

## 五、版本历史

| 版本 | 日期 | 变更说明 |
|------|------|---------|
| v1.0.1 | 2026-09-20 | T3.1 执行回写：§四 #1/#2 裁决落定（40903 载体字段、RESULT_UNKNOWN 接续状态）；TC-INS-05/07 预期同步；TC-INS-08 准备段补执行任务 |
| v1.0.0 | 2026-09-20 | 初版：16 条用例（API 9 条、UI 7 条）覆盖 §7 全部 12 条验收点 |
