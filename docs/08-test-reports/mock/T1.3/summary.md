# T1.3 建立独立数据校验与场景预期 — 验证证据

> 执行时间：2026-09-20｜执行人：AI｜任务：[sub-delivery-plan-jd-charging-mock-T1.3-data-quality.md](../../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T1.3-data-quality.md)
> 环境：macOS（darwin）/ Node.js v25.8.1 / 工作目录 `code/mocks/`

## 1. 交付物

| 文件 | 内容 |
| --- | --- |
| `code/mocks/validation/decimal.ts` | 独立十进制金额运算（不复用生成器算法） |
| `code/mocks/validation/dataset-validator.ts` | 独立数据校验器：版本/时间、答案隔离、跨记录关联、文件字节摘要、金额独立复算（数量×单价、总分、双方对照）、格式关联、五类交付文件完整性；输出 validation-report.json |
| `code/mocks/validation/sabotage-check.ts` | 破坏注入检查：坏关联/错误金额/摘要不符/未登记格式错版，逐种在副本上注入并核实校验器按对象点名抓出 |
| `code/mocks/acceptance/golden/` | 固定样本：golden-facts.json（2 服务商/4 工单/4 账单组，可人工逐字段核实）、golden-expected.json（冻结算式与原文位置）、load-golden.ts、verify-golden.ts、独立环境 environments/golden.json |
| `code/mocks/acceptance/expected/build-expectations.ts` | 独立验收预期生成：九场景 × §5.3 八要素 + 5 个负例预期，冻结后拒绝重写 |
| `code/mocks/generator/manifest.ts` | 五类交付文件完整性检查模块 |

## 2. 五类交付文件（standard-v1，`.data/mock-env-a/delivery/standard-v1/`）

| 文件 | 状态 |
| --- | --- |
| 数据清单 data-manifest.json | 数据集/生成器版本/种子/初始时点/各系统对象数/场景对象清单/账单组索引 |
| 文件清单 file-manifest.json | 997 文件：所属记录/来源/版本/类型/大小/摘要/页·sheet/内容位置；描述与识别原文分开 |
| 场景覆盖表 scenario-coverage.json | 九场景对象与分布、格式四条件、形态五类、多工单账单、单家工单计数 |
| 数据校验报告 validation-report.json | 独立校验 7 类检查 0 失败；rawCounts 全量计数 |
| 独立验收预期 scenario-expectations.json | 九场景八要素（来源对象及初始版本/接口/操作顺序/可变·不可变来源/预期结果/证据位置/回查方式）+ 5 负例预期；冻结不可重写 |

预期文件存放于交付目录、独立于来源存储；校验器 ANSWER-ISOLATION 断言全部 8152 条来源载荷无场景标签/预期/负例编号。

## 3. 逐断言结果

### 3.1 TC-MCK-23 五件交付与未预期错误阻止装载

- 交付完整性：校验器逐项核对五件及必备字段，缺失/缺字段均报名。
- 破坏注入（各在独立副本执行，原环境不动，基线 0 问题）：

| 破坏 | 校验器抓出 |
| --- | --- |
| 方案指向不存在工单 | ASSOCIATION：PLAN-0001 方案指向不存在工单 WO-9999-XXXX |
| 应收分项金额改大 10.00 | AMOUNT：REC-2609-0001 分项合计 1285.00 与原总额 1275.00 不符 |
| 正常文件改一字节 | FILE：MAT-00001@material-1 文件字节摘要与 file_meta 不符 |
| 完整条件服务商声明格式错版 | FORMAT-ASSOCIATION：PROV-DOC-001 声明 FMT-001@fv-9 与说明不一致 |

### 3.2 golden 固定样本（verify-golden 17 断言全过）

- 算式复算：12×30.00=360.00、10×45.00=450.00、360.00+450.00=810.00、2段×4米=8米、8×30.00=240.00、240.00+60.00=300.00、0.00+(-30.00)=-30.00、300.00+5.00=305.00≠310.00 全部成立。
- 情形核实：拆合项（京东 2 分项 vs 应收 1 合并项，不得仅凭总额判一致）、固定费用（数量/单价 null 不倒算）、未知金额保持 null、零值 0.00 保留、负向调整 -30.00 参与合计、范围不一致分项（归属 null 保留）、总分不符负例保留、材料不足保持缺项、同名异义（G-FMT-1.数量=米数 vs G-FMT-2.数量=段数）。
- 独立校验对 golden 数据集 0 未解释错误；3 个文件摘要一致、MAT-G-001 实测 2 页。
- 改坏关键值：REC-G-001 改 811.00 → 抓出 AMOUNT；MAT-G-002 改一字节 → 抓出 FILE。
- 时间推进：副本插入 +7 天 receivable-2 修订记录通过校验，原环境无该记录（新版本不被种子冻结）。

### 3.3 TC-MCK-21/22/24/25/26 承接

| 用例 | 本轮承接证据 |
| --- | --- |
| 21 规模与覆盖 | T1.1 独立校验 38 断言（verify.ts），本轮 validator 复跑 rawCounts 一致 |
| 22 复现与时间推进 | T1.1 八库 8142 条逐条一致、T1.2 两次生成 997 文件 sha256 一致；本轮 golden 时间推进演示 |
| 24 负例与答案隔离 | 负例 5 个按登记保留（validator 豁免但物理核实存在）；ANSWER-ISOLATION 全量载荷扫描通过 |
| 25 跨接口关联 | T1.1 八类关联断言 + 本轮 ASSOCIATION 遍历（方案/明细/材料/权益/账单分项） |
| 26 非法配置拒绝 | T1.1 六类拒绝输出（证据 docs/08-test-reports/mock/T1.1/） |

## 4. 命令

```bash
node validation/dataset-validator.ts --env environments/mock-env-a.json --dataset standard-v1 --write-report
node validation/sabotage-check.ts  --env environments/mock-env-a.json --dataset standard-v1
node acceptance/golden/load-golden.ts && node validation/dataset-validator.ts --env environments/golden.json --dataset golden-v1 --write-report && node acceptance/golden/verify-golden.ts
node acceptance/expected/build-expectations.ts --env environments/mock-env-a.json --dataset standard-v1   # 预期冻结，不可重复执行
```

## 5. 边界

- 场景预期中"应出现的业务结果"的执行核对属 T2.x 接口与 T4.2 业务联调；本轮冻结预期本身并证明数据侧满足前置条件。
- 修订协议（receivable-2 读取与接续）由 T2.6 正式实现，本轮仅证明校验器接受推进的版本与时间。
