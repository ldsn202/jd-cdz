# AGENTS.md — 项目入口

本文件是每次 AI 编程会话的唯一入口。先读本文件，再按任务类型加载规则和文档。仓库内没有 `opencode.json`，本文件即唯一指令入口。

## 1. 项目说明

| 项 | 内容 |
|----|------|
| 产品是什么 | 面向京东业务人员与本地安装服务商的充电桩安装信息管理平台，支持安装资料归集与业务协作 |
| 用户角色 | 京东业务账号统一承担资料核查、业务对账、履约协同；每家服务商一个账号，统一办理本公司接入配置、资料和对账回复，服务商之间隔离。当前账号行为见 PRD 01 §3.1 和启动指南 §6 |
| 项目 slug | jd-charging |
| 技术栈 | React + Vite + TypeScript 前端、Hono + TypeScript Worker 服务端、D1 数据库、R2 文件存储；本地业务服务、Node 后台任务程序和独立 mock 来源已有实现 |
| 本地启动 | 先读 [启动与运行指南.md](启动与运行指南.md)，由接收方 AI 安装依赖并执行 npm 编排，核对实际工单/事项。模型凭证保存在个人 OpenCode 配置；项目根不提供 .command 文件。 |
| 部署 | 待确认；尚未部署，无公开地址 |
| 当前阶段 | 截至 2026-09-27：默认来源 demo-10-v4（严格 10 家服务商、100 张工单、154 个初始事项），四类业务 Skill 已用真实 DeepSeek 模型实跑并验收，169 项自动回归、API/mock 类型检查与前端构建通过；已恢复干净基线，全部事项待手动运行、模型任务与外部写入为 0。T5.1 联调、T5.2 部署文档仍未收口，云端未部署、真实外部提供方未接通；未执行项不标通过，以 progress.md 与两份任务看板为准。 |

### 1.1 本地命令与环境要点

所有命令从项目根执行，统一用 `npm --prefix code ...`；编排实现在 `code/scripts/local-dev.mjs`。

| 命令 | 作用 |
|------|------|
| `npm --prefix code start`（或 `run dev`） | 安装/复用依赖、构建前端、迁移 D1、导入来源、启动后台与网页；首次较慢 |
| `npm --prefix code run status` | 查看五个服务状态；健康快照见 `code/.local/health.json` |
| `npm --prefix code stop` | 只停本编排拥有的进程，保留数据 |
| `npm --prefix code run checkpoint` / `run restore` | 保存/恢复业务库、R2、来源库与原文件的一致起点；未保存起点时拒绝恢复 |
| `npm --prefix code/api run typecheck`、`npm --prefix code/mocks run typecheck`、`npm --prefix code/web run build` | 三个改动后必跑的校验 |
| `npm --prefix code/web test`；`node --test <文件.test.mjs>` | 前端测试 / 单跑一个后端或脚本测试文件 |

- 网页 `http://127.0.0.1:5174`，本系统 API `:8788`，模拟来源 `:8790`；默认只监听 127.0.0.1。
- **平台限制**：统一编排按 macOS 验证，来源文件生成依赖 macOS `sips`；已安装的 OpenCode 二进制与平台绑定，跨系统复制的项目可保留版本号但无法运行。在 Windows/Linux 上不要照搬命令并宣称启动成功。已验证 Node.js 25.8.1。
- 启动器强制 `EXTERNAL_MODE=mock` + `AI_MODE=real`，而 `code/wrangler.jsonc` 的 vars 缺省为 `AI_MODE=mock`，两者不要混为一谈。桌面客户端与 CLI 统一锁定 **2.0.18**（`code/scripts/opencode-version.mjs`），凭证由个人 OpenCode 数据目录管理，项目不读取/创建密钥文件、不打印密钥。
- 运行数据不入库：`code/.local/`、`code/.wrangler/`、`code/mocks/.data/`、`node_modules/`、`dist/`、`code/task-runner/runs/` 与 `.env.local`。新增配置项先登记 `docs/09-deploy/config-items.md` 再使用。

## 2. 项目结构与关键文件索引

