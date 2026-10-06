# 身份、权限与责任域表结构

> 版本：V1.0｜日期：2026-09-20｜状态：foundation 候选设计；本地约束验证，真实鉴权未实现
> 上游（我引用）：[身份与责任 ER](../03-03-er/er-identity-responsibility.md) §1—5、[身份接口](../03-02-external-apis/current-identity-permissions-read.md) §2—4、[事项表结构](work-item-schema.md) §1、§3、§5
> 下游（引用我）：[执行表结构](execution-schema.md) §1—4、[表结构总核对](coverage-review.md) §2—4、[工作台查询接口](../03-06-provided-apis/workbench-apis.md) §1—5

## 1. 范围与保存职责

候选 SQL：[identity-schema.sql](identity-schema.sql)。三张表分别保存稳定主体、一次固定授权上下文和其中的授权项。当前责任人沿用 work_item.assignee_identity_id；原决定沿用 human_decision，不建立另一套账号、角色发放或审批后台。

遵循事项域的 SQLite、逻辑关联和 UTC 毫秒约定。只保存业务追溯所需授权事实，凭据由运行环境管理。按稳定身份取得或更新展示名；授权项先写、上下文最后封存，二者同事务。封存数量须一致，此后不能追加或修改。查询请求可只在请求期间使用上下文，决定与执行尝试所引用的上下文必须保存。

## 2. 字段与索引

### identity_reference

| 字段 | 类型 | 必填 | 默认 | 含义 |
| --- | --- | --- | --- | --- |
| id | TEXT | 是 | — | 本表稳定本地编号，由服务端生成。 |
| identity_source | TEXT | 是 | — | 可信身份来源。 |
| subject_id | TEXT | 是 | — | 来源内稳定主体编号，姓名不参与匹配。 |
| subject_type | TEXT | 是 | — | HUMAN / SERVICE，稳定主体类型。 |
| display_name | TEXT | 是 | — | 展示名，可更新，不作为授权依据。 |
| gmt_create | INTEGER | 是 | — | 创建时的 UTC 毫秒整数。 |
| gmt_modified | INTEGER | 是 | — | 变更 UTC 毫秒；固定历史等于创建时间。 |

索引：主键 id；唯一 identity_source, subject_id；用于稳定身份去重及本表所属任务、范围或历史查询。

### current_identity

| 字段 | 类型 | 必填 | 默认 | 含义 |
| --- | --- | --- | --- | --- |
| id | TEXT | 是 | — | 本表稳定本地编号，由服务端生成。 |
| identity_reference_id | TEXT | 是 | — | 关联稳定身份 identity_reference.id。 |
| subject_type | TEXT | 是 | — | HUMAN / SERVICE，稳定主体类型。 |
| verified_at | INTEGER | 是 | — | 本次身份及授权被可靠核实的时间。 |
| valid_until | INTEGER | 否 | NULL | 授权使用上限；NULL 只供本请求使用，不能跨请求缓存放行。 |
| authorization_version | TEXT | 否 | NULL | 来源授权版本，未知保留 NULL。 |
| source_identities_json | TEXT | 是 | — | 固定原账号映射数组；SERVICE 必为空，不含凭据。 |
| grant_count | INTEGER | 是 | — | 本次封存的授权项数量，可为零。 |
| request_key | TEXT | 是 | — | 一次身份核实的服务端唯一标识。 |
| gmt_create | INTEGER | 是 | — | 创建时的 UTC 毫秒整数。 |
| gmt_modified | INTEGER | 是 | — | 变更 UTC 毫秒；固定历史等于创建时间。 |

索引：主键 id；查询 identity_reference_id, verified_at, id；唯一 request_key；用于稳定身份去重及本表所属任务、范围或历史查询。

### business_permission

| 字段 | 类型 | 必填 | 默认 | 含义 |
| --- | --- | --- | --- | --- |
| id | TEXT | 是 | — | 本表稳定本地编号，由服务端生成。 |
| context_id | TEXT | 是 | — | 所属 current_identity.id；先写授权项再封存上下文。 |
| grant_id | TEXT | 是 | — | 当前上下文内的授权项编号。 |
| business_role | TEXT | 否 | NULL | HUMAN 限六种业务职责，SERVICE 为 NULL。 |
| actions_json | TEXT | 是 | — | 同一授权项明确允许的动作数组，完整枚举由身份接口约定。 |
| scope_type | TEXT | 是 | — | SERVICE_PROVIDER / INSTALLATION_WORK_ORDER / SOURCE_RECORD / CHANGE_FEED。 |
| source_system | TEXT | 否 | NULL | 可靠来源系统标识；权限范围仅 SOURCE_RECORD 必填。 |
| record_type | TEXT | 否 | NULL | 来源记录类型，按外部变化契约枚举校验。 |
| resource_ids_json | TEXT | 是 | — | 范围内明确编号数组，非空、去重、禁止通配符。 |
| gmt_create | INTEGER | 是 | — | 创建时的 UTC 毫秒整数。 |
| gmt_modified | INTEGER | 是 | — | 变更 UTC 毫秒；固定历史等于创建时间。 |

索引：主键 id；唯一 context_id, grant_id；用于稳定身份去重及本表所属任务、范围或历史查询。


## 3. 授权与责任检查

数据库检查稳定身份类型、上下文所属主体、有效上限、授权项数量、角色/程序动作限制和历史不可改写。授权项保持动作与范围同项关联；JSON 深层账号映射、来源记录类型和当前有效性由服务端按身份契约校验。

每次受保护请求重新核实授权；valid_until=NULL 仅限本请求。保存的历史上下文用于追溯，不作为后续放行缓存。人员决定要求同一 HUMAN 主体、当前具体责任人、事项和责任版本匹配，以及完整目标范围授权。matched_grants_json 固定实际使用的 grantId 数组，匹配动作和资源的证明保存在决定内容及尝试依据中。

异步新写出前受控重新核实原确认人；实际执行者另记 SERVICE。缺少提供方受控验证能力时保持阻断。有权后台可回查已经发出的未知结果，不能用程序权限重新代替人员作决定。

## 4. 必要性与验收边界

身份核实不增加人员日常操作。六类职责沿原流程使用工作台，资料、账单、历史证据分别按当前权限读取。责任未明确时可先做已授权分析，人员不得越过具体责任关系办理。

候选验证覆盖主体类型不符、过期上下文、SERVICE 携带人员映射、授权项封存、无授权项、通配范围和替换式写入。真实来源的登录机制、撤权传播、账号映射与保存期限必须在接入实施时验证；本地测试不能证明生产授权生效。
