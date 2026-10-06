# 本地隔离验证环境管理

依据：[mock 数据 PRD §6](../05-prd/00-subprd-mock-data.md)、[本次典型场景证据](../08-test-reports/mock/lifecycle-20260921/summary.json)。实现入口：`code/task-runner/lifecycle-server.mjs`。

## 范围与实际验证

管理器只管理 `code/mocks/.data/lifecycle-managed/` 中由自身新建的环境。每套环境拥有独立模拟来源 SQLite、来源文件、Wrangler 本地 D1/R2、任务目录、SERVICE 凭据及 localhost 端口。业务数据通过 Worker 到模拟来源的真实 HTTP 接口导入；SQL 引导仅用于现有迁移与实际来源身份上下文，不写入业务结果。

2026-09-21 已实际验证：空库与 R2 读写、5 家服务商 / 20 张工单导入、管理器重启后状态保留、来源与文件初始摘要一致、重新导入、真实旧任务领取、新旧入口隔离、旧环境停止领取、失败环境不能启用、BUILDING 期间 SIGTERM 中断保留原环境、R2 上传对象拒绝恢复且原字节保留。生命周期单元回归 5 项通过，mock TypeScript 检查通过。

上传保护证据属于 **R2 存储工程检查**：实际对象位于独占 R2 的 `uploads/` 前缀，恢复被拒绝并重新读取字节核对。本轮未执行真实业务 `/uploads` API 场景，也未执行 SIGKILL 崩溃矩阵或云端验证。详见 [恢复与旧任务](../08-test-reports/mock/lifecycle-20260921/restore-and-old-task.json)、[上传对象保护](../08-test-reports/mock/lifecycle-20260921/r2-upload-protection.json)、[中断](../08-test-reports/mock/lifecycle-20260921/interruption.json)。

## 启动、初始化、恢复

在项目实现工作区执行，需已安装 `code/api` 的 Wrangler 依赖及当前项目要求的 Node。来源文件生成器使用本机已有文件生成工具；工具不可用会保留 FAILED 环境并拒绝启用。

```sh
node code/task-runner/lifecycle-server.mjs --port 18980
```

另一个终端创建新空环境（编号不可复用）：

```sh
curl -sS -H 'Content-Type: application/json' \
  --data '{"envId":"local-demo-01","dataset":"quick"}' \
  http://127.0.0.1:18980/lifecycle/provision
curl -sS -H 'Content-Type: application/json' \
  --data '{"envId":"local-demo-01"}' \
  http://127.0.0.1:18980/lifecycle/verify-import
curl -sS -H 'Content-Type: application/json' \
  --data '{"envId":"local-demo-01"}' \
  http://127.0.0.1:18980/lifecycle/activate
curl -sS http://127.0.0.1:18980/lifecycle/status
```

`dataset` 支持 `quick`（5 家 / 20 工单）和现有 `standard` 配置。`provision` 返回 PROVISIONED 只表示资源已建好；必须由 `verify-import` 检查真实数量后才能 `activate`。

完整恢复使用冻结的生成产物，不复制运行中的来源数据库：

```sh
curl -sS -H 'Content-Type: application/json' \
  --data '{"templateEnvId":"local-demo-01","envId":"local-demo-02"}' \
  http://127.0.0.1:18980/lifecycle/restore
```

管理器暂停旧环境领取，建立新来源和空应用库，经 HTTP 导入、核对后切换稳定 API 入口。旧任务仍绑定旧 URL 和旧凭据；旧凭据不能写入新环境。若旧环境含上传对象，恢复返回 409；可使用无 `templateEnvId` 的 `provision` 另建独立环境，原环境不删除。

模拟来源的 `/control/environments/restore` 也调用该实际管理器。它仅能恢复管理器拥有的环境，不接管既有用户环境。管理器启动的 mock 进程已设置对应 `APP_LIFECYCLE_BASE_URL`。

任务单次执行：

```sh
curl -sS -H 'Content-Type: application/json' \
  --data '{"envId":"local-demo-02"}' \
  http://127.0.0.1:18980/lifecycle/run-once
```

实际运行现有后台程序，使用该环境固定 Worker 地址、SERVICE 凭据和独占任务目录。涉及分析时仍依赖已有真实模型配置；此管理器不生成固定业务结论。稳定入口转发业务 API，不提供前端页面托管。

## 重启与停止

在管理器终端按 `Ctrl+C`，或向**本次启动时记录的管理器 PID** 发送 `SIGTERM`。管理器只停止自身启动的进程，保留全部存储与证据。不要使用按端口批量清理或全局 `pkill`。

再次启动管理器后，原运行环境显示 STOPPED；指定环境重启进程，再明确启用：

```sh
curl -sS -H 'Content-Type: application/json' \
  --data '{"envId":"life-check-d"}' \
  http://127.0.0.1:18980/lifecycle/resume
curl -sS -H 'Content-Type: application/json' \
  --data '{"envId":"life-check-d"}' \
  http://127.0.0.1:18980/lifecycle/activate
```

本次保留的环境是 `life-check-d`；重启后稳定 API 入口为 `http://127.0.0.1:18980`，独占 Worker 为 `http://127.0.0.1:56043`，独占 mock 为 `http://127.0.0.1:56042`。**交付时这些进程均已停止**。既有 8788、8790、18888、18890 未由本管理器操作。

凭据只保存在管理目录的本地受限文件，不在状态接口与验收报告中输出。未正常退出而留下 ownership lock 时，管理器拒绝接管；应先核实该管理器及其子进程是否还在运行。不要删除环境存储来绕过状态检查。

## 可重复验证

```sh
node --test code/task-runner/lifecycle.test.mjs code/mocks/tests/lifecycle-adapter.test.ts
node code/task-runner/lifecycle-verify.mjs \
  --env local-demo-02 --restore-to local-demo-03
node code/task-runner/lifecycle-protection-verify.mjs \
  --env local-demo-03 --base http://127.0.0.1:18980
```

恢复验证需要一个无实际上传对象、已真实导入的运行环境。保护验证会在该环境独占 R2 留下一个实际测试文件，因此后续从该环境恢复会按预期拒绝。证据保存在对应环境 `tasks/` 中；正式验收摘要保存于上述测试报告目录。
