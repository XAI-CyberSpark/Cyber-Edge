import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAssistantPlan, groundAssistantPlan, executeAssistantPlan, assistantSystemPrompt } from '../src/domain/cockpitAssistant';
import { VehicleWorld } from '../src/domain/vehicleWorld';

test('Assistant rejects unsupported actions, malformed output and every invalid parameter before execution', () => {
  for (const value of ['plain text', '{}', '{"kind":"payment"}', '{"kind":"climate","temperature":99,"on":true}', '{"kind":"climate","temperature":"23","on":true}', '{"kind":"windows","targets":{"rr":0,"unknown":100}}', '{"kind":"windows","targets":{"rr":-1}}', '{"kind":"windows","targets":{}}', '{"kind":"reply","text":""}']) assert.throws(() => parseAssistantPlan(value));
});
test('Creating a vehicle proposal does not execute an action', () => {
  const world = new VehicleWorld();
  const before = structuredClone(world.getSnapshot());
  parseAssistantPlan('{"kind":"climate","temperature":25,"on":true}');
  assert.deepEqual(world.getSnapshot(), before);
});
test('Greeting and clarification render as non-executable text', async () => {
  const world = new VehicleWorld();
  for (const kind of ['reply', 'clarify']) {
    const plan = parseAssistantPlan(JSON.stringify({ kind, text: '请告诉我具体是哪一扇车窗。' }));
    await assert.rejects(executeAssistantPlan(plan, world));
  }
});
test('Confirmed climate proposal changes shared state and reports actual temperature', async () => {
  const world = new VehicleWorld();
  const result = await executeAssistantPlan(parseAssistantPlan('{"kind":"climate","temperature":23,"on":true}'), world);
  assert.equal(result.success, true); assert.equal(world.getSnapshot().car.ac.temp, 23); assert.match(result.text, /23/);
});
test('Confirmed window failure never reports success, other windows retain actual outcomes', async () => {
  const world = new VehicleWorld();
  world.setCar(p => ({ ...p, windows: { fl: 100, fr: 100, rl: 100, rr: 100 } }));
  world.setFault('rr');
  const result = await executeAssistantPlan(parseAssistantPlan('{"kind":"windows","targets":{"fl":0,"rr":0}}'), world);
  assert.equal(result.success, false); assert.equal(world.getSnapshot().car.windows.fl, 0); assert.equal(world.getSnapshot().car.windows.rr, 100); assert.match(result.text, /右后窗/);
});
test('Assistant does not race an in-flight actuator', async () => {
  const world = new VehicleWorld();
  const motion = world.moveWindows({ rr: 100 }, 'manual', 200);
  await assert.rejects(executeAssistantPlan({kind:'climate', temperature:24, on:true}, world), /正在执行/);
  await motion;
  assert.equal(world.getSnapshot().car.ac.temp, 22);
});
test('Vehicle state supplied for follow-ups reflects current values', () => {
  const world = new VehicleWorld(); world.setCar(p => ({...p, ac:{...p.ac,temp:26}}));
  assert.match(assistantSystemPrompt(world.getSnapshot().car), /"temp":26/);
});

test('A guessed window becomes a clarification, even when the JSON is valid', () => {
  assert.equal(groundAssistantPlan({kind:'windows',targets:{rl:1}},'打开一点',[]).kind,'clarify');
  assert.equal(groundAssistantPlan({kind:'windows',targets:{rr:1}},'打开右后车窗',[]).kind,'clarify');
  assert.equal(groundAssistantPlan({kind:'windows',targets:{rr:100}},'打开右后车窗',[]).kind,'windows');
  assert.equal(groundAssistantPlan({kind:'windows',targets:{rr:1}},'右后窗开至1%',[]).kind,'windows');
});
