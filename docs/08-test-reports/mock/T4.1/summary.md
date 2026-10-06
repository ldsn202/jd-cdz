# T4.1 模拟来源自动验收 — 证据包（acc-run-1 / acc-run-2）

> 执行时间：2026-09-20T15:08:12.197Z｜数据集：standard-v1｜环境：acc-run-1 / acc-run-2

## 阶段结果

| 阶段 | 结果 | 说明 |
| --- | --- | --- |
| 环境检查 | PASS | acc-run-1 清单校验与存储初始化 |
| 来源生成 | PASS | 100 家/1000 单/3 账期 + 预设负例 |
| 文件生成 | PASS | 997 个真实文件（PDF/XLSX/PNG/JPEG） |
| 验收预期冻结 | PASS | 九场景八要素 + 5 负例预期 |
| 独立数据校验 | PASS | issues=0 |
| 规模与关联核对 | PASS | 38 项断言 |
| 文件独立校验 | PASS | 8 项断言 |
| 破坏注入检查 | PASS | 坏关联/错金额/摘要不符/错版均抓出 |
| golden 固定样本 | PASS | 17 项断言（算式/情形/破坏探针） |
| HTTP 启动 | PASS | acc-run-1 实跑端口 8795 |
| 13+1 业务操作正反例 | PASS | 27 项（失败 0） |
| 重启后写回结果可查 | PASS | 回查 SUCCEEDED |
| 环境检查 | PASS | acc-run-2 清单校验与存储初始化 |
| 来源生成 | PASS | 100 家/1000 单/3 账期 + 预设负例 |
| 文件生成 | PASS | 997 个真实文件（PDF/XLSX/PNG/JPEG） |
| 验收预期冻结 | PASS | 九场景八要素 + 5 负例预期 |
| 独立数据校验 | PASS | issues=0 |
| 规模与关联核对 | PASS | 38 项断言 |
| 文件独立校验 | PASS | 8 项断言 |
| 破坏注入检查 | PASS | 坏关联/错金额/摘要不符/错版均抓出 |
| HTTP 启动 | PASS | acc-run-2 实跑端口 8796 |
| 13+1 业务操作正反例 | PASS | 27 项（失败 0） |
| 重启后写回结果可查 | PASS | 回查 SUCCEEDED |
| 两次生成可复现 | PASS | 记录摘要 e3410bed6f4b… / 文件摘要 3c500724a290… |

## 业务操作正反例

| 操作 | 性质 | 结果 | 说明 |
| --- | --- | --- | --- |
| OP-01+ 身份上下文 | 正例 | PASS | 200 grants=1 |
| OP-01- 身份上下文无凭据 | 反例 | PASS | 40101 |
| OP-02+ 工单上下文 | 正例 | PASS | 200 completeness=COMPLETE |
| OP-02- 工单跨服务商 | 反例 | PASS | 40301 |
| OP-03+ 购买权益 | 正例 | PASS | 200 LIMITED 上限 1 |
| OP-03- 订单不存在 | 反例 | PASS | 40401 |
| OP-04+ 服务商原资料 | 正例 | PASS | 200 formatStatus=PROVIDED |
| OP-04- 来源未配置 | 反例 | PASS | 40001 |
| OP-05+ 原始文件字节 | 正例 | PASS | 200 5288B 摘要=191618888ce9… |
| OP-05- 文件版本不可取得 | 反例 | PASS | 40901 |
| OP-06+ 京东账单 | 正例 | PASS | 200 总额=1275.00 |
| OP-06- 账单工单不符 | 反例 | PASS | 40901 |
| OP-07+ 服务商应收 | 正例 | PASS | 200 总额=1275.00 |
| OP-07- 应收不存在 | 反例 | PASS | 40401 |
| OP-08+ 费用依据 | 正例 | PASS | 200 terms=1 approvals=1 |
| OP-08- 费用依据越权 | 反例 | PASS | 403（按范围控制） |
| OP-09+ 明细提交写入 | 正例 | PASS | SUCCEEDED detail-1 |
| OP-09- 提交版本不符 | 反例 | PASS | 40901 |
| OP-10+ 提交回查 | 正例 | PASS | 回查一致 |
| OP-10- 回查不存在 | 反例 | PASS | 40401 |
| OP-11+ 退回补充写入 | 正例 | PASS | SUCCEEDED |
| OP-11- 退回意见为空 | 反例 | PASS | 40001 |
| OP-12+ 动作回查 | 正例 | PASS | 回查一致 |
| OP-12- 动作不存在 | 反例 | PASS | 40401 |
| OP-13+ 变化发现 | 正例 | PASS | 基线+写入事件 38 条（含明细提交事件=true） |
| OP-13- 变化发现越权 | 反例 | PASS | 40301 |
| OP-14+ 丢响应恢复 | 正例 | PASS | 504→回查 SUCCEEDED（没有收到响应≠没有写入） |

