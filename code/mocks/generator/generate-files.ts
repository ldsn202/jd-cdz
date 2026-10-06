import { providerSample } from './provider-samples.ts';
import {execFileSync} from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateConfig, ConfigError } from './config.ts';
import { buildProviders } from './providers.ts';
import { buildBusinessFacts, type WorkOrderFact, type MaterialFact, type PlanItemFact, type BusinessFacts } from './business-facts.ts';
import { loadEnvironment } from '../src/environment/registry.ts';
import { applyMigrations, openSourceDatabase } from '../src/storage/database.ts';
import { writePdf } from './files/pdf.ts';
import { writeXlsx } from './files/xlsx.ts';
import { writePng } from './files/png.ts';
import { pngToJpegWithComment } from './files/jpeg.ts';
import type { FileManifest, FileManifestEntry, FileNegative } from './file-manifest.ts';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function arg(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

type Built = {
  bytes: Buffer;
  pages: number | null;
  sheets: string[] | null;
  contentPositions: string[];
  descriptionText: string | null;
  extractedText: string | null;
};

function recordLines(w: WorkOrderFact, providerName: string, dateStr: string, items: PlanItemFact[]): string[] {
  const lines = [
    `现场施工记录`,
    `安装工单：${w.installationWorkOrderId}`,
    `服务商：${providerName}`,
    `记录日期：${dateStr}`,
    `项目明细：`,
  ];
  for (const it of items) lines.push(`项目：${it.installationItem}；实际安装数量：${it.quantity} ${it.unit}`, `供料方：${it.materialSupplier}；服务范围：${it.serviceScope}`, '');
  return lines;
}

function itemsOf(w: WorkOrderFact): PlanItemFact[] {
  if (w.detailItems) return w.detailItems;
  return w.planItems.map((p) => ({ ...p }));
}

function buildWorkOrderFile(w: WorkOrderFact, m: MaterialFact, form: string, providerName: string, dateStr: string, tmpDir: string, seedByte: number): Built {
  const items = itemsOf(w);
  if (m.name.endsWith('.xlsx')) {
    if (form === 'restructured_table') {
      const rows1 = [['安装工单', w.installationWorkOrderId], ['段号', '项目', '供料', '安装']];
      items.forEach((it, i) => rows1.push([String(i + 1), it.installationItem, `${it.quantity}${it.unit}`, `${it.quantity}${it.unit}`]));
      const rows2 = [['安装工单', w.installationWorkOrderId], ['项目', '合计数量', '单位']];
      items.forEach((it) => rows2.push([it.installationItem, String(it.quantity), it.unit]));
      const bytes = writeXlsx([{ name: '分段记录', rows: rows1 }, { name: '汇总', rows: rows2 }]);
      return { bytes, pages: null, sheets: ['分段记录', '汇总'], contentPositions: [`分段记录!A1 工单号`, `分段记录!A3 起 ${items.length} 行`, '汇总!A3 起合计行'], descriptionText: null, extractedText: null };
    }
    if (form === 'alt_unit_table') {
      const rows = [['安装工单', w.installationWorkOrderId], ['项目', '计量表达', '折算数量', '单位']];
      for (const it of items) {
        const expr = it.quantity % 4 === 0 ? `${it.quantity / 4}段×4米` : `${it.quantity}m`;
        rows.push([it.installationItem, expr, String(it.quantity), it.unit]);
      }
      const bytes = writeXlsx([{ name: '记录', rows }]);
      return { bytes, pages: null, sheets: ['记录'], contentPositions: ['记录!A1 工单号', '记录!B3 起计量表达列', '记录!C3 起折算数量列'], descriptionText: null, extractedText: null };
    }
    const rows = [['安装工单', '项目', '数量', '单位', '供料方', '服务范围']];
    for (const it of items) rows.push([w.installationWorkOrderId, it.installationItem, String(it.quantity), it.unit, it.materialSupplier, it.serviceScope]);
    const bytes = writeXlsx([{ name: '施工记录', rows }]);
    return { bytes, pages: null, sheets: ['施工记录'], contentPositions: [`施工记录!A2 工单号`, `施工记录!C2:C${items.length + 1} 数量列`], descriptionText: null, extractedText: null };
  }
  if (m.name.endsWith('.pdf')) {
    const lines = recordLines(w, providerName, dateStr, items);
    const isChangeDoc = m.name.includes('变更确认单');
    const pages = isChangeDoc
      ? [{ lines: [`现场变更确认单`, `安装工单：${w.installationWorkOrderId}`, `服务商：${providerName}`, `变更日期：${dateStr}`, `变更说明：现场条件变化，实际施工数量与方案不一致，经现场确认按实际数量结算。`] }]
      : [{ lines }];
    const bytes = writePdf(m.name, pages);
    return { bytes, pages: pages.length, sheets: null, contentPositions: [`第1页第2行 工单号`, `第${pages.length}页 项目数量行`], descriptionText: null, extractedText: null };
  }
  const textLines = recordLines(w, providerName, dateStr, items);
  const extracted = textLines.join('\n');
  const description = `施工记录单图片（${w.installationWorkOrderId}），画面完整显示全部项目、实际数量、单位、供料方与服务范围。`;
  const base=path.join(tmpDir,m.sourceMaterialId);
  writeFileSync(base+'.pdf',writePdf(m.name,[{lines:textLines}]));
  execFileSync('pdftoppm',['-singlefile','-r','160','-png',base+'.pdf',base],{stdio:'pipe'});
  const png=readFileSync(base+'.png');
  if (m.name.endsWith('.png')) {
    return { bytes: png, pages: null, sheets: null, contentPositions: ['图片正文：工单号及逐项施工记录'], descriptionText: description, extractedText: extracted };
  }
  const jpg = pngToJpegWithComment(png, '', path.join(tmpDir, `tmp-${m.sourceMaterialId}`));
  return { bytes: jpg, pages: null, sheets: null, contentPositions: ['图片正文：工单号及逐项施工记录'], descriptionText: description, extractedText: extracted };
}

function buildProviderDocFile(providerId: string, form: string, fileId: string, name: string, formatId: string, tmpDir: string, seedByte: number): Built {
  const seq = providerId.slice('SP-'.length);
  if (name.endsWith('.pdf')) {
    const pages = [{ lines: [`安装资料格式说明（${providerId}）`, `格式编号：${formatId}`, `字段样例：`, `桥架安装 12米 供料方：服务商`, `电缆敷设 45米 供料方：京东`, `说明：字段含义以本文件与格式说明为准。`] }];
    const bytes = writePdf(name, pages);
    return { bytes, pages: 1, sheets: null, contentPositions: ['第1页第2行 格式编号', '第1页第4—5行 字段样例'], descriptionText: null, extractedText: null };
  }
  const description = `安装资料样例照片（${providerId}），画面为资料表照片。`;
  const extractedText = [`安装资料样例（${providerId}）`, `格式编号：${formatId}`, `桥架安装 12米`, `电缆敷设 45米`].join('\n');
  const png = writePng({ width: 640, height: 360, lines: [`PROV ${seq}`, formatId, 'SAMPLE DOC'], seedByte, texts: { Description: description, ExtractedText: extractedText } });
  if (name.endsWith('.png')) {
    return { bytes: png, pages: null, sheets: null, contentPositions: ['iTXt:Description', 'iTXt:ExtractedText'], descriptionText: description, extractedText };
  }
  const jpg = pngToJpegWithComment(png, JSON.stringify({ description, extractedText }), path.join(tmpDir, `tmp-${fileId}`));
  return { bytes: jpg, pages: null, sheets: null, contentPositions: ['COM:description', 'COM:extractedText'], descriptionText: description, extractedText };
}

function main(): void {
  const configFile = arg('--config');
  const envFile = arg('--env');
  if (!configFile || !envFile) throw new Error('用法：node generator/generate-files.ts --config <配置.json> --env <环境清单.json>');
  const config = validateConfig(JSON.parse(readFileSync(path.resolve(rootDir, configFile), 'utf8')));
  const env = loadEnvironment(rootDir, envFile);
  const facts = buildBusinessFacts(config, buildProviders(config));

  const tmpDir = path.join(env.storageDir, 'files', '.tmp');
  mkdirSync(tmpDir, { recursive: true });

  const providerById = new Map(facts.providers.map((p) => [p.providerId, p]));
  const dateStr = config.initialBusinessTime.slice(0, 10);
  const entries: FileManifestEntry[] = [];
  let built = 0;

  const db = openSourceDatabase(path.join(env.sourcesDir, 'file-service.db'));
  applyMigrations(db, path.join(rootDir, 'migrations'));
  const getMeta = db.prepare('SELECT payload_json FROM source_record WHERE kind = ? AND record_id = ?');
  const updMeta = db.prepare('UPDATE source_record SET payload_json = ? WHERE kind = ? AND record_id = ?');

  const writeAndRegister = (opts: {
    fileId: string; version: string; name: string; mediaType: string;
    ownerKind: FileManifestEntry['ownerKind']; ownerId: string; workOrderId: string | null; providerId: string;
    b: Built; metaKey: string;
  }) => {
    const rel = path.join(opts.fileId, `${opts.version}.${opts.name.split('.').pop()}`);
    const abs = path.join(env.filesDir, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, opts.b.bytes);
    const row = getMeta.get('file_meta', opts.metaKey) as { payload_json: string } | undefined;
    if (!row) throw new Error(`file_meta 缺失：${opts.metaKey}（须先完成 T1.1 生成）`);
    const payload = JSON.parse(row.payload_json);
    payload.sha256 = sha256(opts.b.bytes);
    payload.sizeBytes = opts.b.bytes.length;
    payload.relativePath = rel;
    payload.pages = opts.b.pages;
    updMeta.run(JSON.stringify(payload), 'file_meta', opts.metaKey);
    entries.push({
      fileId: opts.fileId,
      sourceVersion: opts.version,
      name: opts.name,
      mediaType: opts.mediaType,
      ownerKind: opts.ownerKind,
      ownerId: opts.ownerId,
      installationWorkOrderId: opts.workOrderId,
      serviceProviderId: opts.providerId,
      relativePath: rel,
      sizeBytes: opts.b.bytes.length,
      sha256: payload.sha256,
      pages: opts.b.pages,
      sheets: opts.b.sheets,
      contentPositions: opts.b.contentPositions,
      descriptionText: opts.b.descriptionText,
      extractedText: opts.b.extractedText,
    });
    built += 1;
  };

  for (const w of facts.workOrders) {
    const provider = providerById.get(w.serviceProviderId)!;
    for (const m of w.materials) {
      if (!m.fileAvailable) continue;
      const b = buildWorkOrderFile(w, m, provider.form, provider.displayName, dateStr, tmpDir, built % 251);
      writeAndRegister({
        fileId: m.sourceMaterialId, version: m.sourceVersion, name: m.name, mediaType: m.mediaType,
        ownerKind: 'work_order_material', ownerId: m.sourceMaterialId, workOrderId: w.installationWorkOrderId,
        providerId: provider.providerId, b, metaKey: `${m.sourceMaterialId}@${m.sourceVersion}`,
      });
    }
  }

  for (const p of facts.providers) {
    if (p.form !== 'pdf_record' && p.form !== 'image_record' && facts.config.datasetId  .startsWith('demo-10-v') === false) continue;
    const seq = p.providerId.slice('SP-'.length);
    const fileId = `PROV-FILE-${seq}`;
    const usePng = p.form === 'image_record' && Number(seq) % 2 === 1;
    const excel = facts.config.datasetId  .startsWith('demo-10-v');
    const name = excel ? `安装明细样表-${seq}.xlsx` : p.form === 'pdf_record' ? `安装资料说明-${seq}.pdf` : `安装资料照片-${seq}.${usePng ? 'png' : 'jpg'}`;
    const mediaType = excel ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : p.form === 'pdf_record' ? 'application/pdf' : usePng ? 'image/png' : 'image/jpeg';
    const b: Built = excel ? {bytes:writeXlsx([{name:'安装明细',rows:providerSample(p).sheetRows}]),pages:null,sheets:['安装明细'],contentPositions:['安装明细!A1:E3'],descriptionText:null,extractedText:null}
      : buildProviderDocFile(p.providerId, p.form, fileId, name, p.formatId, tmpDir, built % 251);
    writeAndRegister({
      fileId, version: 'file-1', name, mediaType,
      ownerKind: 'provider_doc', ownerId: `PROV-DOC-${seq}`, workOrderId: null,
      providerId: p.providerId, b, metaKey: `${fileId}@file-1`,
    });
  }

  const negatives: FileNegative[] = [];
  const pdfEntries = entries.filter((e) => e.mediaType === 'application/pdf' && e.ownerKind === 'work_order_material' && !e.name.includes('变更确认单'));
  const n1 = pdfEntries[0];
  const n2 = pdfEntries[1];
  const counterpartNormal = pdfEntries[2];
  if (!config.datasetId.startsWith('demo-10-v') && n1 && n2 && counterpartNormal) {
    const abs1 = path.join(env.filesDir, n1.relativePath);
    const damaged = Buffer.from(readFileSync(abs1)).subarray(0, Math.floor(readFileSync(abs1).length * 0.6));
    writeFileSync(abs1, damaged);
    n1.sha256 = sha256(damaged);
    n1.sizeBytes = damaged.length;
    const row = getMeta.get('file_meta', `${n1.fileId}@${n1.sourceVersion}`) as { payload_json: string };
    const payload = JSON.parse(row.payload_json);
    payload.sha256 = n1.sha256;
    payload.sizeBytes = n1.sizeBytes;
    updMeta.run(JSON.stringify(payload), 'file_meta', `${n1.fileId}@${n1.sourceVersion}`);
    negatives.push({
      negativeId: 'NEG-F1',
      kind: 'DAMAGED_FILE',
      fileId: n1.fileId,
      counterpartFileId: counterpartNormal.fileId,
      installationWorkOrderId: n1.installationWorkOrderId!,
      expectedHandling: '实际字节已截断损坏（仅保留前 60%，trailer/xref 丢失），解析必须失败并明示文件损坏，不得回退为模板文本或跳过不计',
    });

    const w2 = facts.workOrders.find((w) => w.installationWorkOrderId === n2.installationWorkOrderId)!;
    const provider2 = providerById.get(w2.serviceProviderId)!;
    const m2 = w2.materials.find((m) => m.sourceMaterialId === n2.fileId)!;
    const rebuilt = buildWorkOrderFile(w2, m2, provider2.form, provider2.displayName, dateStr, tmpDir, 0);
    const onePage = writePdf(m2.name, [{ lines: recordLines(w2, provider2.displayName, dateStr, itemsOf(w2)).slice(0, 5) }]);
    void rebuilt;
    const abs2 = path.join(env.filesDir, n2.relativePath);
    writeFileSync(abs2, onePage);
    n2.sha256 = sha256(onePage);
    n2.sizeBytes = onePage.length;
    n2.pages = 2;
    const row2 = getMeta.get('file_meta', `${n2.fileId}@${n2.sourceVersion}`) as { payload_json: string };
    const payload2 = JSON.parse(row2.payload_json);
    payload2.sha256 = n2.sha256;
    payload2.sizeBytes = n2.sizeBytes;
    updMeta.run(JSON.stringify(payload2), 'file_meta', `${n2.fileId}@${n2.sourceVersion}`);
    negatives.push({
      negativeId: 'NEG-F2',
      kind: 'MISSING_PAGE',
      fileId: n2.fileId,
      counterpartFileId: n1.fileId,
      installationWorkOrderId: n2.installationWorkOrderId!,
      expectedHandling: '清单与内容需要 2 页而实际文件仅 1 页，解析必须报告缺页/缺项，不得按完整文件处理',
    });
  }
  db.close();

  const manifest: FileManifest = {
    datasetId: config.datasetId,
    generatorVersion: config.generatorVersion,
    generatedAt: new Date().toISOString(),
    note: '文件清单记录每个文件所属记录、来源、版本、类型、大小、字节摘要、页/sheet索引与内容位置；图片描述与识别原文分开；损坏/缺页负例与正常对照同册登记。',
    files: entries,
    negatives,
  };
  const deliveryDir = path.join(env.storageDir, 'delivery', config.datasetId);
  mkdirSync(deliveryDir, { recursive: true });
  writeFileSync(path.join(deliveryDir, 'file-manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(JSON.stringify({ datasetId: config.datasetId, envId: env.manifest.envId, filesBuilt: built, negatives: negatives.length, deliveryDir }, null, 2));
}

try {
  main();
} catch (e) {
  if (e instanceof ConfigError) {
    console.error(e.message);
    process.exit(2);
  }
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
