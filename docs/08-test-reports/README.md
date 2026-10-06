# 08-test-reports 测试执行结果

`06-testcase/` 里用例的执行结果。**由 `test-case-runner` skill 执行后自动写入**（入口：`.agent/skills/test-case-runner/SKILL.md`），不手写。

## 目录结构（由 test-case-runner 生成）

```
08-test-reports/
├── README.md                        本文件
├── index.md                         报告总索引：各业务域 PASS/FAIL 汇总
├── 测试验收-<业务域>.md              单个业务域的执行报告，与 06-testcase/<业务域>/ 一一对应
├── defects.md                       缺陷清单：所有 FAIL 用例的汇总与状态跟踪
└── screenshots/                     执行截图，按业务域分目录
    └── 测试验收-<业务域>/TC-XX-NN.png
```

## 读法

1. 先看 `index.md` 知道整体通过率。
2. 有 FAIL 去看 `defects.md`，按缺陷单跟踪修复状态。
3. 单条用例的执行细节（含截图）在对应业务域报告里。

**口径约定**：报告与 `06-testcase/` 的用例编号一一对应；用例改了必须重跑并重出报告，不允许报告版本落后于用例版本。
