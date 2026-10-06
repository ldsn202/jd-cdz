# 主开发计划：京东充电桩业务线管理工作台 2.0（jd-charging）

> **版本**：v1.0
> **发布日期**：2026-09-20
> **前序版本**：无（首次生成）
> **适用范围**：本系统（web / api / db / 后台任务程序 / Skill 接入 / 部署配置）的代码实现，不含 mock 数据专题
> **开发模式**：solo-local（本地全栈联调，云端部署暂不规划阶段，仅收口部署文档）
> **参与角色**：AI（执行）、人类 Owner（审核决策）
> **执行约束**：AI 执行 -> 人审核；Task 状态翻转三处同步；完成前真实验证
> **目标**：实现 38 条本系统接口、七域 41 张表、15 个页面 / 视图与后台分析链路，达到本地真实联调可验收
> **当前需求基线**：mainprd-jd-charging.md v1.0（草稿）+ 业务子 PRD 01—07（草稿）+ foundation 七类文档（已本地验收）
> **2026-09-21 当前收口口径**：用户明确选取典型场景验收，不再要求本轮逐条执行全部 149 组 TC。T5.1 进行中；T4.3 按原型返工、UI 验收仍阻塞；核查外写实际失败待修复复测。未执行项保留未测，任务尚未完工。
> **上游文档清单确认（Step 0.5）**：slug=jd-charging；确认时间 2026-09-20；主 PRD、术语表 V1.12、Schema 七域 41 表、对外接口 38 条、外部契约 12 份、业务子 PRD 01—07、BRD V1.1 均已存在并抽读，未进入失败分支
> **并行计划**：mock 数据专题开发计划为独立文件组（`main-delivery-plan-jd-charging-mock.md` 及其看板、子计划，slug=jd-charging-mock），由独立会话维护；本计划不修改其任何文件，仅在前置与闸门处引用其交付状态。两组计划的 Task 编号各自独立有效。
> 上游（我引用）：[mainprd-jd-charging.md](../05-prd/mainprd-jd-charging.md) §一—§七、业务子 PRD 01—07 各自 §1—§7、[本系统接口清单](../03-foundation/03-06-provided-apis/README.md) 38 条、[表结构总核对](../03-foundation/03-05-schema/coverage-review.md)、[系统流程](../03-foundation/03-07-system-flows/README.md)、[TC 主索引](../06-testcase/tc-main-jd-charging.md) §一—§四、[运行数据规则](../../rules/runtime-mock-data.md) §1—§4、[技术栈规则](../../rules/Cloudflare支持技术栈.md) §1—§2、[code/README.md](../../code/README.md) 目录结构与切换约定、[mock 数据 PRD](../05-prd/00-subprd-mock-data.md) §8（边界声明，不承接其实现）
> 下游（引用我）：无（progress.md 进度快照于首次生成后登记）

## 0. 本计划使用指南

1. 先读本主计划，确认 Phase 顺序、Task 索引、发布闸门与风险。
2. 打开任务看板 [task-kanban-jd-charging.md](task-kanban-jd-charging.md)，定位当前 Task 对应的子开发计划。
3. 执行前只加载当前 Task 子开发计划中 `PRD 双链·读` 指向的真实文件，不整包读取 PRD 目录。
4. 开工前运行 `node .agent/skills/delivery-planner/scripts/check-plan-consistency.mjs docs/07-delivery-plans/main-delivery-plan-jd-charging.md --json`，exit 0 才可写代码。
5. 完成后按子开发计划「完成收尾：状态同步」回写三处状态与 progress.md。

### 0.1 PRD 加载约束

- 先读 `docs/05-prd/mainprd-jd-charging.md` §四—§七建立全局地图。
- 每个 Task 只读取其子开发计划列出的子 PRD 章节、接口契约文件与 schema 文档；禁止一次性读取整个 `docs/05-prd/` 或 `docs/03-foundation/`。
- mock 数据专题（00-subprd-mock-data.md）的开发计划为独立文件组（jd-charging-mock 前缀），本计划不为其拆解 Task、不修改其文件，仅引用其交付状态。

### 0.2 读前门禁 / AI 自检清单

- 当前 Task 能从任务看板定位到唯一子开发计划，且三处状态一致。
- 子开发计划的 `核心文件` 路径在仓库中真实存在或为本 Task 新建的真实落点。
- 接口路径、表名、字段名逐字取自 foundation 契约与术语表 V1.12，不自造命名。

### 0.3 完成前验证门禁

- 完成前必须执行子开发计划中的 `Verification Method`，证据落盘到 `Evidence` 指定位置。
- 接口类改动必须有真实请求 / 响应核对；数据库类改动必须有真实查询回查；页面类改动必须有真实接口驱动的页面回显（截图存 `pwScreenShot/`）。
- 构建通过、页面能打开不构成完成；前端不得出现自造业务数据（对照 runtime-mock-data §2 检查）。

