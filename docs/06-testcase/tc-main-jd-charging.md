<!-- @meta docId="tc-main" status="active" baseline="v1.0.2" -->
# TC 主索引：京东充电桩业务线管理工作台 2.0

> 基线版本：v1.0.2｜最后更新：2026-09-20｜状态：初版，待随实现执行
> 上游（我引用）：业务子 PRD 01—07 与 mock 专题的 §7 验收标准（[mainprd-jd-charging.md](../05-prd/mainprd-jd-charging.md) §七 索引）、[06-testcase 落地约定](README.md)、[mock域索引](mock/tc-mock.md) v2.1.0、[来源准备说明](mock/source-scenarios.md) §1—4
> 下游（引用我）：[mock域索引](mock/tc-mock.md) 当前范围及状态；[业务开发主计划](../07-delivery-plans/main-delivery-plan-jd-charging.md) §8 反向索引及各子开发计划「PRD 双链·读」；mock开发计划见其文件组；测试报告（docs/08-test-reports）待执行阶段建立后登记

**PRD 是唯一验收权威源**；所有用例的测试目标与预期结果回链 PRD 验收点，Schema / API 契约仅辅助字段与数据链路。

## 一、业务域登记

| 业务域 | 目录 | 编号前缀 | 基准 PRD | 用例数（方式见备注） | 索引文件 |
|--------|------|---------|---------|--------------------------|---------|
| 待处理事项与工作台总览 | [workbench/](workbench/) | TC-WB- | [01-subprd-workbench-items.md](../05-prd/01-subprd-workbench-items.md) §7 | 18（9/9/—） | [tc-workbench.md](workbench/tc-workbench.md) |
| 工单查询与处理追溯 | [orders/](orders/) | TC-ORD- | [02-subprd-orders-history.md](../05-prd/02-subprd-orders-history.md) §7 | 18（9/9/—） | [tc-orders.md](orders/tc-orders.md) |
| 服务商接入配置 | [config/](config/) | TC-CFG- | [03-subprd-provider-config.md](../05-prd/03-subprd-provider-config.md) §7 | 18（9/9/—） | [tc-config.md](config/tc-config.md) |
| 安装资料整理与提交 | [install/](install/) | TC-INS- | [04-subprd-installation-materials.md](../05-prd/04-subprd-installation-materials.md) §7 | 16（9/7/—） | [tc-install.md](install/tc-install.md) |
| 安装核查与补充 | [review/](review/) | TC-REV- | [05-subprd-installation-review.md](../05-prd/05-subprd-installation-review.md) §7 | 17（9/8/—） | [tc-review.md](review/tc-review.md) |
| 业务对账 | [recon/](recon/) | TC-REC- | [06-subprd-reconciliation.md](../05-prd/06-subprd-reconciliation.md) §7 | 18（9/9/—） | [tc-recon.md](recon/tc-recon.md) |
| 履约协同与异常 | [coord/](coord/) | TC-COO- | [07-subprd-coordination.md](../05-prd/07-subprd-coordination.md) §7 | 17（9/8/—） | [tc-coord.md](coord/tc-coord.md) |
| mock 数据与模拟接口 | [mock/](mock/) | TC-MCK- | [00-subprd-mock-data.md](../05-prd/00-subprd-mock-data.md) V1.1 §7 | 27组（API/集成9、端到端9、生成/环境9），v2.1.0 | [tc-mock.md](mock/tc-mock.md) |

号段约定：其他业务域01—09 API、11—19 UI；mock域01—09 API/后台集成、11—19端到端、21—29生成/环境/验收管理。号段分配后不重排，新增用例在对应号段内顺延。

**用例编号合计149组**（API/后台集成72、UI59、端到端9、生成/环境9）。其中mock域27组细化为93行子场景，执行时逐行及逐参数变体记录结果；未增加编号数量，不将这些设计数量当作已运行测试数。

## 二、PRD 验收点覆盖汇总

