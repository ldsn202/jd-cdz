// Installs the project-private PDF / OCR toolchain and the PDF helper venv.
// Single cross-platform implementation: setup-parsers.sh only delegates here, so
// macOS, Linux and Windows share one toolchain definition and one verification.
import { execFile, spawn } from 'node:child_process';
import { access, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { constants, createWriteStream } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { PARSER_PACKAGES, PARSER_BINARIES, parserPrefix, parserBinDir, micromambaBinaries, micromambaPlatform, micromambaUrl, mambaRoot } from './parser-tools.mjs';

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const local = join(root, '.local'), tools = join(local, 'tools');
const windows = process.platform === 'win32', suffix = windows ? '.exe' : '';
const exists = async p => access(p).then(() => true, () => false);
const usable = async p => exists(p) && (windows ? stat(p).then(s => s.isFile(), () => false) : access(p, constants.X_OK).then(() => true, () => false));

async function pythonCommand() {
  const candidates = windows ? [['python'], ['py', '-3'], ['python3']] : [['python3'], ['python']];
  for (const args of candidates) {
    try { await exec(args[0], [...args.slice(1), '-c', 'import sys;print(sys.version_info[0])'], { timeout: 30000 }); return args; } catch { /* next */ }
  }
  return null;
}

async function ensurePdfEnv(python) {
  const prefix = join(local, 'pdf-env');
  const bin = join(prefix, windows ? 'Scripts/python.exe' : 'bin/python');
  if (await usable(bin) && await exec(bin, ['-c', 'import reportlab'], { timeout: 60000 }).then(() => true, () => false)) return;
  if (!python) throw Error('未找到可用的 Python 3，无法建立生成 PDF 样例所需的 .local/pdf-env；请先安装 Python 3 后重试。');
  console.log('建立项目私有 PDF 生成环境 .local/pdf-env（仅用于生成演示文件）。');
  await exec(python[0], [...python.slice(1), '-m', 'venv', prefix], { cwd: root, timeout: 300000 });
  await exec(bin, ['-m', 'pip', 'install', '--disable-pip-version-check', 'reportlab==4.4.9'], { cwd: root, timeout: 900000, maxBuffer: 8 * 1024 * 1024 });
}

async function ensureMicromamba() {
  const known = micromambaBinaries(root);
  for (const path of known) if (await usable(path)) return path;
  const archive = join(tools, 'micromamba.tar.bz2'), target = join(tools, 'micromamba');
  await mkdir(target, { recursive: true });
  console.log('下载项目私有 micromamba（' + micromambaPlatform() + '，不修改系统环境）。');
  await exec('curl', ['-fL', '--retry', '3', micromambaUrl(), '-o', archive], { cwd: root, timeout: 900000, maxBuffer: 4 * 1024 * 1024 });
  await exec('tar', ['-xjf', archive, '-C', target], { cwd: root, timeout: 600000, maxBuffer: 4 * 1024 * 1024 });
  for (const path of known) if (await usable(path)) return path;
  throw Error('micromamba 未能就绪，请检查 code/.local/tools/micromamba。');
}

async function ensureParsers(python) {
  const prefix = parserPrefix(root), bin = parserBinDir(root);
  const missing = [];
  for (const name of PARSER_BINARIES) if (!await usable(join(bin, name + suffix))) missing.push(name);
  if (!missing.length && python) return;
  // conda-meta records the building platform, so a copied prefix solves to "already
  // installed" and never replaces the foreign binaries. The stamp is ours, not conda's.
  // The package cache is dropped with it: its repodata indexes belong to the old platform.
  const stamp = join(local, 'parser-env-platform'), current = `${process.platform}-${process.arch}`;
  const cache = mambaRoot(root, local);
  if (await readFile(stamp, 'utf8').catch(() => '') !== current) {
    console.log('现有 PDF / OCR 工具来自其他系统或架构，重新建立项目私有环境。');
    await rm(prefix, { recursive: true, force: true });
    await rm(cache, { recursive: true, force: true });
  }
  const micromamba = await ensureMicromamba();
  const packages = python ? PARSER_PACKAGES : [...PARSER_PACKAGES, 'python=3.13'];
  const operation = await exists(join(prefix, 'conda-meta/history')) ? 'install' : 'create';
  console.log('安装项目私有 PDF / OCR 工具（首次需要下载，不修改系统环境）。');
  const log = createWriteStream(join(local, 'parser-install.log'), { flags: 'a' });
  try {
    await new Promise((done, fail) => {
      const child = spawn(micromamba, [operation, '--yes', '--prefix', prefix, '--override-channels', '-c', 'conda-forge', ...packages], { cwd: root, env: { ...process.env, MAMBA_ROOT_PREFIX: cache }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      child.stdout.pipe(log); child.stderr.pipe(log);
      child.on('error', fail);
      child.on('exit', code => code === 0 ? done() : fail(Error(`micromamba ${operation} 失败（${code}），查看 code/.local/parser-install.log`)));
    });
  } finally { log.end(); }
  for (const name of PARSER_BINARIES) if (!await usable(join(bin, name + suffix))) throw Error(`PDF / OCR 工具缺失：${join(bin, name + suffix)}`);
  await writeFile(stamp, current);
}

const python = await pythonCommand();
await ensurePdfEnv(python);
await ensureParsers(python);
console.log('项目私有 PDF / OCR 工具已就绪：' + parserBinDir(root));
