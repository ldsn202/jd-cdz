// Project-private PDF / OCR toolchain layout. One source of truth for launcher PATH,
// installer and parser callers; conda prefixes keep executables in Library\bin on
// Windows and in bin everywhere else.
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export const PARSER_PACKAGES = ['poppler=26.09.0', 'tesseract=5.5.3'];
export const PARSER_BINARIES = ['pdfinfo', 'pdftotext', 'pdftoppm', 'tesseract'];
export const MICROMAMBA_VERSION = 'latest';

export function parserPrefix(root) {
  return join(root, '.local/parser-env');
}

export function parserBinDir(root) {
  return join(parserPrefix(root), process.platform === 'win32' ? 'Library/bin' : 'bin');
}

export function micromambaPlatform() {
  if (process.platform === 'win32') return 'win-64';
  if (process.platform === 'darwin') return process.arch === 'arm64' ? 'osx-arm64' : 'osx-64';
  if (process.platform === 'linux' && process.arch === 'x64') return 'linux-64';
  throw Error(`不支持的处理器与系统组合：${process.platform}/${process.arch}`);
}

export function micromambaBinaries(root) {
  const home = join(root, '.local/tools/micromamba');
  return process.platform === 'win32'
    ? [join(home, 'Library/bin/micromamba.exe'), join(home, 'bin/micromamba.exe')]
    : [join(home, 'bin/micromamba')];
}

export function micromambaUrl() {
  return `https://micro.mamba.pm/api/micromamba/${micromambaPlatform()}/${MICROMAMBA_VERSION}`;
}

// libmamba cannot read its repodata cache from a non-ASCII root prefix on Windows and
// then solves against an empty index, so the package cache moves to a plain-ASCII
// per-user directory. The environment prefix itself stays inside the project.
export function mambaRoot(root, local) {
  if (/^[\x20-\x7e]*$/.test(root)) return join(local, 'mamba');
  const base = process.env.LOCALAPPDATA || tmpdir();
  return join(base, process.platform === 'win32' ? 'jd-charging/mamba' : 'jd-charging-mamba');
}
