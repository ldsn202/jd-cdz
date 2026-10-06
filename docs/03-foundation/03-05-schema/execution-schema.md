# 变化接收与执行域表结构

> 版本：V1.0｜日期：2026-09-20｜状态：foundation 候选设计；本地约束验证，调度及外部调用未实现
> 上游（我引用）：[执行 ER](../03-03-er/er-change-execution.md) §1—6、[身份表结构](identity-schema.md) §1—4、[材料与证据](evidence-schema.md) §2—7、[安装表结构](installation-schema.md) §2—7、[变化接口](../03-02-external-apis/source-record-changes-read.md) §2—4、[AI 契约](../03-02-external-apis/ai-inference-material-parsing.md) §2—5
> 下游（引用我）：[T5.1工程记录](../../08-test-reports/T5.1-engineering-20260921/README.md) 租约与并发；[表结构总核对](coverage-review.md) §2—4、[受控后台执行与本地运行接口](../03-06-provided-apis/execution-apis.md) §1—5、[来源变化、自动准备与 Skill 分析](../03-07-system-flows/sys-analysis-preparation.md) §1—4；[mock T3.1子计划](../../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T3.1-faults-environments.md) PRD双链·读

## 1. 范围与保存职责

候选 SQL：[execution-schema.sql](execution-schema.sql)。九张表保存变化配置及代次、批次、变化、任务与触发关联、固定能力调用、实际尝试和外部业务写入。批次内有序变化关系保存在 change_ids_json；尝试的多份授权依据保存在 authorization_contexts_json。原记录变化与本地写入的匹配依据保存在任务 target_json，保留来源动作身份及回执，不能仅凭工单号推定匹配。

沿用前域逻辑关联与固定历史约定。事务和跨域保护见表结构总核对；JSON 内部业务语义由服务端校验。原文件与模型长日志在受控文件存储，表内只保存固定引用和必要结果，禁止将密钥放入任何 JSON。

## 2. 字段与索引

### change_feed

| 字段 | 类型 | 必填 | 默认 | 含义 |
| --- | --- | --- | --- | --- |
| id | TEXT | 是 | — | 本表稳定本地编号，由服务端生成。 |
| service_provider_id | TEXT | 是 | — | 本地 service_provider.id；不是前端自报的授权凭据。 |
| source_system | TEXT | 是 | — | 可靠来源系统标识；权限范围仅 SOURCE_RECORD 必填。 |
| gmt_create | INTEGER | 是 | — | 创建时的 UTC 毫秒整数。 |
| gmt_modified | INTEGER | 是 | — | 变更 UTC 毫秒；固定历史等于创建时间。 |

索引：主键 id；用于稳定身份去重及本表所属任务、范围或历史查询。

### change_feed_generation

| 字段 | 类型 | 必填 | 默认 | 含义 |
| --- | --- | --- | --- | --- |
| id | TEXT | 是 | — | 本表稳定本地编号，由服务端生成。 |
| feed_id | TEXT | 是 | — | 所属 change_feed.id；稳定的来源与服务商范围。 |
| generation_no | INTEGER | 是 | — | 同一 feed 的配置代次，从 1 开始。 |
| scope_json | TEXT | 是 | — | 本代次固定的完整读取范围与取得方式，不含密钥。 |
| start_cursor | TEXT | 是 | — | 已核实的本代次起始位置，不复用未经核实的旧位置。 |
| current_cursor | TEXT | 是 | — | 已可靠接收的位置；批次、变化与任务保存后条件推进。 |
| state | TEXT | 是 | — | PREPARING / READY / GAP / RETIRED。 |
| source_acquired_position | TEXT | 否 | NULL | 适配层从来源取得的位置，与本系统接收 cursor 分开。 |
| coverage_through | INTEGER | 否 | NULL | 来源可证明的覆盖截止时间，未知 NULL，不填本地当前时间。 |
| row_version | INTEGER | 是 | — | 本地条件更新版本，每次修改加 1。 |
| gmt_create | INTEGER | 是 | — | 创建时的 UTC 毫秒整数。 |
| gmt_modified | INTEGER | 是 | — | 变更 UTC 毫秒；固定历史等于创建时间。 |

索引：主键 id；唯一 feed_id（部分状态）；唯一 feed_id, generation_no；用于稳定身份去重及本表所属任务、范围或历史查询。

### source_change

