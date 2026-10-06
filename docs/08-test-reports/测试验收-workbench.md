# 工作台测试验收

日期：2026-09-21。正式 API：6 PASS、0 FAIL、0 BLOCKED；其余尚未执行。

上游：[工作台用例](../06-testcase/workbench/tc-workbench.md)。下游：[验收索引](index.md)。

| 用例 | 结果 | 验证与证据 |
| --- | --- | --- |
| TC-WB-01 | PASS | 独立Worker/D1，全9份生产迁移与原用例SQL；HTTP 200/code0、3种事项顺序与字段、账单权限全部吻合。查库后停Worker、销毁隔离存储。[HTTP](workbench/TC-WB-01-20260921/http.json)、[数据库](workbench/TC-WB-01-20260921/database.json)、[清理](workbench/TC-WB-01-20260921/cleanup.json)。API用例，无页面按钮或弹窗。 |
| TC-WB-02 | PASS | 默认MINE仅2条张三事项；VISIBLE返回3条，包含赵六事项；独立D1查库一致，已销毁隔离环境。[证据目录](workbench/TC-WB-02-20260921/)、[数据库](workbench/TC-WB-02-20260921/database.json)、[清理](workbench/TC-WB-02-20260921/cleanup.json)。API用例，无页面按钮或弹窗。 |
| TC-WB-03 | PASS | HTTP汇总与列表总数均8；状态5/2/1、类型6/1/1，与数据库GROUP BY一致；隔离环境已清理。[证据目录](workbench/TC-WB-03-20260921/)、[数据库](workbench/TC-WB-03-20260921/database.json)、[清理](workbench/TC-WB-03-20260921/cleanup.json)。API用例，无页面按钮或弹窗。 |
| TC-WB-04 | PASS | kind和status组合筛选列表与汇总均3条；排除PROCESSING对账与安装核查，数据库分组一致。[证据目录](workbench/TC-WB-04-20260921/)、[数据库](workbench/TC-WB-04-20260921/database.json)、[清理](workbench/TC-WB-04-20260921/cleanup.json)。API用例，无页面按钮或弹窗。 |
| TC-WB-05 | PASS | 工单编号、中文标题、服务商名搜索分别1/1/2条；越权工单编号返回0条，查库核对后清理。[证据目录](workbench/TC-WB-05-20260921/)、[数据库](workbench/TC-WB-05-20260921/database.json)、[清理](workbench/TC-WB-05-20260921/cleanup.json)。API用例，无页面按钮或弹窗。 |
| TC-WB-06 | PASS | 会话返回张三HUMAN及核查角色、核实时点；响应仅六个业务字段，不含凭据或授权明细；数据库身份一致。[证据目录](workbench/TC-WB-06-20260921/)、[数据库](workbench/TC-WB-06-20260921/database.json)、[清理](workbench/TC-WB-06-20260921/cleanup.json)。API用例，无页面按钮或弹窗。 |
