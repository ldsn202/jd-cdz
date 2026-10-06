# T4.2 工作台总览与工单追溯页面

## 任务来源

- 主开发计划：[main-delivery-plan-jd-charging.md](main-delivery-plan-jd-charging.md)
- 任务看板：[task-kanban-jd-charging.md](task-kanban-jd-charging.md)

#### T4.2 实现待处理事项、工单列表 / 详情、处理记录与证据侧栏页面

**Requirement ID**：REQ-WB-01、REQ-ORD-01

**PRD 双链·读**：
- `docs/05-prd/01-subprd-workbench-items.md` §2、§3、§7
- `docs/05-prd/02-subprd-orders-history.md` §2、§3、§7
- `docs/06-testcase/workbench/tc-workbench.md`、`docs/06-testcase/orders/tc-orders.md`（UI 号段）

**核心逻辑**：
- 实现 01 / 02 子 PRD 对应页面：待处理事项（身份区、汇总区、筛选区、列表区、分页区）、安装工单列表 / 工单详情、处理记录页、原始证据侧栏。
- 每区块字段、排序、空态、分页按子 PRD §3 逐块实现；数据全部来自 T1.2 / T1.3 接口；缺数据与无权限按各页异常兜底口径呈现真实状态。

**核心文件**：
- `code/web/src/pages/workbench/`（事项页区块组件，新建）
- `code/web/src/pages/orders/`（工单列表 / 详情 / 记录 / 证据侧栏，新建）

**完成标准**：
- 事项页五区块字段与 01-subprd §3.1—3.5 逐块一致；筛选 / 分页触发对应接口参数（网络面板核对）。
- 工单列表与详情展示聚合字段与 02-subprd §3.1—3.2 一致；处理记录与证据侧栏内容来自 activities / material-versions 接口。
- 空态、越权、接口失败三类状态的页面呈现与 §3 异常兜底口径一致。
- TC-WB / TC-ORD UI 号段中可执行用例通过。

**Verification Method**：
- 受控数据下逐页真实走查并截图；逐区块对照 PRD 字段清单；执行 UI 号段可执行用例。

**Evidence**：
- `pwScreenShot/` 页面截图；TC 执行结果记入 `docs/08-test-reports/`；当日开发日志。

**Failure Handling**：
- 依赖的查询接口行为与 PRD 不符时回到对应服务端 Task 修正，不在前端修补数据。
- 截图与 PRD 布局存在理解分歧时 `AI 执行 -> 人审核`。

**完成收尾：状态同步**：
- 本 Task 完成实现和验证后，把完成事实、验证证据、完成日期和建议下一 Task 同步回写三处：`main-delivery-plan-jd-charging.md` 执行阶段表、`task-kanban-jd-charging.md` 对应行、本子开发计划的 `**状态**` 字段。
- 同步更新 `docs/00-process/00-02-progress/progress.md` 的进度快照。
- 回写后重新运行 `node .agent/skills/delivery-planner/scripts/check-plan-consistency.mjs docs/07-delivery-plans/main-delivery-plan-jd-charging.md --json`，确认三处一致；未通过前不得宣称本 Task 已完成。

**Owner**：AI 执行 -> 人审核

**前置**：T1.2、T1.3、T4.1

**状态**：已完成（2026-09-20）