```text
<project-root>/
├── AGENTS.md                     # 本文件：唯一入口，只做路由，不承载细则
├── 启动与运行指南.md              # 启动/停止/回滚/分享的唯一操作指南
├── code/                         # 源代码（结构见 code/README.md）
│   ├── web/                      # 前端（React + Vite）；测试 tests/*.test.mjs
│   ├── api/src/routes/           # 本系统接口实现 ← 03-06-provided-apis
│   ├── db/migrations/            # D1 建表 SQL（0001—0009）← 03-05-schema
│   ├── mocks/<系统名>/           # 外部接口 mock ← 03-02-external-apis
│   ├── task-runner/              # 后台任务程序：领租约、解析材料、执行外部写入
│   ├── skill-runtime/            # 固定输入、装载业务 Skill、校验 analysis、试转换
│   └── scripts/local-dev.mjs     # 本地统一编排（start/stop/status/checkpoint/restore）
├── rules/                        # 规范权威源（登记见 §6）
│   ├── coding-standards/         # 编码规范
│   ├── Cloudflare支持技术栈.md    # 技术栈默认口径
│   ├── Cloudflare-MCP跨Agent连接说明.md
│   └── runtime-mock-data.md      # 运行数据必须来自接口、功能真实执行
├── docs/
│   ├── 00-process/
│   │   ├── 00-01-logs/           # 每日开发日志（YYYYMMDD.md）
│   │   └── 00-02-progress/       # 当前进度快照（progress.md，一份持续更新）
│   ├── 01-brd/                   # BRD（brd-template.md 为结构模板）
│   ├── 02-prototype/             # 页面原型 HTML + page-list.md 页面清单
│   ├── 03-foundation/            # 七类技术文档
│   │   ├── 03-01-glossary/       # 术语表
│   │   ├── 03-02-external-apis/  # 依赖的外部接口
│   │   ├── 03-03-er/             # 实体关系图
│   │   ├── 03-04-business-flows/ # 业务流程图
│   │   ├── 03-05-schema/         # 数据库表结构
│   │   ├── 03-06-provided-apis/  # 本系统提供的接口
│   │   └── 03-07-system-flows/   # 系统流程图
│   ├── 04-skills/                # 四个业务 Skill 包；四类均已真实模型实跑验收
│   ├── 05-prd/                   # PRD：mainprd（索引）+ NN-subprd；含独立 mock 数据专题
│   ├── 06-testcase/              # 测试用例（test-case-writer 生成）
│   ├── 07-delivery-plans/        # 开发计划（delivery-planner 生成：主计划+看板+子计划）
│   ├── 08-test-reports/          # 测试执行结果（test-case-runner 写入）
│   └── 09-deploy/                # 本地/云端启动、配置项总表、密钥台账
└── .agent/skills/                # 项目级 skills（登记见 §7）
```

## 3. 要素之间的关系

1. **AGENTS.md 是入口**，只负责路由到其他区域，不承载细则。
2. **`rules/` 是规则权威源。** 任何指引与规则文件冲突时，以规则文件为准。
3. **`docs/` 承载工作文档。** 代码改动必须能追溯到 `docs/` 里的某份文档。
4. **`code/` 只放源代码。** 不放文档、不放规则、不放临时笔记。
5. **`.agent/skills/` 只做导航和自动化**——指向 `rules/` 和 `docs/`，绝不成为某条规则的唯一载体。skill 不可用时直接从文档入口继续执行，不得跳过规则。

## 4. 双向引用机制

文档之间的引用必须双向建立、同步更新，不允许只有单向链接。

**三个必须建立引用的场景：**

1. **写作时引用**——A 的正文用到了 B 的定义（范围、章节、接口、表或字段、命名）。
2. **执行时锚定**——A 是按 B 执行/验收的，必须把锚点写进 A：Task 写「PRD 依据」、TC 用例表带「PRD 验收#」列、缺陷单每行带用例编号、TC 头声明核对的后端实现类/接口名。
3. **完成后回写**——结果要更新 B 的状态或口径：Task 完成回写主计划 + 看板 + 子计划三处；执行中发现口径变化写回完成标准；缺陷修复回写缺陷单；当日日志「待跟进事项」喂给次日启动。

只是觉得两份文档"相关"、"背景有关"，不构成引用，不登记。

**建立的格式**：每份文档头部固定两行；没有上游或下游写"无"，不删除该行。

```markdown
> 上游（我引用）：[mainprd.md](mainprd.md) §五、[schema.md](../03-foundation/03-05-schema/schema.md) `task` 表
> 下游（引用我）：[01-subprd-task-list.md](../05-prd/01-subprd-task-list.md) §3.2
```

每条 = 可点击的完整路径 + 精确到章节号 / 表名 / 接口路径的标识，保证全局搜索这个字符串能命中；不写"见上文""见某文档"这类搜不到的引用。A 引用 B 时，A 的"上游"行登记 B，B 的"下游"行登记 A，两条在同一次变更里写入。

### 4.1 更新联动

修改任何结构性信息前，先全局搜索该标识，把所有引用点同次改完。重点联动：

| 改了什么 | 必须同步改 |
|---------|-----------|
| BRD 的 In Scope 功能点 | 05-prd 功能块索引 + 对应 subprd；波及 07-delivery-plans 的功能覆盖 |
| subprd 章节号 | mainprd 内容大纲、schema / 接口文档里的章节引用 |
| API 路径 / 前端路由 | 03-06-provided-apis、各 subprd 接口契约节、02-prototype 页面清单 |
| 表名 / 字段名 | 03-05-schema、各 subprd 数据链路表、06-testcase 的 SQL |
| 外部接口结构 | 03-02-external-apis 文档 + code/mocks/ 对应 mock 数据 |
| subprd 验收标准条目号 | 06-testcase 用例表的「PRD 验收#」列 |
| Task 完成标准或 PRD 依据 | 07-delivery-plans 主计划、看板、子计划三处同改 |
| 目录名 / 文件名 | 本文件 §2 索引树、对应目录 README、引用该路径的 skill |
| 术语命名 | 03-01-glossary 先行，然后 PRD、代码、schema 批量同步 |