### 0.4 环境依赖声明

| 依赖项 | 版本要求 | 检测命令 |
|---|---|---|
| Node.js | >= 18 | `node -v` |
| npm | >= 9 | `npm -v` |
| Wrangler | >= 3 | `npx wrangler --version` |

| 工程目录 | 就绪标识 |
|---|---|
| `code/skill-runtime/` | `tests/` 存在且 `node --test` 通过（已实现，验收保持） |
| `code/api/` | `package.json` 存在（T0.1 建立） |
| `code/web/` | `package.json` 存在（T0.1 建立） |

任一检测失败即环境未就绪，禁止开始写代码。

## 1. 差距基线

| 差距 | 影响 | 对应任务 | 状态 |
|---|---|---|---|
| code/web、code/api、code/db/migrations、wrangler.jsonc 均为空目录或缺失 | 无运行载体 | T0.1 | 待处理 |
| 七域 41 张表仅有候选 SQL（本地验证），无正式 D1 migration | 全部接口无持久层 | T0.2 | 待处理 |
| 38 条本系统接口（31 浏览器 + 7 内部 SERVICE）全部未实现 | 页面与后台无数据链路 | T1.1—T1.3、T2.2、T3.1—T3.5 | 待处理 |
| 外部依赖适配层与 EXTERNAL_MODE / AI_MODE 开关未实现 | 无法切换模拟 / 真实来源 | T2.1 | 待处理 |
| 后台 Node 任务程序 HTTP 服务、变化接收、分析准备链路未实现 | Skill 无法进入业务流 | T2.2、T2.3 | 待处理 |
| 上传解析（服务商文件）未实现 | 安装资料导入链路缺失 | T3.1 | 待处理 |
| 15 个页面 / 视图仅有前端模拟原型（假数据），无真实前端 | 无法真实验收 | T4.1—T4.3 | 待处理 |
| 09-deploy 仅有目录 README，无 local-setup / config-items / api-keys | 环境不可复现 | T0.1、T5.2 | 待处理 |
| mock 专题（数据生成器、外部模拟服务、场景操作工具）未实现 | T5.1 联调阻塞；由独立计划（jd-charging-mock 文件组）承接，本计划不动 | （计划外依赖） | 计划外 |

## 2. 分工与边界

| 角色 | 职责 |
|---|---|
| AI | 代码理解、实装、真实验证、状态回写、风险登记；技术判断默认 `AI 执行 -> 人审核` |
| 人类 Owner | 审阅子开发计划（待审阅 -> 待开发）、业务裁决、关键结果验收 |

边界声明：

- 本系统业务逻辑、权限、计算、持久化、状态流转由本计划实现；**模拟数据生成器、外部模拟服务、场景操作工具及 mock 专题验收由 mock 数据专题的独立开发计划（jd-charging-mock 文件组）承接，本计划不拆解、不改动**。
- mock 专题交付物对本计划是外部依赖：T2.1 的 mock 通道地址、T5.1 的联调均以 mock 专题交付为前置；未交付前相关验证项记阻塞，不用本系统侧替身绕过。
- 四类业务 Skill 包与 code/skill-runtime 已验收（75 项程序测试、8 个真实模型场景），本计划只接入、不重测、不改动。

## 3. 执行阶段

### Phase 0：工程与数据基线

**Entry Criteria**：本计划经人类 Owner 审阅，T0.1 子开发计划置为待开发；环境依赖声明检测通过。

**Exit Criteria**：工程骨架可本地启动；七域 41 张表经正式 migration 在本地 D1 落库，约束回归沿用 foundation 检查口径通过。

| Task | 子开发计划 | 状态 |
|---|---|---|
| T0.1 | [sub-delivery-plan-jd-charging-T0.1-project-scaffold.md](sub-delivery-plan-jd-charging-T0.1-project-scaffold.md) | 已完成（2026-09-20） |
| T0.2 | [sub-delivery-plan-jd-charging-T0.2-d1-migrations.md](sub-delivery-plan-jd-charging-T0.2-d1-migrations.md) | 已完成（2026-09-20） |

### Phase 1：服务端公共层与读取链路

**Entry Criteria**：T0.2 完成。

**Exit Criteria**：session 与身份范围检查生效；工作台、工单聚合、材料共 10 条 GET 接口真实返回 D1 数据，越权与空态按 common-contract 响应。

| Task | 子开发计划 | 状态 |
|---|---|---|
| T1.1 | [sub-delivery-plan-jd-charging-T1.1-common-identity.md](sub-delivery-plan-jd-charging-T1.1-common-identity.md) | 已完成（2026-09-20） |
| T1.2 | [sub-delivery-plan-jd-charging-T1.2-workbench-read.md](sub-delivery-plan-jd-charging-T1.2-workbench-read.md) | 已完成（2026-09-20） |
| T1.3 | [sub-delivery-plan-jd-charging-T1.3-orders-materials-read.md](sub-delivery-plan-jd-charging-T1.3-orders-materials-read.md) | 已完成（2026-09-20） |

