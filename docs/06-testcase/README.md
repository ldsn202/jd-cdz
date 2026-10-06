# 06-testcase 测试用例

> 上游（我引用）：[mock用例](mock/tc-mock.md) v2.1.0、[来源准备说明](mock/source-scenarios.md) §1—4
> 下游（引用我）：[TC主索引](tc-main-jd-charging.md) 共性约定

本目录的测试资产**不手写、不凭经验编排**，统一由两个 skill 生成和执行：

| 要做什么 | 用哪个 skill | 入口 |
|---------|-------------|------|
| 从 PRD 生成测试用例和 SQL 数据准备 | `test-case-writer` | `.agent/skills/test-case-writer/SKILL.md` |
| 执行已有用例、出测试报告 | `test-case-runner` | `.agent/skills/test-case-runner/SKILL.md` |

**分工边界**：test-case-writer 只写用例，不改 PRD、不执行；test-case-runner 只执行，不设计用例。用例的验收标准来源于 `05-prd/` 各 subprd 的「验收标准」章节。

## 目录结构（由 test-case-writer 生成）

```
06-testcase/
├── README.md                      本文件
├── tc-main-<slug>.md              TC 主索引：全部业务域、编号前缀、覆盖率汇总
├── <业务域>/
│   ├── tc-<业务域>.md              该域完整用例
│   ├── tc-<业务域>-用例详情.md      用例多时的详情层
│   └── sql/
│       ├── <PREFIX>-SEED.sql       该域共用种子数据
│       └── <PREFIX>-NN.sql         与用例编号一一对应的数据准备/清理
```

执行结果（测试报告、缺陷清单、截图）不在本目录，统一写入 `08-test-reports/`。

各文件的字段、编号规则、SQL 自包含要求，以两个 skill 的 SKILL.md 为准，本文件不重复。

## mock域准备方式

[mock域](mock/tc-mock.md)以PRD V1.1为准，采用[来源数据准备说明](mock/source-scenarios.md)和逐用例操作表；原纯注释SQL已移除。来源存储未实现前不编造SQL，后续用实际来源生成工具及外部接口驱动。设计覆盖不代表执行通过，生成/首次导入/业务办理分别使用各自初态。
