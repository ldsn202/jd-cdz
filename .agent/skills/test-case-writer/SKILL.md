---
name: test-case-writer
description: Use when PRD 已产出，需要从 PRD 生成 TC 主索引 `tc-main-<slug>.md`、业务域 TC 文件和 SQL 数据准备。只写 TC，不改 PRD、不做 TC 核查。
---

# Test Case Writer Skill

你是测试用例的**生成者**。把 PRD 翻译成按业务域组织的测试用例体系——TC 主索引 + 业务域 TC 文件 + 配套 SQL 数据准备。

**PRD 是唯一验收权威源**；BRD / Schema / API 契约 / 项目代码只做上下文或数据链路辅助。

## 1) 角色定义

生成型 skill。核心契约：

- **PRD 是唯一验收权威源**：所有 TC 的测试目标、预期结果、覆盖矩阵都要能回链到 PRD 的具体验收点（`PRD：<PRD 文件名> §<章节>`）
- **PRD 验收点必须是 PRD 写明的行为**：PRD 未写明预期的点标 `[待确认-需产品明确]`，不得脑补
- **代码实现只作数据链路研究**：确认读哪些源表、如何构造输入；不能用代码行为定义预期结果
- **两个不做**：不改 PRD、不做 TC 核查（独立核查不属于本 skill）

## 2) 输入

> `<slug>` 为项目短名，与项目既有文档命名保持一致。

### 依赖文件

| 文件 | 位置 | 用途 |
|------|------|------|
| PRD（主文档 / 功能清单 / 子 PRD） | `docs/` 下对应文档 | 唯一验收权威源；每个 PRD 验收点都要被 TC 覆盖 |
| 术语表 | `docs/` 下对应文档（如有） | 术语、实体名、枚举辅助理解 |
| 数据库 Schema 文档 | `docs/` 下对应文档（如有） | SQL 数据准备、字段合法性、枚举取值 |
| API 契约文档 | `docs/` 下对应文档（如有） | API 调用、响应字段、状态码 |
| 交付范围文档 | `docs/` 下对应文档（如有） | 交付范围辅助确认 |
| 业务背景文档（BRD） | `docs/` 下对应文档（如有） | 业务背景辅助理解 |

### 可选运行时辅助输入

| 输入 | 位置 | 用途 |
|------|------|------|
| 项目代码实现 | `code/` 或项目约定代码根目录 | 可选；仅用于确认数据链路与 SQL 构造方式 |

### 内部知识包（相对本 SKILL.md）

| 文件 | 位置 | 用途 |
|------|------|------|
| `methodology.md` | `references/methodology.md` | 测试设计方法论 + BCDE 覆盖 |
| `templates-shared.md` | `references/templates-shared.md` | 文件头、验收矩阵、TC 主索引（tc-main）、版本历史模板 |

## 3) 产出

| 产物 | 文件名 | 存放位置 | 说明 |
|------|--------|---------|------|
| TC 主索引 | `tc-main-<slug>.md` | `docs/06-testcase/` | 全局 TC 入口，按业务域索引所有域 TC 文件，汇总覆盖率和 `[待确认]` |
| 域 TC 文件 | `<业务域>/tc-<业务域>.md` | `docs/06-testcase/<业务域>/` | 单个业务域下的完整测试用例；可按行数拆为索引层 + 详情层（详情层命名 `tc-<业务域>-用例详情.md`） |
| 场景数据 SQL | `<业务域>/sql/<PREFIX>-<NN>.sql` | `docs/06-testcase/<业务域>/sql/` | 与用例编号一一对应的数据准备与清理脚本；`<PREFIX>` 为该域编号前缀（形如 `TC-<域简称>`），命名规则见 `references/project-conventions.md` §4 |
| 种子数据 SQL | `<业务域>/sql/<PREFIX>-SEED.sql` | `docs/06-testcase/<业务域>/sql/` | 该域多条用例共用的配置 / 种子数据，必须自包含 |

## 4) 工作流

### Phase 1：读 PRD，建立 PRD 验收点清单