| 字段 | 类型 | 必填 | 默认 | 含义 |
| --- | --- | --- | --- | --- |
| id | TEXT | 是 | — | 本表稳定本地编号，由服务端生成。 |
| feed_id | TEXT | 是 | — | 所属 change_feed.id；稳定的来源与服务商范围。 |
| source_change_id | TEXT | 是 | — | source_change 表为 feed 内来源 changeId；触发表为本地 source_change.id。 |
| record_type | TEXT | 是 | — | 来源记录类型，按外部变化契约枚举校验。 |
| source_record_id | TEXT | 是 | — | 原记录编号，与 feed 来源及 record_type 共同定位。 |
| source_version | TEXT | 否 | NULL | 不透明的来源版本，未知 NULL。 |
| change_type | TEXT | 是 | — | UPSERT / REMOVED，未查到记录不能推导移除。 |
| association_completeness | TEXT | 是 | — | COMPLETE / INCOMPLETE / UNKNOWN，限定关联范围的完整性。 |
| associations_json | TEXT | 是 | — | 来源返回的原始业务关联数组，保留不完整状态。 |
| payload_json | TEXT | 是 | — | 完整变化提示对象，固定保存。 |
| payload_sha256 | TEXT | 是 | — | 固定提示内容的 SHA-256 小写摘要；同号不同内容报冲突。 |
| gmt_create | INTEGER | 是 | — | 创建时的 UTC 毫秒整数。 |
| gmt_modified | INTEGER | 是 | — | 变更 UTC 毫秒；固定历史等于创建时间。 |

索引：主键 id；查询 feed_id, record_type, source_record_id, gmt_create, id；唯一 feed_id, source_change_id；用于稳定身份去重及本表所属任务、范围或历史查询。

### change_batch

| 字段 | 类型 | 必填 | 默认 | 含义 |
| --- | --- | --- | --- | --- |
| id | TEXT | 是 | — | 本表稳定本地编号，由服务端生成。 |
| generation_id | TEXT | 是 | — | 本地 change_feed_generation.id，不能只按 feed 匹配旧代次。 |
| from_cursor | TEXT | 是 | — | 接收本批时的原 cursor。 |
| next_cursor | TEXT | 是 | — | 非空批返回的新位置，必须不同于原位置。 |
| change_ids_json | TEXT | 是 | — | 本批顺序排列的本地 source_change.id 数组，非空、去重。 |
| original_response_json | TEXT | 是 | — | 批次原返回，保存完整清单及覆盖信息。 |
| retrieved_at | INTEGER | 是 | — | 实际取得时间，UTC 毫秒。 |
| source_checked_at | INTEGER | 否 | NULL | 来源实际查询时间，未知 NULL。 |
| coverage_through | INTEGER | 否 | NULL | 来源可证明的覆盖截止时间，未知 NULL，不填本地当前时间。 |
| has_more | INTEGER | 是 | — | 来源的继续读取标记，0/1；0 不证明全来源已同步。 |
| gmt_create | INTEGER | 是 | — | 创建时的 UTC 毫秒整数。 |
| gmt_modified | INTEGER | 是 | — | 变更 UTC 毫秒；固定历史等于创建时间。 |

索引：主键 id；唯一 generation_id, from_cursor；用于稳定身份去重及本表所属任务、范围或历史查询。

### background_job

| 字段 | 类型 | 必填 | 默认 | 含义 |
| --- | --- | --- | --- | --- |
| id | TEXT | 是 | — | 本表稳定本地编号，由服务端生成。 |
| purpose | TEXT | 是 | — | 后台任务目的；全部枚举及接续要求见 §3。 |
| service_provider_id | TEXT | 是 | — | 本地 service_provider.id；不是前端自报的授权凭据。 |
| work_item_id | TEXT | 否 | NULL | 关联事项；范围发现和材料解析任务可 NULL，分析及业务写入必须有明确事项。 |
| external_write_id | TEXT | 否 | NULL | external_write_operation.id，外部写入和回查任务必填。 |
| target_json | TEXT | 是 | — | 固定业务范围、目标、版本、输入代次、前序任务及接续依据。 |
| dedupe_key | TEXT | 是 | — | 服务端按目的、范围、确切版本和触发代次生成的稳定唯一键。 |
| status | TEXT | 是 | — | 任务、尝试、外部写入各自的执行状态，见 §3，不代表人员事项完成。 |
| available_at | INTEGER | 否 | NULL | 允许下次领取的 UTC 毫秒；待重试任务按预算设置。 |
| lease_epoch | INTEGER | 是 | 0 | 领取代次；新领取加 1，续租保持，旧执行者不能提交当前结果。 |
| lease_token | TEXT | 否 | NULL | 不可由浏览器指定的领取令牌，任务非运行状态为 NULL。 |
| lease_owner | TEXT | 否 | NULL | 实际 SERVICE 身份编号。 |
| lease_until | INTEGER | 否 | NULL | 领取有效上限 UTC 毫秒，运行中必须晚于本次更新时间。 |
| row_version | INTEGER | 是 | — | 本地条件更新版本，每次修改加 1。 |
| outcome_json | TEXT | 否 | NULL | 阶段完成、失败或取消依据；终态必填，不等于整条业务链完成。 |
| gmt_create | INTEGER | 是 | — | 创建时的 UTC 毫秒整数。 |
| gmt_modified | INTEGER | 是 | — | 变更 UTC 毫秒；固定历史等于创建时间。 |

