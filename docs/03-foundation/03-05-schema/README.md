# 03-05-schema 数据库表结构

> 上游（我引用）：无（本目录作为定义或索引入口）
> 下游（引用我）：[mock T0.1子计划](../../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T0.1-mock-runtime.md) PRD双链·读、[mock开发主计划](../../07-delivery-plans/main-delivery-plan-jd-charging-mock.md) 上游清单

本目录按业务域保存字段、类型、索引、逻辑关联与候选 DDL。当前按项目默认 D1 / SQLite 设计；候选 SQL 只经过本地验证，正式 migration 在后续实现阶段依据完成核对的文档生成。

## 当前交付

| 分域 | 交付 | 状态 |
| --- | --- | --- |
| 处理事项与必要通用约定 | [字段与约束](work-item-schema.md) · [候选 SQL](work-item-schema.sql) | 七张表，文档与本地约束核验通过；服务端和 D1 尚未验证 |
| 材料与分析证据 | [字段与约束](evidence-schema.md) · [候选 SQL](evidence-schema.sql) | 六张表，本地约束核验通过；深层证据与服务端待实现 |
| 安装资料 | [字段与约束](installation-schema.md) · [候选 SQL](installation-schema.sql) | 六张表，本地约束核验通过；真实提交和执行域待实现 |
| 双方账单与对账依据 | [字段与约束](reconciliation-schema.md) · [候选 SQL](reconciliation-schema.sql) | 五张表，本地约束核验通过；十进制计算与真实业务条件待实现 |
| 接入配置 | [字段与约束](integration-config-schema.md) · [候选 SQL](integration-config-schema.sql) | 五张表，本地约束核验通过；转换执行、权限与启用事务待实现 |
| 身份、权限与责任 | [字段与约束](identity-schema.md) · [候选 SQL](identity-schema.sql) | 三张表，当前授权与固定历史分别核实 |
| 变化接收与执行记录 | [字段与约束](execution-schema.md) · [候选 SQL](execution-schema.sql) | 九张表，批次、任务、调用与原系统结果分别保存 |
| 全部表结构覆盖与一致性核对 | [总核对](coverage-review.md) · [组合 SQL 保护](cross-domain-guards.sql) | 七域合并检查及运行边界统一 |

分域沿用 ER 职责，不将逻辑实体数量直接作为物理表数量。七域共 41 张表，另有 transaction_assertion 临时断言表；逻辑关联的目标已定义，运行时业务范围与权限仍需服务端实际核实。

## 文档和变更约定

每张表说明用途、写入与读取职责、字段类型、必填、默认、索引目的和关联条件。数据库能直接检查的约束与服务端必须核实的业务条件分别列明。

字段或结构变更先更新相应文档及候选 DDL，并同步上游/下游引用；不直接修改云端数据库。当前引用采用逻辑关联，正常流程不物理删除历史或级联清理。保存期限与合法删除仍须在实施前明确。

总核对覆盖替换式写入、跨域指针、输入代次、未决写保护与条件零行回滚。正式迁移按总核对的顺序加载全部候选及组合保护；D1 事务、真实授权与实际模型输入仍须实现验收。

本系统接口和系统流程已按这些结构形成设计，详见 foundation 入口；本轮不执行正式迁移。
