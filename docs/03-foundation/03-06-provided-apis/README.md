# 03-06-provided-apis 本系统接口

> 状态：本项目开发契约已形成，服务尚未实现。
> 上游（我引用）：无
> 下游（引用我）：[mainprd-jd-charging.md](../../05-prd/mainprd-jd-charging.md) §四—§五；[mock T4.2子计划](../../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T4.2-business-integration.md) PRD双链·读、[mock开发主计划](../../07-delivery-plans/main-delivery-plan-jd-charging-mock.md) 上游清单

公共返回、身份、分页、幂等、错误码和事务见 [公共约定](common-contract.md)。本目录定义本系统 API；模拟外部依赖的接口保持在 03-02-external-apis，不由前端直接调用。

## 接口清单

| 方法 | 路径 | 契约 |
| --- | --- | --- |
| GET | `/api/admin/charging/session` | [workbench-apis.md](workbench-apis.md) |
| GET | `/api/admin/charging/providers` | [workbench-apis.md](workbench-apis.md) |
| GET | `/api/admin/charging/work-orders` | [workbench-apis.md](workbench-apis.md) §6 |
| GET | `/api/admin/charging/work-orders/{workOrderId}` | [workbench-apis.md](workbench-apis.md) §6 |
| GET | `/api/admin/charging/work-items` | [workbench-apis.md](workbench-apis.md) |
| GET | `/api/admin/charging/work-items/summary` | [workbench-apis.md](workbench-apis.md) |
| GET | `/api/admin/charging/work-items/{workItemId}` | [workbench-apis.md](workbench-apis.md) |
| GET | `/api/admin/charging/work-items/{workItemId}/activities` | [workbench-apis.md](workbench-apis.md) |
| GET | `/api/admin/charging/operations/{operationId}` | [workbench-apis.md](workbench-apis.md) |
| GET | `/api/admin/charging/material-versions/{materialVersionId}` | [material-apis.md](material-apis.md) |
| GET | `/api/admin/charging/material-versions/{materialVersionId}/content` | [material-apis.md](material-apis.md) |
| POST | `/api/admin/charging/uploads` | [material-apis.md](material-apis.md) |
| GET | `/api/admin/charging/uploads/{uploadId}` | [material-apis.md](material-apis.md) |
| GET | `/api/admin/charging/work-items/{workItemId}/installation-draft` | [installation-apis.md](installation-apis.md) |
| PUT | `/api/admin/charging/work-items/{workItemId}/installation-draft` | [installation-apis.md](installation-apis.md) |
| POST | `/api/admin/charging/work-items/{workItemId}/installation-submissions` | [installation-apis.md](installation-apis.md) |
| POST | `/api/admin/charging/work-items/{workItemId}/review-decisions` | [installation-apis.md](installation-apis.md) |
| POST | `/api/admin/charging/work-items/{workItemId}/supplements` | [installation-apis.md](installation-apis.md) |
| GET | `/api/admin/charging/work-items/{workItemId}/reconciliation` | [reconciliation-apis.md](reconciliation-apis.md) |
| POST | `/api/admin/charging/work-items/{workItemId}/billing-questions` | [reconciliation-apis.md](reconciliation-apis.md) |
| POST | `/api/admin/charging/work-items/{workItemId}/billing-replies` | [reconciliation-apis.md](reconciliation-apis.md) |
| POST | `/api/admin/charging/work-items/{workItemId}/billing-facts` | [reconciliation-apis.md](reconciliation-apis.md) |
| GET | `/api/admin/charging/work-items/{workItemId}/configuration` | [configuration-apis.md](configuration-apis.md) |
| PUT | `/api/admin/charging/work-items/{workItemId}/configuration-draft` | [configuration-apis.md](configuration-apis.md) |
| GET | `/api/admin/charging/configuration-trials/{trialId}` | [configuration-apis.md](configuration-apis.md) |
| POST | `/api/admin/charging/work-items/{workItemId}/configuration-enablement` | [configuration-apis.md](configuration-apis.md) |
| POST | `/api/admin/charging/work-items/{workItemId}/progress` | [coordination-apis.md](coordination-apis.md) |
| POST | `/api/admin/charging/work-items/{workItemId}/exceptions` | [coordination-apis.md](coordination-apis.md) |
| POST | `/api/admin/charging/work-items/{workItemId}/coordination-completion` | [coordination-apis.md](coordination-apis.md) |
| POST | `/api/admin/charging/work-items/{workItemId}/exception-resolution` | [coordination-apis.md](coordination-apis.md) |
| POST | `/api/admin/charging/work-items/{workItemId}/stop-decisions` | [coordination-apis.md](coordination-apis.md) |
| POST | `/api/admin/charging/internal/change-batches` | [execution-apis.md](execution-apis.md) |
| POST | `/api/admin/charging/internal/job-claims` | [execution-apis.md](execution-apis.md) |
| POST | `/api/admin/charging/internal/job-attempts/{attemptId}/heartbeats` | [execution-apis.md](execution-apis.md) |
| POST | `/api/admin/charging/internal/job-attempts/{attemptId}/results` | [execution-apis.md](execution-apis.md) |
| POST | `/api/admin/charging/internal/job-attempts/{attemptId}/dispatch-start` | [execution-apis.md](execution-apis.md) |
| POST | `/api/admin/charging/internal/agent-runs` | [execution-apis.md](execution-apis.md) |
| GET | `/api/admin/charging/internal/agent-runs/{runId}` | [execution-apis.md](execution-apis.md) |

## 修改约定

逐接口保留调用方、字段类型与必填、返回、权限、业务规则及错误；修改时同次更新 schema、系统流程和后续 PRD。内部 SERVICE 路由与浏览器接口分开验证。真实模式的提供方能力仍须接入实测。