### Phase 2：外部适配与后台分析链路

**Entry Criteria**：T0.2 完成；T2.1 可与 Phase 1 并行。

**Exit Criteria**：EXTERNAL_MODE 切换生效；7 条内部 SERVICE 路由支撑变化接收与任务调度；后台任务程序经 HTTP 与 Worker 交互，分析结果校验入库并生成 / 更新事项，失败以真实状态呈现。

| Task | 子开发计划 | 状态 |
|---|---|---|
| T2.1 | [sub-delivery-plan-jd-charging-T2.1-external-adapter.md](sub-delivery-plan-jd-charging-T2.1-external-adapter.md) | 已完成（2026-09-20） |
| T2.2 | [sub-delivery-plan-jd-charging-T2.2-execution-internal.md](sub-delivery-plan-jd-charging-T2.2-execution-internal.md) | 已完成（2026-09-20） |
| T2.3 | [sub-delivery-plan-jd-charging-T2.3-analysis-pipeline.md](sub-delivery-plan-jd-charging-T2.3-analysis-pipeline.md) | 已完成（2026-09-20） |

### Phase 3：业务写链路（五条）

**Entry Criteria**：T1.1、T2.1 完成；T3.2、T3.4 另需 T2.3。

**Exit Criteria**：五条写链路各自的版本条件、幂等、结果未知回查与状态接续按契约真实执行；写接口成功伴随 D1 实际状态变化与外部写入登记。

| Task | 子开发计划 | 状态 |
|---|---|---|
| T3.1 | [sub-delivery-plan-jd-charging-T3.1-installation-submit.md](sub-delivery-plan-jd-charging-T3.1-installation-submit.md) | 已完成（2026-09-20） |
| T3.2 | [sub-delivery-plan-jd-charging-T3.2-review-supplement.md](sub-delivery-plan-jd-charging-T3.2-review-supplement.md) | 已完成（2026-09-20） |
| T3.3 | [sub-delivery-plan-jd-charging-T3.3-reconciliation.md](sub-delivery-plan-jd-charging-T3.3-reconciliation.md) | 已完成（2026-09-20） |
| T3.4 | [sub-delivery-plan-jd-charging-T3.4-provider-config.md](sub-delivery-plan-jd-charging-T3.4-provider-config.md) | 已完成（2026-09-20） |
| T3.5 | [sub-delivery-plan-jd-charging-T3.5-coordination.md](sub-delivery-plan-jd-charging-T3.5-coordination.md) | 已完成（2026-09-20） |

### Phase 4：前端工作台

**Entry Criteria**：T1.1 完成（T4.1）；T1.2、T1.3 完成（T4.2）；T3.1—T3.5 完成（T4.3）。

**Exit Criteria**：15 个页面 / 视图全部由本系统 API 驱动，页面与嵌入视图按原型入口分别实现，不按数量凑独立路由；原始证据从工单、事项或处理记录侧栏打开；无前端自造业务数据；身份切换与深链接范围检查真实生效。

| Task | 子开发计划 | 状态 |
|---|---|---|
| T4.1 | [sub-delivery-plan-jd-charging-T4.1-web-shell.md](sub-delivery-plan-jd-charging-T4.1-web-shell.md) | 已完成（2026-09-20） |
| T4.2 | [sub-delivery-plan-jd-charging-T4.2-web-workbench-orders.md](sub-delivery-plan-jd-charging-T4.2-web-workbench-orders.md) | 已完成（2026-09-20） |
| T4.3 | [sub-delivery-plan-jd-charging-T4.3-web-business-pages.md](sub-delivery-plan-jd-charging-T4.3-web-business-pages.md) | 阻塞 |

### Phase 5：联调回归与部署收口

**Entry Criteria**：T4.2、T4.3、T2.3 完成；**mock 数据专题交付（外部依赖，jd-charging-mock 文件组）**。

**Exit Criteria**：EXTERNAL_MODE=mock 下本轮选定的典型场景有实际结果及回查证据，UI 按原型返工后通过典型操作验收，暴露缺陷修复；其他编号如实列为未测。09-deploy 文档随实测同步，可按 local-setup 复现。

| Task | 子开发计划 | 状态 |
|---|---|---|
| T5.1 | [sub-delivery-plan-jd-charging-T5.1-e2e-integration.md](sub-delivery-plan-jd-charging-T5.1-e2e-integration.md) | 进行中 |
| T5.2 | [sub-delivery-plan-jd-charging-T5.2-deploy-docs.md](sub-delivery-plan-jd-charging-T5.2-deploy-docs.md) | 待审阅 |

## 4. 任务看板

