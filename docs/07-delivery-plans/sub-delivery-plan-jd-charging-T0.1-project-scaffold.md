# T0.1 工程骨架与运行配置登记

## 任务来源

- 主开发计划：[main-delivery-plan-jd-charging.md](main-delivery-plan-jd-charging.md)
- 任务看板：[task-kanban-jd-charging.md](task-kanban-jd-charging.md)

#### T0.1 建立工程骨架与运行配置登记

**Requirement ID**：REQ-JDCHARGE-BASE-01

**PRD 双链·读**：
- `code/README.md` 目录结构与「mock 与真实外部接口的切换」
- `rules/Cloudflare支持技术栈.md` §1—§2、§4
- `docs/09-deploy/README.md` 四文件约定
- `docs/05-prd/mainprd-jd-charging.md` §三（系统架构与全局设计原则）

**核心逻辑**：
- 按技术栈规则唯一组合落地空工程：web（React+Vite+TS）、api（Hono+TS Worker）、wrangler.jsonc（Worker、静态资源、D1 绑定）、packages/shared（可选共享类型）。
- EXTERNAL_MODE / AI_MODE 开关是运行数据规则 §2 的硬要求，必须先登记到 `docs/09-deploy/config-items.md` 再在代码中使用；密钥登记进 `api-keys.md` 台账格式（不写真实值）。
- 技术判断（构建配置、目录细化）默认 `AI 执行 -> 人审核`。

**核心文件**：
- `code/api/package.json`、`code/api/src/index.ts`（新建）
- `code/web/package.json`、`code/web/vite.config.ts`（新建）
- `code/wrangler.jsonc`（新建）
- `code/.env.example`（新建）
- `docs/09-deploy/config-items.md`、`docs/09-deploy/api-keys.md`、`docs/09-deploy/local-setup.md`（新建）

**完成标准**：
- `code/api`、`code/web` 依赖安装后 `npm run dev` 可启动，API 健康检查路径返回 200，前端默认页可打开。
- `code/wrangler.jsonc` 含 D1 绑定声明，`npx wrangler d1 list` 可识别。
- `docs/09-deploy/config-items.md` 至少登记 `EXTERNAL_MODE`（mock|real，本地默认 mock）、`AI_MODE`（mock|real）两项，含用途、本地值、必填列。
- `docs/09-deploy/local-setup.md` 写出从零到启动的逐步命令，与实际工程一致。

**Verification Method**：
- 在本机依次执行 local-setup.md 中的安装与启动命令，真实启动两个 dev server 并请求健康检查与首页。

**Evidence**：
- 当日开发日志（`docs/00-process/00-01-logs/YYYYMMDD.md`）：启动命令、响应样例；首页截图存 `pwScreenShot/`。

**Failure Handling**：
- Wrangler / D1 本地能力与规则文档不一致时，先记录差异并 `AI 执行 -> 人审核`，不改技术栈选型。
- 配置项无法确定口径时阻塞该项并在 config-items.md 标 `[待确认]`，不编造默认值。

**完成收尾：状态同步**：
- 本 Task 完成实现和验证后，把完成事实、验证证据、完成日期和建议下一 Task 同步回写三处：`main-delivery-plan-jd-charging.md` 执行阶段表、`task-kanban-jd-charging.md` 对应行、本子开发计划的 `**状态**` 字段。
- 同步更新 `docs/00-process/00-02-progress/progress.md` 的进度快照。
- 回写后重新运行 `node .agent/skills/delivery-planner/scripts/check-plan-consistency.mjs docs/07-delivery-plans/main-delivery-plan-jd-charging.md --json`，确认三处一致；未通过前不得宣称本 Task 已完成。

**Owner**：AI 执行 -> 人审核

**前置**：无

**状态**：已完成（2026-09-20）