索引：主键 id；查询 work_item_id, gmt_create, id；查询 status, available_at, id；唯一 dedupe_key；用于稳定身份去重及本表所属任务、范围或历史查询。

### job_change_trigger

| 字段 | 类型 | 必填 | 默认 | 含义 |
| --- | --- | --- | --- | --- |
| id | TEXT | 是 | — | 本表稳定本地编号，由服务端生成。 |
| job_id | TEXT | 是 | — | 所属 background_job.id。 |
| source_change_id | TEXT | 是 | — | source_change 表为 feed 内来源 changeId；触发表为本地 source_change.id。 |
| generation_id | TEXT | 是 | — | 本地 change_feed_generation.id，不能只按 feed 匹配旧代次。 |
| gmt_create | INTEGER | 是 | — | 创建时的 UTC 毫秒整数。 |
| gmt_modified | INTEGER | 是 | — | 变更 UTC 毫秒；固定历史等于创建时间。 |

索引：主键 id；查询 source_change_id, generation_id, job_id；唯一 job_id, source_change_id, generation_id；用于稳定身份去重及本表所属任务、范围或历史查询。

### capability_call

本表 id 对应 AI 契约 runId，同一编号始终绑定同一输入与运行配置。

| 字段 | 类型 | 必填 | 默认 | 含义 |
| --- | --- | --- | --- | --- |
| id | TEXT | 是 | — | 本表稳定本地编号，由服务端生成。 |
| job_id | TEXT | 是 | — | 所属 background_job.id。 |
| operation | TEXT | 是 | — | PARSE_MATERIAL / ANALYZE_SKILL，两种输入互斥。 |
| source_material_version_id | TEXT | 否 | NULL | 解析调用的 VERIFIED 确切文件版本，分析调用为 NULL。 |
| input_snapshot_id | TEXT | 否 | NULL | 分析调用的封存输入快照，解析调用为 NULL。 |
| profile_id | TEXT | 是 | — | 实际解析/模型配置编号。 |
| implementation_version | TEXT | 是 | — | 已解析的实际实现版本，重试不变。 |
| config_json | TEXT | 是 | — | 固定配置、Skill 版本、输出结构版本与允许工具信息；不含凭据。 |
| input_sha256 | TEXT | 是 | — | 实际文件或封存输入的 SHA-256 小写摘要。 |
| gmt_create | INTEGER | 是 | — | 创建时的 UTC 毫秒整数。 |
| gmt_modified | INTEGER | 是 | — | 变更 UTC 毫秒；固定历史等于创建时间。 |

索引：主键 id；查询 job_id, id；用于稳定身份去重及本表所属任务、范围或历史查询。

### execution_attempt

