# 本地启动与验收环境

> 上游（我引用）：[配置项](config-items.md)、[模拟来源](local-mock.md)、[T5.2](../07-delivery-plans/sub-delivery-plan-jd-charging-T5.2-deploy-docs.md)
> 下游（引用我）：[代码入口](../../code/README.md)、[部署目录](README.md)

当前可以启动真实 Worker、D1、R2、前端和后台执行程序。完整业务闭环尚待 T5.1 验收；统一启动默认 AI real，模拟仅用于业务来源；缺少模型凭证会明确等待，不领取分析任务。四类 Skill 既有真实模型验收不重复执行。

## 0. 推荐统一启动入口（2026-09-27）

先读 [启动与运行指南](../../启动与运行指南.md)，配置好兼容 Node.js 后，从项目根目录执行 `npm --prefix code start`。启动器自动安装项目私有 Node.js 与 Poppler/Tesseract，按锁文件安装依赖，构建前端，并检查实际页面账号下可见的工单和事项后才宣布就绪。

首次来源生成在临时目录完成后才启用；已有来源不重建。业务数据持久化仍使用 `code/.wrangler/state`。模拟账号与明确的服务商授权从身份接口取得，写入本地身份表；业务工单通过 Worker → 来源 HTTP 导入，事项通过变化发现与后台程序生成。默认账号 acc-jd-business；每家服务商一个 acc-sp-xxx 账号，统一本公司配置、资料与对账回复，公共接入账号停用。京东业务账号统一承担京东核查、对账与履约职责；旧环境启动时自动迁移未完成事项，保留历史操作；详见 [项目启动说明](../../README.md)。

`npm --prefix code stop` 停止本入口拥有的服务，保留数据；`npm --prefix code run status` 验证五个服务、实际会话、工单和事项。其他端口进程不会被停止。运行配置统一生成至 `code/.local/wrangler.json`，不覆盖手工 `.dev.vars`。运行日志和导入报告同目录。

下方四终端方式保留用于独立调试，单独执行这些命令不会自动完成标准数据恢复；其 dev-identity.sql 只授权 provider-dev-a/b，不能直接用于标准 SP-001 等来源。恢复标准数据请使用统一入口。

## 1. 依赖

| 依赖 | 要求与用途 |
|---|---|
| Node.js | ≥23.6；本轮 v25.8.1。原生 TypeScript、node:sqlite及JSON数值原文支持 |
| npm | 使用各目录 package-lock.json；`npm ci`安装锁定依赖 |
| Python 3 | XLSX 全工作表读取，标准库，无额外Python包 |
| Poppler | `pdfinfo`、`pdftotext`、`pdftoppm`，PDF逐页读取与渲染 |
| Tesseract | 图片/PDF OCR；`tesseract --list-langs`检查中文数据，缺失如实记解析不完整 |
| OpenCode CLI | 统一启动自动安装 @opencode/cli@2.0.18，与桌面版一致；通过 CLI 认证接口复用个人凭证；当前模型 `deepseek/deepseek-flash` |

以下命令从项目的 `code/` 目录执行。三个锁文件分别位于 code、api、web。

```bash
npm ci
npm --prefix api ci
npm --prefix web ci
npm --prefix web run build
cp -n .env.example .dev.vars
```

`.dev.vars`只为Worker读取；模板内开发凭据没有生产用途。已有文件不得覆盖。按实际测试角色修改 `MOCK_ACCOUNT_ID`；单个来源账号只能执行自己授权的动作，不自动越权。

## 2. 数据库

```bash
npx wrangler d1 migrations apply DB --local
npx wrangler d1 execute DB --local --file db/seeds/dev-identity.sql
```

九份迁移须全部通过，含 `0009_attempt-lease-fence.sql`。第二步仅初始化本地开发身份与两个开发服务商，不代表已导入常规来源集。业务来源数据须经来源HTTP接口导入；不得把 `dev-work-items.sql` 等页面开发数据作为来源联调证据。

测试库、业务库、模拟来源库分别保存。工程回归使用带全部迁移和触发器的独立 SQLite；真实Worker验收通过 `--persist-to <独立目录>` 创建新库。使用同一 `--persist-to` 参数执行迁移、写前置及启动，禁止把正式TC的清理SQL打到既有业务库。旧TC SQL中要求关闭保护触发器的前置不代表生产验收已通过；应记录资产冲突并修订用例，不能关闭保护后宣称生产通过。

## 3. 四个终端启动

终端一：模拟来源（已有来源集日常启动）。首次来源生成及独立验收见 [local-mock.md](local-mock.md)。

```bash
cd mocks
npm run env:check -- --env environments/mock-env-a.json
npm run start -- --env environments/mock-env-a.json
```

终端二：API与本地数据库、文件存储。

```bash
npx wrangler dev --local --ip 127.0.0.1 --port 8788
```

