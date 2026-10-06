# T2.3 后台任务程序与分析准备链路

## 任务来源

- 主开发计划：[main-delivery-plan-jd-charging.md](main-delivery-plan-jd-charging.md)
- 任务看板：[task-kanban-jd-charging.md](task-kanban-jd-charging.md)

#### T2.3 实现后台任务程序、统一取数与 Skill 结果入库

**Requirement ID**：REQ-ANALYSIS-01

**PRD 双链·读**：
- `docs/03-foundation/03-07-system-flows/sys-analysis-preparation.md` §1—§5
- `docs/03-foundation/03-06-provided-apis/execution-apis.md` §4（本地 Node 任务运行）
- `docs/04-skills/README.md` §2—§3
- `code/skill-runtime/README.md`（run-local / contract / transform）
- `rules/Cloudflare支持技术栈.md` §2「本地业务 Skill 运行」

**核心逻辑**：
- 实现独立 Node 后台任务程序的 HTTP 服务：Worker 经本地 HTTP 与其交互，Worker 不直接启动 CLI 子进程。
- 后台统一取数：按事项经适配层（T2.1）分别读取各外部系统，固定来源版本快照；转换与确定性计算由程序执行（复用 skill-runtime transform.mjs），Skill 只做规则生成与证据判断（复用 run-local.mjs / contract.mjs，不改动已验收包）。
- 结果经 contract 校验后入库（evidence 域），随后生成或更新处理事项；分析失败以真实状态进入待处理（分析失败恢复场景），不回退固定答案。
- 已成功回复触发的新输入按 sys-analysis-preparation §5 进入新快照。

**核心文件**：
- `code/api/src/services/analysis-dispatch.ts`（Worker 侧调度，新建）
- `code/task-runner/`（后台 Node 任务程序：HTTP 服务、取数、快照、Skill 调用、结果回传，新建）
- 复用 `code/skill-runtime/`（只读，不改动）

**完成标准**：
- 变化批次到达后，后台任务程序经内部路由领取任务、完成取数与快照固定，快照内容可回查且含来源版本。
- 真实 OpenCode + 业务 Skill 运行结果经 contract 校验入库；校验失败不写入，任务以失败状态呈现。
- 分析完成后对应事项生成 / 更新，work-items 查询可见分析结果与待核实问题；重复运行不重复建事项。
- AI_MODE=mock 与真实 Skill 运行分开配置、分开记录；真实失败不降级为固定答案。

**Verification Method**：
- 端到端跑通单事项分析闭环：注入变化批次 → 领取 → 取数快照 → Skill 运行 → 入库 → 事项可见，逐环节 D1 / 接口回查；构造分析失败场景核对状态呈现。

**Evidence**：
- 当日开发日志：闭环各环节回查记录、agent-runs 与快照样例；Skill 运行证据沿用 PHASE-16 口径（原生 skill 装载、工具事件、实际输出、运行参数）。

**Failure Handling**：
- 已通过验收的 8 个 Skill 场景不重复调用；新增链路验证用新输入，模型调用记录版本。
- mock 专题未交付导致外部取数不可用时，用 T2.1 stub 验证程序逻辑并明确标注，闭环结论留待 T5.1。
- OpenCode / 模型环境缺失时阻塞真实 AI 验证，不用 AI mock 冒充。

**完成收尾：状态同步**：
- 本 Task 完成实现和验证后，把完成事实、验证证据、完成日期和建议下一 Task 同步回写三处：`main-delivery-plan-jd-charging.md` 执行阶段表、`task-kanban-jd-charging.md` 对应行、本子开发计划的 `**状态**` 字段。
- 同步更新 `docs/00-process/00-02-progress/progress.md` 的进度快照。
- 回写后重新运行 `node .agent/skills/delivery-planner/scripts/check-plan-consistency.mjs docs/07-delivery-plans/main-delivery-plan-jd-charging.md --json`，确认三处一致；未通过前不得宣称本 Task 已完成。

**Owner**：AI 执行 -> 人审核

**前置**：T2.2

**裁决与偏差记录（2026-09-20）**：
- 取数入口裁决：agent-runs POST（operation=ANALYZE_SKILL 且 analysisInput 带 workItemId）由 Worker 服务端统一取数（经 T2.1 适配层读外部上下文）、固定快照与 inputDigest 后注册任务与 capability_call；预制 records 的旧路径保留。
- 采用逻辑：reportResult 对 ANALYZE_SKILL+SUCCEEDED 同步执行结果校验（status/summary/findings/openQuestions 规则）→ analysis_result 入库 + 事项指针 CAS + ANALYSIS_COMPLETED 活动；校验失败不写入，job 转 FAILED（ANALYSIS_RESULT_INVALID）。
- Node 任务程序只经内部路由交互（claims/dispatch-start/results），不直接写 D1；执行复用 skill-runtime run-local.mjs（OpenCode + 已验收 Skill 包，未改动）。
- 开发验证用 stub-external（仅上下文端点），不代替 mock 专题验收；真实联调留待 T5.1。

**状态**：已完成（2026-09-20）
