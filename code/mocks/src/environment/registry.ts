import { readFileSync } from 'node:fs';
import path from 'node:path';

export type EnvironmentManifest = {
  envId: string;
  port: number;
  dataset: string;
  storageRoot: string;
  appEnvRef: string;
};

export type LoadedEnvironment = {
  manifest: EnvironmentManifest;
  envFile: string;
  rootDir: string;
  storageDir: string;
  sourcesDir: string;
  filesDir: string;
  tasksDir: string;
};

const ENV_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,31}$/;

export class EnvironmentError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`环境清单校验失败：${issues.join('；')}`);
    this.name = 'EnvironmentError';
    this.issues = issues;
  }
}

export function validateManifest(raw: unknown): EnvironmentManifest {
  const issues: string[] = [];
  const m = raw as Partial<EnvironmentManifest>;

  if (typeof m?.envId !== 'string' || !ENV_ID_PATTERN.test(m.envId)) {
    issues.push('envId 缺失或不合法（小写字母/数字/中划线，2-32 位）');
  }
  if (typeof m?.port !== 'number' || !Number.isInteger(m.port) || m.port < 1 || m.port > 65535) {
    issues.push('port 缺失或不合法（1-65535 整数）');
  }
  if (typeof m?.dataset !== 'string' || m.dataset.trim() === '') {
    issues.push('dataset 缺失（绑定的数据集标识）');
  }
  if (typeof m?.storageRoot !== 'string' || m.storageRoot.trim() === '') {
    issues.push('storageRoot 缺失');
  } else if (m.storageRoot.includes('..') || path.isAbsolute(m.storageRoot)) {
    issues.push('storageRoot 必须是 code/mocks 内的相对路径，不允许 .. 或绝对路径');
  }
  if (typeof m?.appEnvRef !== 'string' || m.appEnvRef.trim() === '') {
    issues.push('appEnvRef 缺失（本系统环境引用，仅登记）');
  }

  if (issues.length > 0) throw new EnvironmentError(issues);
  return m as EnvironmentManifest;
}

export function loadEnvironment(rootDir: string, envFile: string): LoadedEnvironment {
  const envPath = path.resolve(rootDir, envFile);
  if (!envPath.startsWith(path.resolve(rootDir) + path.sep)) {
    throw new EnvironmentError([`环境清单必须位于 ${rootDir} 内：${envFile}`]);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(envPath, 'utf8'));
  } catch (e) {
    throw new EnvironmentError([`环境清单读取或解析失败：${envPath}（${(e as Error).message}）`]);
  }
  const manifest = validateManifest(raw);
  const storageDir = path.resolve(rootDir, manifest.storageRoot);
  if (!storageDir.startsWith(path.resolve(rootDir) + path.sep)) {
    throw new EnvironmentError([`storageRoot 越出 code/mocks：${manifest.storageRoot}`]);
  }
  return {
    manifest,
    envFile: envPath,
    rootDir: path.resolve(rootDir),
    storageDir,
    sourcesDir: path.join(storageDir, 'sources'),
    filesDir: path.join(storageDir, 'files'),
    tasksDir: path.join(storageDir, 'tasks'),
  };
}
