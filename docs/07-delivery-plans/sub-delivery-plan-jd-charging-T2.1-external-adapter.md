# T2.1 外部依赖适配层与模式切换

## 任务来源

- 主开发计划：[main-delivery-plan-jd-charging.md](main-delivery-plan-jd-charging.md)
- 任务看板：[task-kanban-jd-charging.md](task-kanban-jd-charging.md)

#### T2.1 实现外部依赖适配层与 EXTERNAL_MODE / AI_MODE 切换

**Requirement ID**：REQ-EXT-ADAPT-01

**PRD 双链·读**：
- `docs/03-foundation/03-02-external-apis/README.md` 与十二份契约（external-dependency-list.md 为索引）
- `rules/runtime-mock-data.md` §2—§3
- `rules/Cloudflare支持技术栈.md` §2「外部接口与 mock」
- `code/README.md`「mock 与真实外部接口的切换」

**核心逻辑**：
- 按十二份外部契约定义本系统侧 TS 客户端接口（读取、写入、回查、变化发现逐接口独立），服务端业务代码只依赖适配层，不直接拼外部地址。
- `EXTERNAL_MODE=mock|real` 在适配层路由：mock 通道指向模拟服务地址（配置项登记 config-items.md），real 通道保留真实接入实现位；`AI_MODE=mock|real` 独立控制 AI 分析来源，AI mock 结果必须标记来源，不算真实 Skill 验收。
- 模拟服务本身的实现、数据生成与故障入口属 mock 数据专题（独立开发计划），本 Task 只消费其接口，不实现、不改动。

**核心文件**：
- `code/api/src/services/external/` 适配层目录（按外部系统一系统一客户端，新建）
- `code/api/src/lib/mode.ts`（模式解析与开关，新建）
- `docs/09-deploy/config-items.md`（追加模拟服务地址等配置项）

**完成标准**：
- 适配层覆盖十二份契约的全部读取 / 写入 / 回查方法，方法签名与契约字段逐字一致。
- EXTERNAL_MODE 切换经配置生效：mock 通道请求真实发出到配置的模拟服务地址；real 通道在未配置密钥时返回受控错误而非静默降级。
- 本系统业务代码（routes/services）不出现外部地址与模拟数据字面量（代码检查确认）。
- AI mock 返回在数据链路中带来源标记，可被查询区分。

**Verification Method**：
- 单测 + 真实 HTTP 请求核对：以本地 stub HTTP 服务充当模拟服务端点验证适配层收发结构（stub 仅验证适配层，不替代 mock 专题验收）；切换 EXTERNAL_MODE 验证路由行为。

**Evidence**：
- 当日开发日志：请求 / 响应样例、模式切换行为记录、代码检查命令与结果。

**Failure Handling**：
- mock 专题未交付前，mock 通道端到端行为记阻塞并写入风险；T5.1 前不得用 stub 结果宣称联调完成。
- 契约缺口（字段 / 路径缺失）先同步 03-02 契约文档再开发，不由调用方补字段。

**完成收尾：状态同步**：
- 本 Task 完成实现和验证后，把完成事实、验证证据、完成日期和建议下一 Task 同步回写三处：`main-delivery-plan-jd-charging.md` 执行阶段表、`task-kanban-jd-charging.md` 对应行、本子开发计划的 `**状态**` 字段。
- 同步更新 `docs/00-process/00-02-progress/progress.md` 的进度快照。
- 回写后重新运行 `node .agent/skills/delivery-planner/scripts/check-plan-consistency.mjs docs/07-delivery-plans/main-delivery-plan-jd-charging.md --json`，确认三处一致；未通过前不得宣称本 Task 已完成。

**Owner**：AI 执行 -> 人审核

**前置**：T0.1

**裁决与偏差记录（2026-09-20）**：
- AI_MODE=real 的 Worker 侧入口为 TASK_RUNNER_BASE_URL（后台任务程序本地 HTTP，T2.3 实现）；AI_MODE=mock 走 MOCK_BASE_URL 的 ai-runs 端点，两者分开配置、分开报错，不回退固定答案。
- real 业务通道以 EXTERNAL_REAL_BASE_URL 为唯一配置；未配置时受控 50301，不降级为 mock。
- 验证口径：node --test 以本地 stub HTTP 服务验证适配层收发（stub 仅验证适配层，不代表 mock 专题验收）；端到端 mock 通道联调留待 T5.1。

**状态**：已完成（2026-09-20）