- 看板入口：[task-kanban-jd-charging.md](task-kanban-jd-charging.md)
- 状态纪律：仅 `待审阅 / 待开发 / 进行中 / 已完成（YYYY-MM-DD）` 四种；同一时刻有且仅有一个 `进行中`；翻转必须主计划、看板、子开发计划三处同步。

## 5. 发布闸门

本轮按上述用户授权的典型验收范围收口；下列未勾选项不代表已经通过，不继续扩大为全量 TC 执行：

- [ ] 本轮选定的典型场景与 T4.3 原型返工验收有实际证据，暴露缺陷已处理，未测范围明确
- [ ] 典型场景涉及的业务与内部 SERVICE 接口有真实请求 / 响应核对记录；未覆盖接口不标通过
- [ ] 七域 41 张表在本地 D1 经正式 migration 落库，约束回归记录存在
- [ ] mock 数据专题已交付模拟服务（jd-charging-mock 文件组；未交付则 T5.1 保持阻塞，不得用替身数据放行）
- [ ] 前端无自造业务数据检查通过（runtime-mock-data §2）
- [ ] 任务看板、主计划、各子开发计划状态三处一致（check-plan-consistency.mjs exit 0）
- [ ] tc-main §四 跨域待确认 6 条中影响实现的项（404/403 口径、40903 承载字段、身份模拟凭据、故障注入形式）已在对应 Task 内裁决并回写计划正文

## 6. 风险与应对

| 风险 | 影响 | 应对 | Owner | 状态 |
|---|---|---|---|---|
| PRD 整体仍为草稿待完整评审 | 实现中途契约可能调整 | 各 Task 以 foundation 契约为实现准绳；PRD 评审结论出来后按受影响 Task 回写计划，不中途改代码口径 | AI -> 人类 Owner | 待观察 |
| mock 专题未交付（计划外依赖，jd-charging-mock 文件组） | T2.1 mock 通道、T5.1 联调阻塞 | 前置显式登记；阻塞期间推进不依赖模拟服务的 Task；禁止前端或本系统侧造替身数据 | AI -> 人类 Owner | 待观察 |
| tc-main §四 跨域待确认 6 条（404/403 口径、40903 承载字段、故障注入、身份凭据等） | 对应 Task 完成标准无法定稿 | 在 T1.1 / T3.1 / T5.1 内先按契约实现可裁决部分，待确认项以 `AI 执行 -> 人审核` 裁决后同次回写计划与 TC | AI -> 人类 Owner | 待观察 |
| D1（SQLite）与候选 DDL 的触发器 / 事务行为差异 | 历史保护、条件零行回滚失效 | T0.2 用 foundation 既有 123 项检查脚本口径在本地 D1 全量回归；差异点先改 schema 文档再改 migration | AI 执行 -> 人审核 | 待观察 |
| 后台 Node 任务程序与 Worker 的本地 HTTP 交互形态 | T2.2 / T2.3 联调复杂 | 按 execution-apis §4 契约实现；先跑通单事项分析闭环再扩场景 | AI 执行 -> 人审核 | 待观察 |
| 上传文件解析（OCR / XLSX）真实能力边界 | T3.1 上传链路验收口径 | 解析能力按 ai-inference-material-parsing 契约与 Skill 已验收边界执行；缺项以真实失败呈现，不补造 | AI 执行 -> 人审核 | 待观察 |

## 7. AI 执行示例

1. 打开 [task-kanban-jd-charging.md](task-kanban-jd-charging.md)，找到状态为 `待开发` 的 Task（如 T0.1）。
2. 经用户确认开工后，把 T0.1 在主计划执行阶段表、看板、子开发计划三处同步置为 `进行中`，运行 check-plan-consistency.mjs 确认 exit 0。
3. 只加载 T0.1 子开发计划 `PRD 双链·读` 列出的文件（code/README.md、Cloudflare支持技术栈.md §1—§2、09-deploy/README.md），按 `核心文件` 落点实现。
4. 执行 `Verification Method`，证据写入 `Evidence` 指定位置；逐条核对 `完成标准`。
5. 按「完成收尾：状态同步」回写三处状态与 progress.md，再跑一致性校验。

## 8. PRD → 任务反向索引

