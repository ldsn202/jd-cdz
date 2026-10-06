# T2.2 实现服务商原资料及文件版本读取 — 验证证据

> 执行时间：2026-09-20｜执行人：AI｜环境：mock-env-a（8790 实跑）

## 交付物
- `code/mocks/providers/documents.ts`：原资料+格式说明 GET（rawJson 原样、NOT_PROVIDED/null、meaning=null、FORMAT_ASSOCIATION 分别表达）
- `code/mocks/materials/read.ts`：原始文件 GET（按来源/ID/sourceVersion 返回实际字节 base64+sha256；授权先于正文；版本不可取得 40901；零字节 50201；超限 41301；不支持格式 41501）
- `code/mocks/tests/provider-materials.test.ts`：15 项真实 HTTP 断言

## 逐断言结果（15 项全过）
| 组 | 结果 |
| --- | --- |
| 原资料 | 完整条件 PROVIDED+COMPLETE；含义未知 PROVIDED 且 meaning=null；未提供 NOT_PROVIDED+null 不伪造；关联不符声明 fv-2 与说明 fv-1 分别保留并列 FORMAT_ASSOCIATION/INCOMPLETE；跨服务商 40301；不存在 40401；来源未配置 40001；rawJson 与库内原文逐字一致 |
| 文件 | 按版本返回实际字节（与磁盘逐字节一致、摘要一致）；缺 sourceVersion 40001；版本不可取得 40901（不换新文件填旧引用）；NEG-03 索引 material-9 40901 不回退；无 READ_SOURCE_MATERIAL 40301 且 data=null（授权先于正文）；同一材料 material-1/material-2 两版内容不同各自返回对应摘要（测试工具在来源侧准备第二版） |

边界：工作台解析呈现留 T4.2；版本不可核实（40902）在文件缺失登记路径时触发，故障注入留 T3.1。
