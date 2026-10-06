import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from '../../node_modules/esbuild/lib/main.js';
import { fileURLToPath } from 'node:url';
import { workItemsPath, workItemFiltersFromParams } from '../src/pages/workbench/work-item-filters.ts';

test('home overview separates actionable, waiting, processing and blocked work', async () => {
  const overview = await import('../src/pages/workbench/overview.ts').catch(() => ({}));
  assert.equal(typeof overview.buildOverviewCards, 'function');

  const cards = overview.buildOverviewCards({
    total: 14,
    byStatus: [
      { value: 'READY', count: 3 },
      { value: 'WAITING_SUPPLEMENT', count: 2 },
      { value: 'WAITING_REPLY', count: 1 },
      { value: 'PREPARING', count: 4 },
      { value: 'PROCESSING', count: 2 },
      { value: 'EXCEPTION', count: 1 },
      { value: 'BLOCKED', count: 1 },
    ],
    byKind: [],
    asOf: '2026-09-21T00:00:00Z',
  });

  assert.deepEqual(cards.map((card) => [card.key, card.value]), [
    ['actionable', 3],
    ['waiting', 3],
    ['processing', 6],
    ['blocked', 2],
  ]);
});

test('overview links preserve exact groups, including empty groups, through route parsing and reload', async () => {
  const { buildOverviewCards } = await import('../src/pages/workbench/overview.ts');
  const bundle = await build({ entryPoints: [fileURLToPath(new URL('../src/router.tsx', import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false });
  const { parseHash } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
  const cards = buildOverviewCards({ total: 0, byStatus: [], byKind: [], asOf: '' });
  assert.equal(cards.length, 4);
  for (const card of cards) {
    assert.equal(card.value, 0);
    const route = parseHash('#' + workItemsPath({ responsibility: 'MINE', status: card.statuses.join(',') }));
    assert.equal(route.name, 'work-items');
    const filters = workItemFiltersFromParams(route.params);
    assert.equal(filters.responsibility, 'MINE');
    assert.deepEqual(filters.status.split(','), card.statuses);
    assert.equal(filters.page, 1);
    assert.equal(filters.pageSize, 10);
    assert.deepEqual(workItemFiltersFromParams(parseHash('#' + workItemsPath({ ...filters, page: 2 })).params), { ...filters, page: 2 });
  }
  assert.equal(workItemFiltersFromParams(parseHash('#/work-items').params).status, undefined);
  assert.equal(parseHash('#/work-items/INSTALLATION_REVIEW/w-1').params.id, 'w-1');
  const search = { responsibility: 'VISIBLE', keyword: '京东 & 充电桩', status: 'BLOCKED', page: 3, pageSize: 20 };
  const reloaded = workItemFiltersFromParams(parseHash('#' + workItemsPath(search)).params);
  assert.equal(reloaded.keyword, search.keyword);
  assert.equal(reloaded.responsibility, 'VISIBLE');
  assert.equal(reloaded.page, 3);
});
