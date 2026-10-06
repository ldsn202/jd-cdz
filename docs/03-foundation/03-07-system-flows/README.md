# 03-07-system-flows 系统流程

> 状态：五个主题、十幅时序图已形成；浏览器图面检查与实际服务运行分别验收。

## 流程索引

| 主题 | 说明 | 时序图 |
| --- | --- | --- |
| 工作台查询与证据读取 | [流程与异常](sys-workbench-read.md) | [查看图](sys-workbench-read.html) |
| 来源变化、自动准备与 Skill 分析 | [流程与异常](sys-analysis-preparation.md) | [查看图](sys-analysis-preparation.html) |
| 人员确认、事务与外部写入恢复 | [流程与异常](sys-transactions-recovery.md) | [查看图](sys-transactions-recovery.html) |
| 配置试转换与业务对账计算 | [流程与异常](sys-configuration-reconciliation.md) | [查看图](sys-configuration-reconciliation.html) |
| 模拟来源与实际文件验证链路 | [流程与异常](sys-mock-upload.md) | [查看图](sys-mock-upload.html) |

## 图文约定

使用 diagram-design 的时序图，图内节点为拟实现的具体组件，数据库字段与 HTTP 路由查对应契约。修改流程必须同次同步说明、图、接口及引用。业务职责与人工决定条件见业务流程，系统图负责实际读取、写入、事务及失败恢复。
