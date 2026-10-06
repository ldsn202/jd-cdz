import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCheckpoint, restoreCheckpoint } from './local-backup.mjs';
test('rollback restores both stores, preserves changes in backup and rejects damaged baseline',async()=>{
  const root=await mkdtemp(join(tmpdir(),'charging-backup-test-'));
  try {
    for (const path of ['.wrangler/state/r2','mocks/.data/mock-env-a/files']) await mkdir(join(root,path),{recursive:true});
    await writeFile(join(root,'.wrangler/state/db.sqlite'),'original-db');
    await writeFile(join(root,'mocks/.data/mock-env-a/files/evidence'),'original-source');
    const checkpoint=await createCheckpoint(root);
    await writeFile(join(root,'.wrangler/state/db.sqlite'),'changed-db');
    await writeFile(join(root,'mocks/.data/mock-env-a/files/evidence'),'changed-source');
    const restored=await restoreCheckpoint(root);
    assert.equal(await readFile(join(root,'.wrangler/state/db.sqlite'),'utf8'),'original-db');
    assert.equal(await readFile(join(root,'mocks/.data/mock-env-a/files/evidence'),'utf8'),'original-source');
    assert.equal(await readFile(join(restored.previousData,'state/db.sqlite'),'utf8'),'changed-db');
    await writeFile(join(root,'.local/checkpoints',checkpoint.id,'state/db.sqlite'),'corrupt');
    await assert.rejects(restoreCheckpoint(root),/校验失败/);
    assert.equal(await readFile(join(root,'.wrangler/state/db.sqlite'),'utf8'),'original-db');
  } finally { await rm(root,{recursive:true,force:true}); }
});
