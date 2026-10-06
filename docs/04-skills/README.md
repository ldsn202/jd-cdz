# 04-skills 业务 Skills

> 上游（我引用）：[AI 推理与材料解析](../03-foundation/03-02-external-apis/ai-inference-material-parsing.md) §1—3、[运行数据规则](../../rules/runtime-mock-data.md) §2—3、[接入配置 Skill](provider-mapping-config/SKILL.md) §1—7
> 下游（引用我）：[mock 数据 PRD](../05-prd/00-subprd-mock-data.md) §2、§5、[本地运行工具](../../code/skill-runtime/README.md) 运行与校验、[转换配置](provider-mapping-config/SKILL.md) §1—3、[安装整理](install-detail-extractor/SKILL.md) §1—3、[安装核查](install-evidence-finder/SKILL.md) §1—3、[对账解释](billing-diff-explainer/SKILL.md) §1—3、[验证记录](validation.md) §1—3、[mainprd-jd-charging.md](../05-prd/mainprd-jd-charging.md) §四、[03-subprd-provider-config.md](../05-prd/03-subprd-provider-config.md) 头部（代 provider-mapping-config/SKILL.md 登记，SKILL 包已验收不改动）、[04-subprd-installation-materials.md](../05-prd/04-subprd-installation-materials.md) 头部（代 install-detail-extractor/SKILL.md 登记）、[05-subprd-installation-review.md](../05-prd/05-subprd-installation-review.md) 头部（代 install-evidence-finder/SKILL.md 登记）、[06-subprd-reconciliation.md](../05-prd/06-subprd-reconciliation.md) 头部（代 billing-diff-explainer/SKILL.md 登记）

## 1. 当前交付

四包及本地运行工具已完成；75项程序测试通过，四类 Skill 的8个正常/异常场景已有真实 OpenCode 输出并通过验收。版本均为 **1.0.0**，逐项结果与验证范围见 [验证记录](validation.md)。

本目录保存业务 Skill 正本。运行程序按任务复制其中一个包到临时目录 `.opencode/skills/<name>/`，要求原生 skill 工具装载；`.agent/skills/` 继续管理开发辅助 Skill。

用户已确认采用后台统一取数方式：后台按事项读取其他系统，整理并固定来源版本后交给 Skill；Skill 无需直接调用 MCP。转换和确定性计算也由程序执行。来源接口、权限、超时与重试由后台统一处理，Skill 只负责规则生成或证据判断。

## 2. 四类能力

| 包 | 输入重点 | 实际产物 | 处理边界 |
| --- | --- | --- | --- |
| [provider-mapping-config](provider-mapping-config/SKILL.md) | 原字段、格式定义、样例与版本 | 完整可执行转换配置、对照表、待确认项；程序另出实际试转换结果 | 人员确认后启用，同类资料由程序持续转换 |
| [install-detail-extractor](install-detail-extractor/SKILL.md) | 当前工单关联的施工资料 | 安装明细草稿及原文定位 | 使用实际量；人员确认提交 |
| [install-evidence-finder](install-evidence-finder/SKILL.md) | 方案、明细、现场材料及补充 | 支持/冲突/不足的具体证据与问题 | 分析不代替审核决定 |
| [billing-diff-explainer](billing-diff-explainer/SKILL.md) | 双方费用、条款及批准记录 | 差异解释及适用依据 | 金额由程序计算；模型不改账或结算 |

第一包输出 TRANSFORMATION_CONFIG：包含用途、格式版本、明细行位置 rowPath 和 PIPELINE 规则。九种已实现算子覆盖取值、文本整理、精确十进制转换、单位比例及名称对照；未支持的转换明确留待补充。完整语法见 [转换规则目录](provider-mapping-config/references/rule-catalog.md)。

```text
新服务商原字段与说明 → Skill 生成规则 → 程序实际试转换 → 人员确认启用
已生效规则 + 后续同格式资料 → 程序直接转换 → 明细/费用标准字段
格式变更、缺字段或未知值 → 保留原数据与问题 → 重新处理配置
```

这条链路中的规则生成、确定性转换已落地；业务 API、数据库保存和启用事务按 foundation 在后续开发实现。

## 3. 运行和验证

命令、环境要求、工具权限与证据文件见 [本地运行工具](../../code/skill-runtime/README.md)。输入来源于模拟 HTTP 接口返回或后续上传服务的固定快照；前端不生成业务判断。

- 四包只写 analysis JSON，结构、快照、字段和证据定位由 contract.mjs 检查。
- 配置规则由 transform.mjs 实际执行；用途由调用方可信范围提供，不能由模型自证。试转换失败不能成为成功候选。
- 资料缺失、内容不全、关联未知时保留具体问题；模型失败不回退固定答案。
- 当前8个场景是 Skill 应用测试，使用模拟解析块；不代表真实 OCR、XLSX 解析或至少100家服务商的完整 mock 系统已经实现。
- 真实模型实跑验收需保留原生 skill 装载、读写工具事件、实际输出和运行参数；本地 Agent 验证与程序单测分别报告。
