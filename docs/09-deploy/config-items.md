# config-items 配置项总表

> 上游（我引用）：[运行数据规则](../../rules/runtime-mock-data.md) §2、[技术栈规则](../../rules/Cloudflare支持技术栈.md) §2、[code/README.md](../../code/README.md)「mock 与真实外部接口的切换」
> 下游（引用我）：[业务开发主计划](../07-delivery-plans/main-delivery-plan-jd-charging.md) T0.1 / T2.1、各环境启动文档

| 配置项 | 用途 | 本地值 | 云端值 | 必填 |
|--------|------|--------|--------|------|
| EXTERNAL_MODE | 业务来源接口模式：mock=模拟服务 / real=真实外部接口 | mock | 待确认 | 是，缺省按 mock 处理但部署前必须显式确认 |
| AI_MODE | AI 分析模式：mock=不调用真实模型、不生成业务结论 / real=OpenCode+业务 Skill | mock | 待确认 | 是，缺省按 mock 处理但部署前必须显式确认 |
| MOCK_BASE_URL | 模拟服务地址（mock 专题交付的外部接口服务） | http://localhost:8790 | 见密钥台账 / 内网地址 [待确认] | EXTERNAL_MODE=mock 时必填 |
| DEV_IDENTITY_TOKENS | 开发身份模拟凭据：JSON，token→稳定主体编号；仅本地开发，生产由身份提供方协议取代 [待确认] | 见 code/.dev.vars（不进仓库） | 不配置，真实模式无此项 | 本地开发必填，缺失则受保护接口一律 401 |
| LOCAL_ACCOUNT_SWITCHING | 本地账号切换开关，同时要求 mock 来源模式与本机访问 | 统一启动设为 true | 不启用 | 否，缺省关闭 |
| LOCAL_UI_ORIGIN | 账号切换写请求允许的网页 Origin | http://127.0.0.1:5174 | 不配置 | 本地账号切换开启时必填 |
| EXTERNAL_REAL_BASE_URL | 真实外部业务接口地址（EXTERNAL_MODE=real 时使用） | 不配置 | 见密钥台账 [待确认] | real 模式必填，缺失时受控报 50301，不降级 mock |
| TASK_RUNNER_BASE_URL | 旧AI HTTP适配器读取的地址；当前pull runner不使用 | 不配置，未实现对应HTTP服务 | [待确认] | 仅调用旧适配器时需要，不能据此宣称服务存在 |
| TASK_LEASE_MS | 后台任务租约毫秒数（领取/续租） | 600000 | 按实际执行耗时验证后定 | 否，有默认值 |
| TASK_MAX_ATTEMPTS | 单任务最大尝试次数（超出转 FAILED） | 3 | 待评审 | 否，有默认值 |
| TASK_RETRY_BACKOFF_MS | 重试退避毫秒数（RETRY_WAIT 可用时间） | 60000 | 待评审 | 否，有默认值 |
| DB（D1 绑定） | 本系统数据库绑定，非环境变量，在 wrangler.jsonc 声明 | 本地 D1（wrangler dev 自动） | 云端 D1 实例 [待确认] | 是，缺了全部持久化失效 |
| ASSETS（静态资源绑定） | 前端构建产物绑定，非环境变量 | web/dist | web/dist | 是 |
| FILES（R2 绑定） | 上传文件字节的对象存储绑定（上传存储形态裁决，T3.1） | 本地 R2（wrangler dev 的本地模拟，bucket `jd-charging-files`） | 云端 R2 实例 [待确认] | 是，缺了上传登记与正文读取失效 |
| MAX_UPLOAD_BYTES | 单次上传文件的字节上限（上传接口校验） | 10485760（10MB） | 按实际容量评审后定 | 否，代码常量为准 |
| 上传文件类型 | 允许的 MIME：PDF / PNG / JPEG / XLSX | 固定四类 | 固定四类 | 是，硬编码于接口校验 |
| MOCK_ENV_FILE | 模拟服务启动绑定的环境清单（code/mocks/environments/<envId>.json，T0.1） | environments/mock-env-a.json（验证用第二环境 mock-env-b） | 不涉及，模拟服务仅本地 | EXTERNAL_MODE=mock 联调必填 |
| MOCK_ENV_PORTS | 模拟服务各环境端口（环境清单 port 字段） | mock-env-a=8790、mock-env-b=8792（后台程序不监听端口） | 不涉及 | 是，端口冲突时改清单不改代码 |
| MOCK_STORAGE_ROOT | 模拟来源存储根（环境清单 storageRoot，含 sources/files/tasks 三分区） | code/mocks/.data/<envId>/（.gitignore 已排除） | 不涉及 | 是，由 env:check 与实际启动双重校验 |
| MOCK_ACCOUNT_ID | 后台访问模拟来源使用的受控会话账号（按业务动作分别配置） | acc-jd-review（资料/核查类）、acc-jd-recon（账单类）、acc-svc-backend-t26（变化发现 SERVICE） | 不涉及 | EXTERNAL_MODE=mock 必填；无文件/数据库旁路 |

