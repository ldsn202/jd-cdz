# 03-03-er 实体关系图

项目有哪些业务实体、实体之间什么关系（一对一 / 一对多 / 多对多）。建表之前先画 ER 图，`03-05-schema/` 的表结构从这里推导。

## 当前交付

| 关系域 | 文档与图 | 状态 |
| --- | --- | --- |
| 处理事项与补充轮次 | [关系说明](er-work-item.md) · [ER 图](er-work-item.html) | 六类实体、九条关系已作图文与角色走查 |
| 原始材料、分析输入与证据 | [关系说明](er-evidence.md) · [ER 图](er-evidence.html) | 三张图、十类实体与十二条关系已核对 |
| 安装资料归属与提交确认 | [关系说明](er-installation.md) · [ER 图](er-installation.html) | 两张图、九类实体与九条关系已核对 |
| 双方账单与对账依据 | [关系说明](er-reconciliation.md) · [ER 图](er-reconciliation.html) | 三张图、十二类实体与十四条关系已核对 |
| 接入配置、版本与适用范围 | [关系说明](er-integration-config.md) · [ER 图](er-integration-config.html) | 两张图、八类实体与十条关系已核对 |
| 身份、权限与事项责任 | [关系说明](er-identity-responsibility.md) · [ER 图](er-identity-responsibility.html) | 两张图、五类实体与七条关系已核对 |
| 原记录变化接收及执行记录 | [关系说明](er-change-execution.md) · [ER 图](er-change-execution.html) | 四张图、十七类实体与十九条关系已核对 |
| 全部 ER 范围与一致性 | [总核对结论](coverage-review.md) | 七域、十八图的文档核对通过；真实实现待验证 |

## 文件命名

```
er-<域>.md        一个业务域一份，例：er-task.md、er-user.md
```

## 文件组成

每个域两个文件，图一律用 `diagram-design` skill 生成：

```
er-task.md         文字结构（实体清单、关系说明）
er-task.html       diagram-design 生成的 ER 图（type: ER / data model）
```

## 文件结构

| 章节 | 内容 |
|------|------|
| 实体清单 | 每个实体一句话定义，跟术语表口径一致 |
| 关系图 | mermaid ER 图 |
| 关系说明 | 图上每条关系一句话：为什么是这个基数、删除时怎么处理 |

## 本项目约束

- 原系统记录与本工作台的事项、分析、人员决定分别保存。
- 本期正常流程不级联删除已经被决定引用的版本、证据和执行结果；访问仍核实当前权限，保存期限在实施前确认。
- 各图的必填关系按所述业务子类型适用，不把本地确认要求强加给原系统历史导入。
- 逻辑实体不等于一张物理表；内部结构与独立记录的存储选择在表结构阶段明确。

**底线**：ER 图里的实体名必须能在 `03-01-glossary/` 术语表里查到；查不到就先登记术语再画图。
