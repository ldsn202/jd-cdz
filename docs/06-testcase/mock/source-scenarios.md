<!-- @meta docId="tc-mock-preparation" status="active" baseline="v2.1.0" -->
# mock域来源数据准备与执行约束

> 上游（我引用）：[域索引](tc-mock.md) PRD V1.1基线、共用前提及实现待办
> 下游（引用我）：[TC主索引](../tc-main-jd-charging.md) §三、[测试目录](../README.md) mock域准备方式；[用例详情](tc-mock-用例详情.md) 各组前置与证据、[域索引](tc-mock.md) §二；[mock T1.3子计划](../../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T1.3-data-quality.md) PRD双链·读、[mock开发主计划](../../07-delivery-plans/main-delivery-plan-jd-charging-mock.md) 上游清单

本文件是测试准备规格，**没有声明数据已生成或工具已可执行**。原28份SQL仅含注释，已由本文件及逐用例的前置/操作表取代。外部来源存储结构未定，不编造建表或插入脚本，不把空SQL执行成功算作准备完成。

## 1. 实施前提与执行记录

- 实现数据生成器、来源修订入口、故障控制和环境管理后，将确切命令、参数、服务地址及返回证据登记到执行报告。本说明描述必须实现的行为，不假定已有命令。
- 身份/读取/写回使用PRD §2.3登记的独立外部API。后台只经这些接口取得来源；测试工具可在来源侧准备原记录及查看证据，业务运行进程不能读取完整事实清单或验收预期。
- 初次导入：先核实本系统业务表为空，再启动真实导入；将来源可导入记录与实际导入ID集合对比。工单、事项、文件及分析不要求数量一比一，不拿1000工单推导1000事项。
- 生成类用例从工具输入开始，不要求“常规集已生成”；首次导入用例从空业务库开始；业务类用例才使用已完成实际导入的环境。禁止所有用例共用“已导入完成”的前提。
- 每组及每个表格子场景保存独立结果。报告至少包含caseId、子场景、PRD条目、环境/数据集、初态对象及版本、实际请求、来源前后值、业务结果、证据位置、PASS/FAIL/BLOCKED/NOT_RUN；缺工具时标BLOCKED，尚未运行标NOT_RUN。

## 2. 数据集与对象绑定

| 配置 | 标准值或规则 |
| --- | --- |
| 数据集标识、生成器版本、种子、初始业务时间 | 执行前固定具体值并写入清单；同配置复现测试在不同输出目录使用相同值 |
| 服务商 / 工单 / 账期 | 标准集100 / 1000 / 3；每家有业务，工单分布不同 |
| 九项互斥工单场景 | 待整理200；安装证据一致180；数量差异120；材料不足100；账目一致140；账目差异100；对账依据不完整60；履约协调60；只读40 |
| 初始格式版本 | 每家1份，共100；完整70、含义未知10、无说明10、关联不符10 |
| 五类资料形态 | 字段清楚表格、结构不同表格、计量表达不同表格、PDF、图片，各至少20家；同名字段不同含义必须覆盖 |
| 场景分布 | 每种工单主场景至少3家；涉文件场景至少2类格式；账单跨3账期并有一账单多工单 |
| 文件 | 可打开的PDF/XLSX/PNG/JPEG，多页、多sheet；另备真实损坏、缺页及不可取得版本负例 |
| 快速/扩展集 | 快速集明确少量对象仅供排错；扩展集逐项明确数量，保持关联和适用覆盖，不把标准100/1000误写为全系统上限 |

生成器按统一业务事实分发到不同来源，独立验收预期另存。数据清单、文件清单、场景覆盖表、校验报告、独立验收预期齐备后，正常数据才允许装载。故意负例必须在生成前明确登记预期，意外错误不能自动转为负例。

每条用例执行前，从覆盖表选定对象并冻结以下绑定（不能停留在占位符）：

| 绑定内容 | 要求 |
| --- | --- |
| 环境与数据集 | 同时记录，恢复/隔离场景可以同一数据集使用不同环境 |
| 当前主体与后台主体 | 可信会话标识及授权范围；不在报告保存密钥或令牌 |
| 来源对象 | sourceSystem、服务商、工单、订单、材料、账单/应收、格式及相应版本；只填本场景涉及项 |
| 原始文件 | 文件实际位置、类型、字节摘要、页/sheet范围、工单关联；API按固定版本下载 |
| 业务操作 | 实际办理后生成submissionId/operationId/humanDecisionId；初始生成器不伪造已办理状态 |
| 预期事实 | 转换字段、金额和原文定位先从来源事实独立核实；不得复制被测程序输出作为预期 |

同组有多个写入分支时，各分支独立工单或独立环境。需要核查/补充前态时，通过实际提交、核查退回等合法动作建立，不能从另一用例借一个不明状态的工单，不能直接SQL插入SUCCEEDED。

