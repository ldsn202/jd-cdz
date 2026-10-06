# 自动分析入口与对账重复页修复

> 上游（我引用）：[T5.1](../../07-delivery-plans/sub-delivery-plan-jd-charging-T5.1-e2e-integration.md) 2026-09-27 用户纠正；[对账 PRD](../../05-prd/06-subprd-reconciliation.md) §2—3
> 下游（引用我）：[进度](../../00-process/00-02-progress/progress.md) 最新检查点

## 已验证

- 业务对账只保留一个入口；旧 `/billing/work-orders` 和当前 `/billing/orders` 都进入该列表。删除重复组件，Safari 实页及旧链接已核对。
- 当前切换为既有京东业务对账账号；300 条对账事项可读双方金额。安装核查账号仍无账单权限（FORBIDDEN），对账账号 ALLOWED，不扩大授权。
- 修正列表差额与详情正负相反：WO-2609-0767，京东 17385.00、服务商 17435.00，列表及详情均为 50.00。新程序比较版本 strict-exact-lines-2；既有比较记录保留，读取时按其可比金额统一方向，不补算原本不可比的差额。
- OpenCode 1.18.32 私有安装完成，实际 --version 成功。统一启动 Worker/runner 的 AI_MODE=real，业务来源仍 EXTERNAL_MODE=mock。
- 详情提供手动分析/重试，服务端检查责任人、动作权限、版本、幂等与活动任务；历史代次失败不污染当前状态，旧代次结果不覆盖新版。
- 缺少模型凭证时，真实 HTTP 返回 50301 可读原因，不创建新分析；后台不领取 ANALYZE_SKILL，其余导入解析继续。Safari 已显示“分析配置待完成”及禁用的重试按钮。
- 实际保存演示起点并一键回滚成功，随后重启仍为1000工单/1400事项；回滚前数据保存在 code/.local/checkpoints/before-5103835b-a867-4918-b687-3f64d69eddd4。
- 后端/回滚相关26项测试通过，前端10项既有测试及构建通过；API TypeScript检查通过。测试包含旧代次隔离、权限与版本冲突、同请求重放、完整回滚与损坏快照拒绝、差额正负及不可比状态。

## 未完成项

本机没有模型 API Key 或现有 OpenCode 授权配置。真实模型调用与配置后批量恢复旧失败事项尚未实际执行，不能宣称四类 Skill 已在当前环境端到端跑通。项目根“配置模型.command”可在本机输入 DeepSeek Key；不同模型可用 code/.local/model.env。模型配置后仍需实测各类典型事项。

## 根因

对账两个列表复用了同一 FilteredItemsPage、同一 kind=RECONCILIATION，只有标题不同；原型和 PRD 实际只定义一个列表。此前误把页面/视图当独立菜单的实现方式应以页面职责核对。

默认启动器错误固定 AI_MODE=mock，混淆模拟业务来源和停用模型；runner 仍领取真实分析任务，造成 MOCK_AI_NOT_ANALYSIS 重试耗尽。修复为来源 mock + 模型 real，缺凭证时暂停模型领取并明确展示原因。用户已明确授权自动分析、手动演示及回滚；无需再次要求范围审批，当前缺口为真实模型凭证。

OpenCode 安装和配置依据：[官方安装](https://opencode.ai/docs/)、[官方配置](https://opencode.ai/docs/config/)、[DeepSeek模型列表](https://api-docs.deepseek.com/api/list-models/)。
