# 受控后台执行与本地运行接口

> 状态：开发契约及本地实现持续联调；已有任务执行和真实HTTP证据，完整业务验收尚未完成
> 上游（我引用）：[公共约定](common-contract.md) §1—5、[执行表结构](../03-05-schema/execution-schema.md) §1—5、[变化接口](../03-02-external-apis/source-record-changes-read.md) §2—4、[AI 契约](../03-02-external-apis/ai-inference-material-parsing.md) §2—5
> 下游（引用我）：[T5.1工程记录](../../08-test-reports/T5.1-engineering-20260921/README.md) 内部执行接口；[自动准备与分析](../03-07-system-flows/sys-analysis-preparation.md) §1—4、[事务与恢复](../03-07-system-flows/sys-transactions-recovery.md) §1—5、[模拟与上传](../03-07-system-flows/sys-mock-upload.md) §1—3；[mock T3.2子计划](../../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T3.2-backend-adapters.md) PRD双链·读

## 1. 边界与鉴权

下列 `/api/admin/charging/internal/...` 路由仅向受控 SERVICE 开放，浏览器不能凭人员会话调用。实际程序身份由服务端验证；服务凭据不进入前端、Skill 输入或业务日志。Node通过受控HTTP主动领取Worker任务；Node负责子进程和文件工作目录，Worker不启动OpenCode。

业务写入必须保留原 HUMAN 决定，执行前另核实原人员和原账号；内部执行成功不表示获得新的人员授权。

## 2. 接收变化批次

`POST /api/admin/charging/internal/change-batches`，由变化适配器调用，需 READ_SOURCE_CHANGES 及对应 feed 的明确范围。正文必填 `feedId`、`generationId`、`expectedCursor`、`response`；response 为外部变化接口完整返回 data，包含 list、cursor、nextCursor、hasMore 和覆盖信息。

服务端核实来源、配置代次、原位置及返回结构。空 list 返回 HTTP 200 `{batchId:null,acceptedCount:0,currentCursor,jobIds:[]}`，保持位置；非空批按顺序保存固定变化、覆盖任务及关联、完整批次，再条件推进位置。返回 `{batchId,acceptedCount,currentCursor,jobIds}`，acceptedCount 为实际接收条数。

同批或重叠批需逐条核对稳定 changeId 的内容，不能用新内容覆盖旧提示。位置冲突 40901；同变化身份不同内容 40902；来源返回结构不完整 50201。只有整个接收事务完成才回复成功；尚不明确业务关联时也须保存 DISCOVER_RELATIONS 任务。

## 3. 领取与完成后台尝试

`POST /api/admin/charging/internal/job-claims`。程序凭据确定执行者，正文 `{purposes,limit}`；purposes 为其被允许的任务目的数组，limit 为 1—10 的开发批量上限。返回 `{claims:[{jobId,attemptId,purpose,target,leaseToken,leaseEpoch,leaseUntil}]}`，无可领取为 []。

查询实际到期 READY/RETRY_WAIT 任务，或符合恢复条件的过期 RUNNING 任务。按 row_version、原状态、available_at、lease_until 条件领取，写新 token/epoch 和执行尝试；同事务后返回。已过期的外部写入任务先回查旧操作，不因领取而重新发出写入。

mock 环境额外要求当前事项、当前 analysisGeneration 存在人员显式触发记录（manualTrigger=true），才可领取分析准备、分析、来源材料解析或配置试转换；条件同时用于候选查询和实际领取。历史自动恢复记录不能充当手动授权。真实上传文件的离线解析可以先执行，供人员预览；它不触发模型分析。非 mock 来源保持既有自动流程。

`POST /api/admin/charging/internal/job-attempts/{attemptId}/heartbeats`，正文必填 leaseToken、leaseEpoch；实际 SERVICE 须与领取者一致。仅在租约仍有效且当前代次匹配时延长 leaseUntil，返回 `{attemptId,leaseUntil}`；40901 表示失去领取权，停止发布。租期与续租周期必须在部署配置中登记并按实际执行耗时验证。

`POST /api/admin/charging/internal/job-attempts/{attemptId}/results`。正文必填 leaseToken、leaseEpoch、status、dispatchState、result；status 为 SUCCEEDED / FAILED / UNKNOWN，result 为对应任务固定结构的对象，失败时另带 errorCode。后端核实程序身份、租约、输入和结果契约，保存尝试，并按任务类型采用结果、安排后续或保留待恢复；返回 `{attemptId,jobId,adopted,jobStatus}`，adopted 为 boolean。

`POST /api/admin/charging/internal/job-attempts/{attemptId}/dispatch-start`，在实际外部调用之前执行。正文仅 leaseToken、leaseEpoch；服务端重核当前程序身份、任务种类和固定调用，对新业务写入还受控重核原确认人、源端版本与原账号，保存当次授权上下文，条件把 dispatch_state 从 NOT_SENT 改为 MAY_HAVE_BEEN_SENT 并提交，返回 `{attemptId,dispatchState}`。未成功登记不准发出外部调用；结果未知的操作拒绝再次登记新写，转 QUERY_EXTERNAL。Node 不直接写 D1，也不等到终态上报才登记写出事实。