终端三：前端。代理向8788提供默认开发身份，已选择账号的会话优先。统一启动后可在网页右上角切换账号，无须重启；该开发代理仅供本地使用。

```bash
VITE_DEV_IDENTITY_TOKEN=dev-token-jd-review npm --prefix web run dev
```

终端四：后台程序。独立环境文件无真实密钥，可用Node读取。

```bash
cp -n task-runner/.env.example task-runner/.env.local
node --env-file=task-runner/.env.local task-runner/runner.mjs --loop
```

后台当前执行配置试转换、材料解析、Skill分析、外部提交与原编号回查。它主动通过Worker内部HTTP领取任务，不监听8791。AI分析要求Worker与后台的AI_MODE同时为real；mock明确返回未执行模型，真实失败不会降级为固定答案。材料解析为本地确定性处理，不调用模型。

## 4. 验证

```bash
curl --fail http://127.0.0.1:8790/health
curl --fail http://127.0.0.1:8788/api/health
curl --fail -H 'Authorization: Bearer dev-token-jd-review' http://127.0.0.1:8788/api/admin/charging/session
npx wrangler d1 execute DB --local --command 'SELECT count(*) AS migrations FROM d1_migrations'
```

业务接口的正常壳为 `code=0,data=...`。浏览器打开 `http://127.0.0.1:5174`，空业务库应显示空列表；来源未导入不应出现假业务数据。上传的202只代表接收；必须查上传状态、解析记录与材料版本。XLSX读取全部sheet与原公式缓存；百分比、分数显示含义和合并范围无法完整保留时标明具体位置并保持INCOMPLETE；PDF/图片图形、照片、签字语义未核实，保持INCOMPLETE/BLOCKED，不能自动当成完整材料。

## 5. 独立验收与停止

已有8788/5174服务不要直接重启。复制Wrangler配置到独立临时目录，将main、assets.directory、migrations_dir改为绝对路径，填写仅本轮开发凭据；迁移和启动统一指定该config及persist-to。API使用18888、inspector使用19333，仅监听127.0.0.1。本轮已在新本地库应用全部9份迁移；HTTP与业务结果的完整证据保存在测试报告。

停止各自新建终端中的进程，不删除业务库和上传文件。云端步骤及未就绪条件见 [cloud-deploy.md](cloud-deploy.md)。

## 6. 来源初始化

独立模拟来源的后台账号 `acc-svc-backend` 由生成器按实际服务商集合发放授权。Worker侧SERVICE身份也须具备同一服务商范围的 `READ_SOURCE_CHANGES` 与 `PREPARE_ANALYSIS`，最终取双方授权交集。不能把来源账号全量权限直接当成Worker权限。

从项目根目录运行：

```bash
API_BASE_URL=http://127.0.0.1:8788 SERVICE_TOKEN=<本环境后台令牌> node code/task-runner/source-import.mjs --report /tmp/source-import.json --expect-providers 10 --expect-orders 100
```

报告保存每个来源基线回执、变化页与实际工单上下文读取请求编号。重复导入逐一比较版本和内容；新版本或同版本不同内容不覆盖历史。此命令只初始化来源上下文，事项生成与分析另由后台链路处理。返回SCOPED_COMPLETE仅证明授权范围的覆盖。


来源上下文初始化后，另启变化监测终端：

```bash
API_BASE_URL=http://127.0.0.1:8788 SERVICE_TOKEN=<本环境后台令牌> node code/task-runner/source-monitor.mjs --loop
```

默认按当前后台身份的授权服务商范围，订阅 installation-admin、provider-docs、jd-billing、provider-receivable、billing-terms、order-entitlement 六类来源（文件变化由安装来源的材料索引发现，file-service 仅提供文件读取）；可用 `SOURCE_SYSTEMS` 逗号分隔缩小范围。默认30秒读取一次（`SOURCE_POLL_INTERVAL_MS`）。变更经本系统HTTP持久化，再由任务程序执行DISCOVER_RELATIONS和READ_SOURCE。仅在工单或配置业务范围可靠时建事项；待回复或外部写入未决时保留重试。此能力不代表真实生产外部系统已完成对接。

## 5. 真实分析与演示回滚（2026-09-27）

统一启动与模型配置、手动分析、完整数据回滚见 [启动与运行指南](../../启动与运行指南.md)。此次仅验证运行环境和本地业务接口；本机尚无模型凭证，真实调用未完成，不能以 OpenCode 安装成功代替 Skill 执行验收。

### 分享入口调整

项目根 .command 入口已按用户要求移除；接收方只需向 AI 提供 [启动与运行指南](../../启动与运行指南.md)。启动、停止、检查、保存起点与回滚使用指南中的 npm 命令；日常账号切换使用网页右上角入口。模型凭证不写入项目文件。
