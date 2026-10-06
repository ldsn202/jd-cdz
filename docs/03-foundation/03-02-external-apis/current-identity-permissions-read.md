# 当前身份与业务权限取得

> 版本：V1.0｜日期：2026-09-20｜状态：开发契约已核对，真实身份机制待核实
> 上游（我引用）：[外部依赖清单](external-dependency-list.md) §2—4、[术语表](../03-01-glossary/glossary.md) §1、§3、§5、[原型交互说明](../../02-prototype/interaction-spec.md) §1—3、[正式安装明细提交](installation-detail-submit.md) §2—3、[核查决定与补充记录同步](review-supplement-sync.md) §2—4、[原记录变化发现](source-record-changes-read.md) §1—3、[接口规范](../../../rules/coding-standards/09-api-design.md) §2—9
> 下游（引用我）：[AI 推理与材料解析](ai-inference-material-parsing.md) §2、§5、[接入配置实体关系](../03-03-er/er-integration-config.md) §3、§5、[身份与事项责任关系](../03-03-er/er-identity-responsibility.md) §1—5、[术语表](../03-01-glossary/glossary.md) §1、[变化接收与执行关系](../03-03-er/er-change-execution.md) §3、§5—6、[ER 范围与一致性总核对](../03-03-er/coverage-review.md) §2—6、[配置确认](../03-04-business-flows/flow-configuration.md) §1—7、[履约协同与共用异常](../03-04-business-flows/flow-coordination-exceptions.md) §1—7、[接入配置域表结构](../03-05-schema/integration-config-schema.md) §1—7、[身份、权限与责任域表结构](../03-05-schema/identity-schema.md) §1—4、[本系统接口公共约定](../03-06-provided-apis/common-contract.md) §1—5、[00-subprd-mock-data.md](../../05-prd/00-subprd-mock-data.md) §2.3；[mock T2.1子计划](../../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T2.1-identity-workorders.md) PRD双链·读

## 1. 现有依据与接口定位

| 已知范围 | 当前结论 |
| --- | --- |
| 业务角色 | 六类职责已在术语表 §3 定义，人员按原职责办理，不新增组织审批层级 |
| 原型身份 | 选择器和前端判断仅用于体验；京东身份可见全部模拟事项的简化不作为生产权限 |
| 真实认证机制 | 现有工作区依据尚未提供身份系统、登录协议、凭据验证方式或生产账号映射 |
| 本轮输出 | 定义本系统所需的身份与授权返回，供后续适配及 mock 使用；不认定原系统已提供同名接口 |

| 项 | 本项目约定 |
| --- | --- |
| 逻辑调用 | `read_current_identity_permissions` |
| 拟定 mock 请求 | `GET /api/admin/mock/external/identity/current-context` |
| 提供方 | 经核实的身份和权限来源；可以是不同系统组合，具体协议与字段映射待确认 |
| 调用位置 | 后台适配层；本系统提供给浏览器的当前用户接口后续另行定义 |
| 输入 | 服务端取得并验证的当前登录凭据或后台程序凭据，不传可自行修改的人员、角色或服务商参数 |
| 只读边界 | 不注册账号、不变更权限、不切换为其他人员，不发放原系统改账或付款权限 |

凭据形式尚未定稿，不能假定已有某种单点登录、令牌协议或固定请求头。真实模式必须调用已核实的验证机制；失败不退回模拟身份。开发身份由隔离的服务端 mock 配置取得，原型 localStorage、URL 角色值和客户端 confirmed=true 均不是可信身份依据。

## 2. 身份与业务动作

### 2.1 职责参考

以下说明已有业务职责与动作的对应，用于核对适配结果，不表示只要拥有角色名称就自动得到表中全部授权。

| businessRole | 已有职责 | 相关业务动作 |
| --- | --- | --- |
| INSTALLATION_REVIEWER | 京东安装资料核查 | 核实安装资料并作审核决定，按当前事项处理异常 |
| BUSINESS_RECONCILER | 京东业务对账 | 发起费用核实，查看双方记录及回复，处理未解决问题 |
| PROVIDER_DOCUMENT_CLERK | 服务商资料人员 | 确认草稿、提交安装明细、回复所属事项的补充要求 |
| PROVIDER_RECEIVABLE_OWNER | 服务商应收负责人 | 查看本方费用问题、回复核实；原应收修订仍在原系统按原权限办理 |
| PROVIDER_INTEGRATION_CONTACT | 服务商对接人员 | 确认字段含义并启用对应服务商的接入配置 |
| FULFILLMENT_COORDINATOR | 京东物流履约协同 | 协调当前履约问题并记录处理结果 |

