import assert from 'node:assert/strict';
import test from 'node:test';
import { createActionRequest, replayAction, uploadForm, draftChanges, canEnableConfiguration, createActionExecutor, isUncertainWrite } from '../src/pages/workbench/action-request.ts';

test('replaying an uncertain write retains exact request key and body', async () => {
  const bodies = [];
  const payload = { expectedWorkItemVersion: 7, replyText: '具体回复' };
  const request = createActionRequest('/write', payload);
  payload.replyText = '后续编辑';
  const send = async (path, init) => { bodies.push({ path, ...init }); return { status: 'ACCEPTED' }; };
  await replayAction(request, send);
  await replayAction(request, send);
  assert.equal(bodies[0].headers['Idempotency-Key'], bodies[1].headers['Idempotency-Key']);
  assert.equal(bodies[0].body, bodies[1].body);
  assert.equal(JSON.parse(bodies[0].body).replyText, '具体回复');
});
test('upload carries optimistic version and leaves byte content intact', () => {
  const file = new File(['abc'], 'proof.pdf', { type: 'application/pdf' });
  const form = uploadForm({ workItemId: 'w1', providerId: 'p1', rowVersion: 4 }, file, 'INSTALLATION_MATERIAL');
  assert.equal(form.get('expectedWorkItemVersion'), '4');
  assert.equal(form.get('workItemId'), 'w1');
  assert.equal(form.get('file').size, 3);
});
test('draft edit notes cover every changed business field and preserve unknown quantities', () => {
  const original = [{ installationItem: '管线', installedQuantity: null, unit: '米', materialSupplier: null, serviceScope: null }];
  const edited = [{ ...original[0], installedQuantity: 12, materialSupplier: '服务商' }];
  assert.deepEqual(draftChanges(original, edited, '已核对签字材料'), [
    { itemIndex: 0, field: 'installedQuantity', reason: '已核对签字材料' },
    { itemIndex: 0, field: 'materialSupplier', reason: '已核对签字材料' },
  ]);
  assert.equal(original[0].installedQuantity, null);
});
test('enable requires a passed trial for the current candidate and resolved questions', () => {
  const view = { candidateVersion: { versionId: 'v2' }, trial: { trialId: 't', configurationVersionId: 'v2', status: 'PASSED' }, openQuestions: [] };
  assert.equal(canEnableConfiguration(view), true);
  assert.equal(canEnableConfiguration({ ...view, trial: { ...view.trial, status: 'FAILED' } }), false);
  assert.equal(canEnableConfiguration({ ...view, trial: { ...view.trial, configurationVersionId: 'v1' } }), false);
  assert.equal(canEnableConfiguration({ ...view, openQuestions: [{ description: '未知含义' }] }), false);
});

test('concurrent repeated clicks issue one write and share its acceptance', async () => {
  let calls = 0;
  let finish;
  const executor = createActionExecutor(async () => { calls++; return new Promise((resolve) => { finish = resolve; }); });
  const request = createActionRequest('/write', { comment: '确认' });
  const first = executor.execute(request);
  const second = executor.execute(request);
  assert.equal(calls, 1);
  assert.equal(executor.isRunning(), true);
  finish({ status: 'ACCEPTED', operationId: 'op1' });
  assert.deepEqual(await first, await second);
  assert.equal(executor.isRunning(), false);
});
test('only uncertain writes lock editing; validation rejections allow correction', () => {
  assert.equal(isUncertainWrite({ httpStatus: 422, code: 42201 }), false);
  assert.equal(isUncertainWrite({ httpStatus: 403, code: 40301 }), false);
  assert.equal(isUncertainWrite({ httpStatus: 409, code: 40901 }), false);
  assert.equal(isUncertainWrite({ httpStatus: 409, code: 40903 }), true);
  assert.equal(isUncertainWrite({ httpStatus: 503, code: 50301 }), true);
  assert.equal(isUncertainWrite(new Error('network')), true);
});
