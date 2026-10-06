# code 代码区

> 上游（我引用）：[运行数据规则](../rules/runtime-mock-data.md) §2—4
> 下游（引用我）：[本地启动](../docs/09-deploy/local-setup.md)、[配置项](../docs/09-deploy/config-items.md)

运行实现：[Skill 本地工具](skill-runtime/README.md)。四个业务包、转换程序、工作台API和五域页面已有实现；完整业务闭环仍按T5.1验收。

只放源代码。文档在 `docs/`，规范在 `rules/`，这里不放文档和临时笔记。

先读 [启动与运行指南](../启动与运行指南.md)。在兼容 Node.js/npm 环境中执行 `npm start` / `npm run dev`，会恢复来源、权限、业务数据和后台服务；`npm stop`、`npm run status`、`npm run checkpoint`、`npm run restore` 统一管理生命周期。模型凭证由个人 OpenCode 配置提供。

## 目录结构

```text
code/
├── skill-runtime/        OpenCode 调用、契约校验与确定性转换
├── web/                  前端：React + Vite + TypeScript
├── api/                  服务端：Hono + TypeScript Worker
│   └── src/
│       ├── routes/       本系统对外接口实现
│       └── services/     业务逻辑
├── db/
│   └── migrations/       D1 建表与结构变更 SQL
├── mocks/                外部接口 mock，一个外部系统一个目录
│   └── <系统名>/
│       ├── README.md     该 mock 覆盖哪些接口、数据口径
│       └── data/         mock 返回数据
├── packages/
│   └── shared/           前后端共享的 TypeScript 类型（可选）
└── wrangler.jsonc        Worker、静态资源、D1 绑定配置
```

## 代码区与文档区的对照关系

| 代码目录 | 上游文档 | 约束 |
|---------|---------|------|
| `api/src/routes/` | `docs/03-foundation/03-06-provided-apis/` | 接口路径、出入参必须与接口文档一致 |
| `db/migrations/` | `docs/03-foundation/03-05-schema/` | 表结构必须与 schema 文档一致，改表先改文档 |
| `mocks/<系统名>/` | `docs/03-foundation/03-02-external-apis/` | mock 返回结构必须与外部接口文档一致 |
| `api`、`web` 中的命名 | `docs/03-foundation/03-01-glossary/` | 变量、路由、字段名用术语表的英文命名 |
| 环境变量与开关 | `docs/09-deploy/config-items.md` | 新增配置项先登记再使用 |

## mock 与真实外部接口的切换

- mock 业务数据由模拟接口返回，经本系统后端真实处理、持久化，再由本系统 API 提供给前端。禁止在前端写死业务记录、统计和操作成功结果。
- 模拟接口须实际保存来源状态变化，支持回查与版本接续；本系统自身业务逻辑不得用固定返回替代。生成、校验和重置要求由独立 mock 数据 PRD 定义，正式实现前纳入开发计划。

- 拟用 `EXTERNAL_MODE=mock|real` 控制业务来源接口，开发期默认 mock；另以 `AI_MODE=mock|real` 控制 AI 分析，支持业务 mock + AI real。上传服务商文件须保留实际导入来源。当前已有模式校验和外部HTTP适配；真实提供方路径、认证及生产身份尚未接通。
- `EXTERNAL_MODE=real` 走真实外部接口，密钥从 `docs/09-deploy/api-keys.md` 登记的渠道获取，真实值不进仓库。
- 新增外部系统依赖时，先在 `03-02-external-apis/` 写接口文档，再在 `mocks/` 建对应目录。
- 本地 AI real 由独立 Node 后台程序启动 OpenCode CLI；后台经Worker内部HTTP主动领取、续租、提交结果。上传原文件存R2，解析程序经受租约保护的路由读取实际字节；普通Worker不执行本机CLI。真实 AI 失败不得回退为 mock 结论。

## 验证口径

- 本地启动、云端部署步骤见 `docs/09-deploy/`。
- 改代码必须能追溯到 `docs/07-delivery-plans/` 里的某个 Task；验收标准来自 `docs/05-prd/` 对应 subprd 的「验收标准」章节。