## 后台执行程序与开发服务器

| 配置项 | 用途 | 本地值 | 云端值 | 必填 |
|---|---|---|---|---|
| WORKER_BASE_URL | 后台请求的本系统API根地址 | http://127.0.0.1:8788 | 待确认 | 有默认值；隔离验收须显式指定 |
| SERVICE_TOKEN | 后台SERVICE凭据 | 开发映射对应token | 密钥管理 | 是，缺失或权限不足拒绝领取 |
| SKILL_MODEL | OpenCode模型 | deepseek/deepseek-flash | 待验证 | AI real时使用 |
| SKILL_PURPOSE | 配置Skill试转换业务用途 | 可选，依输入确定 | 同左 | 仅配置分析需要明确用途时填写 |
| RUNS_ROOT | 模型输入、输出及运行证据目录 | code/task-runner/runs | 私有持久目录待确认 | 有默认值，注意容量与访问权限 |
| LOOP_INTERVAL_MS | 每轮领取完成后的等待毫秒数 | 15000 | 待确认 | 有默认值，不并发启动多轮 |
| VITE_DEV_IDENTITY_TOKEN | Vite本地API代理注入的开发凭据 | dev-token-jd-review | 禁止配置公网Vite | 开发身份切换使用 |
| WRANGLER_LOG_PATH | Wrangler日志目录 | 默认工具目录；隔离验收指定临时目录 | CLI执行环境 | 可选，不是业务配置 |
| APP_LIFECYCLE_BASE_URL | 模拟环境恢复依赖的业务生命周期服务 | 未实现，保持空 | 不适用 | 缺失时完整恢复必须拒绝，不能单边清空 |

后台程序独立读取进程环境，不会自动读取Worker的 `.dev.vars`。EXTERNAL_MODE、MOCK_BASE_URL、MOCK_ACCOUNT_ID和AI_MODE必须同时提供给需要它们的执行程序。Worker与后台AI_MODE只有同时为real才启动真实模型。解析器不调用模型，依赖Python/Poppler/Tesseract及PATH；TEST_REPORT_PATH只控制解析器测试证据输出，不参与业务运行。

PDF/图片OCR始终明确视觉内容未核实。XLSX不执行公式，使用文件原缓存值；缓存缺失与不支持内容保留问题。MAX_UPLOAD_BYTES是代码常量，不是可覆盖环境变量。

约定：