京东业务账号由同一 HUMAN 主体取得 INSTALLATION_REVIEWER、BUSINESS_RECONCILER、FULFILLMENT_COORDINATOR 三项职责，核查、对账与履约无需切换账号。每家服务商由同一 HUMAN 主体取得 PROVIDER_DOCUMENT_CLERK、PROVIDER_RECEIVABLE_OWNER、PROVIDER_INTEGRATION_CONTACT 三项职责，所有授权项仅包含该公司。人员可以有多个经证实的职责，但每个动作必须在同一授权项的范围内成立，不能拿一个服务商的动作权限与另一个服务商的数据范围拼接。后台程序以 SERVICE 身份执行取数、变化发现和分析准备，不能凭其技术访问能力生成“人员已确认”。

### 2.2 授权动作名称

| action | 含义 |
| --- | --- |
| READ_WORK_ITEM | 查看授权事项、分析及处理记录 |
| READ_WORK_ORDER | 查看授权工单；不自动包含所有附件、账单权限 |
| READ_SOURCE_MATERIAL | 查看授权原始材料；仍核实具体来源及文件权限 |
| READ_BILLING_RECORD | 查看授权账单或应收，保留整张记录访问范围限制 |
| CONFIRM_INSTALLATION_DRAFT | 确认本方安装资料草稿 |
| SUBMIT_INSTALLATION_DETAIL | 提交已确认的安装明细，受现有提交契约约束 |
| DECIDE_INSTALLATION_REVIEW | 按当前核查职责通过或要求补充，不等于费用批准 |
| SUBMIT_SUPPLEMENT | 回复当前仍待补充的原问题 |
| REQUEST_BILLING_VERIFICATION | 发起费用核实问题 |
| REPLY_BILLING_VERIFICATION | 回复本方费用核实问题，不修改京东账单 |
| ENABLE_INTEGRATION_CONFIG | 启用已确认的本方接入配置 |
| COMPLETE_FULFILLMENT_COORDINATION | 记录当前协调结果并完成该环节 |
| RECORD_EXCEPTION_RESULT | 按原责任记录实际异常处理结果 |
| READ_SOURCE_CHANGES | 后台程序读取已授权的变化配置 |
| PREPARE_ANALYSIS | 后台程序准备分析结果，不作正式业务决定 |

前四项为只读动作，中间九项为人员业务动作，最后两项为后台动作。SERVICE 可以被授予必要的只读和后台动作；HUMAN 不通过此契约获得后台程序动作。人员确认后的异步写入由后台执行时，仍按原确认人的业务权限核验，程序身份只表示执行者，不能改写原操作者。

## 3. 返回结构及使用

### 3.1 身份上下文

成功为 HTTP 200，外层 `code=0`、`msg="success"`、`data`、`requestId`；失败保持同一包装，data=null。所有以下字段必返，可空值显式为 null。

| data 字段 | 类型 | 说明 |
| --- | --- | --- |
| identitySource | 非空 string | 已核实的身份来源；与 subjectId 一同标识主体，姓名不作为身份主键 |
| subjectId | 非空 string | 来源内稳定的人员或后台程序编号，不使用角色名称替代 |
| subjectType | string | HUMAN / SERVICE，按可信身份来源确定 |
| displayName | 非空 string | 展示名称，不用于匹配授权或当前责任人 |
| verifiedAt | string | 本次身份与授权核实时间，带时区 |
| validUntil | string / null | 当前上下文可使用的时间上限，带时区；未知则 null，只用于本次请求，不跨请求缓存放行 |
| authorizationVersion | string / null | 权威授权版本或有依据的等价标识，未知为 null，不用取数时间冒充 |
| sourceIdentities | object[] | 已核实的原系统人员映射，每项必返非空 sourceSystem、sourceUserId；没有映射为 [] |
| grants | object[] | 完整取得并可解释的当前授权项，见 §3.2；确认没有授权时为 [] |

只对已验证、当前有效的身份返回成功。授权返回不完整、限制无法表达或来源不可用时返回错误，不返回“看起来可用”的部分授权。grants=[] 表示已确认无业务权限，不等同于查询失败。validUntil 若已到期，不能继续返回可用上下文；授权版本未知时保留核实时间及实际授权内容用于追溯，不伪造版本。

