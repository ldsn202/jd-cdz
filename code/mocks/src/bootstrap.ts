import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { loadEnvironment, type LoadedEnvironment } from './environment/registry.ts';
import { SOURCE_SYSTEMS, type SourceSystemId } from './sources/systems.ts';
import { applyMigrations, openSourceDatabase } from './storage/database.ts';
import { SourceStore } from './storage/source-store.ts';
import { ensureUnifiedJdAccount } from '../identity/unified-jd-account.ts';
import { ensureUnifiedProviderAccounts } from '../identity/unified-provider-accounts.ts';
import { ensureProviderDirectory } from '../installation/providers.ts';

export type MockRuntime = {
  env: LoadedEnvironment;
  stores: Map<SourceSystemId, SourceStore>;
  dbs: Map<SourceSystemId, DatabaseSync>;
  appliedMigrations: Record<string, string[]>;
  close: () => void;
};

export function parseEnvArg(argv: string[]): string {
  const idx = argv.indexOf('--env');
  if (idx === -1 || !argv[idx + 1]) {
    throw new Error('缺少启动参数：--env <环境清单路径，相对 code/mocks>');
  }
  return argv[idx + 1];
}

export function bootRuntime(rootDir: string, envFile: string): MockRuntime {
  const env = loadEnvironment(rootDir, envFile);
  mkdirSync(env.sourcesDir, { recursive: true });
  mkdirSync(env.filesDir, { recursive: true });
  mkdirSync(env.tasksDir, { recursive: true });

  const migrationsDir = path.join(rootDir, 'migrations');
  const stores = new Map<SourceSystemId, SourceStore>();
  const dbs = new Map<SourceSystemId, DatabaseSync>();
  const appliedMigrations: Record<string, string[]> = {};
  for (const system of SOURCE_SYSTEMS) {
    const db = openSourceDatabase(path.join(env.sourcesDir, `${system.id}.db`));
    dbs.set(system.id, db);
    appliedMigrations[system.id] = applyMigrations(db, migrationsDir);
    stores.set(system.id, new SourceStore(db, system.id));
  }

  ensureUnifiedJdAccount(dbs.get('identity')!);
  ensureUnifiedProviderAccounts(dbs.get('identity')!);
  ensureProviderDirectory(dbs.get('installation-admin')!, dbs.get('identity')!);
  return {
    env,
    stores,
    dbs,
    appliedMigrations,
    close: () => {
      for (const db of dbs.values()) db.close();
    },
  };
}
