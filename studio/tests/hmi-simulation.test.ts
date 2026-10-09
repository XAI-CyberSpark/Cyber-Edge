import './cockpit-assistant.test';
import './opensparx.test';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VehicleWorld } from '../src/domain/vehicleWorld';
import { GraphEngine, type GraphCallbacks } from '../src/utils/GraphEngine';
import { buildRainComfortScenario } from '../src/data/rainComfortScenario';

test('Actuator reports actual position, preserves a jammed window, then recovers', async () => {
  const world = new VehicleWorld();
  await world.moveWindows({ fl: 100, fr: 100, rl: 100, rr: 100 }, 'manual', 0);
  world.setFault('rr');
  const result = await world.moveWindows({ fl: 0, fr: 0, rl: 0, rr: 0 }, 'workflow', 0);
  assert.equal(result.success, false);
  assert.deepEqual(result.failedWindows, ['rr']);
  assert.deepEqual(result.actual, { fl: 0, fr: 0, rl: 0, rr: 100 });
  world.setFault(null);
  assert.equal((await world.moveWindows({ rr: 0 }, 'manual', 0)).success, true);
});

test('Reset cancels in-flight motion and competing commands cannot overwrite it', async () => {
  const world = new VehicleWorld();
  const moving = world.moveWindows({ fl: 100 }, 'manual', 80);
  assert.equal((await world.moveWindows({ fl: 0 }, 'workflow', 0)).reason, 'busy');
  world.reset();
  assert.equal((await moving).reason, 'cancelled');
  assert.equal(world.getSnapshot().car.windows.fl, 0);
  assert.equal(world.getSnapshot().moving, false);
  await assert.rejects(world.moveWindows({ fl: Number.NaN }, 'manual', 0));
});

function fixture(weather: string) {
  const world = new VehicleWorld();
  world.setCar(p => ({ ...p, windows: { fl: 100, fr: 100, rl: 100, rr: 100 } }));
  const messages: string[] = [];
  const calls: string[] = [];
  const callbacks: GraphCallbacks = { showRearVideo: async () => 'opened',
    updateNodeStatus() {}, updateKernel() {}, updateMemory() {}, updateSafety() {}, updateMiddleware() {}, log() {},
    getSimulatorState: () => ({ car: world.getSnapshot().car, scenario: { weather } }),
    updateSimulatorState: (category, key, value) => { if (category === 'hmi' && key === 'message') messages.push(value); },
    executeWindowAction: action => { calls.push(action); const value = action === 'close_all' ? 0 : 100; return world.moveWindows({ fl: value, fr: value, rl: value, rr: value }, 'workflow', 0); },
    executeWindowTargets: targets => world.moveWindows(targets, 'workflow', 0),
  };
  const graph = buildRainComfortScenario();
  return { world, messages, calls, callbacks, engine: new GraphEngine(graph.nodes, graph.edges, callbacks) };
}

test('Rain workflow closes windows and exclusively takes success branch', async () => {
  const f = fixture('rain'); const result = await f.engine.run('weather event');
  assert.equal(result.status, 'completed');
  assert.deepEqual(f.calls, ['close_all']);
  assert.deepEqual(f.world.getSnapshot().car.windows, { fl: 0, fr: 0, rl: 0, rr: 0 });
  assert.deepEqual(f.messages, ['检测到下雨，全部车窗已关闭。']);
  assert.equal(result.events.some(e => e.nodeId === 'rain-failure'), false);
});

test('Jammed actuator is a failed action, workflow still reaches failure feedback', async () => {
  const f = fixture('rain'); f.world.setFault('rr'); const result = await f.engine.run('weather event');
  assert.equal(result.status, 'failed');
  assert.equal(f.world.getSnapshot().car.windows.rr, 100);
  assert.equal(result.events.some(e => e.type === 'node_failed' && e.nodeId === 'rain-close'), true);
  assert.equal(result.events.some(e => e.nodeId === 'rain-success'), false);
  assert.equal(result.events.some(e => e.type === 'node_completed' && e.nodeId === 'rain-failure'), true);
  assert.equal(result.events.filter(e => e.type === 'node_failed').length, 1);
  assert.match(f.messages[0], /未能关闭/);
});

test('Edited car-control node applies the selected window and position', async () => {
  const f = fixture('rain');
  const graph = buildRainComfortScenario();
  const close = graph.nodes.find(n => n.id === 'rain-close')!;
  close.data = { ...close.data, module: 'vehicleControl', signalKey: 'WINDOW_POSITION', function: 'set', area: 4, targetStatus: 50 };
  const result = await new GraphEngine(graph.nodes, graph.edges, f.callbacks).run('event');
  assert.equal(result.status, 'completed');
  assert.deepEqual(f.world.getSnapshot().car.windows, { fl: 100, fr: 100, rl: 100, rr: 50 });
});

test('Clear weather and repeated rain with closed windows do not issue commands', async () => {
  const clear = fixture('clear'); await clear.engine.run('weather event'); assert.equal(clear.calls.length, 0);
  const closed = fixture('rain'); closed.world.setCar(p => ({ ...p, windows: { fl: 0, fr: 0, rl: 0, rr: 0 } }));
  await closed.engine.run('weather event'); assert.equal(closed.calls.length, 0);
});


