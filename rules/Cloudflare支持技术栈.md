# Cloudflare 支持技术栈

> 上游（我引用）：[运行数据规则](runtime-mock-data.md) §2—4
> 下游（引用我）：[AI 推理与材料解析](../docs/03-foundation/03-02-external-apis/ai-inference-material-parsing.md) §1、§2.4、§5、[处理事项域表结构](../docs/03-foundation/03-05-schema/work-item-schema.md) §1—9

## 1. 默认技术栈（唯一推荐）

部署到 Cloudflare 的新项目，一律使用以下组合，不海选：

| 层次 | 技术栈 | 一句话理由 |
|---|---|---|
| 前端 | React + Vite + TypeScript | Workers 官方支持，生态最大 |
| 服务端 | Hono + TypeScript（Cloudflare Worker） | 为边缘运行时设计，官方支持，前后端共享 TS 类型 |
| 数据库 | D1（Serverless SQL，底层 SQLite） | Worker 内直接绑定，免运维，migration 管理结构 |
| ORM | 原生 SQL 或 Drizzle | 小项目原生 SQL 足够 |
| 文件存储 | R2（需要上传功能时启用） | 按需 |
| 部署 | Wrangler CLI | 官方工具链 |
| 公开地址 | `*.workers.dev` | 开箱即用 |

```text
浏览器
  │
  ├── 前端 Worker（React 构建产物，Workers Static Assets）
  │
  └── API Worker（Hono + TypeScript）
        │
        ├── D1 数据库
        ├── R2 文件存储（按需）
        └── 外部接口（真实 或 本仓库 mocks/ 提供的 mock，按环境变量切换）
```

## 2. 各层要点

### 前端

- 构建产物经 Workers Static Assets 发布：`npm run build` → `wrangler deploy` → `https://项目名.账号子域名.workers.dev`。
- Pages 仍可用，但新项目一律用 Workers Static Assets。

### 服务端

- Hono 提供路由、中间件、参数校验；一个 Worker 承载全部 API。
- 每个 npm 依赖入包前检查 Workers 兼容性：不依赖本地磁盘、不依赖 Node 原生扩展、不需要常驻进程。

### 本地业务 Skill 运行

- 本地真实 AI 验证采用独立 Node 任务程序启动 OpenCode CLI，装载业务 Skill 并调用已配置模型。Node 程序负责输入准备、进程管理、结果收集与校验。
- API Worker 与任务程序通过本地 HTTP 接口交互；Worker 不直接启动 CLI 子进程。任务程序及其接口尚待实现。
- 云端运行 CLI 的环境在部署阶段单独确定，不假定普通 Worker 可以运行本地命令。

### 数据库

- D1 表结构用 migration 文件管理（`db/migrations/`），禁止手工线上改表。
- 浏览器不直接访问 D1，一律经 API Worker。
- 数据库账号、密码、Token、连接串保存为 Worker Secret 或 Secrets Store，禁止写入前端代码和 Git 仓库。

### 外部接口与 mock

- 遵守运行数据规则：前端仅通过本系统 API 获取业务数据；模拟接口位于外部依赖处，本系统实际执行权限、业务处理、保存与回查。不得用前端固定记录、请求拦截或本地伪造成功代替联调。

- 业务来源接口开发期默认走本仓库 `code/mocks/` 下的 mock 实现；允许上传服务商文件进行导入验证，本地 AI 验证可单独接入真实模型。
- 业务来源与 AI 分别配置：拟用 `EXTERNAL_MODE=mock|real` 控制业务来源接口，`AI_MODE=mock|real` 控制 AI 分析，支持业务 mock + AI real；上传材料保留实际导入来源。真实 AI 失败不得返回固定 mock 结论。配置须在实现前登记到 `docs/09-deploy/config-items.md`，当前开关尚未实现。
- mock 返回结构必须与 `docs/03-foundation/03-02-external-apis/` 的接口文档一致。

## 3. 非默认情况（少数派，需先说清理由）

| 情况 | 选择 |
|---|---|
| 团队已有 Vue 经验 | 前端可换 Vue + Vite + TypeScript，其余不变 |
| 需要 SEO / SSR | Next.js + OpenNext，先核查所用功能在 OpenNext 兼容范围内 |
| 已有 Express 项目迁移 | Express + Node.js compatibility 模式，逐依赖检查兼容性 |
| 已有 PostgreSQL / MySQL | 保留原库，经 Hyperdrive 连接 |
| Java / Go / .NET / Django 项目 | Docker + Containers（需付费套餐），首个项目不用 |

以下能力不进入固定脚手架，按项目需要单独引入：Durable Objects、Queues、Cron Triggers、Workflows、KV、Vectorize、Workers AI。

## 4. 项目目录结构（code/ 区）

```text
code/
├── web/                  前端：React + Vite + TypeScript
├── api/                  服务端：Hono + TypeScript Worker
│   └── src/
│       ├── routes/       本系统对外接口（对应 docs/03-foundation/03-06-provided-apis/）
│       └── services/     业务逻辑
├── db/
│   └── migrations/       D1 建表与结构变更 SQL（对应 docs/03-foundation/03-05-schema/）
├── mocks/                外部接口 mock（对应 docs/03-foundation/03-02-external-apis/，一系统一目录）
│   └── <系统名>/
│       ├── README.md     覆盖哪些接口、数据口径
│       └── data/         mock 返回数据
├── packages/
│   └── shared/           前后端共享的 TypeScript 类型（可选）
└── wrangler.jsonc        Worker、静态资源、D1 绑定配置
```

## 5. 官方资料

- [Workers Framework Guides](https://developers.cloudflare.com/workers/framework-guides/)
- [React + Vite](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/)
- [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Cloudflare Vite Plugin](https://developers.cloudflare.com/workers/vite-plugin/)
- [Hono on Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/hono/)
- [D1](https://developers.cloudflare.com/d1/)
- [Hyperdrive](https://developers.cloudflare.com/hyperdrive/)
- [Node.js Compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)
- [Containers](https://developers.cloudflare.com/containers/)