| PRD / 契约 | Task | 子开发计划 |
|---|---|---|
| mainprd §三 全局设计原则、code/README 目录约定 | T0.1 | [sub-delivery-plan-jd-charging-T0.1-project-scaffold.md](sub-delivery-plan-jd-charging-T0.1-project-scaffold.md) |
| 03-05-schema 七域 + coverage-review | T0.2 | [sub-delivery-plan-jd-charging-T0.2-d1-migrations.md](sub-delivery-plan-jd-charging-T0.2-d1-migrations.md) |
| common-contract §1—§5、01-subprd §5 session/providers | T1.1 | [sub-delivery-plan-jd-charging-T1.1-common-identity.md](sub-delivery-plan-jd-charging-T1.1-common-identity.md) |
| 01-subprd-workbench-items §3、§5、§7 | T1.2、T4.2 | [sub-delivery-plan-jd-charging-T1.2-workbench-read.md](sub-delivery-plan-jd-charging-T1.2-workbench-read.md) |
| 02-subprd-orders-history §3、§5、§7（含工单聚合补充） | T1.3、T4.2 | [sub-delivery-plan-jd-charging-T1.3-orders-materials-read.md](sub-delivery-plan-jd-charging-T1.3-orders-materials-read.md) |
| 03-02-external-apis 十二份契约、runtime-mock-data §2 | T2.1 | [sub-delivery-plan-jd-charging-T2.1-external-adapter.md](sub-delivery-plan-jd-charging-T2.1-external-adapter.md) |
| execution-apis §1—§5、sys-transactions-recovery | T2.2 | [sub-delivery-plan-jd-charging-T2.2-execution-internal.md](sub-delivery-plan-jd-charging-T2.2-execution-internal.md) |
| sys-analysis-preparation §1—§5、04-skills §2—§3 | T2.3 | [sub-delivery-plan-jd-charging-T2.3-analysis-pipeline.md](sub-delivery-plan-jd-charging-T2.3-analysis-pipeline.md) |
| 04-subprd-installation-materials §3、§5、§7 | T3.1、T4.3 | [sub-delivery-plan-jd-charging-T3.1-installation-submit.md](sub-delivery-plan-jd-charging-T3.1-installation-submit.md) |
| 05-subprd-installation-review §3、§5、§7 | T3.2、T4.3 | [sub-delivery-plan-jd-charging-T3.2-review-supplement.md](sub-delivery-plan-jd-charging-T3.2-review-supplement.md) |
| 06-subprd-reconciliation §3、§5、§7 | T3.3、T4.3 | [sub-delivery-plan-jd-charging-T3.3-reconciliation.md](sub-delivery-plan-jd-charging-T3.3-reconciliation.md) |
| 03-subprd-provider-config §3、§5、§7 | T3.4、T4.3 | [sub-delivery-plan-jd-charging-T3.4-provider-config.md](sub-delivery-plan-jd-charging-T3.4-provider-config.md) |
| 07-subprd-coordination §3、§5、§7 | T3.5、T4.3 | [sub-delivery-plan-jd-charging-T3.5-coordination.md](sub-delivery-plan-jd-charging-T3.5-coordination.md) |
| mainprd §五 页面结构与接口调用全景 | T4.1 | [sub-delivery-plan-jd-charging-T4.1-web-shell.md](sub-delivery-plan-jd-charging-T4.1-web-shell.md) |
| 01/02-subprd §2 页面布局 | T4.2 | [sub-delivery-plan-jd-charging-T4.2-web-workbench-orders.md](sub-delivery-plan-jd-charging-T4.2-web-workbench-orders.md) |
| 03—07-subprd §2 页面布局 | T4.3 | [sub-delivery-plan-jd-charging-T4.3-web-business-pages.md](sub-delivery-plan-jd-charging-T4.3-web-business-pages.md) |
| tc-main-jd-charging §一—§四、mock 专题交付状态 | T5.1 | [sub-delivery-plan-jd-charging-T5.1-e2e-integration.md](sub-delivery-plan-jd-charging-T5.1-e2e-integration.md) |
| 09-deploy/README 四文件约定 | T5.2 | [sub-delivery-plan-jd-charging-T5.2-deploy-docs.md](sub-delivery-plan-jd-charging-T5.2-deploy-docs.md) |


### 2026-09-27 本地启动记录

2026-09-27：按用户要求启动现有项目。独立 Node.js v25.8.1 与 npm 位于 `/tmp/jd-charging-tools/node-v25.8.1-darwin-arm64/bin/`；依赖已按锁文件安装，前端构建通过，9 份本地迁移及开发身份初始化成功。前端 http://127.0.0.1:5174、API 8788、模拟来源 8790、后台任务程序均已启动。Safari 实际打开工作台，开发会话、概览和事项接口返回 200。当前业务库为空，模拟来源已生成但未导入业务库；AI_MODE=mock。仅确认本地启动成功，不改变 T4.3/T5.1/T5.2 原有验收状态。进程及日志见 `/tmp/jd-charging-tools/pids.json` 与同目录 `*.log`。


### 2026-09-27 材料入口纠正

2026-09-27：移除独立材料浏览菜单、首页入口与路由，保留业务内原文查看；修正 T4.1 将页面/视图数量等同路由数量的验收口径。构建及 10 项既有前端测试通过，Safari 检查入口已消失。空数据已定位为当前业务库未导入、默认来源账号类型与服务商授权范围不匹配、来源监测未启动；历史数据导入属于隔离验收环境，当前未恢复。详见[核查记录](../08-test-reports/material-entry-root-cause-20260927.md)。整体任务验收状态不变。