1. 定位本次范围内的 PRD 文件，列出相关章节
2. 逐章节读取，把可验证的行为条款提炼成 PRD 验收点清单：PRD 文件 / §X / 场景 / 触发条件 / 预期结果 / `[待确认]` 标记
3. PRD 未写明预期的点，直接标 `[待确认-需产品明确]`，不得用代码行为或经验补位
4. 明确每个验收点的验证方式候选：API / UI / 配置变更验证 / 数据管理 / 回归

### Phase 2：规划业务域和文件结构

1. 按 PRD 验收点的业务域聚合，不按 PRD 文件机械切分
2. 为每个业务域确定目录名、TC 文件名、编号前缀
3. 读取 `references/project-conventions.md`，生成本项目的 `docs/06-testcase/` 文件结构、命名、编号前缀、SQL 目录方案
4. 项目已有 `docs/06-testcase/README.md` 或 `tc-main-<slug>.md` 时沿用其命名与编号；否则按 `project-conventions.md` 的通用模板创建首版约定
5. 生成前向用户展示文件规划与覆盖范围；用户确认后继续

### Phase 3：逐业务域生成 TC + SQL

1. 每次只处理一个业务域；开始前重读该域相关的 PRD 章节
2. 读 Schema / API 契约文档，理解字段、接口、业务规则
3. 如需 SQL，读项目代码或数据链路文档确认源表、查询条件、服务端计算字段禁写清单
4. 按 `references/type-domain.md` 生成业务域 TC 文件：API / UI 按实际适用性组织
5. 输入有缺陷记录时按 `references/type-regression.md` 生成回归文件
6. 生成该域 `sql/` 文件；每个 SQL 同时包含"数据准备"和"数据清理"两段
7. 更新域内验收矩阵，确保每个 PRD 验收点至少有一条 TC 覆盖或明确标记无法生成的原因

### Phase 4：生成 / 更新 TC 主索引

1. 汇总所有域文件路径、编号前缀、用例数量
2. 汇总 PRD 验收点覆盖率
3. 汇总 `[待确认]` 条目与无法生成唯一预期的点
4. 写入 `tc-main-<slug>.md`

### Phase 5：自检

1. 对照 `references/self-check.md` 做单条用例 / 文件级 / 体系级检查
2. 确认所有 PRD 验收点在矩阵中有 TC 覆盖或已明确标记原因
3. 确认每条 TC 的预期都有 PRD 依据；没有依据的已标 `[待确认]`
4. 确认没有把代码实现当作预期 oracle
5. 确认没有生成 TC 核查 issues 文件或任何核查产物

## 5) 写入边界

| 能做 | 不能做 |
|------|------|
| 新建 / 更新 `tc-main-<slug>.md` | 改 PRD 文件 |
| 新建 / 更新 `<业务域>/tc-<业务域>.md` | 改 Schema / API 契约 / BRD / 开发计划文档 |
| 新建 / 更新 `<业务域>/sql/*.sql` | 给 PRD 没写的行为编造预期 |
| 读取项目代码作为数据链路上下文 | 用代码行为定义 TC 预期 |
| 在 TC / 主索引里标 `[待确认-需产品明确]` / `[待确认-缺陷无PRD依据]` | 产出 TC 核查 issues 文件或任何核查产物 |

**最硬规则**：**PRD 验收点 = 测试目标**。TC 的测试目标、预期结果、覆盖矩阵都必须回链到 PRD 验收点；代码实现不能直接制造新的测试 oracle。

## 6) 参考文件

| 文件 | 内容 | 何时读取 |
|------|------|---------|
| `references/methodology.md` | 方法论 + BCDE 覆盖维度 | Phase 1 / 3 设计用例时 |
| `references/templates-shared.md` | TC 主索引（tc-main）、验收矩阵、文件头模板 | Phase 2-4 生成文档时 |
| `references/self-check.md` | 生成期自检清单、陷阱速查 | Phase 5 自检时 |
| `references/type-domain.md` | 业务域 TC：API / UI 验证策略 | 生成业务域文件时 |
| `references/type-regression.md` | 缺陷回归测试策略 | 输入有已知缺陷记录时 |
| `references/project-conventions.md` | 项目测试资产目录、命名、编号、SQL 组织和主索引的通用落地参考 | Phase 2 规划文件结构时 |
