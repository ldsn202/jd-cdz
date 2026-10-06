# T4.2 工作台总览与工单追溯页面 — 验证证据

> 执行时间：2026-09-20｜执行人：AI｜环境：wrangler dev :8788（本地 D1 真实开发数据）+ vite :5174 + Playwright 1.63 截图

## 交付物
- `code/web/src/api.ts`（扩展）：providers / work-items(list/summary/detail/activities) / operations / work-orders(list/detail) / material-versions(meta/content) 类型化接口
- `code/web/src/hooks.ts`：useApiData（loading/failed/ready + retry，失败不清空语义）；`code/web/src/labels.ts`：枚举中文标签
- `code/web/src/pages/workbench/WorkbenchPage.tsx`：待处理事项页五区块（身份/汇总/筛选/列表/分页），home 与 work-items 复用
- `code/web/src/pages/work-item-detail.tsx`：事项详情 + 处理记录时间线 + 外部操作结果块
- `code/web/src/pages/installation-orders.tsx`：工单列表（服务商筛选/关键词/分页/聚合列）
- `code/web/src/pages/installation-order-detail.tsx`：工单详情四信息区 + 关联事项 + 材料入口
- `code/web/src/pages/orders/EvidenceSidebar.tsx`：原始证据侧栏（元数据/版本切换/原文预览/解析区/缺项）

## 真实验证
- 后端数据链路（经 5174 代理）：summary total=4（BLOCKED 1/EXCEPTION 1/READY 2；COORDINATION 1/INSTALLATION_REVIEW 3）；work-items 列表真实 D1 行；work-orders 聚合 activeKinds/activeItemCount
- Playwright 四页截图（pwScreenShot/），页面脚本零错误：
  - T4.2-workbench-home.png：五区块齐全——身份区角色中文标签、汇总区总数与分组计数、五筛选控件、事项行三行布局（类型/状态/分析状态标识、待分配/时间）、分页区 total/page/asOf
  - T4.2-orders-list.png：聚合字段（当前阶段多值并列、进行中事项数、最近更新）
  - T4.2-order-detail.png：四信息区；权益 UNAVAILABLE 与方案未取得如实展示（不显示无依据内容）；未导入材料不开放预览；关联事项 4 条
  - T4.2-workitem-detail.png：分析摘要原样展示；处理记录时间线 actor/occurredAt 为 null 时显示"执行人未知/来源时间未知"
- 异常兜底按 §3.7/§3.5：401 不发后续请求（T4.1 已证）、404 受控、503 重试不清空、空态区分无权限与筛选无结果
- tsc --noEmit + vite build 通过

## 边界
- 证据侧栏原文预览在 dev D1 无 VERIFIED 材料未截图走查（组件按契约实现，待 T4.3 材料浏览页与 T5.1 联调覆盖）
- 分析状态 NOT_READY 与 BLOCKED 标识共用警示色（展示口径正确，样式待细化）
- 截图前发现并修复 4 个页面文件写入未持久化（home/work-items/installation-orders/installation-order-detail 曾回退为骨架版，heredoc 重写并验证磁盘后重建截图）