sourceIdentities 只保存必要的原账号映射，不包含密码或令牌。SERVICE 的该数组必须为空，技术对接凭据由服务端另行管理，不能在此挂入某个人员身份。服务端核实映射属于该主体且在当前来源有效；同名姓名不能推导映射。缺少某个原系统人员映射时，可执行其他已获准且不依赖该映射的动作，涉及该来源的人员写入保持待核实，不能借用共享账号冒充原操作者。

### 3.2 每个授权项

| grant 字段 | 类型 | 说明 |
| --- | --- | --- |
| grantId | 非空 string | 本次身份上下文内唯一的授权项标识，用于追溯映射依据，不作为凭据 |
| businessRole | string / null | HUMAN 为 §2.1 六种值之一，SERVICE 为 null；不能按业务角色自动生成 actions |
| actions | 非空 string[] | 本授权项明确允许的动作，取值限 §2.2，去重 |
| scope | object | 与这些动作绑定的数据范围，必返 scopeType、sourceSystem、recordType、resourceIds |

| scope 字段 | 类型 | 说明 |
| --- | --- | --- |
| scopeType | string | SERVICE_PROVIDER / INSTALLATION_WORK_ORDER / SOURCE_RECORD / CHANGE_FEED |
| sourceSystem | string / null | SOURCE_RECORD 时必为非空来源标识；其余类型为 null，编号在本项目明确命名范围内解析 |
| recordType | string / null | SOURCE_RECORD 时为原记录变化发现 §3.2 的记录类型；其余类型为 null |
| resourceIds | 非空 string[] | 对应范围的明确编号，去重，不接受通配符、空列表表示全部或“未限制”等字符串 |

- SERVICE_PROVIDER 仅在权威权限明确覆盖所列服务商的相关业务范围时使用；不能因为人员属于京东就生成全部服务商范围。共享资料仍按其来源权限及实际适用关系核实。
- INSTALLATION_WORK_ORDER 仅包含列出的工单及可验证关联的业务数据；查看工单不自动取得附带材料、账单或处理动作的权限。
- SOURCE_RECORD 按来源、记录类型和原编号共同定位。批准记录、账单、材料等不因编号相同视为相同记录。
- CHANGE_FEED 仅匹配明确的变化配置编号，适用于后台取数，不能等同于该服务商全部人工办理权限。

实际来源若还有区域、项目、状态等限制，须保持原限制：可以映射为经核实的明确记录范围；无法完整表达或清单未取全时返回范围待核实，不简化为服务商全量授权。本轮不声称此结构已经兼容任何现有权限系统；大范围授权的表达与查询方式需在接入验证后调整契约。

### 3.3 每次业务请求的检查

1. **核实当前身份及授权。** 不接受前端提交的 subjectId、businessRole、scope、sourceUserId 或按钮状态作为授权证据。前端可据当前信息显示入口，服务端仍逐次检查。
2. **在同一 grant 内匹配动作和目标范围。** 按权威记录核实目标工单、服务商、账单或材料的真实归属。多工单账单须满足整张记录权限；不能只因一个工单可见就返回全部账目。历史页面、深链接及下载同样检查。
3. **核实当前办理条件。** 人员决定须与当前责任人的具体身份一致，并核实事项状态、补充关系、人员确认内容及版本。拥有动作权限不代表该事项此刻允许该动作；角色一致也不代表就是当前责任人。
4. **保留原操作者并核实源端权限。** 对外写入使用已核实的原账号映射及源端授权机制；后台技术凭据不能扩大该人员权限。异步执行前再次核验确认人当前权限，按明细提交及核查同步契约处理版本与结果，不要求人员无变化时重复确认。
5. **对权限变化与未知结果分别处理。** 身份失效或权限撤销后停止新的业务动作；已经发出的写入若结果未知，保留原操作并通过有权的后台回查恢复，不能因人员不再可访问就认定写入失败或重发。原人员重新请求历史结果时仍核实当前可见权限。

validUntil 只是使用上限，不保证期间不会撤权；授权版本变化或已收到撤权信息时立即失效。身份来源没有可靠失效通知时，每次受保护请求重新取得授权，不把首次登录结果长期保存后一直放行。新的人员业务动作及异步写出前均须重新核验；源端最终授权也必须生效，不能只依赖调用前一次本地检查。

权限来源失败时停止受保护操作，保留未提交草稿及原事项进展供恢复；不得通过旧缓存继续读取撤权范围。真实账号的失效、撤权传播方式、缓存时限和账号映射尚待验证，不在本轮承诺具体安全时效。

本 GET 只返回当前调用身份。异步执行时重新核实原确认人，须使用提供方已有的受控查询或委托验证能力，并绑定已保存的原确认记录；该能力尚待核实，缺少时不能开放异步新写入。不能给本接口添加任意 subjectId 参数来冒充其他人员。原确认人和实际执行的后台程序分别留痕。

