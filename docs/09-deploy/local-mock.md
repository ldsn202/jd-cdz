# 本地模拟来源（mock）运行与验收复现

> 版本：v1.0｜日期：2026-09-20｜适用：`code/mocks/`（mock 专题 T0.1—T4.1 交付）

## 1. 依赖与锁定

- Node.js ≥ 23.6（原生 TypeScript 运行、内置 `node:sqlite`；实测 v25.8.1）
- 运行时零第三方依赖；`code/mocks/package-lock.json` 锁定 devDependencies（typescript 5.9.3、@types/node 24.10.1）
- 文件校验与人工阅读工具：poppler（pdfinfo/pdftoppm）、macOS sips、LibreOffice（soffice，仅抽样渲染）
- 配置项：`MOCK_BASE_URL`（默认 http://localhost:8790）、`MOCK_ACCOUNT_ID`（按动作分配）、`MOCK_ENV_FILE`、`MOCK_ENV_PORTS`、`MOCK_STORAGE_ROOT`，见 [config-items.md](config-items.md)

## 2. 日常启动

```bash
cd code/mocks
npm install
npm run env:check -- --env environments/mock-env-a.json
npm run start -- --env environments/mock-env-a.json     # 8790；Ctrl-C 停止
```

环境清单 `environments/<envId>.json`：envId/port/dataset/storageRoot/appEnvRef（仅登记）。存储三分区 `.data/<envId>/{sources,files,tasks}`，不进仓库。

## 3. 从空目录完整验收（T4.1 驱动）

```bash
cd code/mocks
node acceptance/run.ts
```

自动完成：环境检查 → 来源生成（standard-v1：100 家/1000 单/3 账期）→ 997 文件生成 → 预期冻结 → 独立数据校验（写报告）→ 规模关联核对 → 文件校验 → 破坏注入检查 → golden 固定样本 → HTTP 启动（acc-run-1:8795、acc-run-2:8796）→ 28 项业务操作正反例 → 重启回查 → 两次生成摘要对照。证据输出：`docs/08-test-reports/mock/T4.1/{summary.md,report.json}`。

## 4. 单项命令

| 目的 | 命令 |
| --- | --- |
| 来源数据生成 | `node generator/generate.ts --config generator/configs/standard.json --env <env>` |
| 文件生成 | `node generator/generate-files.ts --config generator/configs/standard.json --env <env>` |
| 独立校验（写报告） | `node validation/dataset-validator.ts --env <env> --dataset standard-v1 --write-report` |
| 规模/关联/文件核对 | `node generator/verify.ts …`、`node generator/verify-files.ts …` |
| 破坏注入 | `node validation/sabotage-check.ts --env <env> --dataset standard-v1` |
| golden 样本 | `node acceptance/golden/load-golden.ts && node acceptance/golden/verify-golden.ts` |
| 接口测试 | `node tests/<suite>.test.ts`（identity-workorders / provider-materials / billing-sources / detail-writeback / review-writeback / changes / faults-environments） |
| 后台适配集成 | `cd code/api && node tests/external-adapters/run-integration.ts` |

## 5. 快速集与扩展集

`generator/configs/quick.json`（5 家/20 单，单接口排错，门槛放宽）、`extension.json`（120 家/1200 单/4 账期）。非法配置（总数冲突、覆盖不足、缺项）生成器拒绝并不写库。

## 6. 环境与恢复

- 同业务编号双环境（mock-env-a:8790 / mock-env-b:8792）存储完全隔离。
- 完整恢复经 `POST /api/admin/mock/control/environments/restore`：需本系统生命周期适配器（APP_LIFECYCLE_BASE_URL）就绪，否则 40903 拒绝且不做来源单边清空；含上传环境拒绝清空（40901）。
- 故障注入：`POST /api/admin/mock/control/faults`（BEFORE_CALL / AFTER_WRITE_LOST_RESPONSE / RECHECK_FAIL / LOCAL_CONTINUATION，含命中次数与解除）。
- 阶段结论"模拟来源可用"与完整业务验收分开；业务联调子场景见 T4.1 报告 BLOCKED 清单（T4.2 依赖）。