### 2026-09-27 数据恢复与统一启动结果

2026-09-27：标准 mock 数据恢复与统一启动完成，1000 工单、1400 事项（核查账号负责 800）；停止—重启保持工单/事项编号与授权记录、621 份已保存文件摘要不变。新增项目根启动/停止脚本及 README，后续启动复用数据。修复无效 file-service 订阅与 Safari 筛选控件高度。真实 AI 未启用，原项目整体验收状态保持。详见 [恢复与启动验收](../../../../04-分析/本地数据恢复与启动修复.md)。


### 2026-09-27 用户纠正：真实自动分析与重复入口

本轮已授权修复：EXTERNAL_MODE=mock 仅替代外部业务数据来源；正常启动使用真实 OpenCode 分析，工单与材料变化自动触发；详情增加手动分析/失败重试入口，保留版本与权限保护。缺少模型配置应显示真实原因且不耗尽分析任务。提供本地演示基线备份与一键回滚，恢复业务库、来源库及文件一致状态。对账按 06-subprd-reconciliation §2—3.1 合并为单一“业务对账”入口，保留详情中双方原分项对照与服务商原应收。

验证：导航与旧链接均进入同一列表；角色权限保持；手动分析重复请求不创建并行任务、旧代次结果不覆盖新版；自动任务和错误原因可查；回滚须保留恢复前备份并核对数据库/来源文件。真实模型验证依赖本机模型凭证，目前未发现有效配置，不以假结果代替。任务仍为 T5.1 进行中。


### 2026-09-27 自动分析与对账入口检查点

单一“业务对账”入口及旧链接已在 Safari 验证；已切到已有对账账号，300 条对账事项能读取金额。修正列表/详情差额符号。OpenCode 1.18.32 已安装，统一启动改为来源 mock + AI real；手动分析与配置缺失提示已实现，一键回滚实际成功（1000工单/1400事项，回滚前数据保留）。后端与回滚26项、前端10项测试及构建通过。**本机仍缺模型凭证，真实调用与自动恢复旧失败事项尚未实跑**，T5.1保持进行中，整体项目未验收。证据：[本轮报告](../08-test-reports/analysis-and-billing-20260927/README.md)。


### 2026-09-27 用户授权：Markdown 启动交付

移除项目根五个 .command 文件，统一为“启动与运行指南.md”供接收方 AI 执行；保留 code/scripts 内部编排，入口采用 npm start/stop/status 与 checkpoint/restore。DeepSeek 凭证由 OpenCode 桌面客户端保存于个人配置，启动器不再读取项目目录 model.env。验证文档引用、npm入口与实际启动健康；本机桌面版安装与配置界面确认后记录版本。此增量纳入 T5.1，不改变原项目待验范围。


### 2026-09-27 用户授权：OpenCode 版本与个人凭证统一

桌面客户端只管理个人密钥，后台使用同版 CLI。统一为 2.0.18（CLI 包 @opencode/cli），通过 CLI 认证状态接口检查客户端连接，不读取旧版 auth.json。迁移运行参数、任务工作目录与原生 Skill 事件字段；验收包含凭证识别、真实调用、Skill 输出契约、项目重启健康。保持 T5.1 进行中。


### 2026-09-27 移除重复的凭据配置入口

按用户明确要求，删除“凭据配置”菜单、图标、路由及重复页面组件。保留“映射配置”与“变更历史”。该入口实际只筛选 CONFIGURATION/READY 事项，无独立密钥管理功能。范围限前端入口清理，检查残留引用与前端构建；不继续执行已通过的模型和业务链路验证。T5.1 保持进行中。

验证结果：前端类型检查与生产构建通过；源码残留引用为零；Safari 确认菜单移除、映射配置列表正常。


### 2026-09-27 用户授权：页面切换账号

T5.1 增量：右上角增加账号选择与搜索；本地 mock 登录接口仅列出已配置且有效的人类账号，由服务端核实目标身份后设置 HttpOnly 会话 Cookie。前端切换后返回首页、重新取得身份与业务数据，并通知同浏览器其他标签同步；开发代理只在没有会话凭据时使用启动默认账号。运行开关仅由本地启动器开启，生产/真实来源模式禁用。验收限切换读链路、权限隔离、非法账号及来源拒绝、刷新保留和页面回显，不重跑模型分析。依据为用户本轮要求及 01-subprd-workbench-items §3.1、workbench-apis §1 的本地登录扩展。

验证结果：2026-09-27：网页右上角“切换账号”已实现，可搜索104个已有有效人类账号；切换后返回首页并按新身份重新取数，刷新保留选择，同浏览器其他标签同步。新增5项身份边界测试、前端10项、前后端类型检查与构建通过；实际代理切换核查/服务商/对账账号，服务进程不重启，数据范围正确。本轮未重跑模型或提交业务操作。 见[切换验证](../08-test-reports/account-switch-20260927.md)。T5.1保持进行中。


