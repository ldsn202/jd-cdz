# 密钥台账

> 上游（我引用）：[配置项](config-items.md)、[T5.2](../07-delivery-plans/sub-delivery-plan-jd-charging-T5.2-deploy-docs.md)
> 下游（引用我）：[云端部署](cloud-deploy.md)、[部署目录](README.md)

本文件只登记用途和存放渠道，不保存真实值。

| 凭据 | 用途 | 申请渠道 | 配置位置 | 状态与维护人 |
|---|---|---|---|---|
| OpenCode模型凭据 | AI real调用既定模型 | 模型提供方账号；沿用既有OpenCode配置 | 执行机OpenCode用户配置/凭据存储 | 四类Skill已有真实运行验收；本轮未读取或复制密钥，维护人待确认 |
| 后台SERVICE凭据 | 领取、续租、结果提交及受控原文件读取 | 本系统身份管理员 | 后台SERVICE_TOKEN；生产应接真实身份提供方 | 本地开发可用；生产发行/撤销方式待接通 |
| 真实外部系统凭据 | 获取来源事实、提交和回查 | 各外部系统提供方 | Worker/执行环境的secret管理 | 协议、权限、维护人待确认；仅设置base URL不足以完成接入 |
| Cloudflare部署凭据 | Worker发布、D1/R2管理 | Cloudflare账号管理员 | Wrangler登录态或CI密钥库 | 本轮未核验云账号、未部署；维护人待确认 |
| 本地开发token映射 | 单机验收角色与服务身份 | 项目本地配置 | code/.dev.vars中的DEV_IDENTITY_TOKENS | 仅开发，不作为生产认证 |
| 模拟来源会话 | mock接口的动作及范围校验 | 模拟来源账号配置 | MOCK_ACCOUNT_ID用于申请短期会话；token只在运行内存 | 本地模拟用途，不能用于真实系统 |

日志不得记录Bearer头、完整环境文件或模型密钥。交付文档和测试证据仅保留凭据名称及脱敏错误。