### 4.2 断链检查

提交前对被改的标识全局搜索一次，确认没有旧值残留；发现只改了一侧的引用，补齐另一侧再提交。

## 5. 每日启动顺序

每天第一次开始任务时，按顺序执行：

1. 读 `docs/00-process/00-02-progress/progress.md`，确认当前阶段和卡点
2. 读 `docs/00-process/00-01-logs/` 最近一天的日志，看"待跟进事项"
3. 读 `docs/07-delivery-plans/` 的任务看板，定位当前 Task
4. 按该 Task 的 PRD 依据，只加载 `docs/05-prd/` 对应 subprd（不一次读全部 PRD）
5. 按用户本轮已授权范围继续；仅在存在影响实施的缺失信息时询问

## 6. 已登记规则

| 规则 | 触发场景 | 入口 |
|------|---------|------|
| `coding-standards` | 编写、修改、评审、重构代码，或做数据库结构与接口设计时。按任务类型只加载 1-2 份最相关子文档 | `rules/coding-standards/README.md` |
| `cloudflare-stack` | 设计或评审前端、服务端、数据库、存储与部署方案 | `rules/Cloudflare支持技术栈.md` |
| `cloudflare-mcp` | 配置 Cloudflare MCP、执行连接验证或管理平台资源 | `rules/Cloudflare-MCP跨Agent连接说明.md` |
| `runtime-mock-data` | 编写 PRD、业务 Skill、模拟接口、前后端业务代码及联调用例时；要求模拟数据来自接口、功能真实执行 | `rules/runtime-mock-data.md` |

## 7. 已登记 Skills

下表为开发辅助 Skills。工作台运行时的业务 Skill 清单见 [docs/04-skills/README.md](docs/04-skills/README.md)，四包已实现，实测状态见清单。

| Skill | 触发场景 | 入口 |
|-------|---------|------|
| `project-devlog` | 写开发日志、日志收口、每轮推进后回写项目状态。日志存档于 `docs/00-process/00-01-logs/` | `.agent/skills/project-devlog/SKILL.md` |
| `diagram-design` | 生成架构图、流程图、时序图、ER 图等 38 种示意图（单文件 HTML/SVG/PNG）；重绘 drawio / Mermaid 源文件；从网站导入品牌色 | `.agent/skills/diagram-design/SKILL.md` |
| `delivery-planner` | 写代码开发计划：按 PRD 拆 Phase / Task、更新计划状态与完成标准、开工前一致性校验。产出存放于 `docs/07-delivery-plans/` | `.agent/skills/delivery-planner/SKILL.md` |
| `test-case-writer` | PRD 已产出后，从 PRD 生成 TC 主索引、业务域 TC 文件和 SQL 数据准备。只写 TC，不改 PRD。产出存放于 `docs/06-testcase/` | `.agent/skills/test-case-writer/SKILL.md` |
| `test-case-runner` | 执行 `docs/06-testcase/` 下已有的测试用例（跑测试 / 测试报告 / PASS-FAIL）。报告写入 `docs/08-test-reports/`。只执行不设计 | `.agent/skills/test-case-runner/SKILL.md` |

每次回复必须声明本轮使用了哪个 skill；没有则声明"未匹配 skill"。

## 8. 全局硬规则

1. **先评估 skill 再执行。** 写代码、写文档、跑测试前，先看有没有已登记的 skill 覆盖该任务，有就走 skill。
2. **状态必须回写。** 任务完成后同次更新 delivery plan 状态、progress.md 和当日日志；未回写前不得在口径上宣称完成。
3. **分层加载文档。** 先读索引（mainprd / 各目录 README）建立全局认知，再按任务只加载对应子文档；禁止一次性读入整个目录。
4. **"已完成"必须有真实验证证据。** 构建通过、页面能打开不等于完成；涉及接口、数据库、配置的改动，必须有真实链路验证（真实接口响应核对、真实查询回查）。
5. **大量内容分块处理。** 单次写入超过 400 行就拆成多个逻辑单元，完成一块再写下一块。
6. **改动可追溯。** 代码改动能指回 `07-delivery-plans/` 的某个 Task，Task 能指回 `05-prd/` 的验收标准。

## 9. 登记约束

- 在 `.agent/skills/<skill-name>/SKILL.md` 新增 skill 时，必须在同一次变更里回写本文件 §7 登记。未登记的 skill 视为不可发现。
- 在 `rules/` 新增规则文件时，必须在同一次变更里把它的条目和触发条件写进本文件 §6。
- `docs/` 下新增顶层目录或改名时，必须在同一次变更里更新本文件 §2 索引树。
- 与用户沟通使用中文。
