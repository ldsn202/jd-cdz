# Cloudflare MCP 跨 Agent 连接说明

## 1. 文件用途

本文件供 Codex、Claude Code、Cursor、VS Code Copilot 及其他支持 MCP 的 Agent 读取。

Agent 可根据本文完成以下工作：

1. 连接 Cloudflare 官方 MCP Server。
2. 引导使用者完成 Cloudflare OAuth 授权。
3. 先通过只读查询验证连接。
4. 在获得明确授权后，管理 Workers、Pages、D1、R2 等 Cloudflare 资源。

**MCP 地址和配置方法可以随项目文件传递；Cloudflare 登录状态、OAuth 凭证、API Token 需要在每个 Agent 所在客户端单独配置。**

不同 Agent 使用的配置文件格式并不统一。本文件提供一套共同连接信息，以及各主流客户端可直接复制的配置。

---

## 2. 首选连接

| 项目 | 内容 |
|---|---|
| 名称 | Cloudflare API MCP |
| 官方地址 | `https://mcp.cloudflare.com/mcp` |
| 传输协议 | Streamable HTTP |
| 推荐认证 | 浏览器 OAuth |
| 主要用途 | 查询和管理 Cloudflare 账号内的 Workers、Pages、D1、R2、域名及其他平台资源 |

新客户端应使用以 `/mcp` 结尾的地址，不使用旧版 `/sse` 地址。

### 通用 MCP 配置

支持远程 HTTP MCP，且使用 `mcpServers` 作为根字段的客户端，可采用：

```json
{
  "mcpServers": {
    "cloudflare-api": {
      "url": "https://mcp.cloudflare.com/mcp"
    }
  }
}
```

保存配置并重启客户端后，首次调用 Cloudflare 工具通常会打开浏览器，要求登录 Cloudflare 并授权。

---

## 3. Codex

### 3.1. CLI 添加方式

```bash
codex mcp add cloudflare --url https://mcp.cloudflare.com/mcp
codex mcp login cloudflare
codex mcp list
```

### 3.2. 项目级配置方式

在可信项目的 `.codex/config.toml` 中加入：

```toml
[mcp_servers.cloudflare]
url = "https://mcp.cloudflare.com/mcp"
auth = "oauth"
default_tools_approval_mode = "writes"
```

`default_tools_approval_mode = "writes"` 表示读取操作可直接执行，写入操作仍需确认。涉及生产环境时，建议保留这一设置。

### 3.3. 验证

```bash
codex mcp list
```

也可以在 Codex TUI 中输入：

```text
/mcp
```

看到 Cloudflare Server 和可用工具后，再进行只读查询。

---

## 4. Claude Code

Cloudflare 官方为 Claude Code 提供了插件安装方式，插件会同时安装 Cloudflare Skills 与 MCP Servers：

```text
/plugin marketplace add cloudflare/skills
/plugin install cloudflare@cloudflare
```

安装完成后，首次调用 Cloudflare 工具时完成 OAuth 授权。

验证命令：

```bash
claude mcp list
```

如果当前 Claude Code 环境不支持插件，也可以按照“通用 MCP 配置”手动添加远程地址。

---

## 5. Cursor及其他支持远程 MCP 的 Agent

在客户端的 MCP 设置中新增一个远程服务器：

| 配置项 | 填写内容 |
|---|---|
| Server name | `cloudflare-api` |
| Transport | `HTTP` 或 `Streamable HTTP` |
| URL | `https://mcp.cloudflare.com/mcp` |
| Authentication | `OAuth` 或由客户端自动检测 |

如果客户端接受 JSON 配置，优先尝试第 2 节中的 `mcpServers` 配置。

客户端完成配置后需要重新加载 MCP Servers；部分客户端需要完全退出并重新启动。

---

## 6. VS Code Copilot

VS Code 使用 `servers` 作为根字段。在项目的 `.vscode/mcp.json` 中加入：

```json
{
  "servers": {
    "cloudflare-api": {
      "type": "http",
      "url": "https://mcp.cloudflare.com/mcp"
    }
  }
}
```

注意：VS Code 的根字段是 `servers`；很多其他客户端使用 `mcpServers`。字段写错后，客户端可能不会加载服务器。

---

## 7. 只支持本地 stdio MCP 的客户端

有些客户端无法直接连接带 OAuth 的远程 MCP，可以用 `mcp-remote` 作为本地转接：

```json
{
  "mcpServers": {
    "cloudflare-api": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://mcp.cloudflare.com/mcp"
      ]
    }
  }
}
```

该方式需要本机已安装 Node.js，并允许 `npx` 下载和执行 `mcp-remote`。首次连接仍需在浏览器中完成 OAuth。

---

## 8. 可选的 Cloudflare 官方 MCP Servers

刚开始只配置 `cloudflare-api` 即可。出现明确需求后，再增加专用 Server，避免工具列表过长。

