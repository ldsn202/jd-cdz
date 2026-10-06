# T4.3 业务处理页面 — 阶段证据（任务进行中，未完成）

> 执行时间：2026-09-20｜执行人：AI｜环境：wrangler dev :8788 + vite :5174 + Playwright 1.63

## 本轮完成（读路径层）
- `FilteredItemsPage`（筛选列表通用件）+ 七个页面真实数据渲染：billing-work-orders（对账工单）、billing-orders（对账账单）、coordination（履约协同）、exceptions（本地异常）、integration-mappings（映射配置）、integration-credentials（凭据配置）、integration-change-history（变更历史）
- billing-compare：经 `GET /work-items/{id}/reconciliation` 分区展示京东账单/服务商应收/逐项比较/条款批准/核实问题，未取得区块如实标注
- materials：材料版本编号直开证据侧栏（复用 T4.2 EvidenceSidebar）
- integration-format-edit：来源格式说明只读底稿展示
- 验证：tsc+build 通过；Playwright 五页截图零脚本错误（pwScreenShot/T4.3-*.png）；协同/异常页展示真实 D1 行（异常处理中、结果准备中标识）

## 2026-09-21 续做：写请求基础（仍为进行中）
- 浏览器 API 请求层支持 `FormData` 由浏览器生成 multipart `Content-Type` 边界；40903 错误保留服务端返回的 `pendingOperation`，供页面沿原操作编号回查。
- 测试先行：`code/web/tests/api.test.mjs` 两项先失败、修复后均通过；`code/web` 的 `npm run build` 通过。
- 此轮未完成安装资料表单、实际上传或任何写操作的浏览器联调；下列未完成项保持原状态。

## 未完成（子计划完成标准未达，不宣称完成）
1. 五组写操作链路页面：资料确认提交（installation-submissions）、核查决定/退回/补充（review-decisions/supplements）、对账核实发起/回复（billing-questions/replies/facts）、协同进展/异常/完成（progress/exceptions/coordination-completion/exception-resolution）、接入启用（configuration-enablement）、上传入口（POST /uploads）
2. 四类异常路径页面呈现（版本冲突/重复提交/结果未知回查/分析失败）与操作后列表联动实证
3. 五域 UI 号段用例执行
4. billing-compare 分区字段名待与 06-subprd §3 逐块核对（当前为结构直透展示）
5. integration-format-edit 的映射编辑表单（当前只读底稿）

## 下一步
按五域子 PRD §3 实现写操作表单与异常路径，走通每组至少一条完整操作链路并截图后，方可回写 T4.3 完成。

## 写链路实现与实证（2026-09-21 补记）

### 交付物
- `code/web/src/pages/workbench/ActionPanels.tsx`：五域操作面板——PreparationPanel（草稿确认+补充材料上传 multipart）、ReviewPanel（核查通过/退回/服务商补充）、ReconciliationPanel（发起核实/应收回复）、CoordinationPanel（进展/异常登记/完成协同/异常处置）、ConfigurationPanel（配置启用）；统一 Idempotency-Key、受理回执、冲突/结果未知/拒绝三类受控呈现
- `code/web/src/pages/work-item-detail.tsx`：接入 ActionPanels，操作成功后事项与时间线联动重查

### 浏览器实证（Playwright，零脚本错误）
1. **履约异常处置完整链路（成功）**：w-dev-3 填处置结果 → 提交 → 事项 已完成/EXCEPTION_RESOLVED，时间线 DECISION_CONFIRMED（含原文）+ FOLLOWUP_LINKED，本地异常列表联动清空（T4.3-chain-*.png）
2. **核查通过异常路径（真实拒绝）**：w-dev-5 APPROVE → 42201「分析仍有未解决缺项，不可直接通过」，页面如实展示拒绝，无成功假象（T4.3-review-*.png）
3. **退回补充控制错误**：REQUEST_SUPPLEMENT → 42201「正式安装明细或版本缺失，不可提交核查决定」（dev 种子工单无已提交明细上下文，T4.3-return-*.png）