| 字段 | 类型 | 必填 | 默认 | 含义 |
| --- | --- | --- | --- | --- |
| id | TEXT | 是 | — | 本表稳定本地编号，由服务端生成。 |
| job_id | TEXT | 是 | — | 所属 background_job.id。 |
| attempt_no | INTEGER | 是 | — | 同一任务内递增尝试序号。 |
| executor_identity_id | TEXT | 是 | — | 执行者的 SERVICE 身份引用，不代替原人员。 |
| capability_call_id | TEXT | 否 | NULL | 本次能力调用编号；取数或外部写入尝试可 NULL。 |
| lease_epoch | INTEGER | 是 | — | 领取代次；新领取加 1，续租保持，旧执行者不能提交当前结果。 |
| lease_token | TEXT | 是 | — | 不可由浏览器指定的领取令牌，任务非运行状态为 NULL。 |
| authorization_contexts_json | TEXT | 是 | — | 按用途保存上下文编号、匹配授权项和目标：EXECUTOR 或 ORIGINAL_ACTOR；允许失败前尚未取得。 |
| dispatch_state | TEXT | 是 | — | NOT_SENT / MAY_HAVE_BEEN_SENT / RESPONSE_RECEIVED，写出前先持久记为可能已发出。 |
| status | TEXT | 是 | — | 任务、尝试、外部写入各自的执行状态，见 §3，不代表人员事项完成。 |
| started_at | INTEGER | 是 | — | 实际尝试开始时间。 |
| ended_at | INTEGER | 否 | NULL | 实际结束时间；运行中 NULL。 |
| result_json | TEXT | 否 | NULL | 响应摘要、错误或未采用原因，不保存访问令牌。 |
| error_code | TEXT | 否 | NULL | 失败或未知结果原因，可空；不能以空值推导成功。 |
| gmt_create | INTEGER | 是 | — | 创建时的 UTC 毫秒整数。 |
| gmt_modified | INTEGER | 是 | — | 变更 UTC 毫秒；固定历史等于创建时间。 |

索引：主键 id；唯一 job_id, attempt_no；用于稳定身份去重及本表所属任务、范围或历史查询。

### external_write_operation

安装明细写入的本表 id 同 submissionId，也同 installation_detail_submission.id；三者指向同一笔外部操作。

| 字段 | 类型 | 必填 | 默认 | 含义 |
| --- | --- | --- | --- | --- |
| id | TEXT | 是 | — | 本表稳定本地编号，由服务端生成。 |
| human_decision_id | TEXT | 是 | — | 原人员确认 human_decision.id，一次决定至多一笔外部写入。 |
| work_item_id | TEXT | 是 | — | 关联事项；范围发现和材料解析任务可 NULL，分析及业务写入必须有明确事项。 |
| service_provider_id | TEXT | 是 | — | 本地 service_provider.id；不是前端自报的授权凭据。 |
| installation_work_order_id | TEXT | 是 | — | 安装工单本地编号，跨明细/审核/补充共用未决写保护。 |
| source_system | TEXT | 是 | — | 可靠来源系统标识；权限范围仅 SOURCE_RECORD 必填。 |
| interface_kind | TEXT | 是 | — | INSTALLATION_SUBMIT / REVIEW_SYNC；审核与补充共用后者去重范围。 |
| action | TEXT | 是 | — | SUBMIT_INSTALLATION / APPROVE / REQUEST_SUPPLEMENT / SUBMIT_SUPPLEMENT。 |
| request_json | TEXT | 是 | — | 完整固定外部请求，按稳定编号回查或恢复，不得改内容。 |
| content_sha256 | TEXT | 是 | — | 完整请求按固定序列化规则计算的 SHA-256 摘要。 |
| status | TEXT | 是 | — | 任务、尝试、外部写入各自的执行状态，见 §3，不代表人员事项完成。 |
| receipt_json | TEXT | 否 | NULL | 匹配原操作的权威终态回执；非终态 NULL。 |
| verified_at | INTEGER | 否 | NULL | 可靠核实时间；身份为本次授权核实，外部写入为权威终态核实。 |
| row_version | INTEGER | 是 | — | 本地条件更新版本，每次修改加 1。 |
| gmt_create | INTEGER | 是 | — | 创建时的 UTC 毫秒整数。 |
| gmt_modified | INTEGER | 是 | — | 变更 UTC 毫秒；固定历史等于创建时间。 |

索引：主键 id；查询 work_item_id, gmt_create, id；唯一 work_item_id（部分状态）；唯一 installation_work_order_id（部分状态）；唯一 human_decision_id；用于稳定身份去重及本表所属任务、范围或历史查询。


## 3. 状态、调用和恢复