- 本地默认值写入 `wrangler.jsonc` 的 `vars`；云端用 `wrangler secret` 或平台变量覆盖，真实密钥值不进仓库。
- 新增配置项必须先登记本表再在代码中使用（code/README.md「代码区与文档区的对照关系」）。
- `MOCK_BASE_URL` 在 mock 专题（jd-charging-mock 计划）交付模拟服务后按实际地址更新。
- 上传文件存储形态裁决（T3.1，2026-09-20）：文件字节存入 R2（本地为 wrangler dev 的本地 R2），`content_locator` 记为 `uploads/{uploadId}/{安全文件名}`；`source_material.source_system` 记为 `LOCAL_UPLOAD`。不使用本地文件系统路径，不落公开可访问 URL。


### 2026-09-21 本地验收与来源导入补充

| 名称 | 使用处 | 要求 |
|---|---|---|
| API_BASE_URL | `task-runner/source-import.mjs`；单用例HTTP驱动 | 本系统Worker地址；来源导入不得直连数据库 |
| SERVICE_TOKEN | 来源导入与后台执行程序 | Worker的SERVICE令牌，按服务商授予明确权限；不写入证据 |
| CASE_EVIDENCE_DIR / CLERK_TOKEN | `verify-single-upload.mjs`仅TC-INS-09 | 专属用例输出目录 / 资料员开发令牌；不用于生产配置 |
| MOCK_ACCOUNT_ID=acc-svc-backend | 独立来源后台身份 | 生成器按实际来源集发放SERVICE范围；Worker权限另行核实 |

后台运行产物 `code/task-runner/runs/` 与 `.env.local` 已忽略，不能把模型输入、原材料、运行日志或凭据提交到仓库。


### 本地统一启动（2026-09-27）

由 AI 按 [启动与运行指南](../../启动与运行指南.md) 安装或复用兼容 Node.js，再通过 npm 调用 `code/scripts/local-dev.mjs`。运行配置及进程记录存 `code/.local/`，数据仍存 `code/.wrangler/state` 和 `code/mocks/.data/mock-env-a`。默认只监听 127.0.0.1，端口为 5174 / 8788 / 8790。`LOCAL_ACCOUNT` 为启动时选择的已有 mock 人类账号，默认 acc-jd-review；授权逐项来自来源身份接口。`JOB_PURPOSES` 仅供任务程序限定本次领取目的，逗号分隔，未配置则采用既有完整目的清单。`--drain` 连续处理当前可领取任务直到空队列，循环服务有任务时继续领取，空闲或失败后等待 LOOP_INTERVAL_MS。此模式仍逐条串行执行，不制造额外并发。

解析工具通过 [Micromamba 官方安装方式](https://mamba.readthedocs.io/en/latest/installation/micromamba-installation.html) 安装在 code/.local/parser-env，使用 conda-forge 的 Poppler 26.09.0、Tesseract 5.5.3；私有 PATH 传给后台。首次安装无系统 Python 时补 Python 3.13。标准启动器使用 EXTERNAL_MODE=mock + AI_MODE=real，缺少凭证时 ANALYSIS_ENABLED=false，仅暂停领取 ANALYZE_SKILL。默认 SOURCE_SYSTEMS 已修正为六类有变化发现接口的来源；file-service 没有订阅接口，材料变化由 installation-admin 的 material_index 提供。

### 2026-09-27 模型配置

项目不读取或创建 `code/.local/model.env`。桌面版和 CLI 统一 2.0.18，凭证由 OpenCode 个人数据存储管理。启动器调用 CLI 的 `auth list --standalone --format json` 读取连接状态，不读取旧版 auth.json、不复制密钥。也接受进程环境中的 SKILL_MODEL、DEEPSEEK_API_KEY、OPENAI_API_KEY、ANTHROPIC_API_KEY、GOOGLE_GENERATIVE_AI_API_KEY。统一启动器为 Worker 设置 ANALYSIS_RUNTIME_ERROR，为后台设置 ANALYSIS_ENABLED。配置状态变化会触发自有服务重启；每个分析任务使用独立 CLI 进程重新读取个人凭证。凭证状态接口成功仅代表已配置，模型是否可用由真实调用结果验证。
