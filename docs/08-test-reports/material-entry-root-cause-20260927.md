# 材料入口修复与空数据原因核查

> 上游（我引用）：[原型清单](../02-prototype/page-list.md) §1、[工单与记录 PRD](../05-prd/02-subprd-orders-history.md) §3.4、[前端骨架计划](../07-delivery-plans/sub-delivery-plan-jd-charging-T4.1-web-shell.md)、[本地启动](../09-deploy/local-setup.md) §2、§6
> 下游（引用我）：[当前进度](../00-process/00-02-progress/progress.md) 最近动作、[当日日志](../00-process/00-01-logs/20260927.md) 补充更新、业务主计划与看板本次修复记录

## 1. 已修复

删除 App 菜单、首页快捷入口、materials 路由与 materials.tsx。工单详情和事项分析中的 EvidenceSidebar、EvidenceLinks 及材料 API 保留。旧 /materials 地址进入既有不存在状态。

## 2. 错误出现在哪一层

- 原型清单只登记“原始证据侧栏”，入口为事项详情 → 查看原文；PRD §3.4 明确从工单、事项或处理记录滑出。
- T4.1 子计划把“15 个页面 / 视图”转写成“15 个路由全部可达”，是目前可核实的最早文档偏差。已纠正验收口径，并同步主计划和看板。
- 前端实现添加独立 MaterialsPage，要求手输 materialVersionId；菜单和首页再暴露该入口。未发现 PRD 要求这样设计。缺陷落在计划拆解与前端实现，材料存储/API的按编号读取能力本身合理。
- T4.2 历史报告曾写“待 T4.3 材料浏览页与 T5.1 联调覆盖”，说明审查继续接受了该页面。现有 Git 仅能追至迁移提交，无法证明原始生成者或精确提交；“计划偏差导致页面新增”是文档与实现相符的推断，不当作已证明的提交因果。

## 3. 为什么当前页面为空

| 层 | 2026-09-27 实际证据 | 影响 |
| --- | --- | --- |
| mock 来源库 | installation-admin.source_record 有 1000 条 work_order；生成清单有 100 家服务商、997 份文件 | 来源数据存在 |
| 当前业务库 | installation_work_order、work_item、source_material_version、background_job、change_batch 均为 0；service_provider 为 2 | 页面读取的业务数据库尚未导入数据 |
| 导入身份 | 用本地 SERVICE 令牌请求 source-import/scope，返回 HTTP 403 / 40301“来源身份必须为 SERVICE” | .dev.vars 使用 acc-jd-review，人类核查账号不能作为后台导入身份 |
| 授权范围 | 本地后台仅 provider-dev-a/provider-dev-b，当前人类账号仅 provider-dev-a；标准来源使用 SP-001 等编号 | 即使换成后台来源账号，现有双方服务商范围仍不匹配；页面账号也看不到标准来源 |
| 自动发现 | 当前启动进程没有 source-monitor | runner 只领取已有任务，无法单靠启动它建立来源变化订阅 |
| 历史导入 | 9 月 21 日 source-import-1000.json 记录 100 家/1000 单成功；该轮 README 明确使用隔离 Worker 18888 和来源 18890 | 历史验收报告不能证明当前 8788 的新数据库已有数据 |
| AI 分析 | 当前 AI_MODE=mock，material-parser.mjs 明确报 MOCK_AI_NOT_ANALYSIS | 即使恢复原始数据，也不会自动得到真实模型分析结论 |

上轮启动只恢复了服务进程、新库迁移和开发身份，并生成 mock 来源；没有完成来源导入、双方身份范围对齐和来源监测。这是本轮启动遗漏，不能归因于 mock 数据不存在。无法据当前文件证明历史验收数据库已丢失或仍可恢复。

## 4. 验证与边界

前端构建通过，既有前端测试 10/10 通过；Safari 实际确认侧栏和首页业务查询均无材料浏览入口。源码核对工单和事项的查看原文组件保留；当前没有业务材料，未声称完成材料预览业务回归。

此次仅修复材料入口并核查数据链路，没有更改账号授权、导入业务记录或切换真实模型。完整业务验收状态保持。
