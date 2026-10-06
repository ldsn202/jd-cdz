# 2026-09-21 典型场景联调与工程证据

> 上游（我引用）：[T5.1](../../07-delivery-plans/sub-delivery-plan-jd-charging-T5.1-e2e-integration.md)、[T4.3](../../07-delivery-plans/sub-delivery-plan-jd-charging-T4.3-web-business-pages.md)、[内部执行接口](../../03-foundation/03-06-provided-apis/execution-apis.md) §6、[执行表保护](../../03-foundation/03-05-schema/execution-schema.md) §6、[T5.2](../../07-delivery-plans/sub-delivery-plan-jd-charging-T5.2-deploy-docs.md)
> 下游（引用我）：[验收索引](../index.md)、[进度](../../00-process/00-02-progress/progress.md)、[同日日志](../../00-process/00-01-logs/20260921.md)

用户已明确改为选取典型场景验收。本目录按真实证据记录结果，不再要求本轮逐条跑完 149 组 TC；工程检查不自动计为正式 TC 的 PASS。UI 正按确认原型返工，任务尚未整体验收。

| 检查 | 实际结果 | 证据与限制 |
|---|---|---|
| 空库真实 Worker HTTP | health/session/work-items 通过；业务列表为空 | [HTTP](clean-worker-http.json)；没有前端假数据 |
| 来源常规集导入 | 授权范围 100 家服务商、1,000 工单，来源基线覆盖核验通过 | [导入](source-import-1000.json)、[查库](import-database.json)；来源 HTTP→Worker→D1，未直接读源库 |
| 常规集重复导入 | 1,000 单均 UNCHANGED；上下文仍 1,000 | [重复导入](source-import-repeat.json)、[查库](import-repeat-database.json)；仅证明本次授权范围 |
| 来源发现与大范围查询 | 来源订阅、变化页、D1 批次/任务、领取、上下文核实及事项生成有真实 HTTP；100 家 / 1,000 工单总数与 20 条分页已核对 | [发现](source-discovery-http.json)、[查询](large-scope-read-http.json)；实际发现 D1 参数数量限制后修复，保留原过程 |
| 来源文件读取与解析 | 两份 XLSX 从来源读取并保存 R2，材料状态 VERIFIED，实际解析 COMPLETE；已形成包含 6 项输入的 COMPLETE 快照 | [HTTP](source-material-http.json)、[查库](source-material-database.json)；此检查点仍有 READY/RUNNING 任务，不代表全部来源任务已执行完 |
| 真实模型核查与采纳 | 用户明确授权的单份 13,480 字节合成输入已实际运行 `deepseek/deepseek-flash`；运行 passed=true、exit=0；结果接口 adopted=true / SUCCEEDED，核查事项 READY | [固定请求](real-source-analysis/request.json)、[模型运行](real-source-analysis/model/run.json)、[模型结果](real-source-analysis/model/result.json)、[HTTP](real-source-analysis/http.json)、[查库](real-source-analysis/database.json)；证明此版本输入的核查链路，不表示人工审核或外部业务写入已完成 |
| 安装上传和解析正式复测 | TC-INS-09 PASS；安装域累计最近 9 条 API PASS | [安装报告](../测试验收-install.md) 第2轮；HTTP、原文件、查库与清理证据在 [TC-INS-09](../install/TC-INS-09-20260921/) |
| 工作台正式 API | TC-WB-01—06 均 PASS | [工作台报告](../测试验收-workbench.md)；各自独立 HTTP、查库、清理，不代表 UI 验收 |
| 配置试转换与启用 | 固定候选与原输入，真实逐行逐规则执行；已有一条真实启用及 CONFIGURATION_ENABLED | [HTTP](configuration-trial-http.json)、[查库](configuration-trial-database.json)、[清理](configuration-trial-cleanup.json)；前置为工程 fixture，不冒充来源 AI 生成或正式 TC-CFG 全域通过 |
| 配对环境生命周期 | 独立空 D1/R2、5 家 / 20 工单真实导入、初始摘要一致、C→D 恢复 7 项检查、旧领取拒绝与旧凭据隔离、BUILDING 中断后 FAILED | [摘要](../mock/lifecycle-20260921/summary.json)、[恢复与旧任务](../mock/lifecycle-20260921/restore-and-old-task.json)、[中断](../mock/lifecycle-20260921/interruption.json)；全部自启进程已停止，存储与证据保留 |
| 生命周期上传对象保护 | R2 `uploads/` 前缀实际对象使恢复返回 409，原字节保留 | [R2 保护](../mock/lifecycle-20260921/r2-upload-protection.json)；属于存储工程验证，未执行真实 uploads API 与恢复组合场景 |
| 核查外部写回 | 当前保存证据为 BLOCKED：外发本地明细编号导致来源 40401 | [HTTP](review-writeback/http.json)；来源 ID 映射修复与复测待回写，不计通过 |
| 并发与权限 | 已有材料版本授权、首次并发导入、候选保存回滚、租约失权、分析新旧代次保护工程回归 | 保留全部生产迁移与触发器；不以回归数量替代业务场景证据 |

当前限制：UI 按原型返工后的典型浏览器操作待验；核查写回最新失败尚待修复复测；其他未执行编号保留未测。PDF/图片 OCR 不证明图形语义完整；XLSX 百分比、分数等显示含义或合并范围未保留时明确 INCOMPLETE。生命周期未覆盖 SIGKILL 崩溃矩阵。云端未部署，无公开地址。

18888（Worker）、18890（来源）是本轮独立验收端口，原 8788/8790/5174 保留。生命周期环境单独使用管理器 18980 及登记的独占端口，本次已停止；[重启与使用步骤](../../09-deploy/04-local-lifecycle.md)。测试凭据不写入报告，真实模型授权仅对应上述明确的一份合成输入。

## UI返工复核更新

首页与详情已按既有原型完成布局返工并走查代表交互，详见[UI复核](ui-review.md)。web构建和9项请求/分页回归通过。核查来源编号修复SQLite 5/5通过；旧失败操作仍未决，真实HTTP外写复测尚未通过，项目不标完工。