| 基准 PRD | 验收点数 | 已覆盖 | 附条件覆盖 | 未覆盖 |
|---------|---------|--------|-----------|--------|
| 00-subprd-mock-data V1.1 §7 | 11 | 11项已编写，运行NOT_RUN | 5项开发实现信息待登记；不影响既定产品判据 | 0 |
| 01-subprd-workbench-items §7 | 14 | 12 | #6 BLOCKED 构造方式、#12 越权口径待确认 | 0 |
| 02-subprd-orders-history §7（含 4 条补充） | 14+4 | 18 | #12 localContinuationStatus 计算条件、#13 404/403 口径待确认 | 0 |
| 03-subprd-provider-config §7 | 14 | 14 | #11、#14 为联调验证 | 0 |
| 04-subprd-installation-materials §7 | 12 | 12 | 3 条待确认细节 | 0 |
| 05-subprd-installation-review §7 | 13 | 13 | 6 条待确认细节 | 0 |
| 06-subprd-reconciliation §7 | 14 | 14 | #11 拒绝路径错误码待确认 | 0 |
| 07-subprd-coordination §7 | 14 | 12 | #6 前提条件、#12 故障注入手段待确认 | 0 |

逐条验收点 → 用例映射见各域索引文件的验收矩阵。原登记27条由其他域22条待确认及mock域5项实现登记组成；mock的5项不再列为产品预期待确认，明细见各域索引，跨域共性待确认见 §四。

## 三、测试环境共性约定（各域索引层前置条件的汇总口径）

1. **测试库与历史保护触发器**：其他业务域的SQL与候选DDL检查记录保留在其域文档，本轮未复审。它们只能证明对应准备脚本或数据库约束，不能证明业务联调。mock域没有可执行SQL种子，使用[来源准备说明](mock/source-scenarios.md)建立来源数据，经API驱动本系统。
2. **外部驱动**：来源读取、写入、回查、变化发现及失败必须由相应模拟接口真实发生。直接SQL写本系统终态只可用于隔离的展示/约束检查，不能验收数据链路、外部写入或完整业务功能；尚无外部驱动时对应联调用例记BLOCKED/NOT_RUN。
3. **身份凭据**：由受控测试会话取得可信身份；准备记录不构成授权，不接受客户端自报角色。执行报告不保存凭据。
4. **服务地址与环境**：按实际部署配置绑定本系统和各外部服务；mock域环境的来源存储、本系统库、文件和任务空间须完整配对。
5. **验证证据**：设计覆盖、文档检查、SQL可执行性、外部接口运行、端到端验收分别记录。mock原28份.sql均为注释，已移除；本域无生成/接口/业务运行通过结论。已通过的Skill能力证据按版本复用，不代替新增联调。

## 四、跨域待确认与实现登记（按问题归属处理）

| # | 待确认项 | 影响域 |
|---|---------|--------|
| 1 | 40903 响应中"原操作入口"的承载字段名 | install / review |
| 2 | ~~越权与无权限的 404 / 403 口径统一~~ 已裁决（2026-09-20，T1.1）：资源不存在或对当前身份不可见统一 404/40404（common-contract §3 末句）；资源可见但无该动作权限返回 403/40301（§4）；列表类接口不泄露存在性，按可见范围过滤后返回空 | workbench / orders / recon / coord |
| 3 | 其他域测试库历史保护触发器与数据清理口径；mock按PRD §6完整环境恢复 | 其他7域 |
| 4 | 故障注入能力（接口 5xx/超时、关联写入失败回滚）的提供形式 | orders / coord / mock |
| 5 | 模拟来源存储表结构、生成与重置入口形态（mock 专题实现前） | mock |
| 6 | 开发身份模拟凭据的发放形式 | 全部域 |

## 五、版本历史

| 版本 | 日期 | 变更说明 |
|------|------|---------|
| v1.0.2 | 2026-09-20 | mock域v2.1.0审核修订：27组93行子场景，运行未执行；纠正纯注释SQL验证及覆盖状态表述；mock五项转为实现信息登记，其余域未复审。 |
| v1.0.1 | 2026-09-20 | mock 域按 mock PRD V1.1 重建（11 条验收全覆盖），待确认总数 27；其余沿用 v1.0.0。 |
| v1.0.0 | 2026-09-20 | 初版：8 个业务域、149 条用例，覆盖全部 PRD §7 验收点（103 条 + orders 4 条补充）；27 条 [待确认] 已分散登记各域并汇总共性 6 条。由 test-case-writer skill 生成，未改 PRD。 |
