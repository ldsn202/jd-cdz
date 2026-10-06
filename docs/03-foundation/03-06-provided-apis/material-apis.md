# 材料预览与上传接口

> 状态：foundation 开发契约；未实现
> 上游（我引用）：[公共约定](common-contract.md) §1—5、[材料表结构](../03-05-schema/evidence-schema.md) §1—7、[原始材料接口](../03-02-external-apis/source-material-read.md) §2—5、[AI 契约](../03-02-external-apis/ai-inference-material-parsing.md) §2.5
> 下游（引用我）：[模拟数据与上传流程](../03-07-system-flows/sys-mock-upload.md) §1—3、[工作台查询与证据读取](../03-07-system-flows/sys-workbench-read.md) §1—3、[02-subprd-orders-history.md](../../05-prd/02-subprd-orders-history.md) §5、[04-subprd-installation-materials.md](../../05-prd/04-subprd-installation-materials.md) §5、[05-subprd-installation-review.md](../../05-prd/05-subprd-installation-review.md) §5

## 1. 读取证据与文件

`GET /api/admin/charging/material-versions/{materialVersionId}`，path 非空 string，需 READ_SOURCE_MATERIAL；返回 `data={materialVersionId,sourceSystem,sourceMaterialId,sourceVersion,name,mediaType,byteLength,sha256,readState,parsing}`。原文件未取得时元数据未知字段返回 null；readState 为 REFERENCED / VERIFIED。

parsing 为 null 或 `{parseId,runId,completeness,units,blocks,issues}`。沿已保存解析结果逐字节版本定位，units 覆盖原页、图片或全部 sheet；blocks 带 blockId、原位置与内容。结构与 AI 契约保持一致，不把解析不全显示为资料齐全。

`GET /api/admin/charging/material-versions/{materialVersionId}/content` 返回原文件字节，成功为对应 Content-Type、Content-Length、私有 Cache-Control 与安全的 Content-Disposition。此二进制响应是统一 JSON 壳的明确例外；失败仍返回公共 JSON 错误。版本须 VERIFIED，未取得正文返回 42201；每次核实权限，禁止公开存储 URL。按实际 MIME 验证，禁止执行上传 HTML 或宏。

## 2. 接收服务商文件

`POST /api/admin/charging/uploads`，multipart/form-data，需 Idempotency-Key。输入字段：

| 字段 | 类型 / 必填 | 规则 |
| --- | --- | --- |
| file | binary / 是 | 一份 PDF、PNG、JPEG 或 XLSX；实际字节、MIME 和摘要校验，限制从部署配置读取 |
| providerId | string / 是 | 实际授权服务商范围，服务端核实 |
| purpose | string / 是 | INSTALLATION_MATERIAL / PROVIDER_FORMAT / RECEIVABLE_MATERIAL，仅表示文件用途 |
| workItemId | string / 条件 | 安装或费用事项材料必填；配置资料可空，由服务端定位或准备配置事项 |
| configurationId | string / 条件 | PROVIDER_FORMAT 且未提供事项时使用已知配置编号；未提供时仅在后端能唯一核实来源、用途与业务范围时自动定位，多义返回 42201 |
| expectedWorkItemVersion | integer / 条件 | 指定事项时必填，须当前可编辑，未决写入时拒绝冲突变更 |
| replacesMaterialVersionId | string / 否 | 同一文件的新版关联，须与服务商、事项、用途匹配，不覆盖旧文件 |

安装上传需 CONFIRM_INSTALLATION_DRAFT 或 SUBMIT_SUPPLEMENT（按事项阶段匹配），格式资料需 ENABLE_INTEGRATION_CONFIG，费用材料需 REPLY_BILLING_VERIFICATION。动作须与当前具体责任一致。上传只是准备材料，不自动成为正式补充提交或账单修订。

服务端分配稳定接收编号，来源记为 LOCAL_UPLOAD；以该编号及实际摘要记录版本。先完整保存文件，再保存材料记录、输入关联及任务；中断时受控清理未引用文件，不能先把缺字节文件标 VERIFIED。回放同键须同文件摘要与元信息；独立上传不写入模拟来源种子数据。

返回 HTTP 202：`data={uploadId,materialVersionId,workItemId,jobId,status}`，各编号 string，status 为 RECEIVED。HTTP 413/422/409 分别表示超限、格式或范围缺项、版本冲突。分析由后台自动安排，页面显示实际接收和准备状态。

## 3. 上传状态与后续

`GET /api/admin/charging/uploads/{uploadId}`，返回 `{uploadId,materialVersionId,workItemId,jobId,status,issues}`。status 为 RECEIVED / PREPARING / READY / BLOCKED，issues 为 `{code,description}`[]；由材料记录及任务状态计算，不另造成功状态。读取与关联事项、材料权限同时核实。

上传归属、用途、原文件版本及替换关联固定保存在来源记录和任务 target_json；analysis_input_item 在真正准备分析时封存。文件更换使相关事项输入代次增加并清空当前分析指针；实际处理重新生成结果，旧证据继续受限保留。

接收任务的固定 target_json 为 `{uploadId,providerId,purpose,workItemId,configurationId,replacesMaterialVersionId,materialVersionId,requestKey,fileSha256,metadataDigest}`；不适用的关联为 null。metadataDigest 按固定序列化计算全部归属及用途字段，配合文件摘要验证同键重放。uploadId 与任务一一关联，状态查询按此记录恢复，不能依赖浏览器缓存。

文件服务、运行程序和这些接口均未实现。后续验收须核对文件字节、全部 sheet/页面解析、原文定位、实际任务结果与缺项；只有文件名或预填解析文本不算上传验证通过。