test('Camera frame reaches inference; unavailable vision never triggers text-rule vehicle actions', async t => {
  const f = fixture('clear');
  let payload: any;
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => { payload = JSON.parse(String(init.body)); return new Response('unavailable', { status: 503 }); });
  const nodes = [
    { id: 'camera', type: 'input', position: { x: 0, y: 0 }, data: {} },
    { id: 'vision', type: 'llm', position: { x: 1, y: 0 }, data: { model: 'vision-test' } },
    { id: 'control', type: 'car_control', position: { x: 2, y: 0 }, data: { action: 'auto' } },
  ];
  const edges = [{ id: 'a', source: 'camera', target: 'vision' }, { id: 'b', source: 'vision', target: 'control' }];
  const frame = 'data:image/png;base64,aGVsbG8=';
  const result = await new GraphEngine(nodes, edges, f.callbacks).run({ type: 'image', content: frame, text: '后排摄像头 close windows' });
  assert.equal(payload.messages[1].content[1].image_url.url, frame);
  assert.equal(result.status, 'failed');
  assert.equal(f.calls.length, 0);
  assert.equal(result.events.some(e => e.nodeId === 'control'), false);
  assert.match(String(result.events.find(e => e.type === 'node_failed')?.payload.error), /图像推理/);
});

import { buildChildSafetyTemplate, createChildSafetyScenarioSpec, updateChildSafetyScenarioSpec } from '../src/data/childSafetyScenario';
for (const sample of [
  { label: 'risk', content: JSON.stringify({ status: 'risk', confidence: .96, risk_action: '儿童探窗', summary: '可见儿童身体探出车窗' }), expected: 'child_cockpit_alert' },
  { label: 'normal', content: JSON.stringify({ status: 'normal', confidence: .95, risk_action: '坐姿', summary: '儿童坐在座椅中' }), expected: 'child_normal' },
  { label: 'low confidence risk', content: JSON.stringify({ status: 'risk', confidence: .4, risk_action: '疑似站起', summary: '画面遮挡' }), expected: 'child_unknown' },
  { label: 'unknown', content: JSON.stringify({ status: 'unknown', confidence: .9, risk_action: '未知', summary: '无法看到座舱环境' }), expected: 'child_unknown' },
  { label: 'invalid JSON', content: '随便一个儿童都很危险', expected: null },
  { label: 'invalid confidence', content: JSON.stringify({ status: 'risk', confidence: 2, risk_action: '站起', summary: '儿童站起' }), expected: null },
]) {
  test(`Child care: ${sample.label} follows real model result, without default risk or car actions`, async t => {
    const f = fixture('clear');
    const graph = buildChildSafetyTemplate(createChildSafetyScenarioSpec());
    let payload: any;
    t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
      payload = JSON.parse(String(init.body));
      return Response.json({ model: payload.model, choices: [{ message: { content: sample.content }, finish_reason: 'stop' }] });
    });
    const frame = 'data:image/png;base64,aGVsbG8=';
    const result = await new GraphEngine(graph.nodes as any, graph.edges as any, f.callbacks).run({ type: 'image', content: frame });
    assert.equal(payload.messages[1].content[1].image_url.url, frame);
    assert.equal(result.status, sample.expected ? 'completed' : 'failed');
    const actions = result.events.filter(e => e.type === 'node_completed' && ['child_cockpit_alert','child_normal','child_unknown'].includes(e.nodeId || '')).map(e => e.nodeId);
    assert.deepEqual(actions, sample.expected ? [sample.expected] : []);
    assert.equal(f.calls.length, 0);
    assert.equal(f.messages.filter(Boolean).length, sample.expected === 'child_cockpit_alert' || !sample.expected ? 1 : 0);
    if (sample.expected === 'child_cockpit_alert') assert.equal(f.messages.filter(Boolean)[0], '检测到后排儿童可能存在危险，已显示后排画面。');
    assert.equal(result.events.filter(e => e.type === 'node_completed' && e.nodeId === 'child_event_log').length, sample.expected ? 1 : 0);
    assert.equal(f.messages.some(m => /已解除|静默监测/.test(m)), false);
    if (sample.expected === 'child_cockpit_alert') assert.ok(result.events.some(e => e.type === 'node_completed' && e.nodeId === 'child_video_display'));
  });
}
test('Child care rejects text-only input and unavailable vision', async t => {
  const f = fixture('clear');
  const graph = buildChildSafetyTemplate(createChildSafetyScenarioSpec());
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => { requests++; return new Response('offline', { status: 503 }); });
  for (const input of ['儿童探窗', { type: 'image', content: 'data:image/png;base64,aGVsbG8=' }]) {
    const result = await new GraphEngine(graph.nodes as any, graph.edges as any, f.callbacks).run(input);
    assert.equal(result.status, 'failed');
    assert.equal(result.events.some(e => e.nodeId === 'child_cockpit_alert'), false);
  }
  assert.equal(requests, 1);
});

test('Unsupported child scenario requests never claim connected realtime or temporal perception', () => {
  const {spec,changes} = updateChildSafetyScenarioSpec(createChildSafetyScenarioSpec(), '实时后排画面，持续哭泣，5秒后静默，不重复提醒');
  assert.equal(spec.displayMode, 'uploaded_frame');
  assert.equal(spec.triggerActions.includes('持续哭泣'), false);
  assert.match(changes.join(' '), /未接入/);
  const graph = buildChildSafetyTemplate(spec);
  assert.equal(graph.nodes.some(n => ['risk_monitor','output','car_control'].includes(n.type)), false);
  assert.equal(graph.edges.filter(e => e.target === 'child_event_log').length, 3);
});
