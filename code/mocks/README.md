# jd-charging-mocks

外部系统本地模拟服务（mock 专题）。承载八类模拟外部系统的独立来源存储；本系统后端只能经 HTTP 访问，本工程不导入 `code/api` 的任何数据仓储。

## 环境要求

- Node.js ≥ 23.6（原生运行 TypeScript、内置 `node:sqlite`；开发实测 v25.8.1）
- 无运行时第三方依赖；`typescript` / `@types/node` 仅用于 `npm run typecheck`

## 命令

```bash
npm install                                        # 安装并锁定 devDependencies（package-lock.json）
npm run env:check -- --env environments/mock-env-a.json   # 环境配置检查：清单校验、存储目录、逐来源库迁移
npm run start -- --env environments/mock-env-a.json       # 启动模拟服务（前台进程，Ctrl-C 停止）
npm run typecheck                                  # TypeScript 类型检查
```

## 环境清单

`environments/<envId>.json`：`envId` / `port` / `dataset` / `storageRoot`（相对本目录，运行产物写入 `.data/<envId>/`，不进仓库）/ `appEnvRef`（本系统环境引用，仅登记，不代表应用已实现）。

同一 `envId` 绑定一份数据集的：各来源 SQLite 库（`.data/<env>/sources/<system>.db`）、文件空间（`files/`）、任务空间（`tasks/`）。不同环境之间存储完全隔离。

## T0.1 冒烟接口（开发工具入口，非业务契约）

- `GET /health`、`GET /environment`
- `PUT /sources/{system}/smoke-records/{recordId}`：body `{payload, sourceVersion, operationId}`；同一来源事务写入记录与版本日志；`operationId` 重复返回 409
- `GET /sources/{system}/smoke-records/{recordId}`：无记录返回 404，不返回示例成功

来源系统标识见 `src/sources/systems.ts`（八类）。业务读/写契约接口由 T2.1—T2.6 实现，未实现路径一律 404。

## 来源数据生成（T1.1）

```bash
node generator/generate.ts --config generator/configs/standard.json --env environments/mock-env-a.json   # 常规集 100 家/1000 单/3 账期
node generator/verify.ts   --env environments/mock-env-a.json --dataset standard-v1                     # 独立校验（38 项断言）
```

配置先校验后生成：总数冲突、覆盖不足、不完整配置逐项拒绝（退出码 2），不静默补数。来源库非空时拒绝覆盖，需新环境或先按 PRD §6.2 恢复。交付文件写入 `.data/<env>/delivery/<datasetId>/`（数据清单、场景覆盖表、预设负例、生成校验报告；文件清单待 T1.2）。快速集 `quick.json` 仅供单接口排错，不代替常规集验收；扩展集 `extension.json` 逐项明确数量。
