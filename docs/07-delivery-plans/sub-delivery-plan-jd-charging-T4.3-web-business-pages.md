# T4.3 业务处理页面（03—07）

## 任务来源

- 主开发计划：[main-delivery-plan-jd-charging.md](main-delivery-plan-jd-charging.md)
- 任务看板：[task-kanban-jd-charging.md](task-kanban-jd-charging.md)

#### T4.3 实现接入配置、安装资料、安装核查、业务对账、履约协同页面

**Requirement ID**：REQ-CFG-01、REQ-INS-01、REQ-REV-01、REQ-REC-01、REQ-COO-01

**PRD 双链·读**：
- `docs/05-prd/03-subprd-provider-config.md` §2、§3、§7
- `docs/05-prd/04-subprd-installation-materials.md` §2、§3、§7
- `docs/05-prd/05-subprd-installation-review.md` §2、§3、§7
- `docs/05-prd/06-subprd-reconciliation.md` §2、§3、§7
- `docs/05-prd/07-subprd-coordination.md` §2、§3、§7
- `docs/06-testcase/` 对应五域 UI 号段

**核心逻辑**：
- 实现五组业务页面：接入事项列表 / 服务商接入配置、安装资料确认（含上传入口）、安装核查详情 / 费用依据核查 / 分析失败恢复、业务对账列表 / 差异详情 / 服务商原应收、履约协同详情。
- 写操作全部走 T3.x 接口：版本冲突、重复提交、结果未知、分析失败等异常按各子 PRD §3 异常兜底口径真实呈现；操作成功后事项状态与待处理列表联动更新。

**核心文件**：
- `code/web/src/pages/config/`、`code/web/src/pages/installation/`、`code/web/src/pages/review/`、`code/web/src/pages/reconciliation/`、`code/web/src/pages/coordination/`（新建）

**完成标准**：
- 页面结构、信息层次与视觉效果按已确认的 `docs/02-prototype/index.html` 原型实现，区块字段与各自子 PRD §2—§3 一致；写操作请求参数与接口契约一致。现有低于原型的 UI 正在返工。
- 版本冲突、重复提交、结果未知回查、分析失败四类异常路径在页面上呈现真实状态，无成功假象。
- 完成提交 / 决定 / 处理操作后，返回待处理事项页可见状态联动更新。
- 按用户本轮典型验收要求，所选页面与操作有真实浏览器证据；未执行 UI 编号保留未测，不因组件构建通过而标记整域 UI 通过。

**Verification Method**：
- 原型与实际页面逐屏比对后，选取典型页面、完整操作及关键异常路径真实走查并截图；不扩展为五域全部 UI 编号逐条执行。

**Evidence**：
- `pwScreenShot/` 页面与异常路径截图；TC 执行结果记入 `docs/08-test-reports/`；当日开发日志。

**Failure Handling**：
- 某写链路后端行为未达契约时回到对应 T3.x 修正，前端不兜底补数据。
- 联调依赖 mock 专题的页面路径（如真实来源变化驱动的更新）留待 T5.1，本 Task 不宣称该路径完成。

**完成收尾：状态同步**：
- 本 Task 完成实现和验证后，把完成事实、验证证据、完成日期和建议下一 Task 同步回写三处：`main-delivery-plan-jd-charging.md` 执行阶段表、`task-kanban-jd-charging.md` 对应行、本子开发计划的 `**状态**` 字段。
- 同步更新 `docs/00-process/00-02-progress/progress.md` 的进度快照。
- 回写后重新运行 `node .agent/skills/delivery-planner/scripts/check-plan-consistency.mjs docs/07-delivery-plans/main-delivery-plan-jd-charging.md --json`，确认三处一致；未通过前不得宣称本 Task 已完成。

**Owner**：AI 执行 -> 人审核

**前置**：T3.1、T3.2、T3.3、T3.4、T3.5、T4.1

**状态**：阻塞

验收状态仍为阻塞：用户明确指出当前 UI 低于原型，现已在 T5.1 收口期间执行按原型返工。返工后的典型浏览器操作与视觉比对尚待主代理验收；保留已有业务表单与数据链路，不标完工。
