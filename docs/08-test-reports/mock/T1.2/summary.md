# T1.2 生成可解析且可追溯的原始材料文件 — 验证证据

> 执行时间：2026-09-20｜执行人：AI｜任务：[sub-delivery-plan-jd-charging-mock-T1.2-material-files.md](../../07-delivery-plans/sub-delivery-plan-jd-charging-mock-T1.2-material-files.md)
> 环境：macOS（darwin）/ Node.js v25.8.1 / 外部工具 pdfinfo·pdftoppm（poppler）、sips、LibreOffice soffice / 工作目录 `code/mocks/`

## 1. 交付物

| 文件 | 内容 |
| --- | --- |
| `code/mocks/generator/files/pdf.ts` | 真实 PDF 写入器（Type0 STSong-Light/UniGB-UCS2-H，中文可渲染，固定创建信息，多页） |
| `code/mocks/generator/files/xlsx.ts` + `zip.ts` + `crc32.ts` | 真实 XLSX 写入器（最小 ZIP，inlineStr，多 sheet，固定时间戳） |
| `code/mocks/generator/files/png.ts` | 真实 PNG 写入器（IHDR/IDAT + iTXt：Description 与 ExtractedText 分开；5×7 点阵 ASCII 光栅） |
| `code/mocks/generator/files/jpeg.ts` | PNG 经 sips 转真实 JPEG 并注入 COM 段（description/extractedText JSON） |
| `code/mocks/generator/generate-files.ts` | 文件生成 CLI：按已冻结事实生成 997 个文件，回写 file_meta 摘要/大小/路径/页数，输出 file-manifest.json 与文件级负例 |
| `code/mocks/generator/verify-files.ts` | 独立文件校验：存在与摘要、结构（pdfinfo/自解析/sips）、关键字段原文定位、负例触发 |
| `code/mocks/generator/file-manifest.ts` | 文件清单类型：所属记录/来源/版本/类型/大小/摘要/页·sheet 索引/内容位置 |
| `code/mocks/fixtures/material-layouts/layouts.md` | 五类资料形态版式规格 |
| `code/mocks/tests/files/run-file-checks.sh` | 文件校验入口脚本 |

## 2. 命令与实际环境

```bash
node generator/generate-files.ts --config generator/configs/standard.json --env environments/mock-env-a.json
node generator/verify-files.ts   --env environments/mock-env-a.json --dataset standard-v1
```

实际生成 997 个文件到 `.data/mock-env-a/files/<fileId>/<version>.<ext>`（PDF 257 / XLSX 541 / PNG 104 / JPEG 93，含多页 179、多 sheet 187），清单 `.data/mock-env-a/delivery/standard-v1/file-manifest.json`。

## 3. 逐断言结果（独立校验 8 项全过）

| 断言 | 结果 |
| --- | --- |
| FILES-EXIST-AND-HASH | 997 个文件全部存在，大小与 sha256 逐文件一致 |
| FILES-STRUCTURE | 结构校验通过：PDF 经 pdfinfo 复核页数与清单一致；XLSX 解包 sheet 数一致；PNG/JPEG 头与 COM/iTXt 段完整 |
| FILES-KEY-FIELDS | 关键字段（工单号、数量/计量表达、格式编号）均能在原文实际定位；图片描述与识别原文分开且不相同 |
| FILES-TYPE-COVERAGE | PDF 257 / XLSX 541 / PNG 104 / JPEG 93 |
| FILES-MULTI-STRUCTURE | 多 sheet 187、多页 179 |
| NEG-F1 损坏负例 | 实际字节截断 60%（trailer/xref 丢失），pdfinfo 解析失败；正常对照可读；字节与对照不同 |
| NEG-F2 缺页负例 | 清单需要 2 页而实际文件仅 1 页（pdfinfo 实测 1<2），解析须报缺页 |
| FILES-SIPS-SAMPLE | sips 抽样 PNG 尺寸 640×400 可读 |

复现：两次同配置生成 997 个文件 sha256 完全一致（diff 为空）。typecheck 0 错误。

## 4. 人工阅读固定核对文件（视觉核对，样本见 samples/）

| 形态 | 样本 | 视觉核对结论 |
| --- | --- | --- |
| 字段清楚的表格 | MAT-00003 施工记录 | 表头 安装工单/项目/数量/单位/供料方/服务范围 清晰，行值与事实一致（samples/xlsx-clear-1.png） |
| 同义字段结构不同表格 | MAT-00001 分段记录+汇总 | 段号/项目/供料/安装 分列结构与清楚表格明显不同（samples/xlsx-restructured-1.png） |
| 计量表达不同表格 | MAT-00002 记录 | 「22m」「6段×4米」计量表达与折算数量并存（samples/xlsx-multi-1.png） |
| PDF 施工记录 | MAT-00016 现场施工记录 | 两页：第 1 页工单/服务商/日期，第 2 页项目数量行，中文正常渲染（samples/pdf-sample-1/2.png） |
| 图片施工记录 | MAT-00004 .jpg / MAT-00015 .png | 光栅可见工单号与数量标注；iTXt/COM 中描述与识别原文分开（samples/jpg-sample.jpg、png-sample.png） |
| 变更确认单 | MAT-00382 现场变更确认单 | 单页 PDF，含工单号与变更说明（samples/change-sample-1.png） |

## 5. 边界与后续

- 签字材料仅作为材料存在，不自动代表费用批准；费用批准记录由 billing-terms 域独立建模（T1.1 已生成）。
- 真实解析（AI/程序读取这些字节形成证据）属 T2.x 接口与业务联调范围，本轮证明文件真实、可打开、内容可追溯、负例可触发。
- 图片光栅为点阵 ASCII（中文在描述/识别原文文本层），满足字节真实与内容可追溯；生产级手写图像不属于开发数据要求。