### 2026-09-27 用户授权：京东账号合并

将核查、对账、履约三个京东账号统一为 acc-jd-business / 京东业务账号；同一主体拥有三组既有动作，页面按一个账号操作。来源身份接口、首次生成、已有身份升级、当前未完成事项责任迁移及后续责任分配必须一致。历史操作及已完成事项不改，服务商账号不合并，旧本地会话兼容到新主体。验收限身份授权、责任迁移幂等与实际读取/可用动作，不重跑模型。T5.1保持进行中。


验证结果：京东核查、对账、履约已统一为 acc-jd-business / 京东业务账号；来源首次生成及已有环境升级同步，未完成800条核查和300条对账事项归入同一主体，历史操作及已完成事项保留。旧本地会话自动兼容；Safari确认账号列表只显示一个京东业务账号，服务商账号保持独立。新增4项合并测试及5项切换测试通过，API/模拟服务类型检查、前端类型检查与构建通过；未重跑模型。启动健康为1000工单、1400可见事项、1100京东负责事项。T5.1仍进行中。 见[合并验证](../08-test-reports/jd-account-merge-20260927.md)。


### 2026-09-27 用户授权：每家服务商一个账号

同一服务商账号统一承担本公司的接入配置、安装资料、补充回复与对账回复，按服务商隔离，不再分内部登录角色。停用公共 acc-jd-config，现有配置事项按所属服务商迁移；历史留存，旧公共会话返回默认京东账号，旧服务商会话保留。首次生成和已有环境升级一致，补齐对账回复责任分配。验收仅含账号权限、跨服务商拒绝、待办迁移幂等、页面与启动检查，不重跑模型分析。沿用 T5.1 进行中；依据用户本轮明确指令及 PRD 01 §3.1、03 §1、06 §1。

验证结果：每家服务商统一一个账号，拥有本公司的接入配置、安装资料、补充与对账回复权限，页面统一显示“服务商”；公共 acc-jd-config 停用并从切换列表移除。100条配置事项按所属公司迁移，历史保留。标准账号现为京东1个+服务商100个。实际核对100家公司全部授权范围仅含自身，001/002账号配置跨公司读取双向404；隔离测试覆盖跨公司修改拒绝、迁移幂等及后续责任分配。原1000工单/1400事项保留，首次生成与旧环境升级一致。新增4项服务商账号测试、4项京东账号/生成回归及5项既有切换测试通过；模拟服务类型检查、前端类型检查与构建通过；Safari确认账号名称与列表。未重跑模型或提交业务决定，T5.1保持进行中。 [服务商账号验证](../08-test-reports/provider-account-merge-20260927.md)。


### 2026-09-27 用户授权：对账与映射配置表格列表

将“业务对账”“接入映射配置”两页由叙述事项行改为标准表格，分列显示业务编号/配置名称、服务商、状态、金额（对账）、分析状态（配置）、责任人、更新时间和详情入口；提供责任范围、状态、服务商及关键词筛选，分页与每页条数、刷新和重置。沿用现有有权限的列表 API，不按行额外请求详情，不推断配置启用状态。验收两页真实数据显示、筛选空态与重置、分页、详情跳转、窄屏横向滚动及控件等高。仅前端和对应文档，不修改后台任务或触发模型；T5.1保持进行中。

验证结果：业务对账、接入映射配置两页已改为标准表格，增加责任范围/状态/服务商/关键词筛选、重置、刷新、10/20/50条分页与详情入口；对账金额分列右对齐，非零差额标红，配置列表独立显示处理状态与分析状态。Safari实查300条对账和100条配置，工单精确查询、空态/清除筛选、第二页、每页20条及配置详情跳转通过；窄屏筛选换行、表格保留列宽和固定操作列已视觉检查。前端类型检查与生产构建通过。此次仅修改前端展示，未提交额外分析请求；既有后台自动分析仍按原设置运行。T5.1保持进行中。 [列表验证](../08-test-reports/business-tables-20260927.md)。


### 2026-09-27 用户授权：首页统计卡片进入对应事项

将首页四张统计卡片改为可点击入口，进入“我负责的”事项并带入与统计完全相同的状态组合；零条同样可进入空列表。列表服务支持受枚举校验的多个状态并集，权限与责任范围仍由服务端限制；筛选写入页面地址，刷新、前进后退保留，状态选择器回显对应分组并可改选单一状态。验收四类入口、零条、列表分页与汇总一致性、非法状态及权限隔离，不触发额外分析。T5.1保持进行中。

验证结果：首页四张统计卡片已改为整卡链接，进入“我负责的”并带入同组状态；零条可进入空态。服务端增加多个合法状态的并集筛选，列表与汇总共用权限、责任范围和过滤条件；页面地址保留筛选及页码，刷新和浏览器后退能恢复。Safari逐一验证四卡、零条、第二页和刷新；前端11项、后端事项读取7项测试通过，前后端类型检查和前端构建通过。没有提交额外分析或业务写入，既有后台自动分析继续运行。T5.1保持进行中。 [卡片验证](../08-test-reports/overview-card-navigation-20260927.md)。


