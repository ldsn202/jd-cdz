import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootRuntime, parseEnvArg } from './bootstrap.ts';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function main(): void {
  const runtime = bootRuntime(rootDir, parseEnvArg(process.argv));
  const { env } = runtime;

  const checks: { item: string; pass: boolean; detail: string }[] = [];
  checks.push({ item: '环境清单校验', pass: true, detail: env.envFile });
  for (const [label, dir] of [
    ['来源库目录', env.sourcesDir],
    ['文件空间目录', env.filesDir],
    ['任务空间目录', env.tasksDir],
  ] as const) {
    checks.push({ item: label, pass: existsSync(dir), detail: dir });
  }
  for (const [systemId, applied] of Object.entries(runtime.appliedMigrations)) {
    const dbFile = path.join(env.sourcesDir, `${systemId}.db`);
    checks.push({
      item: `来源库就绪：${systemId}`,
      pass: existsSync(dbFile),
      detail: `本次应用迁移 ${applied.length} 份（重复执行为 0 属幂等）`,
    });
  }

  runtime.close();

  const failed = checks.filter((c) => !c.pass);
  console.log(JSON.stringify({
    envId: env.manifest.envId,
    port: env.manifest.port,
    dataset: env.manifest.dataset,
    storageRoot: env.manifest.storageRoot,
    appEnvRef: env.manifest.appEnvRef,
    checks,
    passed: failed.length === 0,
  }, null, 2));
  if (failed.length > 0) process.exit(1);
}

try {
  main();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
