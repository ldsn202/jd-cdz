# T2.6 实现来源修订与变化发现 — 验证证据

> 执行时间：2026-09-20｜执行人：AI｜环境：mock-env-a（8790 实跑）

## 交付物
- `code/mocks/migrations/0003_source_events.sql` + `src/storage/source-events.ts`：来源事件日志（与业务写入同事务）
- `code/mocks/control/revise-source.ts`：开发用来源修订入口（应收/方案/条款/格式/材料版本，预期版本不符 40901，只改该来源记录）
- `code/mocks/change-feeds/feeds.ts`：feed 登记（基线初始清单，不从"现在"静默开始）+ 变化 GET（游标/分页/空批/代次校验，仅 SERVICE）
- T2.4/T2.5 写入路径回补事件发射（明细提交、审核/退回/补充、工单版本推进）
- `code/mocks/tests/changes.test.ts`：14 项真实 HTTP 断言（可重复执行）

## 逐断言结果（14 项全过）
- feed 登记返回基线初始记录；pageSize=1 分页 nextCursor 前进；同 cursor 重读 changeId 与内容稳定；消费完空批 nextCursor=cursor 且 hasMore=false
- 应收修订生成 receivable-2，空查询之后无需重置即被发现；应收读取返回新版含上一版本与修订说明；京东账单仍 bill-1（两侧独立）；修订预期版本不符 40901
- 事件与源写入一致（每个修订有事件、事件指向存在版本）；cursor 代次不符 40901；pageSize 越界 40001；HUMAN 40301
- 安装来源 feed 基线含经工单归属解析的明细/材料（修复：无服务商字段记录经 work_order/purchase_order 解析归属）