### 2026-09-27 用户授权：恢复服务商名称及持续同步

依据工单查询PRD 02 §3.1和用户本轮缺陷反馈，补齐模拟安装系统的服务商名录投影与授权查询、业务服务经HTTP同步名称，并修复已有环境。旧来源只迁移已保存且可明确识别的公司账号名称，新生成数据直接取provider事实；不以账号名称作为日常查询来源。启动及来源检查补上幂等同步，工单页面名称缺失时显示已有编号。验收100家公司/1000张工单名称、筛选、跨公司隔离、首次生成与旧环境重复执行；不重置工单或运行额外分析。T5.1保持进行中。


### 2026-09-27 用户最终授权：mock全部分析改为手动

覆盖此前自动分析与仅暂停对账的口径。mock环境默认不领取未被前端显式触发的分析准备、模型分析与配置试转换；旧排队任务同样等待新按钮请求，旧自动恢复记录不作为手动授权。四类Skill详情提供运行分析按钮及用户指定的mock演示说明；点击仅放行该事项当前分析代次，刷新/重启保留。新来源与配置变更触发的新代次仍等待点击，禁用启动器自动批量重分析。现场已终止在跑对账及执行器，重新启动前须证明不会自动领取。验证仅用隔离数据库验证触发执行，现场不点击按钮调用模型。T5.1仍进行中。


### 2026-09-27 用户补充：分析前可读业务资料与服务商上传

京东侧与对应服务商可在事项详情读取来源资料、配置样例、格式说明、原文件及本地已上传文件，不依赖模型分析完成。运行配置分析仍由所属服务商触发，不扩大京东侧办理权限。补齐配置与资料整理页显式上传入口，保留服务商隔离；上传只准备材料，mock新分析代次继续等待手动运行。验收只读无任务新增、双方可读、跨公司拒绝、原文件与实际上传闭环，现场不额外调用模型。T5.1保持进行中。


### 2026-09-27 用户最新授权：十家服务商与可操作演示

覆盖旧百家规模：标准启动严格10家服务商、100工单；旧库整体归档，新生成源字段、说明和Excel共用事实。配置页前置Excel下载/上传及表格预览，业务文案使用中文字段，技术信息折叠。修复差额行加50却未调整数量单价的造数缺陷，保留明确异常；逐项一致由程序校验、不调用模型，真实差额交由AI解释后人员核实。验收需覆盖真实文件、全部10家公司、差额与一致分支、前端实际操作及幂等重启。T5.1仍进行中，未扩大为全项目验收。


## 2026-09-27 当前口径：十家服务商与可操作演示

默认数据集已改为 demo-10-v2：严格10家服务商、100张工单、154项，京东1个+服务商10个账号；旧100家环境整库归档，不进入当前列表。映射页顶部可下载样表、真实上传Excel、查看原表与中文字段对应及实际转换输出。服务商002上传17.25与0的明细，真实模型映射和试转换通过；001原样表试转换通过。京东可读取双方材料及结果，服务商之间保持隔离。

对账源数据纠正只改金额、字段说明不符与跨工单无分摊问题：44单中10单逐项一致、29单正常差额、5单明确异常。逐项一致跳过AI；WO-2609-0061差额30元已真实解释并进入待确认。全部模型分析仅由单项详情手动触发，上传仅离线解析。安装工单服务商名录已改为启动及持续同步。61项定向测试、源数据校验和类型/构建检查通过。业务T5.1仍进行中，其余未验收范围不变。
证据：[本轮验证报告](../08-test-reports/demo-quality-20260927.md)。


2026-09-27：[十家服务商四个 Skill 完整改造](four-skills-demo-implementation-20260927.md)已完成实施与本轮本地验收。本地演示改造已完成并验收：demo-10-v4 固定10家服务商、100工单、154初始事项；四类 Skill 的代表业务链路均已真实运行，覆盖映射启用后复用、安装提取与提交、京东核查、退回上传补充再确认、单价及数量差异。逐项一致账单不调用 AI。17份实际上传文件及逐步 README 已放入“测试用上传数据”。169项自动回归、37项来源校验、类型检查与构建通过；最终回滚并重启后全部待手动运行，模型任务和业务写入均为0。旧百家规模、自动分析和缺模型凭证的历史描述已被本条覆盖。 [验收报告](../08-test-reports/four-skills-demo-20260927/README.md)。T5.1 其余范围状态保持。


2026-09-27 本地文件清理：用户要求删除无用测试过程文件；已释放12.32GB，保留当前数据、17份演示文件、有效回滚基线及正式验收证据。运行服务检查正常。本轮不改变任务验收范围。
