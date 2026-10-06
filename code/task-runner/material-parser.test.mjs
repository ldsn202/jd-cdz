import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, execFile } from 'node:child_process';
import { parseMaterialBytes, assertAnalysisMode } from './material-parser.mjs';
const type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PYTHON = process.platform === 'win32' ? 'python' : 'python3';
function target(bytes, mediaType = type) {
  return { runId: 'parse-test', profileId: 'local-material-parser', implementationVersion: '1.0.0', materialVersionId: 'smv-test', parseInput: { sourceSystem: 'LOCAL_UPLOAD', sourceMaterialId: 'up-test', sourceVersion: 'local:test', contentSha256: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.length, mediaType } };
}
async function workbook(missingCache = false) {
  const dir = await mkdtemp(join(tmpdir(), 'parser-test-'));
  const path = join(dir, 'input.xlsx');
  execFileSync(PYTHON, ['-c', `import zipfile,sys
with zipfile.ZipFile(sys.argv[1],'w') as z:
 z.writestr('xl/workbook.xml','<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="安装" sheetId="1" r:id="r1"/><sheet name="隐藏依据" sheetId="2" state="hidden" r:id="r2"/></sheets></workbook>')
 z.writestr('xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Target="worksheets/sheet1.xml" Type="worksheet"/><Relationship Id="r2" Target="worksheets/sheet2.xml" Type="worksheet"/></Relationships>')
 z.writestr('xl/worksheets/sheet1.xml','<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>管线</t></is></c><c r="B1"><f>6*2</f>${missingCache ? '' : '<v>12</v>'}</c></row></sheetData></worksheet>')
 z.writestr('xl/worksheets/sheet2.xml','<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>未读此表不可通过</t></is></c></row></sheetData></worksheet>')`, path]);
  const bytes = await readFile(path);
  await rm(dir, { recursive: true, force: true });
  return bytes;
}
test('real XLSX includes hidden sheets and original formula/cache without calculation', async () => {
  const bytes = await workbook();
  const result = await parseMaterialBytes(bytes, target(bytes));
  assert.equal(result.parsing.completeness, 'COMPLETE');
  assert.deepEqual(result.parsing.units.map(u => u.name), ['安装', '隐藏依据']);
  const formula = result.parsing.blocks.find(b => b.cellRange === 'B1');
  assert.equal(formula.formula, '6*2');
  assert.equal(formula.cachedValue, '12');
  assert.equal(result.parsing.blocks.some(b => b.text === '未读此表不可通过'), true);
});
test('missing formula cache is incomplete and never calculated or replaced by zero', async () => {
  const bytes = await workbook(true);
  const result = await parseMaterialBytes(bytes, target(bytes));
  assert.equal(result.parsing.completeness, 'INCOMPLETE');
  assert.equal(result.parsing.blocks.find(b => b.cellRange === 'B1').cachedValue, null);
  assert.match(result.parsing.issues.join(' '), /缓存/);
});
test('mismatched uploaded bytes fail before parser execution', async () => {
  const bytes = await workbook();
  await assert.rejects(parseMaterialBytes(Buffer.concat([bytes, Buffer.from('bad')]), target(bytes)), /摘要|长度/);
});
test('mock or mismatched executor mode cannot launch real analysis', () => {
  assert.throws(() => assertAnalysisMode('mock', 'real'), /MOCK_AI_NOT_ANALYSIS/);
  assert.throws(() => assertAnalysisMode('real', 'mock'), /AI_MODE_MISMATCH/);
  assert.throws(() => assertAnalysisMode('real', undefined), /AI_MODE_MISMATCH/);
  assert.doesNotThrow(() => assertAnalysisMode('real', 'real'));
});
function twoPagePdf() {
 const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ...['First page source', 'Second page evidence'].map(text => { const stream = `BT /F1 14 Tf 30 120 Td (${text}) Tj ET`; return `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`; }),
 ];
 let pdf = '%PDF-1.4\n'; const offsets = [0];
 for (let i = 0; i < objects.length; i++) { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; }
 const xref = Buffer.byteLength(pdf);
 pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
 pdf += offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('');
 pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 return Buffer.from(pdf);
}
test('real PDF visits every page and reports visual interpretation as incomplete', async () => {
 const bytes = twoPagePdf();
 const parsed = (await parseMaterialBytes(bytes, target(bytes, 'application/pdf'))).parsing;
 assert.deepEqual(parsed.units.map(u => u.index), [1, 2]);
 assert.equal(parsed.blocks.some(b => b.unitId === 'page-2' && b.text.includes('Second page evidence')), true);
 assert.equal(parsed.completeness, 'INCOMPLETE');
 assert.match(parsed.issues.join(' '), /图形|照片/);
});
test('real PNG OCR retains image unit without pretending graphic coverage', async () => {
 const bytes = execFileSync(PYTHON, ['-c', `import struct,zlib,sys
chunk=lambda t,d:struct.pack('!I',len(d))+t+d+struct.pack('!I',zlib.crc32(t+d)&0xffffffff)
sys.stdout.buffer.write(b'\\x89PNG\\r\\n\\x1a\\n'+chunk(b'IHDR',struct.pack('!2I5B',100,100,8,2,0,0,0))+chunk(b'IDAT',zlib.compress((b'\\x00'+b'\\xff'*300)*100))+chunk(b'IEND',b''))`]);
 const parsed = (await parseMaterialBytes(bytes, target(bytes, 'image/png'))).parsing;
 assert.equal(parsed.units[0].kind, 'IMAGE');
 assert.equal(parsed.completeness, 'INCOMPLETE');
 assert.ok(parsed.issues.length);
});

