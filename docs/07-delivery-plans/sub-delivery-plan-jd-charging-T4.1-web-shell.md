# T4.1 前端骨架与会话

## 任务来源

- 主开发计划：[main-delivery-plan-jd-charging.md](main-delivery-plan-jd-charging.md)
- 任务看板：[task-kanban-jd-charging.md](task-kanban-jd-charging.md)

#### T4.1 实现前端骨架、页面、嵌入视图与会话初始化

**Requirement ID**：REQ-WEB-01

**PRD 双链·读**：
- `docs/05-prd/mainprd-jd-charging.md` §五（页面结构与接口调用全景）、§三（前端是纯渲染层）
- `docs/02-prototype/page-list.md` §1—§2（15 个页面 / 视图基线）
- `docs/02-prototype/interaction-spec.md`（交互基线）
- `rules/runtime-mock-data.md` §2

**核心逻辑**：
- 以原型为交互基线搭建 React+Vite+TS 前端：页面和嵌入视图按原型各自的入口实现；原始证据使用业务页面内侧栏，不建立独立材料查询页面；初始化先调 `GET /session` 取得身份与权限，再按页面调对应读取接口。
- 前端只做渲染与界面状态（表单输入、选择项、展开状态），不做业务判断；深链接打开任何页面先完成身份范围检查再渲染。
- 操作后区域联动：先骨架屏后替换渲染（mainprd §5.3）。

**核心文件**：
- `code/web/src/main.tsx`、`code/web/src/router.tsx`（新建）
- `code/web/src/api/client.ts`（统一 API 封装，新建）
- `code/web/src/stores/session.ts`（新建）
- `code/web/src/pages/`（按原型页面和嵌入视图分别实现）

**完成标准**：
- 按 page-list.md §1 逐项核对页面与视图的业务入口。原始证据侧栏从工单、事项或处理记录进入，不按页面 / 视图总数凑独立路由，不要求业务人员输入内部材料版本编号。
- 首屏网络面板中首个业务请求为 `/api/admin/charging/session`；无任何静态 JSON / localStorage / 请求拦截器充当业务数据（代码检查确认）。
- 无权限深链接按 T1.1 裁决口径呈现受控响应页，不渲染业务内容。
- 操作后目标区域出现骨架屏再替换为接口返回内容（交互录制或逐帧截图核对）。

**Verification Method**：
- 本地启动前后端，真实走查原型清单中的页面和嵌入视图入口；浏览器开发者工具核对请求顺序与来源；截图存 `pwScreenShot/`。

**Evidence**：
- `pwScreenShot/` 下 页面、嵌入视图截图与会话请求时序；当日开发日志记录走查结论。

**Failure Handling**：
- 后端接口未就绪的页面留真实空态 / 失败态，不用假数据填充。
- 原型与 PRD 交互口径冲突时以 PRD 为准并登记差异，`AI 执行 -> 人审核`。

**完成收尾：状态同步**：
- 本 Task 完成实现和验证后，把完成事实、验证证据、完成日期和建议下一 Task 同步回写三处：`main-delivery-plan-jd-charging.md` 执行阶段表、`task-kanban-jd-charging.md` 对应行、本子开发计划的 `**状态**` 字段。
- 同步更新 `docs/00-process/00-02-progress/progress.md` 的进度快照。
- 回写后重新运行 `node .agent/skills/delivery-planner/scripts/check-plan-consistency.mjs docs/07-delivery-plans/main-delivery-plan-jd-charging.md --json`，确认三处一致；未通过前不得宣称本 Task 已完成。

**Owner**：AI 执行 -> 人审核

**前置**：T1.1

**状态**：已完成（2026-09-20）


### 2026-09-27 材料入口纠正

2026-09-27：移除独立材料浏览菜单、首页入口与路由，保留业务内原文查看；修正 T4.1 将页面/视图数量等同路由数量的验收口径。构建及 10 项既有前端测试通过，Safari 检查入口已消失。空数据已定位为当前业务库未导入、默认来源账号类型与服务商授权范围不匹配、来源监测未启动；历史数据导入属于隔离验收环境，当前未恢复。详见[核查记录](../08-test-reports/material-entry-root-cause-20260927.md)。整体任务验收状态不变。

2026-09-27：对账两个重复列表合并为单一“业务对账”入口，`/billing/orders` 为当前入口，`/billing/work-orders` 保留旧链接兼容。原型和 06-subprd-reconciliation §2 定义的三视图保持；列表/详情/原应收视图不等同三个侧栏菜单。
