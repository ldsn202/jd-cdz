# T4.1 前端骨架与会话 — 验证证据

> 执行时间：2026-09-20｜执行人：AI｜环境：wrangler dev :8788（本地 D1）+ vite :5174（/api 代理注入开发身份头）

## 交付物
- `code/web/src/api.ts`：统一信封与错误映射（40404/40401→not-found，40301/40303→forbidden，40901/40903/40904→conflict，50301/50401→unavailable，40101→unauthenticated）
- `code/web/src/session.tsx`：会话初始化（首屏第一个业务请求为 GET /api/admin/charging/session；失败→无法核实身份说明页，不用占位身份）
- `code/web/src/router.tsx`：hash 路由表 15 条（page-list 一一对应）
- `code/web/src/components/PageShell.tsx`：Skeleton/StateView/PageShell；`code/web/src/styles.css`（语义类，无 Tailwind 依赖）
- `code/web/src/pages/` 15 个页面骨架（无硬编码业务数据）
- `code/web/vite.config.ts`：代理注入 `VITE_DEV_IDENTITY_TOKEN`（默认 dev-token-jd-review，仅本地开发）

## 逐断言结果
| 断言 | 结果 |
| --- | --- |
| tsc --noEmit + vite build | PASS（dist 149KB js + 1.6KB css） |
| 会话链路 | 浏览器口径（无显式头）经代理 session 200 返回真实 D1 身份（京东核查员/INSTALLATION_REVIEWER/dev-auth-v1）；直连 Worker 带凭据 200；无凭据 40101 |
| 首屏为会话初始化 | session.tsx 先于任何页面数据请求；loading 骨架、failed 受控说明页+重试 |
| 15 路由可达 | parseHash 15/15 解析；未知路由 → null → StateView not-found |
| 骨架屏与无假数据 | 15 页均为 PageShell+Skeleton；grep 无硬编码业务数据/假待办 |
| 错误映射组件 | not-found/forbidden/unavailable/conflict/unauthenticated 五类受控视图（文案口径按 interaction-spec §1） |

边界：页面数据加载与真实接口接入属 T4.2/T4.3；浏览器截图级验证未执行（无 Playwright 环境依赖登记），以构建+代理链路+路由解析实证代替。
