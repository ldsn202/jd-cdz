# T2.1 实现身份、工单和权益读取接口 — 验证证据

> 执行时间：2026-09-20｜执行人：AI｜环境：mock-env-a（8790 实跑）/ Node.js v25.8.1

## 交付物
- `code/mocks/identity/`：roles.ts（六类人员职责+SERVICE 动作表）、sessions.ts（受控测试会话签发/解析，停用 403、失效 401）、current-context.ts（身份上下文构建）
- `code/mocks/installation/context.ts`：工单上下文 GET（方案/明细/材料索引/版本/完整性）
- `code/mocks/purchase-orders/entitlements.ts`：购买订单与安装权益 GET（关联核实、适用性、数量类型）
- `code/mocks/src/server.ts`：挂载 `/api/admin/mock/external/` 路由；自报身份/范围参数一律 40001
- `code/mocks/tests/identity-workorders.test.ts`：18 项真实 HTTP 断言

## 逐断言结果（18 项全过，真实 HTTP + 来源库回查）
| 组 | 结果 |
| --- | --- |
| 会话 | 签发 201；停用身份 40301；无凭据/错凭据/失效会话 40101；自报 subjectId 40001；有效无授权 grants=[] |
| 身份上下文 | 服务商 HUMAN 范围仅 SP-001、动作含 CONFIRM_INSTALLATION_DRAFT；SERVICE 无人员映射、businessRole=null、不带人员动作；同名不同 ID 不混归属（SP-003 vs SP-001） |
| 工单上下文 | 本服务商工单 200（方案/明细状态/材料索引/版本）；跨服务商 40301 不泄露字段；不存在 40401；NOT_SUBMITTED 为正常阶段（detail=null 不列缺失）；无 READ_SOURCE_MATERIAL 时索引未取全并列 SOURCE_MATERIAL_INDEX（工单可见不自动放行材料） |
| 权益 | 正确关联 200：APPLICABLE、LIMITED 上限 1（上限不冒充实际量）；订单工单不符 40901；订单不存在 40401 |

原始响应样例（脱敏）：`current-context` 返回 identitySource=identity_mock、authorizationVersion=authorization-mock-1、grant 含 actions 与 SERVICE_PROVIDER 范围；`context` 返回 completeness/missingParts/sourceVersion 逐对象版本。
边界：工作台侧 404/深链接验收属 T4.2；SERVICE 不代人员确认由写入接口（T2.4/T2.5）执行时核验。
