# 运行数据与模拟接口规则

> 上游（我引用）：无（本轮用户明确要求）
> 下游（引用我）：[业务 Skills](../docs/04-skills/README.md) §3、[mock 数据 PRD](../docs/05-prd/00-subprd-mock-data.md) §1—7、[PRD 编写约定](../docs/05-prd/README.md)「运行数据要求」、[外部接口目录](../docs/03-foundation/03-02-external-apis/README.md)「模拟接口要求」、[技术栈](Cloudflare支持技术栈.md) §2、[代码入口](../code/README.md)「mock 与真实外部接口的切换」、[本系统接口公共约定](../docs/03-foundation/03-06-provided-apis/common-contract.md) 关联章节、[模拟来源与实际文件验证链路](../docs/03-foundation/03-07-system-flows/sys-mock-upload.md) 关联章节、[mainprd-jd-charging.md](../docs/05-prd/mainprd-jd-charging.md) §三、§六、[01-subprd-workbench-items.md](../docs/05-prd/01-subprd-workbench-items.md) 头部关联块、[02-subprd-orders-history.md](../docs/05-prd/02-subprd-orders-history.md) 头部关联块、[03-subprd-provider-config.md](../docs/05-prd/03-subprd-provider-config.md) 头部关联块、[04-subprd-installation-materials.md](../docs/05-prd/04-subprd-installation-materials.md) 头部关联块、[05-subprd-installation-review.md](../docs/05-prd/05-subprd-installation-review.md) 头部关联块、[06-subprd-reconciliation.md](../docs/05-prd/06-subprd-reconciliation.md) 头部关联块、[07-subprd-coordination.md](../docs/05-prd/07-subprd-coordination.md) 头部关联块

## 1. 适用范围

适用于后续可运行应用、开发联调和功能验收。现有 `docs/02-prototype/` 是界面与交互设计材料，其前端模拟不能作为真实功能验收证据。

**mock 业务数据必须由模拟接口返回；前端不得自行生成业务数据或操作成功结果。**

## 2. 数据与功能边界

```text
浏览器 → 本系统 API → 权限与业务处理 → 本系统数据库
                         ↕
                    外部依赖适配
                         ↕
              模拟业务接口 → 模拟来源数据与原始文件

后台分析任务 → 本地 Node 任务程序 → OpenCode + 业务 Skill
                                      ↓
                             结果校验 → 本系统数据库
```

- 模拟接口替代外部业务系统，遵守已登记的请求、返回、版本、权限范围与失败契约。前端只调用本系统 API。
- 本系统实际执行数据导入、鉴权、校验、转换、计算、持久化、任务调度、人工处理与状态流转。业务结果由这些处理产生，再经本系统 API 返回页面。
- 列表、详情、统计、证据、AI 判断与处理记录不得写死在前端，不得以浏览器随机数、静态 JSON、localStorage 或请求拦截器代替联调数据来源。表单输入、选择项、展开状态等界面状态可在前端维护。
- 写接口成功必须有实际状态变化。需要写回外部来源的操作，应修改模拟来源记录；随后读取、版本核对与变化发现须反映该变化。仅本系统内部操作按业务规则保存到本系统数据库，不强行写外部来源。
- 接口失败、材料缺失、分析失败须展示真实状态，不得自动补造数据、判断或成功提示。

## 3. Skill 验证边界

- 业务接口模式与 AI 模式分开配置。验证 Skill 可用性须使用真实 OpenCode、模型与工具执行，输入来自模拟接口返回的业务材料，或经后端接收并保存的上传文件。
- AI mock 仅供确定性流程测试，由服务端模拟接口提供并标记来源，不能算作真实 Skill 验收；AI real 失败不得降级为固定答案。
- 上传文件保留实际来源、服务商、版本和关联记录，不补造缺失的京东账单、计费依据或批准记录。

## 4. PRD 与验收要求

- 必须有独立 mock 数据 PRD，覆盖数据范围、规模、关联规则、生成与校验、读写接口、异常、重置及验收。
- 每个业务子 PRD 须注明数据从哪个接口取得、由谁计算、写入何处、处理后如何回查；禁止以“使用假数据”省略数据链路。
- 常规联调必须使用多服务商数据集，并覆盖不同格式、业务阶段、账期与权限范围；少量固定案例仅可用于快速检查。
- 数据生成器、模拟接口、业务实现分别验收。数据生成成功、接口返回成功、页面有内容均不能单独证明业务闭环完成。
