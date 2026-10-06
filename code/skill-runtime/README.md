# 业务 Skill 本地运行工具

> 上游（我引用）：[业务 Skills](../../docs/04-skills/README.md) §2—3、[AI 契约](../../docs/03-foundation/03-02-external-apis/ai-inference-material-parsing.md) §2—3
> 下游（引用我）：[业务 Skills](../../docs/04-skills/README.md) §3、[验证记录](../../docs/04-skills/validation.md) §1—3、[代码入口](../README.md) 目录结构

本工具负责固定输入、复制指定 Skill、启动 OpenCode、限制工具、记录事件、校验 analysis，以及真实执行配置试转换。当前是命令行验证工具；工作台 HTTP 服务、D1 任务队列、上传解析和生产身份接入仍需实现。

## 运行

本项目已确认使用 DeepSeek V4.1 Flash：`deepseek/deepseek-flash`。已通过场景沿用记录，仅对未通过项或实际变更影响执行必要验证。

要求 Node.js 22 或更高、已安装 OpenCode CLI、可用模型。密钥沿 OpenCode 已有配置获取，不写入输入、包、命令参数或报告。需要外部模型授权时先取得授权；不自行更换模型提供方。

```bash
node code/skill-runtime/run-local.mjs request.json /绝对路径/新的证据目录 deepseek/deepseek-flash
# 配置 Skill 另传可信任务用途，取自待配置业务范围
node code/skill-runtime/run-local.mjs request.json /绝对路径/新的证据目录 deepseek/deepseek-flash INSTALLATION
```

request.json 遵循 AI 契约 ANALYZE_SKILL 分支。每次使用新的证据目录，不覆盖旧输出。CLI 版本、模型、输入和包摘要、用时、工具装载、错误及结果分别保存。一次开发验证限 180 秒、12 轮，不自动重试；错误排查后的再次验证是新尝试，不能冒充第一次通过。没有产物或结构/引用检查失败则非零退出，不用聊天文本和固定答案兜底。

## 输出

| 文件 | 内容 |
| --- | --- |
| run.json | 实际环境、摘要、耗时、退出状态和是否通过 |
| events.jsonl | 原生 CLI 事件与实际工具调用，含测试输入/输出内容，按业务资料权限保存 |
| stderr.txt | 进程诊断，不作为业务结论 |
| result.json | 经程序校验的 analysis 对象；失败时不创建有效结果 |
| trial.json | 配置 Skill 的实际逐行转换和逐规则执行记录；由程序生成 |

任务临时目录使用真实规范路径，以避免 macOS /var 与 /private/var 的别名导致权限失配。模型只允许装载指定 Skill、读取该包和本任务 input、写 output/result.json；shell、网络工具、其他 Skill 和外部目录均拒绝。该工具策略不等于操作系统级生产隔离，正式运行进程及密钥隔离仍须部署验收。

临时任务目录初始化为独立 Git 工作区，read/edit 权限使用相对该工作区的路径；原项目 Git 不受影响。OpenCode 的 [read 实现](https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/opencode/src/tool/read.ts) 与 [write 实现](https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/opencode/src/tool/write.ts) 均按 worktree 相对路径检查权限；[项目解析](https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/opencode/src/project/project.ts) 对无 Git 的全局项目使用根目录。实跑已验证此配置可正确限制并完成任务文件读写。

## 本地校验

```bash
node --test code/skill-runtime/tests/*.test.mjs
node code/skill-runtime/tests/prepare-fixtures.mjs /绝对路径/测试输入目录
```

prepare-fixtures 临时启动仅绑定 127.0.0.1 的模拟 HTTP 来源，读取后即关闭。它提供 Skill 单元验收输入，含明确标注的模拟解析块；不代替独立 mock PRD 的多服务商系统，更不证明 PDF、图片、XLSX 真实解析能力。

## 转换执行

transform.mjs 的 validateConfig / transformRows 可由后续服务直接调用。支持 PIPELINE 取值与九种登记算子；精度由十进制整数运算保持，实际安装数量最后转换为可准确表示的 number。run-local.mjs 的 parseRawJson 保留原始 JSON 数字文本，selectRows 按配置 rowPath 取行；直接集成引擎也必须保留这两步。缺字段、查表失败、单位后缀不符和版本不匹配不发布成功配置。原输入保持不变。

runTrials(request, analysis, expectedPurpose) 的用途由调用方明确传入 INSTALLATION / RECONCILIATION，后续服务从已验证的 integration_config.purpose 取得，不能把模型输出再传回作自我校验。来源服务商、原资料版本与原格式关联同时核对。

实现使用 Node 通用工程规范；当前规范目录没有专门的 Node 编码细则。OpenCode 配置依据：[Skills](https://opencode.ai/docs/skills/)、[权限](https://opencode.ai/docs/permissions/)、[Agent](https://opencode.ai/docs/agents/)。

实际试跑能够验证结构和数据执行，无法证明字段业务含义天然正确；原格式、范围和人工确认仍按 foundation 执行。后续应在后端按实际输入建立试转换记录，不能用本地 trial.json 文件替代身份/事务/启用服务。
