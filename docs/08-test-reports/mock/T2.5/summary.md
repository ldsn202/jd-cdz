# T2.5 实现审核、退回与补充写入和回查 — 验证证据

> 执行时间：2026-09-20｜执行人：AI｜环境：mock-env-a（8790 实跑）

## 交付物
- `code/mocks/installation/review-actions.ts`：review-actions POST（APPROVE/REQUEST_SUPPLEMENT/SUBMIT_SUPPLEMENT 三动作，角色前置、版本条件、回复轮次、幂等）+ GET 回查
- `code/mocks/tests/review-writeback.test.ts`：15 项真实 HTTP 断言

## 逐断言结果（15 项全过）
- APPROVE SUCCEEDED，回执含 review-1 记录版本与前进后的工单版本 work-order-2；回查同一份回执；重放返回原结果不因版本已变误报冲突；同编号改内容 40902
- REQUEST_SUPPLEMENT（具体问题非空）→ SUBMIT_SUPPLEMENT 接续原退回 SUCCEEDED；重复回复同一退回 40903（已不在待回复状态）；缺 replyTo 40001；非补充携带 replyTo 40001；空意见 40001
- 明细/工单版本已变 40901（版本随动作前进）；明细未提交不可批准；服务商越权审核、对账角色核查均 40301
- 写入单事务：review_action 记录 + 工单版本推进；SERVICE/非责任人不代决定