test('runner in Worker mock mode reports failure without creating any model run', async () => {
 const directory = await mkdtemp(join(tmpdir(), 'runner-mode-test-'));
 const preload = join(directory, 'worker-fixture.mjs');
 const reportPath = join(directory, 'reported.json');
 await writeFile(preload, `import {writeFile} from 'node:fs/promises';
 globalThis.fetch = async (url, init) => {
  let data;
  if(url.endsWith('/api/health')) data={aiMode:'mock'};
  else if(url.endsWith('/job-claims')) data={claims:[{jobId:'j',attemptId:'a',purpose:'ANALYZE_SKILL',target:{runId:'must-not-run'},leaseToken:'lease',leaseEpoch:1,leaseUntil:Date.now()+60000}]};
  else if(url.endsWith('/results')) {await writeFile(process.env.TEST_REPORT_PATH,init.body);data={jobStatus:'FAILED'};}
  else throw new Error('unexpected Worker route: '+url);
  return Response.json({code:0,data});
 };`);
 try {
  await promisify(execFile)(process.execPath, ['--import', pathToFileURL(preload).href, fileURLToPath(new URL('./runner.mjs', import.meta.url)), '--once'], {
   env: { ...process.env, WORKER_BASE_URL: 'http://worker-fixture.invalid', AI_MODE: 'real', RUNS_ROOT: join(directory,'runs'), SERVICE_TOKEN: 'test-only', TEST_REPORT_PATH: reportPath }, timeout: 10000,
  });
  const report = JSON.parse(await readFile(reportPath,'utf8'));
  assert.equal(report.errorCode, 'MOCK_AI_NOT_ANALYSIS');
  assert.equal((await readdir(directory)).includes('runs'), false);
 } finally { await rm(directory, { recursive: true, force: true }); }
});

test('percent display semantics and merged ranges cannot silently count as complete',async()=>{
 const source=await workbook();
 const bytes=execFileSync(PYTHON,['-c',`import io,zipfile,sys
src=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()));out=io.BytesIO()
with zipfile.ZipFile(out,'w') as z:
 for n in src.namelist():
  value=src.read(n)
  if n=='xl/worksheets/sheet1.xml':value=value.replace(b'<c r="B1">',b'<c r="B1" s="1">').replace(b'</worksheet>',b'<mergeCells><mergeCell ref="C3:D3"/></mergeCells></worksheet>')
  z.writestr(n,value)
 z.writestr('xl/styles.xml','<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs><xf numFmtId="0"/><xf numFmtId="9"/></cellXfs></styleSheet>')
sys.stdout.buffer.write(out.getvalue())`],{input:source});
 const parsed=(await parseMaterialBytes(bytes,target(bytes))).parsing;
 assert.equal(parsed.completeness,'INCOMPLETE');
 assert.match(parsed.issues.join(' '),/安装!B1.*格式/);
 assert.match(parsed.issues.join(' '),/C3:D3/);
});
