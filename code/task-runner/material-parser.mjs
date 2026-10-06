// Offline parser capability v1.0.0. No model/network calls and no business conclusions.
// PDF: enumerate every page, extract text, render each page and OCR; always INCOMPLETE
// because OCR cannot verify diagrams/photos/signatures. Images have the same restriction.
// XLSX: inspect all sheets incl. hidden, preserve formulas and stored cache without execution.
// Unsupported objects, missing caches or uncertain number formats remain explicit issues.
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const execute = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PAGES = 200;
// Windows ships the interpreter as python.exe; POSIX uses python3.
const PYTHON = process.platform === 'win32' ? 'python' : 'python3';
const COMMAND_OPTIONS = { timeout: 60000, maxBuffer: 24 * 1024 * 1024, env: { ...process.env, LC_ALL: 'C' } };
export function assertAnalysisMode(workerMode, executorMode) {
  if (workerMode === 'mock') throw Object.assign(new Error('MOCK_AI_NOT_ANALYSIS：mock 模式不调用真实模型，也不生成业务结论'), { code: 'MOCK_AI_NOT_ANALYSIS' });
  if (workerMode !== 'real' || executorMode !== 'real') throw Object.assign(new Error('AI_MODE_MISMATCH：Worker 与执行器均须明确配置 real'), { code: 'AI_MODE_MISMATCH' });
}
function textBlock(unitId, suffix, text) {
  return { blockId: `${unitId}:${suffix}`, unitId, kind: 'TEXT', text: text.trim(), cellRange: null, formula: null, cachedValue: null };
}
async function ocr(file, unitId, issues) {
  try {
    const { stdout: languages } = await execute('tesseract', ['--list-langs'], COMMAND_OPTIONS);
    // Windows prints resolved tessdata paths, macOS prints bare language names.
    const installed = new Set(languages.split(/\s+/).filter(Boolean).map(name => name.replace(/\\/g, '/').split('/').pop()));
    const langs = ['chi_sim', 'chi_tra', 'eng'].filter(lang => installed.has(lang));
    if (!langs.includes('chi_sim')) issues.push(`${unitId} 当前 OCR 未安装简体中文语言数据，中文识别未核实`);
    if (!langs.length) throw new Error('未找到已安装OCR语言');
    const { stdout } = await execute('tesseract', [file, 'stdout', '-l', langs.join('+')], COMMAND_OPTIONS);
    return stdout.trim() ? [textBlock(unitId, 'ocr', stdout)] : [];
  } catch (error) {
    issues.push(`${unitId} OCR 未完成：${error.code ?? error.message}`);
    return [];
  }
}
async function parsePdf(file, directory) {
  const { stdout: info } = await execute('pdfinfo', [file], COMMAND_OPTIONS);
  if (/Encrypted:\s+yes/i.test(info)) throw new Error('加密 PDF 不可解析');
  const pages = Number(info.match(/^Pages:\s+(\d+)/m)?.[1]);
  if (!Number.isInteger(pages) || pages < 1 || pages > MAX_PAGES) throw new Error('PDF 页数无效或超过 200 页，未截取内容');
  const units = [], blocks = [], issues = ['PDF 已逐页提取文本并渲染 OCR；图形关系、照片与签字含义尚未核实，不能认定完整'];
  for (let index = 1; index <= pages; index++) {
    const unitId = `page-${index}`;
    const unit = { unitId, kind: 'PDF_PAGE', index, name: null, status: 'UNREADABLE' };
    units.push(unit);
    try {
      const { stdout } = await execute('pdftotext', ['-f', String(index), '-l', String(index), '-layout', file, '-'], COMMAND_OPTIONS);
      if (stdout.trim()) blocks.push(textBlock(unitId, 'text', stdout));
      const prefix = join(directory, unitId);
      await execute('pdftoppm', ['-f', String(index), '-l', String(index), '-singlefile', '-scale-to', '2200', '-png', file, prefix], COMMAND_OPTIONS);
      blocks.push(...await ocr(`${prefix}.png`, unitId, issues));
    } catch (error) {
      unit.status = 'FAILED';
      issues.push(`${unitId} 读取或渲染失败：${error.code ?? error.message}`);
    }
  }
  return { units, blocks, issues, completeness: 'INCOMPLETE' };
}
export async function parseMaterialBytes(bytes, target) {
  const input = target.parseInput;
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
  if (!input || bytes.length !== input.byteLength || bytes.length > MAX_BYTES) throw new Error('原文件长度不匹配或超过解析上限');
  if (createHash('sha256').update(bytes).digest('hex') !== input.contentSha256) throw new Error('原文件摘要不匹配');
  if (target.profileId !== 'local-material-parser' || target.implementationVersion !== '1.0.0') throw new Error('解析器配置或实现版本不匹配');
  const directory = await mkdtemp(join(tmpdir(), 'jd-material-'));
  try {
    const file = join(directory, 'original');
    await writeFile(file, bytes, { mode: 0o600 });
    let parsed;
    if (input.mediaType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      if (bytes.subarray(0, 2).toString() !== 'PK') throw new Error('文件内容不是 XLSX ZIP');
      const { stdout } = await execute(PYTHON, [join(here, 'material-parser-xlsx.py'), file], COMMAND_OPTIONS);
      parsed = JSON.parse(stdout);
    } else if (input.mediaType === 'application/pdf') {
      if (!bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw new Error('文件内容不是 PDF');
      parsed = await parsePdf(file, directory);
    } else if (['image/png', 'image/jpeg'].includes(input.mediaType)) {
      if (input.mediaType === 'image/png' && !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('文件内容不是 PNG');
      if (input.mediaType === 'image/jpeg' && !(bytes[0] === 255 && bytes[1] === 216)) throw new Error('文件内容不是 JPEG');
      const unitId = 'image-1';
      const issues = ['图片已执行 OCR；非文字内容、签字与图形含义尚未核实，不能认定完整'];
      parsed = { units: [{ unitId, kind: 'IMAGE', index: 1, name: null, status: 'UNREADABLE' }], blocks: await ocr(file, unitId, issues), issues, completeness: 'INCOMPLETE' };
    } else throw new Error('不支持的材料类型');
    if (Buffer.byteLength(JSON.stringify(parsed)) > 20 * 1024 * 1024) throw new Error('解析结果超限，未截断采纳');
    return { runId: target.runId, operation: 'PARSE_MATERIAL', profileId: target.profileId, implementationVersion: target.implementationVersion, inputSnapshotId: null, analysis: null,
      parsing: { parseId: `parsing:${target.runId}`, sourceSystem: input.sourceSystem, sourceMaterialId: input.sourceMaterialId, sourceVersion: input.sourceVersion, contentSha256: input.contentSha256, ...parsed } };
  } finally { await rm(directory, { recursive: true, force: true }); }
}
export async function fetchMaterialBytes(worker, token, claim, fetchImpl = fetch) {
  const response = await fetchImpl(`${worker}/api/admin/charging/internal/job-attempts/${encodeURIComponent(claim.attemptId)}/material-content`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ leaseToken: claim.leaseToken, leaseEpoch: claim.leaseEpoch }),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`原文件读取失败 HTTP ${response.status}`);
  const expected = claim.target.parseInput.byteLength;
  if (expected > MAX_BYTES || !response.body) throw new Error('原文件长度超限或正文缺失');
  const chunks = [];
  let size = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > expected || size > MAX_BYTES) { await reader.cancel(); throw new Error('原文件流长度超过固定输入'); }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
