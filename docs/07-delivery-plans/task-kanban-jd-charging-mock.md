# 京东充电桩 mock开发任务看板

> 上游（我引用）：[主计划](main-delivery-plan-jd-charging-mock.md) §3，以下子计划的前置和状态
> 下游（引用我）：[主计划](main-delivery-plan-jd-charging-mock.md) §4、各子计划状态同步、[开发进度](../00-process/00-02-progress/progress.md)

当前：T0.1—T4.1 已完成（2026-09-20），"模拟来源可用"阶段结论成立；T4.2 正按用户要求进行典型业务联调收口，已有来源/模型/生命周期实测；UI 按原型返工与核查外写修复待验。T4.2另依赖真实业务应用，不以mock来源验收替代。Task编号仅在本mock专题内有效。

| Task | 子开发计划 | Owner | 前置 | 状态 | 完成日期 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| T0.1 | [建立可持久化的本地模拟服务工程](sub-delivery-plan-jd-charging-mock-T0.1-mock-runtime.md) | AI 执行 -> 人审核 | 无 | 已完成（2026-09-20） | 2026-09-20 | Phase 0：双环境持久化冒烟 17 断言全过 |
| T1.1 | [生成相互关联的业务事实与多服务商原记录](sub-delivery-plan-jd-charging-mock-T1.1-source-generation.md) | AI 执行 -> 人审核 | T0.1 | 已完成（2026-09-20） | 2026-09-20 | Phase 1：常规集独立校验 38 断言全过；TC-MCK-26 六类非法配置拒绝；复现一致 |
| T1.2 | [生成可解析且可追溯的原始材料文件](sub-delivery-plan-jd-charging-mock-T1.2-material-files.md) | AI 执行 -> 人审核 | T1.1 | 已完成（2026-09-20） | 2026-09-20 | Phase 1：997 文件独立校验 8 断言全过；负例可触发；两次生成摘要一致 |
| T1.3 | [建立独立数据校验与场景预期](sub-delivery-plan-jd-charging-mock-T1.3-data-quality.md) | AI 执行 -> 人审核 | T1.1、T1.2 | 已完成（2026-09-20） | 2026-09-20 | Phase 1：五件交付齐备；四类破坏均抓出；golden 17 断言全过 |
| T2.1 | [实现身份、工单和权益读取接口](sub-delivery-plan-jd-charging-mock-T2.1-identity-workorders.md) | AI 执行 -> 人审核 | T1.3 | 已完成（2026-09-20） | 2026-09-20 | Phase 2：三条 GET 真实 HTTP 18 断言全过 |
| T2.2 | [实现服务商原资料及文件版本读取](sub-delivery-plan-jd-charging-mock-T2.2-provider-materials.md) | AI 执行 -> 人审核 | T2.1 | 已完成（2026-09-20） | 2026-09-20 | Phase 2：原资料/文件两条 GET 15 断言全过 |
| T2.3 | [实现双方账单及计费依据读取](sub-delivery-plan-jd-charging-mock-T2.3-billing-sources.md) | AI 执行 -> 人审核 | T2.1 | 已完成（2026-09-20） | 2026-09-20 | Phase 2：账单类三条 GET 12 断言全过 |
| T2.4 | [实现安装明细提交与结果回查](sub-delivery-plan-jd-charging-mock-T2.4-detail-writeback.md) | AI 执行 -> 人审核 | T2.2 | 已完成（2026-09-20） | 2026-09-20 | Phase 2：提交/回查 15 断言全过 |
| T2.5 | [实现审核、退回和补充写入与回查](sub-delivery-plan-jd-charging-mock-T2.5-review-writeback.md) | AI 执行 -> 人审核 | T2.4 | 已完成（2026-09-20） | 2026-09-20 | Phase 2：三动作写入/回查 15 断言全过 |
| T2.6 | [实现来源修订与变化发现](sub-delivery-plan-jd-charging-mock-T2.6-changes-revisions.md) | AI 执行 -> 人审核 | T2.3、T2.5 | 已完成（2026-09-20） | 2026-09-20 | Phase 2：修订与变化发现 14 断言全过，Phase 2 收口 |
| T3.1 | [实现可重复故障与配对环境恢复工具](sub-delivery-plan-jd-charging-mock-T3.1-faults-environments.md) | AI 执行 -> 人审核 | T2.6 | 已完成（2026-09-20） | 2026-09-20 | Phase 3：四类故障+恢复协调 18 断言全过 |
| T3.2 | [交付后台HTTP适配与来源输入追溯](sub-delivery-plan-jd-charging-mock-T3.2-backend-adapters.md) | AI 执行 -> 人审核 | T2.6 | 已完成（2026-09-20） | 2026-09-20 | Phase 3：适配器集成 11 断言全过，Phase 3 收口 |
| T4.1 | [交付模拟来源自动验收驱动与证据包](sub-delivery-plan-jd-charging-mock-T4.1-source-acceptance.md) | AI 执行 -> 人审核 | T3.1、T3.2 | 已完成（2026-09-20） | 2026-09-20 | Phase 4：验收驱动 25 阶段全 PASS、28 操作正反例全过、双环境生成可复现 |
| T4.2 | [接入真实工作台并完成mock业务联调](sub-delivery-plan-jd-charging-mock-T4.2-business-integration.md) | AI 执行 -> 人审核 | T4.1 | 进行中 | — | 典型场景收口；生命周期证据已存，UI 与外写修复待验，未标完工 |