操作合计 27 项，通过 27 项。

## 用例分阶段状态（生成 / 来源接口 / 业务联调）

| 用例 | 生成 | 来源接口 | 业务联调 |
| --- | --- | --- | --- |
| TC-MCK-01 模拟外部接口分层入口与合同包装 | PASS | PASS | BLOCKED |
| TC-MCK-02 后台 HTTP 适配、脱敏与失败分支 | PASS | PASS | BLOCKED |
| TC-MCK-03 来源调用前失败 | PASS | PASS | BLOCKED |
| TC-MCK-04 材料版本与读取错误 | PASS | PASS | BLOCKED |
| TC-MCK-05 服务商格式四条件 | PASS | PASS | BLOCKED |
| TC-MCK-06 多服务商账号与范围隔离 | PASS | PASS | BLOCKED |
| TC-MCK-07 来源调用前失败恢复 | PASS | PASS | BLOCKED |
| TC-MCK-08 超时、结果未知与回查恢复 | PASS | PASS | BLOCKED |
| TC-MCK-09 写入后响应丢失 | PASS | PASS | BLOCKED |
| TC-MCK-10 同操作编号并发与重复提交 | PASS | NOT_RUN | BLOCKED |
| TC-MCK-11 服务商修订应收并重读 | PASS | PASS | BLOCKED |
| TC-MCK-12 服务商回复后的分析与复核衔接 | PASS | BLOCKED | BLOCKED |
| TC-MCK-13 权限撤销与失效会话 | PASS | PASS | BLOCKED |
| TC-MCK-14 双方账目字段完整性 | PASS | PASS | BLOCKED |
| TC-MCK-15 缺权限与自报身份参数 | PASS | PASS | BLOCKED |
| TC-MCK-16 越权读取与跨服务商 | PASS | PASS | BLOCKED |
| TC-MCK-17 无权限与深链接 404 口径 | PASS | BLOCKED | BLOCKED |
| TC-MCK-18 上传文件实际保留 | PASS | BLOCKED | BLOCKED |
| TC-MCK-19 上传与模拟材料浏览隔离 | PASS | BLOCKED | BLOCKED |
| TC-MCK-20 模拟数据经接口进入工作台 | PASS | BLOCKED | BLOCKED |
| TC-MCK-21 常规集规模、场景与覆盖核对 | PASS | PASS | BLOCKED |
| TC-MCK-22 初始复现与时间推进 | PASS | PASS | BLOCKED |
| TC-MCK-23 五件交付文件齐备与完整性 | PASS | PASS | BLOCKED |
| TC-MCK-24 预设负例保留、命中与答案隔离 | PASS | PASS | BLOCKED |
| TC-MCK-25 来源跨接口关联与对照独立 | PASS | PASS | BLOCKED |
| TC-MCK-26 非法生成配置拒绝与有效对照 | PASS | PASS | BLOCKED |
| TC-MCK-27 来源读写持久化与重启恢复 | PASS | PASS | BLOCKED |
| TC-MCK-28 配对环境恢复、上传保护与切换 | PASS | PASS | BLOCKED |
| TC-MCK-29 Skill 产物保存 | PASS | BLOCKED | BLOCKED |

29 组用例：生成阶段 PASS 29，来源阶段 PASS 22，业务联调 BLOCKED 29（依赖：T4.2 真实业务应用联调（工作台、D1、调度与 Skill 执行）未实现，不以来源 200 或文档检查换算业务 PASS）。

## 可复现性

对照环境 acc-run-2：来源记录一致=true；文件摘要一致=true。

## 阶段结论

阶段结论：模拟来源可用（生成、来源接口与持久化恢复均已实证）；该结论与完整业务验收分开，业务联调相关子场景保持 BLOCKED，依赖 T4.2 真实业务应用联调。