# T2.3 实现双方账单及计费依据读取 — 验证证据

> 执行时间：2026-09-20｜执行人：AI｜环境：mock-env-a（8790 实跑）

## 交付物
- `code/mocks/jd-bills/read.ts`：京东账单 GET（整单权限、多工单 WORK_ORDER_AMOUNT、关联不符 40901）
- `code/mocks/provider-receivables/read.ts`：服务商应收 GET（原分项/总额、版本、修订信息位）
- `code/mocks/billing-evidence/read.ts`：条款与批准记录 GET（适用范围/生效依据/查全标记）
- `code/mocks/tests/billing-sources.test.ts`：12 项真实 HTTP 断言

## 逐断言结果（12 项全过）
- 单工单账单字段齐全，目标金额=原总额，分项×单价与合计独立十进制复算一致；一账单多工单：无分配依据 targetWorkOrderAmount=null 列 WORK_ORDER_AMOUNT/INCOMPLETE，整单 2 工单可见
- 关联不符 40901、不存在 40401、越权 40301（data=null）；NEG-01 总分不符原样保留（10160.00 vs 10170.00），接口不预计算差额
- 应收读取独立复算一致；测试工具在来源侧改应收为 99999.99 后京东账单仍为 1275.00（两侧独立，已恢复来源原值）
- 费用依据完整组：条款 EFFECTIVE+批准 APPROVED 且范围明确；依据不完整场景：查全为真但无批准记录（与未查全区分）；按服务商范围控制
- 全部返回不夹带 reconciliationSummary/预制判断/场景标签
