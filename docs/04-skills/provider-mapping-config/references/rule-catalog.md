# 转换规则目录 charging-transform-1

> 上游（我引用）：无（已实现算子的登记目录）
> 下游（引用我）：[Skill](../SKILL.md) §1—3、[业务清单](../../README.md) §2、[AI 契约](../../../03-foundation/03-02-external-apis/ai-inference-material-parsing.md) §3.3

## 配置结构

content 字段全部必返且不得增添：ruleCatalogVersion 固定 charging-transform-1；purpose 为 INSTALLATION 或 RECONCILIATION；sourceFormatId/sourceFormatVersion 为输入实际版本；rowPath 为原 rawJson 中明细行对象或数组的 JSON Pointer（空字符串表示根）；rules 为非空数组。例：原始数据为 {"rows":[…]} 时 rowPath=/rows，嵌套表为 {"sheets":{"明细":[…]}} 时 rowPath=/sheets/明细。规则内路径均相对于选中的每一行。

INSTALLATION 完整目标：installationItem、installedQuantity、unit、materialSupplier、serviceScope。
materialSupplier 和 serviceScope 是文本字段，优先保留“物业”“仅安装”等明确原义；输入未给定统一代码表时不得自行发明 PROPERTY 等枚举。只有明确给出对应关系时才使用 lookup。
RECONCILIATION 完整目标：itemName、chargeScope、billedQuantity、unit、unitPrice、amount、currency。只规范字段和值，不自动判定双方分项对应，更不算应付款。

每条规则固定 `{ruleId,sourceFields,targetField,operation,parameters,conditions}`。ruleId 唯一，targetField 唯一，operation=PIPELINE，parameters=`{steps:[...]}`。sourceFields 为相对一条原始数据行的 JSON Pointer 数组，必须与取值算子实际读取一致。conditions 为 `{path,equals}`[]，逐条相等才执行；不成立则待处理。数组为空表示不附加行条件，仍核实用途和格式版本。

## 算子

第一步只能取值，后续只能加工；最多16步。不支持的转换列入 openQuestions。

| 算子 | 精确结构 | 行为 |
| --- | --- | --- |
| field | `{op:"field",path:"/实装长度"}` | 按原字段位置取值；缺失待处理 |
| firstOf | `{op:"firstOf",paths:["/旧列","/新列"]}` | 只在等价表头有依据时使用；均存在且值不同则待处理 |
| const | `{op:"const",value:"米"}` | 明确定义的固定单位等；依据不足不使用。可空费用字段允许 null |
| trim | `{op:"trim"}` | 只去字符串首尾空白 |
| halfwidth | `{op:"halfwidth"}` | 全角 ASCII 转半角 |
| stripSuffix | `{op:"stripSuffix",value:"米"}` | 必须存在该后缀，移除后整理首尾空白；不猜单位 |
| decimal | `{op:"decimal"}` | 精确十进制标准化；空、科学计数法、非数值拒绝 |
| scale | `{op:"scale",factor:"0.01"}` | 精确乘比例；比例须有明确单位换算依据 |
| lookup | `{op:"lookup",entries:[{from:"m",to:"米"}],onMiss:"HOLD"}` | 精确查表；未命中待处理，不猜默认值 |

const 的 sourceFields=[]；firstOf 声明全部 paths；field 声明该 path。源字段与 conditions 路径都相对原行，不写 /rawJson 或 /rows/0 前缀。

运行程序从 rawJson 保留数字的原始十进制文本，避免大整数和长小数先被浮点数改写。conditions.equals 只用字符串或布尔值；数值条件使用原始十进制字符串。scale.factor 必须为十进制字符串。科学计数法当前不支持，不能通过近似值绕过。

## 例子

```json
{"ruleId":"actual-length","sourceFields":["/实装长度"],"targetField":"installedQuantity","operation":"PIPELINE","parameters":{"steps":[{"op":"field","path":"/实装长度"},{"op":"halfwidth"},{"op":"stripSuffix","value":"米"},{"op":"decimal"}]},"conditions":[]}
```

程序输出实际数量为有限非负 number；金额、计费数量、单价为精确字符串。任何目标缺规则或执行失败，整份试转换均不能 PASSED。试跑结果只能由脚本生成。

当前不支持任意正则、日期重写、跨行聚合和脚本执行。新增算子须同时新增执行实现、参数校验和反例，不能只在目录写名字。
