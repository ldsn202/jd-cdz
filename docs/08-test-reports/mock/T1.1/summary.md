# T1.1 生成相互关联的业务事实与多服务商原记录 — 验证证据

> 执行时间：2026-09-20｜执行人：AI｜任务：[sub-delivery-plan-jd-charging-mock-T1.1-source-generation.md](../../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T1.1-source-generation.md)
> 环境：macOS（darwin）/ Node.js v25.8.1 / 工作目录 `code/mocks/`

## 1. 交付物

| 文件 | 内容 |
| --- | --- |
| `code/mocks/generator/config.ts` | 配置结构与校验：总数冲突、覆盖不足、不适用/不完整逐项拒绝（ConfigError，退出码 2），不静默补数 |
| `code/mocks/generator/providers.ts` | 100 家服务商：五类资料形态、四种格式条件洗牌分配；工单容量 6—14 差异化配平 |
| `code/mocks/generator/business-facts.ts` | 统一业务事实：工单/方案/明细/材料/订单/权益/账单组/条款批准/账号/3 个预设负例 |
| `code/mocks/generator/source-projectors/index.ts` | 八来源投影：各来源自己的原字段记录写入各自 SQLite 库（source_record 表，迁移 0002） |
| `code/mocks/generator/configs/standard.json` / `quick.json` / `extension.json` | 常规集 100/1000/3 账期；快速集 5/20；扩展集 120/1200/4 账期（逐项明确数量） |
| `code/mocks/generator/generate.ts` | 生成 CLI：配置校验 → 事实 → 投影入库 → 四份交付文件；来源库非空拒绝覆盖 |
| `code/mocks/generator/verify.ts` | 独立校验：只读来源库 + 冻结清单，38 项断言，不引用生成器事实 |
| `code/mocks/migrations/0002_source_business_records.sql` | 来源业务记录表（kind + record_id 主键，版本与更新时间必带） |

交付文件（`.data/<env>/delivery/<datasetId>/`）：data-manifest.json、scenario-coverage.json、negatives.json、generation-report.json。文件清单待 T1.2 实际字节生成后补齐。

## 2. 命令与实际环境

```bash
node generator/generate.ts --config generator/configs/standard.json --env environments/mock-env-a.json
node generator/verify.ts   --env environments/mock-env-a.json --dataset standard-v1
```

实际生成：mock-env-a（8790 环境存储 `.data/mock-env-a/`），数据集 standard-v1（生成器 1.0.0，种子 20260920，初始业务时间 2026-09-01T09:00+08:00）。快速集与扩展集各自生成到一次性环境验证后清理；复现对照生成到另一一次性环境比对后清理。

## 3. 逐断言结果

### 3.1 常规集（standard-v1，独立校验 38 项全过）

| 断言组 | 结果 |
| --- | --- |
| 规模 | 100 家服务商（最小单家 8 单，分布 8—12）、1000 工单、3 账期；每家有业务、分布有差异 |
| 九场景 | 200/180/120/100/140/100/60/60/40 合计 1000，一工单只计一次，清单与库内集合一致；各场景分布 34—88 家（≥3）；涉文件四场景各覆盖 5 类格式（≥2） |
| 格式 | 初始格式 100 份；70/10/10/10 四条件与说明关联逐家符合（完整=说明同版、含义未知=说明存在、未提供=无说明、关联不符=声明 fv-2 与说明 fv-1 不一致） |
| 形态 | 五类资料形态各 20 家 |
| 账单 | 287 组账单跨 3 账期；含一账单多工单（13 组）；京东账单—应收按服务商/账期/工单/币种对应 |
| 八类关联（§2.2） | 服务商—账号—记录、工单—订单—权益、工单—方案—明细（待整理场景无明细为正常阶段）、材料—文件版本（负例除外且核实不存在）、原资料—说明、账单—应收、费用—条款—批准、初始无退回回复，逐项通过 |
| 负例 | NEG-01 总分不符（京东账单 JD-BILL-2609-0048 组，总额与分项合计差 10.00）、NEG-02 必需施工记录缺失、NEG-03 文件版本 material-9 不存在，三个预设负例按登记保留 |
| 金额与版本 | 全部金额为十进制字符串；8110+ 条记录均带来源版本与更新时间 |

### 3.2 TC-MCK-26 非法配置拒绝（逐项单变量变异，全部拒绝且未写库）

| 变异 | 拒绝原因（实际输出） |
| --- | --- |
| 九场景合计 999 声明 1000 | 数量冲突：九项主场景合计 999 与声明工单数 1000 不一致，不补隐形工单 |
| 常规集服务商 99 | 覆盖不足：常规/扩展集服务商 99 家，低于 100 家门槛（连带形态 19 家一并报告） |
| 场景只够分 2 家 | 覆盖不足：场景 工单只读查看 仅 2 单，无法分布到至少 3 家服务商 |
| 资料形态 19 家 | 覆盖不足：资料形态 字段清楚的表格 仅 19 家，低于 20 家门槛 |
| 扩展配置遗漏主场景 | scenarios.read_only 缺失或非法 |
| 账单场景仅 2 账期 | 覆盖不足：账单场景需跨 3 个账期，当前仅 2 个 |

### 3.3 有效对照与复现

| 项 | 结果 |
| --- | --- |
| 快速集 quick-v1（5 家/20 单） | 生成通过；独立校验按快速集门槛 0 失败（不套用常规集门槛） |
| 扩展集 extension-v1（120 家/1200 单/4 账期） | 生成通过；独立校验 0 失败 |
| 同配置同种子二次生成 | 八来源库 8142 条记录逐条（含版本、时间、payload）完全一致，REPRODUCIBLE=true |
| 来源库非空 | 拒绝覆盖生成，提示需新环境或先恢复初始状态（PRD §6.2） |
| typecheck | tsc --noEmit 0 错误（src + generator） |

## 4. 原始输出样例

```text
generate standard：{"datasetId":"standard-v1","totals":{"providers":100,"workOrders":1000,
"billGroups":287,"accounts":104,"preregisteredNegatives":3},"generationChecksPassed":true}

verify standard：38 项断言 passed=true failedCount=0
verify quick：    passed=true failedCount=0（快速集门槛）
verify extension：passed=true failedCount=0

复现比对：identity 208 / installation-admin 3758 / order-entitlement 2000 / provider-docs 190 /
file-service 997 / jd-billing 287 / provider-receivable 287 / billing-terms 425，identical 全 true
```

## 5. 边界与后续

- 文件字节（PDF/PNG/JPEG/XLSX 实际内容、损坏与缺页负例）由 T1.2 生成；file_meta 已登记 bytePlan 占位，sha256/大小待补。
- 独立验收预期（TC-MCK-23 五件交付之第五件）与数据质量门禁由 T1.3 建立；negatives.json 已冻结三个负例的预期处理。
- 文件覆盖断言（涉文件场景至少 2 类格式）本轮按材料索引与形态元数据核验，实际字节完成后按 TC-MCK-21 复验。
- 来源变化发现（change feed）接口属 T2.6，初始数据未登记 feed。