### 3.4 开发示例

以下为受限的服务商资料人员 mock 上下文，角色来自当前业务职责；账号、授权项与版本均为独立开发编号。示例只授予指定工单内列明的动作，不表示此人就是该工单的当前责任人，也不证明真实身份系统已可用。

```json
{
  "code": 0,
  "msg": "success",
  "requestId": "mock-current-identity-001",
  "data": {
    "identitySource": "identity_mock",
    "subjectId": "person-document-mock-001",
    "subjectType": "HUMAN",
    "displayName": "服务商资料人员",
    "verifiedAt": "2026-09-20T18:00:00+08:00",
    "validUntil": null,
    "authorizationVersion": "authorization-mock-1",
    "sourceIdentities": [{"sourceSystem":"installation_management","sourceUserId":"source-person-mock-001"}],
    "grants": [{
      "grantId": "grant-mock-001",
      "businessRole": "PROVIDER_DOCUMENT_CLERK",
      "actions": ["READ_WORK_ITEM", "READ_WORK_ORDER", "CONFIRM_INSTALLATION_DRAFT", "SUBMIT_INSTALLATION_DETAIL", "SUBMIT_SUPPLEMENT"],
      "scope": {
        "scopeType": "INSTALLATION_WORK_ORDER",
        "sourceSystem": null,
        "recordType": null,
        "resourceIds": ["AZ-260918-021"]
      }
    }]
  }
}
```

未出现 READ_SOURCE_MATERIAL 或 READ_BILLING_RECORD 的授权时，不因工单可见就放行原文或账单。生产需要哪些动作和范围须按真实职责授予，不能为了让页面按钮可用而在前端补权限。

## 4. 错误与兜底

| 情况 | HTTP / code | 本系统处理 |
| --- | --- | --- |
| 请求带有本契约不接受的人员、角色或范围参数 | 400 / 40001 | 拒绝自报身份，不按参数切换主体 |
| 缺少凭据、验证失败或会话已失效 | 401 / 40101 | 停止受保护请求，按已确认的真实登录流程恢复；不自动改为其他账号 |
| 身份被停用或不允许使用该工作台 | 403 / 40301 | 显示无法访问，不伪装成空待办 |
| 授权限制、人员归属或来源映射存在冲突，无法完整解释 | 409 / 40901 | 权限范围待核实，不以部分结果放行 |
| 身份或权限来源不可用 / 超时 | 503 / 50301、504 / 50401 | 显示暂时无法核实权限，保留草稿，不切换为 mock 或绕过 |
| 主体不符、非法枚举、授权项重复冲突、SERVICE 带人员业务动作等非法结构 | 502 / 50201 | 拒绝上下文并记录 requestId，不泄露凭据或他人资料 |

```json
{"code":50301,"msg":"当前无法核实身份与业务权限，请稍后重试","data":null,"requestId":"mock-current-identity-002"}
```

已认证但没有某个目标动作权限时，由实际业务接口返回 403；找不到必要的原系统人员映射时，相关写入接口返回明确的待核实错误，不猜配。当前身份接口不把“没有授权项”一律当作身份失效，避免循环要求重新登录。

开发默认单次核实最多 5 秒，仅 50301 / 50401 在 1 秒后重试 1 次，含重试最多 11 秒；重试仍验证同一凭据及当前有效性。此配置未经运行验证，不表示提供方 SLA。凭据不得写入日志、HTML 或普通接口返回。

## 5. 依赖方与后续验证

工单和事项查询、材料预览、人员提交与决定、服务商隔离、后台变化发现及分析准备均使用可信身份与明确授权范围。本系统后续接口、数据查询和处理流程按上述要求执行，不能只隐藏按钮。

角色走查：人员使用自身身份打开工作台后看到已获准的事项，按原职责办理；身份和权限核实由后台完成，不增加逐项选角色、申请重复审批或重复确认的日常步骤。服务商应收仍在原系统维护，本契约不给工作台新增改账能力。

后续 mock 覆盖六类职责、同人多范围授权、动作与范围不可跨项组合、跨服务商访问、只读与办理区别、当前责任人不符、材料单独权限、后台身份限制、账号停用、权限撤销、来源失败、无授权项、未知版本与原系统人员映射缺失。真实模式须取得并核实提供方、凭据验证协议、稳定主体编号、完整权限范围、原账号映射和撤权方式。本轮未实现登录、鉴权或调用真实身份系统。
