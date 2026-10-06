# T0.1 建立可持久化的本地模拟服务工程 — 验证证据

> 执行时间：2026-09-20｜执行人：AI｜任务：[sub-delivery-plan-jd-charging-mock-T0.1-mock-runtime.md](../../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T0.1-mock-runtime.md)
> 环境：macOS（darwin）/ Node.js v25.8.1（原生 TypeScript 运行 + 内置 `node:sqlite`）/ 工作目录 `code/mocks/`

## 1. 交付物

| 文件 | 内容 |
| --- | --- |
| `code/mocks/package.json` + `package-lock.json` | 无运行时第三方依赖；devDependencies 锁定 typescript 5.9.3 / @types/node 24.10.1（npm install 实际安装） |
| `code/mocks/src/server.ts` | node:http 服务：/health、/environment、来源冒烟记录 PUT/GET；未实现路径真实 404 |
| `code/mocks/src/bootstrap.ts` | 启动装载：环境清单 → 存储三分区 → 八来源库逐库迁移 |
| `code/mocks/src/environment/registry.ts` | 环境清单校验（envId/port/dataset/storageRoot/appEnvRef），越界路径拒绝 |
| `code/mocks/src/storage/database.ts` | 来源 SQLite 打开（WAL）+ 迁移幂等应用（schema_migration 登记表） |
| `code/mocks/src/storage/source-store.ts` | 冒烟记录同事务写入：记录 + 版本日志；操作编号唯一冲突抛 DuplicateOperationError |
| `code/mocks/src/sources/systems.ts` | 八类来源系统标识（与 mock PRD §2.1 一一对应） |
| `code/mocks/migrations/0001_source_core.sql` | smoke_record（PRIMARY KEY record_id、UNIQUE operation_id）+ source_version_log（PRIMARY KEY source_version） |
| `code/mocks/environments/mock-env-a.json` / `mock-env-b.json` | 两个验证环境清单（8790 / 8792，8791 为后台任务程序占用） |
| `code/mocks/README.md` | 安装 / 启动 / 停止 / 环境检查命令与运行时要求 |
| `docs/09-deploy/config-items.md` | 登记 MOCK_ENV_FILE / MOCK_ENV_PORTS / MOCK_STORAGE_ROOT 三项 |

## 2. 环境映射

| 环境 | 端口 | 数据集 | 来源存储 | 本系统环境引用（仅登记） |
| --- | --- | --- | --- | --- |
| mock-env-a | 8790 | standard-v1 | code/mocks/.data/mock-env-a/{sources,files,tasks} | jd-charging-local |
| mock-env-b | 8792 | standard-v1 | code/mocks/.data/mock-env-b/{sources,files,tasks} | jd-charging-local |

## 3. 逐断言结果

| # | 断言 | 方法 | 结果 |
| --- | --- | --- | --- |
| 1 | typecheck 通过 | `npm run typecheck`（tsc --noEmit） | PASS，0 错误 |
| 2 | 环境配置检查 A/B 通过 | `npm run env:check -- --env environments/mock-env-{a,b}.json` | PASS，各 12 项全过（清单、三分区目录、八来源库迁移各 1 份） |
| 3 | 迁移幂等 | env:check 重复执行 | PASS，二次执行各来源应用迁移 0 份（schema_migration 登记） |
| 4 | 独立端口可启动 ×2 | 后台进程实起 8790 / 8792 | PASS，`/health` 返回各自 envId 与 8 来源 |
| 5 | 首次空查询返回真实不存在 | GET A `/sources/identity/smoke-records/rec-t01-001` 写入前 | PASS，HTTP 404 RECORD_NOT_FOUND，无示例成功 |
| 6 | 写入来源测试记录 | PUT A 同路径 `{payload:{probe:T0.1-persistence},sourceVersion:sv-2026-09-20-01,operationId:op-t01-a-0001}` | PASS，HTTP 201 |
| 7 | 写入后回查 | GET A 同路径 | PASS，HTTP 200，字段逐值一致 |
| 8 | 同业务编号两环境互不影响 | B 查 rec-t01-001 → 404；B 以同编号写入 → 201 | PASS，隔离成立 |
| 9 | 操作编号唯一约束 | A 以相同 operationId 写新记录 | PASS，HTTP 409 DUPLICATE_OPERATION |
| 10 | 未知来源系统 | GET A `/sources/no-such-system/...` | PASS，HTTP 404 SOURCE_NOT_FOUND |
| 11 | 非法 body | PUT 缺 sourceVersion/operationId | PASS，HTTP 400 FIELD_INVALID |
| 12 | 未实现业务路径不返回固定成功 | GET A `/sources/installation-admin/work-orders` | PASS，HTTP 404 NOT_FOUND |
| 13 | 重启保留记录与版本 | 重启 A 进程后 GET rec-t01-001 | PASS，HTTP 200，createdMs 与重启前一致（1789906340071） |
| 14 | 重启后唯一约束仍生效 | 重启后再以 op-t01-a-0001 写入 | PASS，HTTP 409 |
| 15 | 来源模块不导入 code/api 仓储 | grep `code/api`、`api/src`（src/ migrations/ environments/ package.json） | PASS，无引用 |
| 16 | 模拟服务无 D1/Worker 访问路径 | grep `wrangler`、`D1`、`.wrangler`（src/） | PASS，无引用；本系统业务库未被触碰 |
| 17 | 记录、版本、操作关联落来源库 | 只读打开 `.data/mock-env-a/sources/identity.db` 回查 | PASS，smoke_record 1 行 + source_version_log 1 行（sv-2026-09-20-01 ↔ op-t01-a-0001）+ schema_migration 1 行 |

## 4. 原始响应样例

```text
PUT /sources/identity/smoke-records/rec-t01-001 (A)  → 201
{"ok":true,"data":{"recordId":"rec-t01-001","payload":{"probe":"T0.1-persistence","n":1},
"sourceVersion":"sv-2026-09-20-01","operationId":"op-t01-a-0001","createdMs":1789906340071}}

GET  /sources/identity/smoke-records/rec-t01-001 (B)  → 404
{"ok":false,"error":{"code":"RECORD_NOT_FOUND","message":"记录不存在"}}

PUT  重复 operationId (A) → 409
{"ok":false,"error":{"code":"DUPLICATE_OPERATION","message":"操作编号已存在：op-t01-a-0001"}}
```

来源库回查（identity.db，只读）：

```text
smoke_record:       [{"record_id":"rec-t01-001","source_version":"sv-2026-09-20-01","operation_id":"op-t01-a-0001"}]
source_version_log: [{"source_version":"sv-2026-09-20-01","first_operation_id":"op-t01-a-0001"}]
schema_migration:   [{"name":"0001_source_core.sql"}]
```

## 5. 边界与后续

- 业务契约读/写接口（§2.3 各外部接口）由 T2.1—T2.6 实现，当前一律真实 404。
- 来源测试记录仅为 T0.1 持久化冒烟数据，不是业务来源数据；T1.1 生成正式来源数据时另行登记。
- 验证进程（8790 / 8792）在证据采集后停止；`.data/` 为一次性验证产物，不进仓库。