| Server | 地址 | 适用场景 |
|---|---|---|
| Cloudflare API | `https://mcp.cloudflare.com/mcp` | 查询和管理 Cloudflare 平台资源，首选 |
| Documentation | `https://docs.mcp.cloudflare.com/mcp` | 搜索 Cloudflare 官方文档 |
| Workers Bindings | `https://bindings.mcp.cloudflare.com/mcp` | 查询 Workers 与 KV、D1、R2 等绑定关系 |
| Workers Builds | `https://builds.mcp.cloudflare.com/mcp` | 查询 Workers Builds 构建状态与构建问题 |
| Observability | `https://observability.mcp.cloudflare.com/mcp` | 查询日志、指标和运行问题 |

---

## 9. 首次连接验证

Agent 完成配置后，应按以下顺序验证：

1. 确认 MCP Server 出现在客户端的 Server 列表中。
2. 确认可见 Cloudflare 提供的工具。
3. 完成浏览器 OAuth 授权。
4. 先执行一次只读查询。
5. 只读查询成功后，再处理部署或资源变更。

推荐使用以下提示词做首次验证：

```text
请只读取当前 Cloudflare 账号中的 Workers 和 D1 数据库列表，返回名称和状态。不要创建、修改、部署或删除任何资源。
```

只有 Server 已加载、工具可见、只读查询成功，才能确认连接完成。

---

## 10. 项目部署时的分工

| 能力 | 推荐工具 | 主要工作 |
|---|---|---|
| 阅读和修改项目代码 | Agent 本身 | 识别前端、服务端、数据库结构，修改配置与代码 |
| 本地开发和正式部署 | Wrangler CLI | 本地运行、创建绑定、执行 D1 迁移、部署 Workers |
| 账号资源管理 | Cloudflare MCP | 查询和管理平台资源、构建记录、绑定和日志 |
| 源码托管与持续部署 | GitHub，可选 | 保存代码，触发 Cloudflare Git 集成构建 |

Cloudflare MCP 能提高对话式管理平台资源的能力。完整部署仍可能使用 Wrangler 完成本地构建、数据库迁移和发布。GitHub 属于可选集成，项目也可以从本地通过 Wrangler 部署。

---

## 11. 权限和安全要求

1. 禁止把 OAuth 凭证、Cloudflare API Token、账号密码写入本文件或提交到 Git。
2. API Token 只通过客户端 Secret、系统环境变量或 CI/CD Secret 注入。
3. Token 权限按实际任务最小化配置，并限定账号和 Zone 范围。
4. 首次连接先查询，不执行创建、修改、部署、迁移或删除。
5. 涉及生产环境发布、D1 迁移、域名变更、资源删除时，先向使用者说明目标和影响，再取得明确授权。
6. Agent 不得在回复、日志、截图或项目文件中暴露 Token、Cookie、OAuth Code 等认证信息。
7. 项目仓库可以保存本说明和无密钥配置模板，不保存已登录状态。

CI/CD 无法使用浏览器 OAuth 时，可以创建权限受限的 Cloudflare API Token，并由运行环境以 Bearer Token 方式提供。Token 的具体配置字段取决于 MCP 客户端，不能直接写死在跨客户端模板中。

---

## 12. 常见故障

| 现象 | 检查方式 |
|---|---|
| Server 没有出现 | 检查客户端使用 `servers` 还是 `mcpServers`，保存后重启客户端 |
| 地址可以访问但没有工具 | 确认地址以 `/mcp` 结尾，并选择 HTTP 或 Streamable HTTP |
| 首次调用卡在登录 | 检查浏览器是否拦截弹窗，重新发起 OAuth |
| OAuth 状态异常 | 删除该 MCP Server 后重新添加，再次授权 |
| 客户端不支持远程 OAuth | 使用第 7 节的 `mcp-remote` 转接方案 |
| MCP 可查询但无法完成部署 | 安装并登录 Wrangler，用 Wrangler 执行构建、迁移和部署 |
| 写操作被拒绝 | 检查 OAuth 或 API Token 权限，并确认客户端是否等待人工批准 |

---

## 13. 给读取此文件的 Agent

读取到本文件后，按以下规则执行：

1. 先识别当前客户端支持的 MCP 配置格式。
2. 首选连接 `https://mcp.cloudflare.com/mcp`。
3. 需要登录时，引导使用者在浏览器中完成 Cloudflare OAuth。
4. 不向使用者索要账号密码，也不要求把 Token 粘贴进项目文件。
5. 连接后先做只读验证，并明确报告实际读取结果。
6. 使用者只提出研究或检查时，不创建、修改、部署、迁移或删除资源。
7. 使用者明确要求部署后，再结合项目代码、Wrangler 和 Cloudflare MCP 完成操作。
8. 每次写操作前确认目标账号、项目名称、环境和影响范围。
9. 无法加载 MCP 时，说明当前客户端的限制，并提供 Wrangler CLI 方案。

---

## 14. 官方资料

- [Cloudflare 官方 MCP Servers 目录](https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/)
- [Cloudflare：Codex 配置](https://developers.cloudflare.com/agent-setup/codex/)
- [Cloudflare：Claude Code 配置](https://developers.cloudflare.com/agent-setup/claude-code/)
- [Cloudflare：VS Code 配置](https://developers.cloudflare.com/agent-setup/visual-studio-code/)
- [OpenAI Codex MCP 配置](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)

