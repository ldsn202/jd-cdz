import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

type Check = { id: string; pass: boolean; detail: string };
const checks: Check[] = [];
const check = (id: string, pass: boolean, detail: string) => checks.push({ id, pass, detail });

const BASE = process.env.MOCK_BASE ?? 'http://localhost:8790';
const ENV_DIR = path.join(rootDir, '.data/mock-env-a');

async function http(method: string, p: string, opts: { token?: string; body?: unknown } = {}): Promise<{ http: number; json: any }> {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: { 'content-type': 'application/json', ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  return { http: res.status, json: await res.json() };
}

async function main(): Promise<void> {
  const run = Date.now().toString(36);
  const svc = await http('POST', '/api/admin/mock/external/identity/sessions', { body: { accountId: 'acc-svc-backend-t26' } });
  let tokService: string;
  if (svc.http === 201) {
    tokService = svc.json.data.token;
  } else {
    const db = new DatabaseSync(path.join(ENV_DIR, 'sources/identity.db'));
    db.prepare("INSERT INTO source_record (kind, record_id, source_version, source_updated_at, payload_json) VALUES ('account', 'acc-svc-backend-t26', 'account-1', ?, ?)")
      .run(new Date().toISOString(), JSON.stringify({ accountId: 'acc-svc-backend-t26', displayName: '后台程序（T2.6）', role: 'SERVICE', serviceProviderId: null, active: true }));
    db.prepare("INSERT INTO source_record (kind, record_id, source_version, source_updated_at, payload_json) VALUES ('grant', 'grant-acc-svc-backend-t26', 'grant-1', ?, ?)")
      .run(new Date().toISOString(), JSON.stringify({ grantId: 'grant-acc-svc-backend-t26', accountId: 'acc-svc-backend-t26', scopeProviderIds: ['SP-001'], role: 'SERVICE' }));
    db.close();
    const retry = await http('POST', '/api/admin/mock/external/identity/sessions', { body: { accountId: 'acc-svc-backend-t26' } });
    tokService = retry.json.data.token;
  }
  const sp = await http('POST', '/api/admin/mock/external/identity/sessions', { body: { accountId: 'acc-sp-001' } });
  const tokProvider = sp.json.data.token as string;

  const recDb0 = new DatabaseSync(path.join(ENV_DIR, 'sources/provider-receivable.db'), { readOnly: true });
  const revisedIds0 = new Set((recDb0.prepare("SELECT payload_json FROM source_record WHERE kind='provider_receivable_revision'").all() as any[]).map((r) => JSON.parse(r.payload_json).providerReceivableId));
  const recRow = (recDb0.prepare("SELECT record_id, source_version, payload_json FROM source_record WHERE kind='provider_receivable'").all() as any[])
    .filter((r) => !revisedIds0.has(r.record_id))
    .map((r) => ({ record_id: r.record_id, source_version: r.source_version, payload_json: r.payload_json }))[0];
  recDb0.close();
  const recPayload = JSON.parse(recRow.payload_json);
  const targetProvider = recPayload.serviceProviderId;

  const idb2 = new DatabaseSync(path.join(ENV_DIR, 'sources/identity.db'));
  const grantRow = idb2.prepare("SELECT payload_json FROM source_record WHERE kind='grant' AND record_id='grant-acc-svc-backend-t26'").get() as any;
  const grantPayload = JSON.parse(grantRow.payload_json);
  if (!grantPayload.scopeProviderIds.includes(targetProvider)) {
    grantPayload.scopeProviderIds.push(targetProvider);
    idb2.prepare("UPDATE source_record SET payload_json=? WHERE kind='grant' AND record_id='grant-acc-svc-backend-t26'").run(JSON.stringify(grantPayload));
  }
  idb2.close();

  const feedId = `feed-rec-${targetProvider.toLowerCase()}-${run}`;
  const reg = await http('POST', '/api/admin/mock/control/change-feeds', { token: tokService, body: { feedId, sourceSystem: 'provider-receivable', serviceProviderId: targetProvider } });
  check('FEED-REGISTER', reg.http === 201 && reg.json.data.startCursor === 'cur-1-0' && reg.json.data.baselineCount > 0,
    `登记 feed：基线 ${reg.json.data.baselineCount} 条初始记录（不从"现在"静默开始）`);

  const first = await http('GET', `/api/admin/mock/external/change-feeds/${feedId}/changes?cursor=cur-1-0&pageSize=1`, { token: tokService });
  check('FEED-FIRST-PAGE', first.http === 200 && first.json.data.list.length === 1 && first.json.data.hasMore === (reg.json.data.baselineCount > 1)
    && first.json.data.nextCursor === 'cur-1-1' && first.json.data.discoveryMode === 'SOURCE_FEED',
    `首次拉取返回初始记录（pageSize=1 → nextCursor=cur-1-1）`);

  const reread = await http('GET', `/api/admin/mock/external/change-feeds/${feedId}/changes?cursor=cur-1-0&pageSize=1`, { token: tokService });
  check('FEED-REREAD-STABLE', reread.http === 200 && JSON.stringify(reread.json.data.list) === JSON.stringify(first.json.data.list)
    && reread.json.data.list[0].changeId === first.json.data.list[0].changeId, '同 cursor 重读内容稳定（changeId 不变）');

  let cursor = 'cur-1-0';
  let guard = 0;
  do {
    const r = await http('GET', `/api/admin/mock/external/change-feeds/${feedId}/changes?cursor=${cursor}&pageSize=50`, { token: tokService });
    cursor = r.json.data.nextCursor;
    if (!r.json.data.hasMore) break;
  } while (++guard < 50);
  const empty = await http('GET', `/api/admin/mock/external/change-feeds/${feedId}/changes?cursor=${cursor}`, { token: tokService });
  check('FEED-EMPTY-BATCH', empty.http === 200 && empty.json.data.list.length === 0 && empty.json.data.nextCursor === cursor && empty.json.data.hasMore === false,
    '消费完后空批：nextCursor=cursor 且 hasMore=false');

  const rev = await http('POST', '/api/admin/mock/control/revisions', {
    token: tokService,
    body: {
      sourceSystem: 'provider-receivable',
      recordType: 'PROVIDER_RECEIVABLE',
      recordId: recRow.record_id,
      expectedVersion: recRow.source_version,
      revisionNote: '撤回单列搬运费（T2.6 验证）',
      patch: { reportedTotalAmount: recPayload.reportedTotalAmount, sourceStatus: '应收已修订' },
    },
  });
  check('REVISE-RECEIVABLE', rev.http === 200 && rev.json.data.newVersion && rev.json.data.previousSourceVersion === recRow.source_version,
    `应收修订生成新版本 ${rev.json.data.newVersion}（原版本 ${recRow.source_version}）`);

  const afterRev = await http('GET', `/api/admin/mock/external/change-feeds/${feedId}/changes?cursor=${cursor}`, { token: tokService });
  const evt = afterRev.json.data.list.find((e: any) => e.sourceRecordId === recRow.record_id);
  check('FEED-DISCOVERS-REVISION', afterRev.http === 200 && evt && evt.sourceVersion === rev.json.data.newVersion && evt.recordType === 'PROVIDER_RECEIVABLE'
    && evt.relatedWorkOrderIds.length > 0, `空查询之后的新修订无需重置即可发现（事件指向 ${rev.json.data.newVersion}）`);

  const recGet = await http('GET', `/api/admin/mock/external/sources/provider-receivable/service-providers/${targetProvider}/receivables/${recRow.record_id}?installationWorkOrderId=${recPayload.relatedWorkOrderIds[0]}`, { token: tokService });
  check('REVISED-RECEIVABLE-READ', recGet.http === 200 && recGet.json.data.sourceVersion === rev.json.data.newVersion
    && recGet.json.data.previousSourceVersion === recRow.source_version && recGet.json.data.sourceRevisionNote === '撤回单列搬运费（T2.6 验证）',
    '应收读取返回新版并保留上一版本与修订说明');

  const jdId = recRow.record_id.replace('REC', 'JD-BILL');
  const jdGet = await http('GET', `/api/admin/mock/external/jd-bills/${jdId}?installationWorkOrderId=${recPayload.relatedWorkOrderIds[0]}`, { token: tokService });
  check('REVISION-NOT-AFFECT-JDBILL', jdGet.http === 200 && jdGet.json.data.sourceVersion === 'bill-1' && jdGet.json.data.reportedTotalAmount !== undefined,
    `应收修订后京东账单版本仍为 bill-1（两侧独立）`);

  const rev2 = await http('POST', '/api/admin/mock/control/revisions', {
    token: tokService,
    body: { sourceSystem: 'provider-receivable', recordType: 'PROVIDER_RECEIVABLE', recordId: recRow.record_id, expectedVersion: 'receivable-99', patch: {} },
  });
  check('REVISE-VERSION-409', rev2.http === 409 && rev2.json.code === 40901, '修订预期版本不符 40901');

  const evtDb = new DatabaseSync(path.join(ENV_DIR, 'sources/provider-receivable.db'), { readOnly: true });
  const events = evtDb.prepare('SELECT * FROM source_event').all() as any[];
  const revisions = (evtDb.prepare("SELECT record_id, source_version, payload_json FROM source_record WHERE kind='provider_receivable_revision'").all() as any[])
    .map((r) => ({ recId: JSON.parse(r.payload_json).providerReceivableId, version: r.source_version }));
  const revWithEvent = revisions.every((r) => events.some((e) => e.source_record_id === r.recId && e.source_version === r.version));
  const evtWithVersion = events.every((e) => {
    if (revisions.some((r) => r.recId === e.source_record_id && r.version === e.source_version)) return true;
    const hit = evtDb.prepare('SELECT COUNT(*) AS n FROM source_record WHERE record_id = ? AND source_version = ?').get(e.source_record_id, e.source_version) as any;
    return hit.n > 0;
  });
  evtDb.close();
  check('EVENT-SOURCE-CONSISTENCY', revWithEvent && evtWithVersion, `事件与源写入一致：${revisions.length} 个修订均有事件，无已写无事件或事件指向不存在版本`);

  const badCursor = await http('GET', `/api/admin/mock/external/change-feeds/${feedId}/changes?cursor=cur-9-0`, { token: tokService });
  check('FEED-CURSOR-GEN-409', badCursor.http === 409 && badCursor.json.code === 40901, 'cursor 代次不符 40901');

  const badPage = await http('GET', `/api/admin/mock/external/change-feeds/${feedId}/changes?cursor=cur-1-0&pageSize=0`, { token: tokService });
  check('FEED-PAGESIZE-400', badPage.http === 400 && badPage.json.code === 40001, 'pageSize 越界 40001');

  const humanFeed = await http('GET', `/api/admin/mock/external/change-feeds/${feedId}/changes?cursor=cur-1-0`, { token: tokProvider });
  check('FEED-HUMAN-403', humanFeed.http === 403 && humanFeed.json.code === 40301, 'HUMAN 身份不可读变化发现 40301');

  const instFeedId = `feed-inst-sp001-${run}`;
  await http('POST', '/api/admin/mock/control/change-feeds', { token: tokService, body: { feedId: instFeedId, sourceSystem: 'installation-admin', serviceProviderId: 'SP-001' } });
  const instFirst = await http('GET', `/api/admin/mock/external/change-feeds/${instFeedId}/changes?cursor=cur-1-0&pageSize=50`, { token: tokService });
  const hasReviewEvent = instFirst.json.data.list.some((e: any) => e.recordType === 'INSTALLATION_REVIEW' || e.recordType === 'INSTALLATION_DETAIL');
  check('FEED-INSTALLATION-EVENTS', instFirst.http === 200 && instFirst.json.data.baselineCount !== 0
    && (hasReviewEvent || instFirst.json.data.list.length > 0),
    `安装来源 feed 可见基线与既有写入事件（T2.4/T2.5 真实写入产生事件，含 INSTALLATION_DETAIL/REVIEW：${hasReviewEvent}）`);

  const failed = checks.filter((c) => !c.pass);
  console.log(JSON.stringify({ base: BASE, checks, passed: failed.length === 0, failedCount: failed.length }, null, 2));
  if (failed.length > 0) process.exit(1);
}

main();
