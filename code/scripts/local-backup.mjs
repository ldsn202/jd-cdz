import { cp, mkdir, readFile, writeFile, readdir, lstat, rename, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';

const exists = p => access(p).then(() => true, () => false);
const locations = { state: '.wrangler/state', source: 'mocks/.data/mock-env-a' };
async function inventory(root) {
  const files = {};
  async function walk(relative = '') {
    for (const name of (await readdir(join(root, relative))).sort()) {
      const path = join(relative, name), stat = await lstat(join(root, path));
      if (stat.isSymbolicLink()) throw Error('备份目录不接受符号链接');
      if (stat.isDirectory()) await walk(path);
      else {
        const hash=createHash('sha256');
        for await (const chunk of createReadStream(join(root,path))) hash.update(chunk);
        files[path]=hash.digest('hex');
      }
    }
  }
  await walk(); return files;
}
export async function createCheckpoint(root) {
  const checkpoints = join(root, '.local/checkpoints');
  await mkdir(checkpoints, { recursive: true });
  const id = 'checkpoint-' + randomUUID(), dir = join(checkpoints, id);
  await mkdir(dir);
  for (const [name, path] of Object.entries(locations)) await cp(join(root, path), join(dir, name), { recursive: true, errorOnExist: true, force: false });
  const manifest = { id, createdAt: new Date().toISOString(), files: await inventory(dir) };
  await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest));
  await writeFile(join(checkpoints, 'baseline.json'), JSON.stringify({ id }));
  return manifest;
}
// Caller has stopped all project services before snapshot, recovery or restore.
export async function recoverRestore(root) {
  const journal = join(root, '.local/pending-restore.json');
  if (!await exists(journal)) return;
  const { transaction } = JSON.parse(await readFile(journal, 'utf8'));
  if (!/^[a-f0-9-]+$/.test(transaction)) throw Error('恢复记录无效');
  for (const [name, path] of Object.entries(locations)) {
    const previous = join(root, '.local/checkpoints', 'before-' + transaction, name);
    if (await exists(previous)) {
      await rm(join(root, path), { recursive: true, force: true });
      await rename(previous, join(root, path));
    }
    await rm(join(root, path + '.restoring-' + transaction), { recursive: true, force: true });
  }
  await rm(journal);
}
export async function restoreCheckpoint(root) {
  const checkpoints = join(root, '.local/checkpoints');
  const { id } = JSON.parse(await readFile(join(checkpoints, 'baseline.json'), 'utf8'));
  if (!/^checkpoint-[a-f0-9-]+$/.test(id)) throw Error('演示起点编号无效');
  const dir = join(checkpoints, id), manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
  const actual = await inventory(dir); delete actual['manifest.json'];
  if (JSON.stringify(actual) !== JSON.stringify(manifest.files)) throw Error('演示起点文件校验失败，未回滚');
  const transaction = randomUUID(), backup = join(checkpoints, 'before-' + transaction);
  await mkdir(backup);
  for (const [name, path] of Object.entries(locations)) await cp(join(dir, name), join(root, path + '.restoring-' + transaction), { recursive: true, errorOnExist: true, force: false });
  await writeFile(join(root, '.local/pending-restore.json'), JSON.stringify({ transaction }));
  try {
    for (const [name, path] of Object.entries(locations)) {
      await rename(join(root, path), join(backup, name));
      await rename(join(root, path + '.restoring-' + transaction), join(root, path));
    }
    await rm(join(root, '.local/pending-restore.json'));
  } catch (error) { await recoverRestore(root); throw error; }
  return { restored: id, previousData: backup, createdAt: manifest.createdAt };
}
