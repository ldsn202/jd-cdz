import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { loadEnvironment } from '../src/environment/registry.ts';
import type { FileManifest, FileManifestEntry } from './file-manifest.ts';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

type Assertion = { id: string; pass: boolean; detail: string };

function arg(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function pdfPagesViaPdfinfo(abs: string): number | null {
  try {
    const out = execFileSync('pdfinfo', [abs], { stdio: 'pipe' }).toString();
    const m = out.match(/^Pages:\s+(\d+)/m);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

function pdfExtractText(buf: Buffer): string {
  const s = buf.toString('latin1');
  const parts: string[] = [];
  const re = /<([0-9A-Fa-f]+)>\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const hex = m[1]!;
    const bytes = Buffer.from(hex, 'hex');
    let t = '';
    for (let i = 0; i + 1 < bytes.length; i += 2) t += String.fromCharCode((bytes[i]! << 8) | bytes[i + 1]!);
    parts.push(t);
  }
  return parts.join('\n');
}

function unzipEntries(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  let pos = 0;
  while (pos + 30 <= buf.length && buf.readUInt32LE(pos) === 0x04034b50) {
    const method = buf.readUInt16LE(pos + 8);
    const compSize = buf.readUInt32LE(pos + 18);
    const nameLen = buf.readUInt16LE(pos + 26);
    const extraLen = buf.readUInt16LE(pos + 28);
    const name = buf.subarray(pos + 30, pos + 30 + nameLen).toString('utf8');
    const dataStart = pos + 30 + nameLen + extraLen;
    const data = buf.subarray(dataStart, dataStart + compSize);
    out.set(name, method === 0 ? data : inflateSync(data));
    pos = dataStart + compSize;
  }
  return out;
}

function pngTexts(buf: Buffer): Record<string, string> {
  const texts: Record<string, string> = {};
  let pos = 8;
  while (pos + 12 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.subarray(pos + 4, pos + 8).toString('ascii');
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'iTXt') {
      const nul = data.indexOf(0);
      const key = data.subarray(0, nul).toString('latin1');
      const rest = data.subarray(nul + 1);
      const langNul = rest.indexOf(0, 2);
      const afterLang = rest.subarray(langNul + 1);
      const transNul = afterLang.indexOf(0);
      texts[key] = afterLang.subarray(transNul + 1).toString('utf8');
    }
    pos += 12 + len;
  }
  return texts;
}

function jpegComment(buf: Buffer): Record<string, string> | null {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let pos = 2;
  while (pos + 4 <= buf.length) {
    if (buf[pos] !== 0xff) return null;
    const marker = buf[pos + 1]!;
    const len = buf.readUInt16BE(pos + 2);
    if (marker === 0xfe) {
      try {
        return JSON.parse(buf.subarray(pos + 4, pos + 2 + len).toString('utf8'));
      } catch {
        return null;
      }
    }
    pos += 2 + len;
    if (marker === 0xda) break;
  }
  return null;
}

function imageDimsViaSips(abs: string): string | null {
  try {
    const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', abs], { stdio: 'pipe' }).toString();
    return out.replace(/\s+/g, ' ').trim();
  } catch {
    return null;
  }
}

function checkKeyFields(e: FileManifestEntry, buf: Buffer): string | null {
  const need: string[] = [];
  if (e.installationWorkOrderId) need.push(e.installationWorkOrderId);
  let text = '';
  if (e.mediaType === 'application/pdf') text = pdfExtractText(buf);
  else if (e.mediaType.includes('spreadsheetml')) {
    const entries = unzipEntries(buf);
    for (const [name, data] of entries) if (name.startsWith('xl/worksheets/')) text += data.toString('utf8');
  } else if (e.mediaType === 'image/png') text = (pngTexts(buf).ExtractedText ?? '') + (e.ownerKind === 'provider_doc' ? (pngTexts(buf).Description ?? '') : '');
  else if (e.mediaType === 'image/jpeg') {
    const com = jpegComment(buf);
    text = com ? `${com.extractedText ?? ''}\n${com.description ?? ''}` : '';
  }
  for (const n of need) if (!text.includes(n)) return `关键字段 ${n} 未在原文定位`;
  if (e.ownerKind === 'work_order_material' && !e.name.includes('变更确认单')) {
    if (!/\d/.test(text)) return '数量信息未在原文定位';
  }
  if ((e.mediaType === 'image/png' || e.mediaType === 'image/jpeg') && e.descriptionText && e.extractedText && e.descriptionText === e.extractedText) {
    return '图片描述与识别原文未分开';
  }
  return null;
}

function main(): void {
  const envFile = arg('--env');
  const datasetId = arg('--dataset');
  if (!envFile || !datasetId) throw new Error('用法：node generator/verify-files.ts --env <环境清单.json> --dataset <datasetId>');
  const env = loadEnvironment(rootDir, envFile);
  const manifest: FileManifest = JSON.parse(readFileSync(path.join(env.storageDir, 'delivery', datasetId, 'file-manifest.json'), 'utf8'));

  const A: Assertion[] = [];
  const assert = (id: string, pass: boolean, detail: string) => A.push({ id, pass, detail });

  const negativeIds = new Set(manifest.negatives.map((n) => n.fileId));
  let hashFail = 0;
  let structFail = 0;
  let fieldFail = 0;
  const structSamples: string[] = [];
  const fieldSamples: string[] = [];
  let pdfCount = 0, xlsxCount = 0, pngCount = 0, jpgCount = 0, multiSheet = 0, multiPage = 0;

  for (const e of manifest.files) {
    const abs = path.join(env.filesDir, e.relativePath);
    if (!existsSync(abs)) {
      hashFail += 1;
      continue;
    }
    const buf = readFileSync(abs);
    if (buf.length !== e.sizeBytes || sha256(buf) !== e.sha256) {
      hashFail += 1;
      continue;
    }
    if (negativeIds.has(e.fileId)) continue;

    if (e.mediaType === 'application/pdf') {
      pdfCount += 1;
      const pages = pdfPagesViaPdfinfo(abs);
      if (pages !== e.pages) {
        structFail += 1;
        if (structSamples.length < 3) structSamples.push(`${e.fileId} pdfinfo=${pages} 清单=${e.pages}`);
      } else if ((e.pages ?? 0) > 1) multiPage += 1;
      if (!buf.subarray(0, 5).equals(Buffer.from('%PDF-'))) structFail += 1;
    } else if (e.mediaType.includes('spreadsheetml')) {
      xlsxCount += 1;
      try {
        const entries = unzipEntries(buf);
        const wb = entries.get('xl/workbook.xml')?.toString('utf8') ?? '';
        const sheetCount = (wb.match(/<sheet /g) ?? []).length;
        if (sheetCount !== (e.sheets?.length ?? 0)) {
          structFail += 1;
          if (structSamples.length < 3) structSamples.push(`${e.fileId} sheets=${sheetCount} 清单=${e.sheets?.length}`);
        }
        if (sheetCount > 1) multiSheet += 1;
      } catch {
        structFail += 1;
        if (structSamples.length < 3) structSamples.push(`${e.fileId} zip 解析失败`);
      }
    } else if (e.mediaType === 'image/png') {
      pngCount += 1;
      if (!buf.subarray(1, 4).equals(Buffer.from('PNG'))) structFail += 1;
    } else if (e.mediaType === 'image/jpeg') {
      jpgCount += 1;
      if (buf[0] !== 0xff || buf[1] !== 0xd8) structFail += 1;
      if (!jpegComment(buf)) {
        structFail += 1;
        if (structSamples.length < 3) structSamples.push(`${e.fileId} COM 段缺失`);
      }
    }
    const fieldErr = checkKeyFields(e, buf);
    if (fieldErr) {
      fieldFail += 1;
      if (fieldSamples.length < 3) fieldSamples.push(`${e.fileId} ${fieldErr}`);
    }
  }

  assert('FILES-EXIST-AND-HASH', hashFail === 0, hashFail === 0 ? `全部 ${manifest.files.length} 个文件存在且大小/摘要一致` : `${hashFail} 个文件缺失或摘要不符`);
  assert('FILES-STRUCTURE', structFail === 0, structFail === 0 ? `结构校验通过（外部工具复核）` : `${structFail} 个结构失败：${structSamples.join('；')}`);
  assert('FILES-KEY-FIELDS', fieldFail === 0, fieldFail === 0 ? '关键字段均可在原文定位' : `${fieldFail} 个字段定位失败：${fieldSamples.join('；')}`);
  assert('FILES-TYPE-COVERAGE', pdfCount > 0 && xlsxCount > 0 && pngCount > 0 && jpgCount > 0, `PDF ${pdfCount} / XLSX ${xlsxCount} / PNG ${pngCount} / JPEG ${jpgCount}`);
  assert('FILES-MULTI-STRUCTURE', multiSheet > 0 && multiPage > 0, `多 sheet ${multiSheet}、多页 ${multiPage}`);

  for (const n of manifest.negatives) {
    const e = manifest.files.find((f) => f.fileId === n.fileId)!;
    const abs = path.join(env.filesDir, e.relativePath);
    const buf = readFileSync(abs);
    if (n.kind === 'DAMAGED_FILE') {
      const pages = pdfPagesViaPdfinfo(abs);
      const counterpart = manifest.files.find((f) => f.fileId === n.counterpartFileId)!;
      const cbuf = readFileSync(path.join(env.filesDir, counterpart.relativePath));
      const cpages = pdfPagesViaPdfinfo(path.join(env.filesDir, counterpart.relativePath));
      assert(`NEG-${n.negativeId}-TRIGGERS-FAILURE`, pages === null && cpages === counterpart.pages && sha256(buf) !== sha256(cbuf), `损坏文件 pdfinfo 失败=${pages === null}；对照正常=${cpages === counterpart.pages}；字节与对照不同`);
    }
    if (n.kind === 'MISSING_PAGE') {
      const pages = pdfPagesViaPdfinfo(abs);
      assert(`NEG-${n.negativeId}-MISSING-PAGE`, pages !== null && e.pages !== null && pages < e.pages, `实际 ${pages} 页 < 清单需要 ${e.pages} 页（解析须报缺页）`);
    }
  }

  const sample = manifest.files.find((f) => f.mediaType === 'image/png' && f.ownerKind === 'work_order_material');
  if (sample) {
    const dims = imageDimsViaSips(path.join(env.filesDir, sample.relativePath));
    assert('FILES-SIPS-SAMPLE', dims !== null && dims.includes('640'), `sips 抽样 ${sample.fileId}：${dims}`);
  }

  const failed = A.filter((x) => !x.pass);
  console.log(JSON.stringify({ datasetId, envId: env.manifest.envId, assertions: A, passed: failed.length === 0, failedCount: failed.length }, null, 2));
  if (failed.length > 0) process.exit(1);
}

main();
