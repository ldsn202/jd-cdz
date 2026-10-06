import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, access, rm, open, rename, cp } from 'node:fs/promises';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { createCheckpoint, restoreCheckpoint, recoverRestore } from './local-backup.mjs';
import { analysisSettings } from './analysis-settings.mjs';
import { parserBinDir } from './parser-tools.mjs';
import { OPENCODE_VERSION, OPENCODE_PACKAGE, OPENCODE_DIRECTORY, opencodeInstall } from './opencode-version.mjs';
import { identitySql } from './local-identity.mjs';
import { JD_ACCOUNT, LEGACY_JD_ACCOUNTS, canonicalAccount, mergeJdIdentitiesSql } from './merge-jd-identities.mjs';
import { RETIRED_PROVIDER_ACCOUNT, mergeProviderIdentitiesSql } from './merge-provider-identities.mjs';
import { runSourceImport } from '../task-runner/source-import.mjs';
import { upgradeDemoDataset } from './demo-dataset.mjs';

const canonicalLocalAccount = account => canonicalAccount(account === RETIRED_PROVIDER_ACCOUNT ? JD_ACCOUNT : account);
const exec = promisify(execFile), script = fileURLToPath(import.meta.url);
const root = resolve(dirname(script), '..'), local = join(root, '.local');
const windows = process.platform === 'win32';
const dataset=JSON.parse(await readFile(join(root,'mocks/generator/configs/standard.json'),'utf8'));
const config = join(local, 'wrangler.json'), persist = join(root, '.wrangler/state');
const mock = 'http://127.0.0.1:8790', api = 'http://127.0.0.1:8788', web = 'http://127.0.0.1:5174';
const serviceToken = 'local-acc-svc-backend', jdToken = 'local-' + JD_ACCOUNT;
const wrangler = join(root, 'node_modules/wrangler/bin/wrangler.js');
const npm = join(dirname(process.execPath), windows ? 'node_modules/npm/bin/npm-cli.js' : '../lib/node_modules/npm/bin/npm-cli.js');
const delay = ms => new Promise(r => setTimeout(r, ms));
const exists = async p => access(p).then(() => true, () => false);
const json = async p => JSON.parse(await readFile(p, 'utf8'));
const save = (p, value) => writeFile(p, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
// Windows keeps the inherited block as Path; drop every case variant so the child sees one PATH.
const withPath = (env, value) => { const next = { ...env }; for (const key of Object.keys(next)) if (key.toLowerCase() === 'path') delete next[key]; return { ...next, PATH: value }; };
const analysis = await analysisSettings(local);
const baseEnv = { ...withPath({ ...process.env, ...analysis.env }, [dirname(process.execPath), join(local, OPENCODE_DIRECTORY, 'node_modules/.bin'), parserBinDir(root), process.env.PATH].filter(Boolean).join(delimiter)), WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: join(local, 'wrangler.log'), CI: 'true' };
const jobEnv = { ...baseEnv, WORKER_BASE_URL: api, API_BASE_URL: api, SERVICE_TOKEN: serviceToken, EXTERNAL_MODE: 'mock', MOCK_BASE_URL: mock, MOCK_ACCOUNT_ID: 'acc-svc-backend', AI_MODE: 'real', ANALYSIS_ENABLED: String(analysis.ready), LOOP_INTERVAL_MS: '1000', RUNS_ROOT: join(local, 'runs') };

async function request(url, token, body) {
  const response = await fetch(url, { headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), 'content-type': 'application/json' }, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(120000) });
  const data = await response.json();
  if (!response.ok || (data.code !== undefined && data.code !== 0) || data.ok === false) throw Error(`${url}: HTTP ${response.status} ${data.msg ?? JSON.stringify(data.error)}`);
  return data.data ?? data;
}
async function command(args, name, cwd = root, env = baseEnv) {
  const log = await open(join(local, name + '.log'), 'a', 0o600);
  try {
    await new Promise((done, fail) => {
      const child = spawn(process.execPath, args, { cwd, env, windowsHide: true, stdio: ['ignore', log.fd, log.fd] });
      child.on('error', fail);
      child.on('exit', code => code === 0 ? done() : fail(Error(`${name} 失败（${code}），查看 code/.local/${name}.log`)));
    });
  } finally { await log.close(); }
}
async function freePort(port) {
  await new Promise((done, fail) => {
    const socket = createServer();
    socket.once('error', () => fail(Error(`端口 ${port} 已被其他进程占用；未停止该进程。请先停止原服务。`)));
    socket.listen(port, '127.0.0.1', () => socket.close(done));
  });
}
async function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}
async function commandLineOf(pid) {
  if (!windows) return (await exec('ps', ['-p', String(pid), '-o', 'command='])).stdout;
  return (await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`])).stdout;
}
async function owned(entry) {
  if (!entry?.pid || !await alive(entry.pid)) return false;
  if (!windows) return (await commandLineOf(entry.pid)).includes(script + ' service ' + entry.role);
  if (entry.ownedBy === process.platform) return true;
  const line = await commandLineOf(entry.pid).catch(() => '');
  return line.includes(script) && line.includes(' service ' + entry.role);
}
async function terminate(pid) {
  if (!windows) { process.kill(-pid, 'SIGTERM'); return; }
  // Windows 无法投递 SIGTERM；结束整棵进程树，wrangler / vite 等子进程一并退出。
  await exec('taskkill', ['/PID', String(pid), '/T', '/F']).catch(() => process.kill(pid));
}
async function state() { return await exists(join(local, 'processes.json')) ? json(join(local, 'processes.json')) : {}; }
async function stop() {
  const processes = await state();
  for (const role of ['monitor', 'runner', 'web', 'api', 'mock']) {
    const entry = processes[role];
    if (!await owned(entry)) continue;
    await terminate(entry.pid);
    for (let i = 0; i < 100 && await alive(entry.pid); i++) await delay(100);
    if (await alive(entry.pid)) throw Error(`${role} 尚未停止；数据与进程记录保留。`);
  }
  await save(join(local, 'processes.json'), {});
  console.log('服务已停止，数据库和上传文件已保留。');
}
async function launch(role) {
  const log = await open(join(local, role + '.log'), 'a', 0o600);
  const child = spawn(process.execPath, [script, 'service', role], { cwd: root, env: baseEnv, detached: true, windowsHide: true, stdio: ['ignore', log.fd, log.fd] });
  await new Promise((done, fail) => { child.once('spawn', done); child.once('error', fail); });
  await log.close();
  child.unref();
  const processes = await state(); processes[role] = { role, pid: child.pid, ownedBy: process.platform };
  await save(join(local, 'processes.json'), processes);
}
async function waitFor(url, role) {
  for (let i = 0; i < 100; i++) {
    if (!await owned((await state())[role])) throw Error(`${role} 启动退出，请查看 code/.local/${role}.log`);
    try { if ((await fetch(url, { signal: AbortSignal.timeout(800) })).ok) return; } catch {}
    await delay(300);
  }
  throw Error(`${role} 未就绪，请查看 code/.local/${role}.log`);
}
async function service(role) {
  const settings = await json(join(local, 'settings.json'));
  const jobs = {
    mock: { args: [join(root, 'mocks/src/server.ts'), '--env', 'environments/mock-env-a.json'], cwd: join(root, 'mocks') },
    api: { args: [wrangler, 'dev', '--config', config, '--local', '--ip', '127.0.0.1', '--port', '8788', '--inspector-port', '0', '--persist-to', persist] },
    web: { args: [join(root, 'web/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--strictPort'], cwd: join(root, 'web'), env: { ...baseEnv, VITE_DEV_API_TARGET: api, VITE_DEV_IDENTITY_TOKEN: 'local-' + settings.account } },
    runner: { args: [join(root, 'task-runner/runner.mjs'), '--loop'], env: jobEnv },
    monitor: { args: [join(root, 'task-runner/source-monitor.mjs'), '--loop'], env: jobEnv },
  };
  const job = jobs[role]; if (!job) throw Error('未知服务');
  const child = spawn(process.execPath, job.args, { cwd: job.cwd ?? root, env: job.env ?? baseEnv, windowsHide: true, stdio: 'inherit' });
  child.on('error', e => { console.error(e.message); process.exitCode = 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  child.on('exit', code => { process.exitCode = code ?? 0; });
}
async function identity(accountId) {
  const session = await request(mock + '/api/admin/mock/external/identity/sessions', null, { accountId });
  return request(mock + '/api/admin/mock/external/identity/current-context', session.token);
}
async function check() {
  const processes = await state();
  for (const role of ['mock', 'api', 'web', 'runner', 'monitor']) if (!await owned(processes[role])) throw Error(`${role} 未运行`);
  await request(mock + '/health'); await request(api + '/api/health');
  const orders = await request(api + '/api/admin/charging/work-orders?pageSize=1', jdToken);
  const items = await request(api + '/api/admin/charging/work-items?responsibility=VISIBLE&pageSize=1', jdToken);
  const mine = await request(api + '/api/admin/charging/work-items?responsibility=MINE&pageSize=1', jdToken);
  const session = await request(web + '/api/admin/charging/session');
  const providers=await request(api+'/api/admin/charging/providers?pageSize=50',jdToken);
  if(providers.total!==dataset.providers)throw Error('服务商必须恰好 '+dataset.providers+' 家，实际 '+providers.total);
  if (orders.total < dataset.workOrders || mine.total === 0) throw Error(`数据未恢复完整：工单 ${orders.total}，事项 ${items.total}，京东账号负责 ${mine.total}`);
  const result = { url: web, account: session.displayName, providers:providers.total, orders: orders.total, visibleItems: items.total, jdAssignedItems: mine.total, checkedAt: new Date().toISOString() };
  await save(join(local, 'health.json'), result); console.log(JSON.stringify(result, null, 2)); return result;
}
async function start() {
  if (!['darwin', 'win32'].includes(process.platform)) throw Error('本启动入口支持 macOS 与 Windows；Linux 尚未验证。');
  const processes = await state();
  if (Object.keys(processes).length) {
    const running = await Promise.all(Object.values(processes).map(owned));
    const settings = await json(join(local, 'settings.json')).catch(() => ({}));
    const sameAccount = (!process.env.LOCAL_ACCOUNT || canonicalLocalAccount(process.env.LOCAL_ACCOUNT) === settings.account) && settings.analysisModel === analysis.model && settings.analysisReady === analysis.ready && settings.launcherVersion === 10 && settings.datasetId===dataset.datasetId && settings.analysisTriggerMode === 'manual' && settings.analysisFingerprint === analysis.fingerprint;
    if (sameAccount && running.every(Boolean) && ['mock','api','web','runner','monitor'].every(k => processes[k])) { await request(api + '/api/admin/charging/internal/source-import/providers', serviceToken, {}); await check(); return; }
    await stop();
  }
  await recoverRestore(root);
  await upgradeDemoDataset(root,dataset.datasetId);
  for (const port of [5174, 8788, 8790]) await freePort(port);
  await command([join(root, 'scripts/setup-parsers.mjs')], 'install-parsers', root, baseEnv);
  console.log('1/6 安装锁定依赖并构建前端');
  for (const part of ['', 'api', 'web']) {
    const folder = join(root, part), stamp = join(local, 'deps-' + (part || 'root'));
    const hash = createHash('sha256').update(await readFile(join(folder, 'package-lock.json'))).update(process.version + process.platform + process.arch).digest('hex');
    if (!await exists(join(folder, 'node_modules')) || !await exists(stamp) || (await readFile(stamp, 'utf8')) !== hash) {
      await command([npm, 'ci', '--no-audit', '--no-fund', '--cache', join(local, 'npm-cache')], 'install-' + (part || 'root'), folder);
      await writeFile(stamp, hash);
    }
  }
  const opencode = await opencodeInstall(local);
  if (!opencode.usable) {
    // A version match is not enough: a copied .local keeps another platform's binary.
    if (opencode.version === OPENCODE_VERSION) await rm(join(local, OPENCODE_DIRECTORY), { recursive: true, force: true });
    await command([npm, 'install', '--prefix', join(local, OPENCODE_DIRECTORY), '--save-exact', `${OPENCODE_PACKAGE}@${OPENCODE_VERSION}`, '--no-audit', '--no-fund', '--cache', join(local, 'npm-cache')], 'install-opencode');
  }
  Object.assign(analysis, await analysisSettings(local, baseEnv));
  Object.assign(baseEnv, analysis.env);
  Object.assign(jobEnv, analysis.env, { ANALYSIS_ENABLED: String(analysis.ready) });
  await command([npm, '--prefix', 'web', 'run', 'build'], 'build');
  console.log('2/6 检查模拟来源；已有数据不重建');
  const sourceRoot = join(root, 'mocks/.data/mock-env-a');
  if (!await exists(sourceRoot)) {
    if (process.platform !== 'darwin') throw Error('来源数据尚未生成，生成器依赖 macOS sips。请在 macOS 上执行一次生成，或把 code/mocks/.data/mock-env-a 整体复制到本机后重新启动。');
    const staging = '.data/initializing-' + randomUUID();
    const manifestFile = staging + '.json';
    await mkdir(join(root, 'mocks/.data'), { recursive: true });
    const manifest = await json(join(root, 'mocks/environments/mock-env-a.json'));
    await save(join(root, 'mocks', manifestFile), { ...manifest, storageRoot: staging });
    for (const file of ['generate.ts', 'generate-files.ts']) await command([join(root, 'mocks/generator', file), '--config', 'generator/configs/standard.json', '--env', manifestFile], 'generate', join(root, 'mocks'));
    await rename(join(root, 'mocks', staging), sourceRoot);
    await rm(join(root, 'mocks', manifestFile));
  }
  if (!await exists(join(sourceRoot, 'delivery',dataset.datasetId,'data-manifest.json')) || !await exists(join(sourceRoot, 'files'))) throw Error('已有来源目录不完整；为保护数据未覆盖，请检查 code/mocks/.data/mock-env-a。');
  const mergeBackup = join(local, 'before-provider-account-merge');
  if (!await exists(mergeBackup)) {
    const staging = mergeBackup + '-' + randomUUID();
    await mkdir(staging);
    await cp(join(sourceRoot, 'sources'), join(staging, 'sources'), { recursive: true });
    if (await exists(join(persist, 'v3/d1'))) await cp(join(persist, 'v3/d1'), join(staging, 'd1'), { recursive: true });
    await rename(staging, mergeBackup);
  }
  await command([join(root, 'mocks/src/env-check.ts'), '--env', 'environments/mock-env-a.json'], 'source-check', join(root, 'mocks'));
  const oldSettings = await exists(join(local, 'settings.json')) ? await json(join(local, 'settings.json')) : {};
  const remembered=oldSettings.account&&(!oldSettings.account.startsWith('acc-sp-')||Number(oldSettings.account.slice(7))<=dataset.providers)?oldSettings.account:JD_ACCOUNT;
  const account = canonicalLocalAccount(process.env.LOCAL_ACCOUNT ?? remembered ?? JD_ACCOUNT);
  await save(join(local, 'settings.json'), { account, analysisModel: analysis.model, analysisReady: analysis.ready, analysisFingerprint: analysis.fingerprint, launcherVersion: 10, datasetId:dataset.datasetId, analysisTriggerMode: 'manual', opencodeVersion: OPENCODE_VERSION });
  await launch('mock'); await waitFor(mock + '/health', 'mock');
  console.log('3/6 从身份接口取得真实授权，初始化本地数据库');
  const serviceContext = await identity('acc-svc-backend');
  const providerIds = [...new Set(serviceContext.grants.flatMap(g => g.scope.resourceIds))];
  if (providerIds.length !== dataset.providers) throw Error('服务商数量与演示集不一致，必须恰好 '+dataset.providers+' 家');
  const accounts = ['acc-svc-backend', JD_ACCOUNT, ...providerIds.map(id => 'acc-' + id.toLowerCase())];
  if (!accounts.includes(account) || account === 'acc-svc-backend') throw Error('LOCAL_ACCOUNT 必须是标准来源中已有的人类账号');
  const contexts = [serviceContext];
  for (const id of accounts.slice(1)) contexts.push(await identity(id));
  const original = JSON.parse(await readFile(join(root, 'wrangler.jsonc'), 'utf8'));
  await save(config, { ...original, main: join(root, 'api/src/index.ts'), assets: { ...original.assets, directory: join(root, 'web/dist') }, d1_databases: original.d1_databases.map(d => ({ ...d, migrations_dir: join(root, 'db/migrations') })), vars: { ...original.vars, EXTERNAL_MODE: 'mock', AI_MODE: 'real', LOCAL_ACCOUNT_SWITCHING: 'true', LOCAL_UI_ORIGIN: web, ANALYSIS_RUNTIME_ERROR: analysis.error, MOCK_BASE_URL: mock, MOCK_ACCOUNT_ID: 'acc-svc-backend', DEV_IDENTITY_TOKENS: JSON.stringify(Object.fromEntries([...accounts.map(id => ['local-' + id, id]), ...[...LEGACY_JD_ACCOUNTS, RETIRED_PROVIDER_ACCOUNT].map(id => ['local-' + id, JD_ACCOUNT])])) } });
  const dbArgs = ['--config', config, '--local', '--persist-to', persist];
  await command([wrangler, 'd1', 'migrations', 'apply', 'DB', ...dbArgs], 'migrate');
  await writeFile(join(local, 'identity.sql'), contexts.map(identitySql).join('\n') + '\n' + mergeJdIdentitiesSql() + '\n' + mergeProviderIdentitiesSql(), { mode: 0o600 });
  await command([wrangler, 'd1', 'execute', 'DB', ...dbArgs, '--file', join(local, 'identity.sql')], 'identity');
  await launch('api'); await waitFor(api + '/api/health', 'api');
  console.log('4/6 同步服务商名称并导入工单，保留已有业务记录');
  await request(api + '/api/admin/charging/internal/source-import/providers', serviceToken, {});
  const previous = await exists(join(local, 'import-report.json')) ? await json(join(local, 'import-report.json')) : null;
  const current = await request(api + '/api/admin/charging/work-orders?pageSize=1', jdToken);
  if (previous?.status !== 'SCOPED_COMPLETE' || current.total < dataset.workOrders) {
    const report = await runSourceImport({ baseUrl: api, token: serviceToken, reportPath: join(local, 'import-report.json'), expectedProviders: dataset.providers, expectedOrders: dataset.workOrders });
    if (report.status !== 'SCOPED_COMPLETE') throw Error('来源导入未完成，查看 code/.local/import-report.json');
  }
  console.log('5/6 建立来源订阅，通过业务链路生成事项（首次需要几分钟）');
  await command([join(root, 'task-runner/source-monitor.mjs')], 'monitor-bootstrap', root, jobEnv);
  await command([join(root, 'task-runner/runner.mjs'), '--drain'], 'discovery', root, { ...jobEnv, JOB_PURPOSES: 'DISCOVER_RELATIONS' });
  console.log('6/6 启动后台与页面，核对实际可见数据');
  await launch('runner'); await launch('monitor'); await launch('web'); await waitFor(web, 'web');
  await check();
  if (analysis.error) console.log(analysis.error + ' 来源数据继续同步，配置模型后可在事项详情点击运行分析。');
  console.log('mock 环境全部分析均需在事项详情点击运行分析；启动和数据更新不会自动发起分析。');
  console.log('启动完成。停止：在项目根执行 npm --prefix code stop。再次启动保留现有业务与上传文件。');
}

await mkdir(local, { recursive: true, mode: 0o700 });
const action = process.argv[2] ?? 'start';
if (action === 'service') await service(process.argv[3]);
else {
  const lock = join(local, 'startup.lock');
  try { await mkdir(lock); } catch {
    const owner = await json(join(lock, 'owner.json')).catch(() => null);
    if (!owner?.pid) throw Error('启动锁缺少进程信息，请检查 code/.local/startup.lock。');
    const commandLine = await commandLineOf(owner.pid).catch(() => '');
    if (commandLine.includes('local-dev.mjs')) throw Error('另一个启动/停止操作尚未结束，请勿同时启动。');
    await rm(lock, { recursive: true }); await mkdir(lock);
  }
  await save(join(lock, 'owner.json'), { pid: process.pid, action });
  try {
    if (action === 'start') await start();
    else if (action === 'checkpoint' || action === 'restore') {
      if (action === 'restore' && !await exists(join(local, 'checkpoints/baseline.json'))) throw Error('尚无演示起点，请在项目根执行 npm --prefix code run checkpoint。');
      await stop();
      await recoverRestore(root);
      const result = action === 'checkpoint' ? await createCheckpoint(root) : await restoreCheckpoint(root);
      console.log(action === 'checkpoint' ? `已保存演示起点：${result.id}` : JSON.stringify(result, null, 2));
      await start();
    }
    else if (action === 'stop') await stop();
    else if (action === 'status' || action === 'check') await check();
    else throw Error('用法：node code/scripts/local-dev.mjs [start|stop|status|check|checkpoint|restore]');
  } catch (error) {
    console.error(error.message);
    if (action === 'start') await stop();
    process.exitCode = 1;
  } finally { await rm(lock, { recursive: true, force: true }); }
}
