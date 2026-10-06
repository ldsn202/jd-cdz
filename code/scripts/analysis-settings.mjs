import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { opencodeBinary } from './opencode-version.mjs';

const exec = promisify(execFile);

export async function analysisSettings(local, inherited = process.env) {
  const allowed = ['SKILL_MODEL', 'DEEPSEEK_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'];
  const env = Object.fromEntries(allowed.filter(k => inherited[k]).map(k => [k, inherited[k]]));
  const model = env.SKILL_MODEL || 'deepseek/deepseek-flash';
  const provider = model.split('/')[0];
  const keys = { deepseek: 'DEEPSEEK_API_KEY', openai: 'OPENAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY', google: 'GOOGLE_GENERATIVE_AI_API_KEY' };
  const key = keys[provider];
  // V2 credentials are managed by OpenCode. This command returns connection
  // metadata only; never copy or read secret values from its personal database.
  let connections = [], unavailable = false;
  try {
    const { stdout } = await exec(opencodeBinary(local), ['auth', 'list', '--standalone', '--format', 'json'], { env: inherited, timeout: 20000, maxBuffer: 1024 * 1024, windowsHide: true });
    const providers = JSON.parse(stdout);
    if (!Array.isArray(providers)) throw Error('Unexpected credential status');
    connections = providers.find(p => p.id === provider)?.connections ?? [];
  } catch { unavailable = true; }
  const configured = !!(key && env[key]) || connections.length > 0;
  return { env: { ...env, SKILL_MODEL: model }, model, ready: configured, fingerprint: createHash('sha256').update(JSON.stringify([model,{ ...env, SKILL_MODEL: model },connections])).digest('hex'),
    error: configured ? '' : unavailable ? '无法读取 OpenCode 凭证状态。请按《启动与运行指南.md》检查 CLI 版本并重新启动项目。' : `模型凭证尚未配置。请在 OpenCode 客户端连接 ${provider}，再按《启动与运行指南.md》重新启动项目。` };
}