| 对象 | 状态与允许接续 |
| --- | --- |
| 配置代次 | PREPARING 完成起点/范围核实后 READY；缺口为 GAP，补查须有依据；停用为 RETIRED，不覆盖旧代次 |
| 后台任务 | READY / RETRY_WAIT 可条件领取为 RUNNING；失败按原因转 RETRY_WAIT、BLOCKED 或 FAILED；完成本阶段为 SUCCEEDED；取消须有依据；终态不改写，后续工作新建任务并关联前序 |
| 执行尝试 | RUNNING 最终记 SUCCEEDED / FAILED / UNKNOWN；每次重试新行；可能写出后不得倒退为 NOT_SENT |
| 外部写入 | REGISTERED → PROCESSING；响应不确定为 RESULT_UNKNOWN；匹配权威终态后 SUCCEEDED / REJECTED；RESULT_UNKNOWN 仅回查，不返回 PROCESSING 重写 |

任务目的为 DISCOVER_RELATIONS、READ_SOURCE、PARSE_MATERIAL、ANALYZE_SKILL、RECONCILE、TRIAL_CONFIG、WRITE_EXTERNAL、QUERY_EXTERNAL、CONTINUE_LOCAL。前四类准备资料与分析；RECONCILE 执行程序计算；TRIAL_CONFIG 执行受控转换；最后三类区分新写、回查及本地接续。任务结束不等于人员事项完成。

每次领取按 row_version 条件更新，新的 lease_token 与 lease_epoch 同时生效；续租保持代次。提交结果时再次比对令牌、代次与时效。旧执行者可留诊断，不能覆盖新领取者结果。占用到期不能证明外部调用没发生，写入按原编号回查，AI 按原 runId 和预算有限重试。

capability_call.id 即 runId；输入、配置和实现版本固定。PARSE_MATERIAL 仅绑定确切已核实文件；ANALYZE_SKILL 仅绑定同事项的封存快照。material_parsing / analysis_result 的 run_id 唯一，组合保护核对输入、操作与实现版本。已采用结果发布失败时只恢复本地发布。

external_write_operation.id 为全局稳定操作编号。明细分支与 installation_detail_submission.id 相同，原请求中的 submissionId 同值；审核与补充 request.operationId 同值。不同 action 不得复用编号改内容。正文与账号映射由后端按人员确认和原接口契约组装。

工单与事项各有一个部分唯一索引，REGISTERED / PROCESSING / RESULT_UNKNOWN 均占用未决写保护。终态解除索引占用，事项 pending_write_id 的清理与业务接续另按同事务规则执行。终态回执必须匹配来源、接口、操作、正文与版本，仅填 receipt_json 不证明外部成功。

## 4. 事务与执行边界

接收事务先保存变化、去重后的任务和触发关系，再保存完整批次，最后按原 cursor 条件推进；空批不写 batch、不推进。change_batch 的顺序 ID 清单须和原响应逐项一致，每条变化在当前配置代次下已有覆盖任务。任一步失败整批回滚。

新输入快照与后台任务同事务保存。analysis_generation 只在实际依赖材料、来源版本、业务依据或配置变化时增加；进展保存及责任调整不改变输入代次。发布时比较输入代次和实际配置/来源指纹，再以当前 row_version 作一次条件更新；旧输入结果留历史，新的普通进度版本不触发无限重算。

人员确认、固定外部请求、明细扩展（如适用）、后台任务、事项未决指针同事务。外部调用发生在提交之后，源端成功回执与本地接续分开；先保存成功事实，接续失败仅恢复本地。源端仍须有条件写入与可关联回查能力，本地唯一索引不代替源端保护。

## 5. 必要性与验收边界

人员打开工作台直接处理实际已准备好的结果。批次接收、输入准备、重试和恢复由后台负责；补充仍接续原事项，配置事项不补造工单。

本地检查覆盖非空批、任务覆盖、cursor 条件、领取冲突、程序身份、固定输入、未决工单唯一与历史不可替换。真实 D1 batch、进程失联、OpenCode 运行、模型质量和原系统回查均留待实现阶段运行验收；不能据候选 SQL 已建表宣称这些能力已可用。


## 6. 本地运行保护补充（2026-09-21）

生产迁移 `code/db/migrations/0009_attempt-lease-fence.sql` 新增 `guard_attempt_current_lease`：尝试离开RUNNING或更新发出状态前，在同一事务核对后台任务仍RUNNING、token/epoch/owner一致且租约尚未过期。先更新尝试，再采纳业务产物；旧执行者失权会回滚全部业务写入。

变化接收在推进cursor的条件UPDATE之后使用 `transaction_assertion` 核对实际更新行数；零行冲突回滚变化、批次和任务。配置保存/启用、分析封存分别有相应事务断言。运行时不关闭历史、版本或租约触发器。
