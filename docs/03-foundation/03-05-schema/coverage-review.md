# 表结构覆盖与一致性核对

> 版本：V1.0｜日期：2026-09-20｜状态：候选设计总核对；实际业务及 D1 运行验收在实现阶段执行
> 上游（我引用）：[事项](work-item-schema.md) §1—9、[材料证据](evidence-schema.md) §1—7、[安装](installation-schema.md) §1—7、[对账](reconciliation-schema.md) §1—7、[配置](integration-config-schema.md) §1—7、[身份](identity-schema.md) §1—4、[执行](execution-schema.md) §1—5
> 下游（引用我）：[本系统接口公共约定](../03-06-provided-apis/common-contract.md) §1—5、[系统事务与恢复](../03-07-system-flows/sys-transactions-recovery.md) §1—5、[foundation 全范围验收](../coverage-review.md) §1—5、[00-subprd-mock-data.md](../../05-prd/00-subprd-mock-data.md) §2.3

## 1. 加载与范围

按 work-item、evidence、installation、reconciliation、integration-config、identity、execution 顺序加载七份候选 SQL，再加载 [cross-domain-guards.sql](cross-domain-guards.sql)。七域共 41 张业务及执行表，另有一张临时事务断言表；这些为后续 migration 的设计依据，尚未部署。

单域检查只证明局部约束。组合保护必须随正式迁移一并加载，不允许仅复制单域文件而省略最后一份。深层 JSON、授权事实、外部版本、证据语义和完整业务条件仍由服务端校验。

## 2. 跨域一致性

| 关系 | 固定口径与保护位置 |
| --- | --- |
| 服务商、工单、事项 | 本地 id 与来源编号分开；历史事项的服务商不随当前工单重新分配迁移。实际读写检查当前归属 |
| 身份与人工决定 | 同 HUMAN 主体、当前责任人、事项及责任版本、上下文中的授权项匹配；组合 SQL 检查引用，服务端核实当前动作和范围 |
| 输入与结果 | 输入项先写、快照最后封存；封存、任务同事务。runId 的操作、输入、配置及实现版本须与采用结果一致 |
| 分析发布 | 快照与事项 analysis_generation 匹配；输入改变时加代次并清空当前分析指针。服务端再核实实际材料/配置版本，按当前 row_version 条件更新 |
| 草稿及提交 | 固定草稿版本和真实确认生成同一份请求；明细扩展 id = external_write_operation.id = submissionId，状态只在外部写入表维护 |
| 未决写入 | external_write_operation 的工单、事项部分唯一索引跨明细、审核、补充共同保护；REGISTERED 即占用 |
| 配置启用 | 同事项当前候选、通过的试转换、当前责任、确认的配置版本及旧生效指针均匹配，才能保存 APPLIED 并同时切换指针和完成事项 |
| 对账完成 | 原分项覆盖、对应关系、各方版本、计费依据及全部疑点均满足业务条件；金额使用十进制程序计算，AI 输出不充当金额权威源 |
| 来源变化 | 同代次完整批、固定变化、覆盖任务和 cursor 同事务；空批不推进，同号不同内容报冲突 |
| 历史 | 业务历史不直接删除；所有业务表主键和唯一键显式阻断替换式写入，不能依赖 recursive_triggers 设置 |

## 3. 条件更新与事务

`transaction_assertion` 为组合提交的临时 SQL 断言，无独立业务实体或页面。字段：id TEXT 主键；passed INTEGER 必为 1；gmt_create/gmt_modified INTEGER 为同一 UTC 毫秒。每次受控批次使用独立服务端生成的 id，事务内插入并删除，不留下长期业务记录。

每次必须命中一行的条件 UPDATE 后，紧接着执行：

```sql
INSERT INTO transaction_assertion(id,passed,gmt_create,gmt_modified)
VALUES (:assertionId, changes()=1, :now, :now);
DELETE FROM transaction_assertion WHERE id=:assertionId;
```

断言必须紧随被检查的语句，不能先插入日志或其他记录再读 changes()。命中零行使 CHECK 失败，整批回滚；不能在已提交后检查 affectedRows 再试图回滚。固定历史记录、任务、指针和状态在同一批中保存。外部调用在本地提交后执行，不能加入数据库事务。

SQLite 本地测试用显式事务验证同等 SQL 失败回滚。D1 实现须使用绑定参数的 `batch()` 并实测整批失败行为；D1 API 的批次事务约定见[官方说明](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)。本地结果不替代 D1 运行验证。

## 4. 服务端必须执行的条件

- 请求级：可信身份、完整授权、动作与范围同项匹配、责任人及责任版本、资源可见性、同键同内容幂等。
- 确认级：输入和候选版本未变；未决外部操作不存在；决定内容由后端重建并与人员确认一致。确认不等于外部已成功。
- 发布级：当前来源与配置指纹仍适用、输入代次相同、事项未完成、领取令牌仍有效；普通进度变化时重读当前行后重新条件发布，不重跑模型。
- 启用级：当前候选与试转换完全匹配、输入覆盖和规则检查通过、无未决冲突、配置旧生效版本匹配。任何条件改变整批失败，旧配置继续有效。
- 外部级：写出前重新核实原人员、当前版本与原账号；结果未知保持保护并回查，成功后的本地接续失败不能再次写外部。
- 结束级：保留具体完成原因与依据；异常关闭须在同事务中登记精准后续事项/关联；业务停止须有确切依据，未决写入未恢复不得当作失败清空。

## 5. 检查与限制

本轮新增约束测试在 `PHASE-14/tests/test-foundation-completion.py`，与已有五域约束测试共同执行。覆盖合法流程及主体不符、封存后追加、历史替换、批次缺任务、竞争领取、未知写入重发、同工单重复写入、旧输入晚到、普通进展不废弃分析、条件零行回滚等反例。

逻辑外键、深层 JSON 与业务事实不宣称由单表全部保证。真实来源、完整服务事务、D1、OpenCode 和上传解析在后续实现阶段按接口及系统流程验证。文件大小、执行预算与保存期限属于实现前配置验收项，不能凭截断输入得到通过结果。
