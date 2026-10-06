# T3.2 交付后台HTTP适配与来源输入追溯 — 验证证据

> 执行时间：2026-09-20｜执行人：AI｜环境：mock-env-a（8790 实跑）+ code/api 集成测试（Node 直跑）

## 交付物
- `code/api/src/services/external/client.ts`（扩展）：受控会话签发与缓存（MOCK_ACCOUNT_ID），401 清缓存；`detailedMockCall` 返回 requestId/httpStatus；不可达统一 50301
- `code/api/src/adapters/external/`：trace.ts（AdapterTrace/Traced 类型）+ index.ts（12 条来源调用的追溯适配器：来源/ID/版本/requestId 留痕；文件字节复验 sha256 不一致拒绝消费）
- `code/api/src/adapters/ai/index.ts`：runAiOperation——mock 经 `/ai-runs` 且结果带 mockNotice；AI_MODE=real 未配置时 50301，不回退模拟答案（真实分析经内部任务路由）
- `code/mocks/ai/ai-runs.ts`：AI mock 流程端点（单独标记 mock:true + issues 声明，runId 幂等留痕于来源库）
- `code/api/tests/external-adapters/run-integration.ts`：11 项真实 HTTP 集成断言
- config-items 登记 MOCK_ACCOUNT_ID

## 逐断言结果（11 项全过）
- 身份/工单/账单/应收/费用依据 trace 均含来源、编号、版本、requestId；文件字节逐字节一致且适配器复验摘要（digestVerified=true）
- 版本不可取得映射 40901 不补造记录；来源不可达 50301 无旁路；EXTERNAL_MODE=real 未配置 50301 不降级
- AI mock 明确标记且留痕；AI_MODE=real 无配置 50301 不回退

边界：类型与错误映射可供后续服务直接导入；真实 AI 分析链路（job-dispatch + OpenCode）为业务 T2.2 既有能力，本轮未重跑四个 Skill 能力测试。
