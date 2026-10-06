# 工作台 2.0 原型页面清单

> 版本：V1.1｜日期：2026-09-20｜状态：高保真候选，待评审
> 上游（我引用）：[BRD](../01-brd/BRD-jd-charging.md) §2—4
> 下游（引用我）：[交互说明](interaction-spec.md) §1—3、[ER 范围与一致性总核对](../03-foundation/03-03-er/coverage-review.md) §2—6、[业务主流程与角色交接](../03-foundation/03-04-business-flows/flow-business-main.md) §1—7、[业务流程覆盖与一致性总核对](../03-foundation/03-04-business-flows/coverage-review.md) §2—8、[mainprd-jd-charging.md](../05-prd/mainprd-jd-charging.md) §5.1、[01-subprd-workbench-items.md](../05-prd/01-subprd-workbench-items.md) §2、[02-subprd-orders-history.md](../05-prd/02-subprd-orders-history.md) §2、[03-subprd-provider-config.md](../05-prd/03-subprd-provider-config.md) §2、[04-subprd-installation-materials.md](../05-prd/04-subprd-installation-materials.md) §2、[05-subprd-installation-review.md](../05-prd/05-subprd-installation-review.md) §2、[06-subprd-reconciliation.md](../05-prd/06-subprd-reconciliation.md) §2、[07-subprd-coordination.md](../05-prd/07-subprd-coordination.md) §2

## 1. 页面与视图

| 页面 / 视图 | 原型入口 | 使用者 | 页面定位 | 状态 |
| --- | --- | --- | --- | --- |
| 待处理事项 | [打开](index.html#home) | 各角色 | 操作 | 已实现，待评审 |
| 安装核查详情 | [春和庭](index.html#task/bridge) | 京东安装核查 | 操作 | 已实现，待评审 |
| 费用依据核查 | [尚澜府](index.html#task/fee) | 京东安装核查 | 操作 | 已实现，待评审 |
| 分析失败恢复 | [锦绣里](index.html#task/failed) | 京东安装核查 | 操作 | 已实现，待评审 |
| 安装资料确认 | [桂语庭](index.html#task/draft) | 安家安装资料人员 | 操作 | 已实现，待评审 |
| 对账差异详情 | [云栖苑](index.html#task/billing) | 京东对账、城南应收负责人 | 操作 | 已实现，待评审 |
| 服务商接入配置 | [江畔里](index.html#task/mapping) | 远程机电对接人员 | 配置 | 已实现，待评审 |
| 履约协同详情 | [澜山府](index.html#task/coordination) | 京东物流 | 操作 | 已实现，待评审 |
| 安装工单列表 | [打开](index.html#orders) | 授权角色 | 查看 | 已实现，待评审 |
| 工单详情 | [春和庭工单](index.html#order/bridge) | 授权角色 | 查看 | 已实现，待评审 |
| 业务对账列表 | [打开](index.html#billing) | 京东对账、城南应收负责人 | 操作 | 已实现，待评审 |
| 接入事项列表 | [打开](index.html#mapping) | 远程机电对接人员 | 配置 | 已实现，待评审 |
| 处理记录 | [打开](index.html#history) | 各角色 | 查看 | 已实现，待评审 |
| 原始证据侧栏 | 事项详情 → 查看原文 | 授权角色 | 查看 | 已实现，待评审 |
| 服务商原应收 | 云栖苑核实中 → 城南身份 → 打开服务商原应收 | 城南应收负责人 | 操作 | 已实现，待评审 |

## 2. 使用约定

所有页面共享同一份模拟业务状态，直接打开深链接也执行身份范围检查。先切换匹配身份，再进入相应场景。资料正式提交后自动产生桂语庭核查事项；退回后的服务商回复视图与京东侧复核共用原事项，不另建重复事项。

履约与异常详情提供“保存进展，继续处理”和完成操作。异常关闭后显示“继续办理原业务”链接，后续事项沿用 `#task/<事项标识>` 路由，提供回看异常结果的链接。配置试转换结果可刷新保留，修改含义后必须重新执行。
