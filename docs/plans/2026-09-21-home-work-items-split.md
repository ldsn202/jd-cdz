# 首页与处理事项拆分 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将重复的“首页”和“处理事项”拆成个人工作概览与完整办事队列。

**Architecture:** 复用现有真实 `work-items/summary` 与 `work-items` 接口。首页只查询当前人员汇总及最近 5 条事项；处理事项页保留完整筛选、责任范围与分页，不新增后端接口和模拟数据。

**Tech Stack:** React 18、TypeScript、Vite、Node test runner。

---

### Task 1: 固化首页汇总规则

**Files:**
- Create: `code/web/src/pages/workbench/overview.ts`
- Test: `code/web/tests/overview.test.mjs`

1. 先写失败测试，验证 READY、WAITING、PROCESSING、BLOCKED 四类概览数量来自真实状态汇总。
2. 运行单测确认因函数不存在而失败。
3. 实现纯函数并再次运行测试。

### Task 2: 拆分两个入口

**Files:**
- Create: `code/web/src/pages/workbench/HomeOverviewPage.tsx`
- Modify: `code/web/src/pages/home.tsx`
- Modify: `code/web/src/pages/workbench/WorkbenchPage.tsx`
- Modify: `code/web/src/styles.css`

1. 首页展示四类概览、最近 5 条我的事项和业务快捷入口。
2. 处理事项页展示完整筛选、责任范围、表格和分页。
3. 两页使用不同标题、信息密度和主操作，所有数据仍来自真实 API。

### Task 3: 验证

**Files:**
- Update: `docs/08-test-reports/T5.1-engineering-20260921/ui-review.md`

1. 运行 web 全部测试和生产构建。
2. 在浏览器分别检查首页和处理事项，确认两个入口内容不同且导航选中正确。
3. 保存两页截图并记录尚未覆盖的范围。
