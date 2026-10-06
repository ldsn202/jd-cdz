// Desktop and CLI must use the same release and personal credential storage.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const OPENCODE_VERSION = '2.0.18';
export const OPENCODE_PACKAGE = '@opencode/cli';
export const OPENCODE_DIRECTORY = 'tools/opencode-v2';
// The postinstall always links the platform build to this file name, .exe included on macOS.
export const opencodeBinary = local => join(local, OPENCODE_DIRECTORY, 'node_modules', OPENCODE_PACKAGE, 'bin', 'opencode.exe');
// Header bytes per platform: a project copied from another OS keeps the version but cannot run.
const MAGIC = {
  win32: [[0x4d, 0x5a]],
  darwin: [[0xcf, 0xfa, 0xed, 0xfe], [0xce, 0xfa, 0xed, 0xfe], [0xfe, 0xed, 0xfa, 0xcf], [0xfe, 0xed, 0xfa, 0xce]],
  linux: [[0x7f, 0x45, 0x4c, 0x46]],
};
export async function opencodeInstall(local) {
  const version = await readFile(join(local, OPENCODE_DIRECTORY, 'node_modules', OPENCODE_PACKAGE, 'package.json'), 'utf8').then(text => JSON.parse(text).version, () => null);
  if (version !== OPENCODE_VERSION) return { version, usable: false };
  const head = await readFile(opencodeBinary(local)).then(buffer => [...buffer.subarray(0, 4)], () => null);
  return { version, usable: !!head && (MAGIC[process.platform] ?? []).some(signature => signature.every((byte, index) => head[index] === byte)) };
}
