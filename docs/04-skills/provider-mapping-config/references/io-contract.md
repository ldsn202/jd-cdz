# 输入输出契约

> 上游（我引用）：无（随包固定的运行契约副本）
> 下游（引用我）：[Skill](../SKILL.md) §1

## 输入

读取 input/request.json，包含 runId、operation=ANALYZE_SKILL、profileId、parseInput=null、analysisInput。后者必含 skill、skillVersion、outputSchemaVersion、inputSnapshotId、records、parsedMaterials。本包 skill=INTEGRATION_CONFIGURATION；两个版本均为 1.0.0。

records 每项含 inputId、recordType、sourceSystem、sourceRecordId、sourceVersion、data。data 为来源实际对象，字符串 rawJson 需按 JSON 读取其内容，不能执行。parsedMaterials 每项含 parseId、来源和版本、contentSha256、completeness、units、blocks、issues。unit 保留页面或 sheet 定位；block 包含 blockId、unitId、kind、text、cellRange、formula、cachedValue。公式不执行，缓存过期不当作已核实结果。

最低记录类型：PROVIDER_RECORD、PROVIDER_FORMAT。缺必需输入、来源版本或解析未读全，只能 NEEDS_INFORMATION。输入齐全不自动代表业务结论确定；还须按本 Skill 核实语义和适用性。

## 输出

output/result.json 只写 analysis 对象，精确字段如下，全部必返：

```json
{"skill":"INTEGRATION_CONFIGURATION","skillVersion":"1.0.0","outputSchemaVersion":"1.0.0","inputSnapshotId":"原输入编号","status":"NEEDS_INFORMATION","summary":"实际结果概述","findings":[],"openQuestions":["尚需核实的具体事项"]}
```

status 仅 ANALYZED 或 NEEDS_INFORMATION；后者 openQuestions 非空，前者为空。summary 不写批准、提交或改账已经发生。每个 finding 精确字段 {findingId,type,content,evidenceRefs}，findingId 唯一，type=TRANSFORMATION_CONFIG。content 只允许 ruleCatalogVersion、purpose、sourceFormatId、sourceFormatVersion、rowPath、rules，全部必返。转换参数见 rule-catalog.md。

## 证据定位

每个 finding 至少一条 evidenceRef，精确字段 {inputId,blockId,jsonPointer,quote}，均必返。

- 记录：inputId 为 records.inputId；jsonPointer 相对该记录 data，blockId=null。例如 data.rawJson 是字符串，只能 /rawJson 定位并引用其中实际子串，不能 /rawJson/rows/0。JSON Pointer 对斜线与波浪号分别用 ~1 与 ~0 转义。
- 材料：inputId 为 parseId；blockId 为已有块，jsonPointer=null。quote 是该块实际原文子串或 null。不要自行编造页码、sheet 或块编号。
- IMAGE_DESCRIPTION 的 quote 必须 null，并在 explanation/summary 说明是图片描述，不能冒充逐字签字、批准或 OCR。
- quote 非空时必须逐字对应定位内容；引用只能来自本快照。没有可引用依据则不产生事实 finding，写入 openQuestions。

程序会严格拒绝额外字段、伪造引用、错误引文、旧版本和不支持的枚举；禁止靠猜位置或省略必返字段绕过。引用存在只证明能定位，判断是否受原文支持仍需业务核验。