### 后端修复（T3.x 回归）
- review-decision.ts 明细版本兜底查询引用了不存在的 `installation_detail.source_version` 列，导致核查决定 500（D1_ERROR no such column）；改为从最近 SUCCEEDED 外部写入回执 `receipt_json.installationDetail.sourceVersion` 取得，缺失时按既有 42201 受控拒绝。api typecheck 通过； curl 复测返回 42201 而非 500。

### 仍未完成（T4.3 保持进行中）
- Preparation（资料确认提交）、Reconciliation（对账核实/回复）、Configuration（配置启用）三组链路需对应责任人身份（provider-clerk / 对账）与匹配种子数据走通，尚未执行浏览器实证
- 五域 UI 号段用例未执行；billing-compare 分区字段名待与 06-subprd §3 逐块核对

## 五组写链路全部走通（2026-09-21 补记二）

### 种子与身份（dev fixtures，见 code/db/seeds/dev-t43-*.sql）
- 对账：ir-dev-jd-recon（REQUEST/REPLY_BILLING_VERIFICATION）+ w-dev-6 RECONCILIATION + reconciliation_record rc-dev-1（DIFFERENCE，100.00 vs 120.00）
- 接入：ir-dev-provider-integration（ENABLE_INTEGRATION_CONFIG）+ w-dev-7 CONFIGURATION + 配置/候选版本/通过试验（含快照 config_versions 绑定、规则与通过结果）
- 资料：w-dev-2 草稿链路（上下文快照→INSTALLATION_EXTRACTION 分析→草稿 v1；提交时补 COMPLETE 上下文+草稿 v2）；原 clerk 授权缺 READ_SOURCE_MATERIAL（授权历史不可改），新建 ir-dev-provider-clerk2 重指派
- 触发器逐条对齐：grant_count、analysis_call_mismatch（capability_call）、draft 首版/顺序、trial 候选绑定与通过规则、快照 COMPLETE 缺项等

### 浏览器实证（Playwright，按身份切换 VITE_DEV_IDENTITY_TOKEN，零脚本错误）
| 组 | 链路 | 结果 |
| --- | --- | --- |
| 资料整理 | w-dev-2 确认并提交正式明细（草稿 v2/COMPLETE 上下文） | SUBMIT_INSTALLATION 受理，事项 处理中，时间线含 submissionId/operationId（先验 42201「上下文缺项」受控拒绝路径，T4.3-INSTALLATION_PREPARATION-*.png） |
| 安装核查 | w-dev-5 APPROVE / REQUEST_SUPPLEMENT | 42201「分析仍有未解决缺项」/「明细版本缺失」两条受控拒绝，另修后端明细版本 500（T4.3-review-*.png、T4.3-return-*.png） |
| 业务对账 | w-dev-6 发起核实 | 事项 待回复，时间线 REQUEST_FEE_VERIFICATION + questionActionId（T4.3-RECONCILIATION-*.png） |
| 接入配置 | w-dev-7 启用接入配置 | 事项 已完成 CONFIGURATION_ENABLED（T4.3-CONFIGURATION-*.png） |
| 履约协同 | w-dev-3 异常处置 | 事项 已完成 EXCEPTION_RESOLVED，异常列表联动清空（T4.3-chain-*.png） |

### 后端伴随修复
- review-decision.ts：明细版本兜底改读外部写入回执（原查不存在列，500→42201 受控）
- config-trial.ts readConfigurationView：补 activeVersionId / configurationRowVersion 字段（启用表单契约需要）
- 前端面板按真实视图字段对齐（versionId/trialId/sourceMaterials）

### 剩余（T4.3 保持进行中）
- 五域 UI 号段用例执行（建议与 T5.1 回归同跑）；billing-compare 分区字段名与 06-subprd §3 逐块核对；对账应收回复与服务商补充回复链路的第二段（需要应收/服务商侧身份与更完整往返数据）
