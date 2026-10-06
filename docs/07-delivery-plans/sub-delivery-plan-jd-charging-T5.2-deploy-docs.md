# T5.2 部署与配置收口

## 任务来源

- 主开发计划：[main-delivery-plan-jd-charging.md](main-delivery-plan-jd-charging.md)
- 任务看板：[task-kanban-jd-charging.md](task-kanban-jd-charging.md)

#### T5.2 完成 09-deploy 四份文档并复核环境可复现

**Requirement ID**：REQ-DEPLOY-01

**PRD 双链·读**：
- `docs/09-deploy/README.md` 四文件约定与红线
- `code/README.md`「mock 与真实外部接口的切换」「验证口径」
- `rules/Cloudflare支持技术栈.md` §1—§2

**核心逻辑**：
- 收口四份文档：`local-setup.md`（从零到本地全栈启动，含 D1 migration、后台任务程序、模拟服务地址配置）、`cloud-deploy.md`（部署目标与发布 / 回滚步骤，云端运行 CLI 的环境单独确定，不假定普通 Worker 可运行本地命令）、`config-items.md`（全部环境变量终稿）、`api-keys.md`（密钥台账，不写真实值）。
- 测试 schema 口径写入文档：历史保护触发器与 INSERT 策略的统一约定（PHASE-18 记录）须在 local-setup 中明确，测试库与本系统库、模拟来源库分开。

**核心文件**：
- `docs/09-deploy/local-setup.md`、`docs/09-deploy/cloud-deploy.md`、`docs/09-deploy/config-items.md`、`docs/09-deploy/api-keys.md`（新建 / 收口）

**完成标准**：
- 按 local-setup.md 在干净环境（新终端、新本地库）逐步执行可复现 T5.1 联调环境，步骤无缺失、无口头补充。
- config-items.md 覆盖代码中实际读取的全部环境变量（代码扫描核对，含 EXTERNAL_MODE / AI_MODE / 模拟服务地址 / D1 绑定 / 上传存储）。
- api-keys.md 逐项登记密钥用途、申请渠道、存放位置，全文无真实密钥值（扫描确认）。
- cloud-deploy.md 明确云端暂不部署的口径与后续接入步骤，不虚构已部署地址。

**Verification Method**：
- 干净环境按文档实操复现一次；代码扫描比对环境变量清单与文档登记；扫描 api-keys.md 确认无真实值。

**Evidence**：
- 当日开发日志：复现过程记录、扫描命令与结果。

**Failure Handling**：
- 复现过程中任何一步需要口头补充才能成功，先改文档再复测。
- 云端部署参数未确认的部分标 `[待确认]`，不编造。

**完成收尾：状态同步**：
- 本 Task 完成实现和验证后，把完成事实、验证证据、完成日期和建议下一 Task 同步回写三处：`main-delivery-plan-jd-charging.md` 执行阶段表、`task-kanban-jd-charging.md` 对应行、本子开发计划的 `**状态**` 字段。
- 同步更新 `docs/00-process/00-02-progress/progress.md` 的进度快照。
- 回写后重新运行 `node .agent/skills/delivery-planner/scripts/check-plan-consistency.mjs docs/07-delivery-plans/main-delivery-plan-jd-charging.md --json`，确认三处一致；未通过前不得宣称本 Task 已完成。

**Owner**：AI 执行 -> 人审核

**前置**：T5.1

**状态**：待审阅


### 2026-09-21 执行检查点

按用户本轮授权推进；T4.3正式UI与完整后台前置仍待验收，当前开展缺陷修复及可独立验证部分，不代表前置已通过。证据见[工程记录](../08-test-reports/T5.1-engineering-20260921/README.md)。

当前集中推进T5.1的后台依赖；本任务已完成的代码/文档保留，待该依赖具备验收条件后继续收口。


### 2026-09-27 本地启动记录

2026-09-27：按用户要求启动现有项目。独立 Node.js v25.8.1 与 npm 位于 `/tmp/jd-charging-tools/node-v25.8.1-darwin-arm64/bin/`；依赖已按锁文件安装，前端构建通过，9 份本地迁移及开发身份初始化成功。前端 http://127.0.0.1:5174、API 8788、模拟来源 8790、后台任务程序均已启动。Safari 实际打开工作台，开发会话、概览和事项接口返回 200。当前业务库为空，模拟来源已生成但未导入业务库；AI_MODE=mock。仅确认本地启动成功，不改变 T4.3/T5.1/T5.2 原有验收状态。进程及日志见 `/tmp/jd-charging-tools/pids.json` 与同目录 `*.log`。


### 2026-09-27 数据恢复与统一启动结果

2026-09-27：标准 mock 数据恢复与统一启动完成，1000 工单、1400 事项（核查账号负责 800）；停止—重启保持工单/事项编号与授权记录、621 份已保存文件摘要不变。新增项目根启动/停止脚本及 README，后续启动复用数据。修复无效 file-service 订阅与 Safari 筛选控件高度。真实 AI 未启用，原项目整体验收状态保持。详见 [恢复与启动验收](../../../../04-分析/本地数据恢复与启动修复.md)。
