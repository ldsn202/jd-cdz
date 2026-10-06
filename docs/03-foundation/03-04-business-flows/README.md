# 03-04-business-flows 业务流程图

业务上谁先做什么、谁后做什么、异常走哪条分支。业务流程图里只有业务角色和业务动作，不出现接口、表、队列等技术组件——那是 `03-07-system-flows/` 的内容。

## 当前交付

| 流程 | 文档与图 | 状态 |
| --- | --- | --- |
| 业务主流程与角色交接 | [流程说明](flow-business-main.md) · [三张流程图](flow-business-main.html) | 六类角色的入口、交接与返回条件已核对 |
| 安装资料整理与提交 | [流程说明](flow-installation-submission.md) · [两张流程图](flow-installation-submission.html) | 草稿、确认、提交结果及核查交接已核对 |
| 安装核查与补充 | [流程说明](flow-installation-review.md) · [两张流程图](flow-installation-review.html) | 核查决定、有效补充轮次与原事项接续已核对 |
| 业务对账 | [流程说明](flow-reconciliation.md) · [两张流程图](flow-reconciliation.html) | 双方原账、费用核实、修订接续及核对结束条件已核对 |
| 配置确认 | [流程说明](flow-configuration.md) · [流程图](flow-configuration.html) | 含义、试转换、启用结果与适用范围复用已核对 |
| 履约协同与共用异常 | [流程说明](flow-coordination-exceptions.md) · [两张流程图](flow-coordination-exceptions.html) | 进展、完成条件与未完业务接续已核对 |
| 全部业务流程覆盖核对 | [核对结论](coverage-review.md) | 全范围文档核对通过；真实实现待验证 |

主流程检查不代表完整状态机或真实运行已验证。实体、接口及后台执行细节继续放在对应 foundation 文档中。

## 文件命名

```
flow-<流程名>.md        例：flow-task-notify.md、flow-task-archive.md
```

## 文件组成

每个流程两个文件，图一律用 `diagram-design` skill 生成：

```
flow-task-notify.md       文字结构（流程说明、异常分支）
flow-task-notify.html     diagram-design 生成的流程图（type: Flowchart）
```

## 文件结构

| 章节 | 内容 |
|------|------|
| 流程说明 | 这个流程解决什么业务问题，触发条件是什么 |
| 流程图 | mermaid 流程图，判断节点写清判断条件 |
| 异常分支 | 每条异常路径：什么时候发生、谁处理、处理完回到哪 |

