# 07-delivery-plans 开发执行计划

> 上游（我引用）：[mock主计划](main-delivery-plan-jd-charging-mock.md) 范围及任务状态、[业务主计划](main-delivery-plan-jd-charging.md) 范围及任务状态
> 下游（引用我）：[mock主计划](main-delivery-plan-jd-charging-mock.md) 使用指南、[业务主计划](main-delivery-plan-jd-charging.md) 使用指南

本目录的开发计划**不手写、不凭经验编排**，统一由 `delivery-planner` skill 生成和维护（入口：`.agent/skills/delivery-planner/SKILL.md`）。上游依据是 `05-prd/` 与 `03-foundation/`，计划状态与 `00-process/00-02-progress/progress.md` 的进度快照联动。

## 目录结构（由 delivery-planner 生成）

```
07-delivery-plans/
├── README.md                                      本文件
├── main-delivery-plan-<slug>.md                   主开发计划：全局骨架、阶段索引、发布闸门、风险、PRD 反向索引
├── task-kanban-<slug>.md                          任务看板：全部 Task 状态总览
└── sub-delivery-plan-<slug>-<TaskID>-<name>.md    子开发计划：一个文件一个 Task 正文
```

## 三类文件分工

| 文件 | 职责 | 谁读 |
|------|------|------|
| 主开发计划 | 保留全局方法、Phase 索引、发布闸门 | 新线程建立全局认识时 |
| 任务看板 | Task 状态、依赖、子开发计划入口 | 定位当前该干什么时 |
| 子开发计划 | 单个 Task 的 PRD 依据、核心文件、完成标准、验证方法 | 执行该 Task 时 |

**状态纪律**：Task 状态只有 `待审阅 / 待开发 / 进行中 / 已完成（日期）` 四种；`待审阅` 未经人类确认不得开工；同一时刻有且仅有一个 Task `进行中`；每次翻状态必须三处同步（主计划、看板、子计划）。开工前用 `check-plan-consistency.mjs` 校验，产出后用 `validate-plan-structure.mjs` 校验，两个脚本都在 skill 的 `scripts/` 下。

## mock专题开发计划

[mock数据与外部模拟接口主计划](main-delivery-plan-jd-charging-mock.md) · [任务看板](task-kanban-jd-charging-mock.md)

范围：mock来源数据/文件、独立外部接口、故障与环境、后台适配和联调驱动。5阶段14项任务，当前全部待审阅、无进行中任务，候选首任务T0.1。整体应用计划位于本目录根层，mock专题以`jd-charging-mock`文件名前缀区分，各自Task编号仅在各自看板内有效；模拟来源交付与真实业务验收分开。

## 业务系统开发计划

[业务系统主开发计划](main-delivery-plan-jd-charging.md) · [任务看板](task-kanban-jd-charging.md)

范围：本系统（web / api / db / 后台任务程序 / Skill 接入 / 部署配置）实现——工程骨架、D1 七域 41 表、38 条本系统接口、外部适配与后台分析链路、五条业务写链路、15 页前端、联调回归与部署收口。6 阶段 18 项任务，当前全部待审阅、无进行中任务，候选首任务 T0.1。mock 数据专题不在本计划范围，作为计划外依赖在 T2.1 / T5.1 前置与发布闸门登记。两组计划文件各自独立维护，互不修改。
