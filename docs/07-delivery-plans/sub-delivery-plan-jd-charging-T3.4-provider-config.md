# T3.4 服务商接入配置

## 任务来源

- 主开发计划：[main-delivery-plan-jd-charging.md](main-delivery-plan-jd-charging.md)
- 任务看板：[task-kanban-jd-charging.md](task-kanban-jd-charging.md)

#### T3.4 实现配置草稿、试转换、启用与变更重新处理

**Requirement ID**：REQ-CFG-01

**PRD 双链·读**：
- `docs/05-prd/03-subprd-provider-config.md` §3、§4、§5、§7
- `docs/03-foundation/03-06-provided-apis/configuration-apis.md`
- `docs/03-foundation/03-05-schema/integration-config-schema.md`
- `docs/04-skills/provider-mapping-config/SKILL.md`（规则产物结构，只读）
- `code/skill-runtime/transform.mjs`（确定性转换执行，复用不改动）
- `docs/06-testcase/config/tc-config.md`（TC-CFG-）

**核心逻辑**：
- 实现 `GET /configuration`、`PUT /configuration-draft`、`GET /configuration-trials/{trialId}`、`POST /configuration-enablement`。
- 试转换由程序用 transform.mjs 对真实样例执行，失败结果不能成为成功候选；试转换记录启用前必须存在且通过（原型 V1.1 已补的约束口径）。
- 启用走启用事务：人员确认 + 试转换通过 + 权限核实同时满足才生效；启用后同格式资料由程序持续转换；格式变更、缺字段或未知值保留原数据与问题并触发重新处理，不误套配置。

**核心文件**：
- `code/api/src/routes/configuration.ts`（新建）
- `code/api/src/services/config-draft.ts`、`code/api/src/services/config-trial.ts`、`code/api/src/services/config-enablement.ts`（新建）

**完成标准**：
- 启用前置校验三条（确认、试转换通过、权限）任一不满足时启用被拒绝且无部分写入（D1 回查）。
- 启用成功后新版本配置生效，后续资料按新配置转换结果可回查；旧配置版本保留。
- 格式变更样例触发重新处理事项，原数据与问题记录保留，未被旧配置覆盖转换。
- configuration-trials 返回真实执行记录（输入样例、输出、失败原因），无伪造成功。

**Verification Method**：
- 真实走通草稿 → 试转换 → 启用 → 新资料转换链路；构造缺确认 / 试转换失败 / 格式变更三类场景；执行 TC-CFG 可执行用例（#11、#14 联调项留待 T5.1）。

**Evidence**：
- 当日开发日志：链路请求 / 响应与 D1 回查、试转换执行记录；TC-CFG 执行结果记入 `docs/08-test-reports/`。

**Failure Handling**：
- transform 算子不支持的转换按 Skill 包既有边界留待补充，不现场新增算子冒充支持。
- 启用事务与 integration-config 域约束冲突时先回写 schema 文档再改实现。

**完成收尾：状态同步**：
- 本 Task 完成实现和验证后，把完成事实、验证证据、完成日期和建议下一 Task 同步回写三处：`main-delivery-plan-jd-charging.md` 执行阶段表、`task-kanban-jd-charging.md` 对应行、本子开发计划的 `**状态**` 字段。
- 同步更新 `docs/00-process/00-02-progress/progress.md` 的进度快照。
- 回写后重新运行 `node .agent/skills/delivery-planner/scripts/check-plan-consistency.mjs docs/07-delivery-plans/main-delivery-plan-jd-charging.md --json`，确认三处一致；未通过前不得宣称本 Task 已完成。

**Owner**：AI 执行 -> 人审核

**前置**：T1.1、T2.1、T2.3

**状态**：已完成（2026-09-20）