## 3. 外部接口与用例对应

路径逐项对应PRD V1.1 §2.3，具体字段/查询参数及错误码从该节链接的foundation契约取得。表中省略查询参数：如文件的sourceVersion必须填写。八种来源读取加两种写入、两种结果GET与变化读取，共13条业务操作，均要留独立调用证据。

| 来源/动作 | 完整方法与路径 | 覆盖用例（同前缀） |
| --- | --- | --- |
| 当前身份与业务权限 | `GET /api/admin/mock/external/identity/current-context` | TC-MCK-01、03 |
| 工单、方案及正式明细 | `GET /api/admin/mock/external/installation/work-orders/{installationWorkOrderId}/context` | TC-MCK-02、05、08、12 |
| 购买订单及安装权益 | `GET /api/admin/mock/external/purchase-orders/{purchaseOrderId}/installation-entitlements` | TC-MCK-02、12、25 |
| 服务商原资料及格式说明 | `GET /api/admin/mock/external/sources/{sourceSystem}/service-providers/{serviceProviderId}/records/{sourceRecordId}/documents` | TC-MCK-02、11、16 |
| 原始文件 | `GET /api/admin/mock/external/sources/{sourceSystem}/materials/{sourceMaterialId}` | TC-MCK-02、04、12、25 |
| 京东账单 | `GET /api/admin/mock/external/jd-bills/{jdBillId}` | TC-MCK-02、14、15、25 |
| 服务商应收 | `GET /api/admin/mock/external/sources/{sourceSystem}/service-providers/{serviceProviderId}/receivables/{providerReceivableId}` | TC-MCK-02、14、25 |
| 条款及费用批准记录 | `GET /api/admin/mock/external/installation-work-orders/{installationWorkOrderId}/fee-evidence` | TC-MCK-02、08、14、16 |
| 提交正式安装明细 | `POST /api/admin/mock/external/installation/work-orders/{installationWorkOrderId}/installation-detail-submissions` | TC-MCK-05、06、07、09、12 |
| 回查明细提交结果 | `GET /api/admin/mock/external/installation/work-orders/{installationWorkOrderId}/installation-detail-submissions/{submissionId}` | TC-MCK-05、07、17 |
| 审核通过、退回及补充同步 | `POST /api/admin/mock/external/installation/work-orders/{installationWorkOrderId}/review-actions` | TC-MCK-06、07、09、13 |
| 回查核查或补充结果 | `GET /api/admin/mock/external/installation/work-orders/{installationWorkOrderId}/review-actions/{operationId}` | TC-MCK-07、13、17 |
| 发现新增或变化记录 | `GET /api/admin/mock/external/change-feeds/{feedId}/changes` | TC-MCK-08、11、14、28 |

AI mock的`POST /api/admin/mock/external/ai-runs`由TC-MCK-19单独验证模式与调用记录。真实AI执行使用OpenCode及deepseek/deepseek-flash；业务mock模式不强制AI mock。

回查GET返回原操作的状态及来源版本引用。正文核实应结合来源实际保存内容、工单上下文或补充记录读取证据；不能在回查响应中凭空要求契约未定义的items/comment字段。GET不可发起第二次写入。

## 4. 故障控制、环境清理与证据保存

每次故障在执行前填写完整控制单：目标环境、完整接口、来源对象与版本、操作编号、触发操作、失败阶段、次数、解除条件、对照请求。只填“制造异常”或“按条件解除”不满足准备要求。

| 测试动作 | 具体控制要求 |
| --- | --- |
| 调用前失败 | 在确认未发出外部写入的位置阻断，目标1次；来源写次数应为0；解除后允许同编号正常重试 |
| 写入后丢响应 | 源端先完成1次实际写入，再丢弃其响应；只读回查保持可控，不改写源端成功记录 |
| 回查失败 | 原编号GET分别返回404/503/504；解除后恢复读取已保存结果；不能由此触发重发 |
| 本地接续失败 | 来源成功回执保留，阻断本系统后续保存/交接；恢复时只继续本地流程 |
| 权限撤销 | 在身份来源修改实际授权，保留已发出操作；新动作拒绝，既有操作由有权后台回查 |
| 文件失败 | 保存真实损坏/缺页字节或针对确切文件版本阻断；正常对照文件保持可读 |
| 环境恢复中断 | 在来源完成、业务导入未完成及最终检查失败的位置分别中断，不启用半成品环境 |
| 迟到结果 | 延迟真实在途任务的回传，切换环境后释放；按原环境核验归属，禁止直接SQL写目标状态 |

结束后解除本场景故障，保留请求和来源变化证据。需恢复时暂停旧任务并另建配对环境，经接口重新导入且检查后切换；含实际上传的原环境不清空。只读检查不执行删除；不清理其他用例或其他项目的数据。