过期或旧代次响应只进入受限诊断，不更新当前任务、业务结果或事项指针；40901 返回失去领取权。调用已经发出却失联时保留 MAY_HAVE_BEEN_SENT，UNKNOWN 不作为业务拒绝。前后端不得直接将此接口的 SUCCEEDED 当作人员事项完成。

新业务写入的 dispatch-start 同事务把对应 external_write_operation 从 REGISTERED 条件改为 PROCESSING；任一租约、事项、授权或操作状态检查失败均回滚。QUERY_EXTERNAL 只登记本次查询尝试，保留原操作 RESULT_UNKNOWN，直到取得可核实终态。

## 4. 本地 Node 任务运行

`POST /api/admin/charging/internal/agent-runs`，由 API 的后台执行适配器调用本地 Node 服务。请求采用 AI 契约的 `runId,operation,profileId,parseInput,analysisInput`，并提供服务端固定的 `implementationVersion,skillPackageDigest,inputDigest`。解析时 skillPackageDigest 可 null，分析时必有。Node 再核实摘要与已登记包，禁用客户端任意工作目录、命令与工具权限。

同 runId 同输入复用任务；同编号不同内容 40902。受理后返回 202 `{runId,status:"ACCEPTED"}`。由 Node 准备固定版本 Skill、受控工具和输入目录并启动 OpenCode；CLI JSON 事件用于过程采集，业务结果从约定产物读取并验证，二者不能混用。

`GET /api/admin/charging/internal/agent-runs/{runId}`，同服务身份与任务范围核实后返回 `{runId,status,result,error}`。status 为 ACCEPTED / RUNNING / SUCCEEDED / FAILED；未完成 result=null，成功 result 为 AI 契约完整输出，失败 error=`{code,msg}`；无错误为 null。结果必须匹配原 runId、输入、Skill 与实现版本。采用和业务发布由 API 完成，Node 不直接改业务数据库。

## 5. 失败与配置

AI 运行重试次数与总预算沿外部 AI 契约，使用原 runId 与固定输入；可再次计费，不声称模型天然幂等。真实模式失败不得返回固定答案。外部业务写入未知按原编号回查，不能套用 AI 的重试方法。

内部服务地址、身份凭据渠道、租约、容量、文件限制、EXTERNAL_MODE 与 AI_MODE 在实现前登记部署配置；秘密值不写进文档。当前契约不承诺生产模型质量、性能或真实提供方可用。


## 6. 本地联调补充接口（2026-09-21）

全部路径以 `/api/admin/charging` 开头，要求SERVICE身份；读取和写入都重新核对服务商范围。开发凭据仅用于本地，生产身份接入尚待落实。

| 方法与路径 | 输入 | 实际行为 |
|---|---|---|
| GET `/internal/source-import/scope` | 无 | 双方SERVICE授权交集，返回范围及来源身份核验凭据编号；不返回令牌 |
| POST `/internal/source-import/providers` | 无 | 经来源 HTTP 分页读取授权交集内服务商名录，验证整批后幂等同步名称，不改变工单归属及历史 |
| POST `/internal/source-import/feeds` | serviceProviderId | 向模拟来源登记新基线，返回feedId、startCursor、baselineCount |
| POST `/internal/source-import/pages` | serviceProviderId、feedId、cursor | 每页最多10条，经来源HTTP取工单上下文并核对版本；返回IMPORTED/UNCHANGED/FAILED，失败不覆盖历史 |
| POST `/internal/source-monitor/initialize` | serviceProviderId | 幂等建立本地变化订阅及初始代次；目前覆盖installation-admin来源 |
| POST `/internal/source-monitor/poll` | feedId | 读取实际变化页，经change-batches事务固定后推进位置；并发冲突整批回滚 |
| POST `/internal/job-attempts/:attemptId/source-discovery` | leaseToken、leaseEpoch | 服务端实际核实完整工单关联和业务阶段，创建或接续事项及READ_SOURCE；等待外部/人员动作时保留RETRY_WAIT，不吞掉变化 |
| POST `/internal/job-attempts/:attemptId/input-preparation` | leaseToken、leaseEpoch、skillPackageDigest | 实际分类取数并固定分析输入，按当前代次登记分析任务；外部取数后在事务内再次验证租约 |
| POST `/internal/job-attempts/:attemptId/material-content` | leaseToken、leaseEpoch | 返回该尝试绑定的固定材料字节；每次检查材料实际所属服务商、版本与当前lease |
| POST `/internal/job-attempts/:attemptId/configuration-trial` | leaseToken、leaseEpoch | Worker从候选原输入执行确定性规则；Node不能提交PASSED/checks替代真实试转换 |

来源导入只证明授权范围，不创建假事项；变化发现无法核实配置业务范围或工单关系时明确BLOCKED。固定历史不采用替换写入。材料解析和配置试转换的失败保留实际问题，不回退固定成功结果。
