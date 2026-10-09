import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOpenSparXPlan, OPENSPARX_MODEL } from '../src/domain/opensparx';
import { GraphEngine, type GraphCallbacks } from '../src/utils/GraphEngine';
import { VehicleWorld } from '../src/domain/vehicleWorld';

const allowed = new Set(['windows.open_all', 'windows.close_all', 'hmi.reply']);
test('OpenSparX rejects invalid, missing and unsupported action plans', () => {
  for (const value of ['plain text', '{}', '{"reply":"ok"}', '{"reply":"ok","action":"fly"}', '{"reply":"ok","action":"none","confidence":2}']) assert.throws(() => parseOpenSparXPlan(value, allowed, 'open windows', false));
  const none = parseOpenSparXPlan('{"reply":"不执行","action":"none","actions":[]}', allowed, 'open windows', false);
  assert.equal(none.action, 'none');
  assert.deepEqual(none.actions, []);
});

function setup() {
  const world = new VehicleWorld(); const calls: string[] = [];
  const callbacks: GraphCallbacks = { showRearVideo: async () => 'opened',
    updateNodeStatus() {}, updateKernel() {}, updateMemory() {}, updateSafety() {}, updateMiddleware() {}, log() {}, updateSimulatorState() {},
    executeWindowAction: action => { calls.push(action); const n = action === 'open_all' ? 100 : 0; return world.moveWindows({fl:n,fr:n,rl:n,rr:n}, 'workflow', 0); },
  };
  const nodes: any[] = [{id:'in',type:'input',position:{x:0,y:0},data:{}}, {id:'llm',type:'llm',position:{x:0,y:0},data:{model:OPENSPARX_MODEL}}, {id:'car',type:'car_control',position:{x:0,y:0},data:{action:'windows.open_all'}}, {id:'out',type:'output',position:{x:0,y:0},data:{}}];
  const edges = [{id:'a',source:'in',target:'llm'}, {id:'b',source:'llm',target:'car'}, {id:'c',source:'car',target:'out'}];
  return { world, calls, engine: new GraphEngine(nodes, edges, callbacks) };
}

test('OpenSparX offline or malformed output blocks downstream vehicle execution', async t => {
  for (const response of [new Response('{}', {status:503}), new Response(JSON.stringify({model:OPENSPARX_MODEL,choices:[{message:{content:'not JSON'},finish_reason:'stop'}]}))]) {
    const f = setup(); t.mock.method(globalThis, 'fetch', async () => response);
    const result = await f.engine.run('open windows');
    assert.equal(result.status, 'failed'); assert.equal(f.calls.length, 0);
    t.mock.restoreAll();
  }
});

test('Context overflow reaches workflow feedback and never executes vehicle actions', async t => {
  const f = setup();
  const detail = '输入超出模型上下文上限（本次 4296 tokens，上限 4096 tokens）。请缩小图片或缩短提示词。';
  t.mock.method(globalThis, 'fetch', async () => Response.json({detail}, {status:422}));
  const result = await f.engine.run('打开车窗');
  assert.equal(result.status, 'failed');
  assert.equal(f.calls.length, 0);
  assert.ok(result.events.some(e => e.type === 'node_failed' && String(e.payload.error).includes(detail)));
});

test('Non-JSON service errors retain HTTP fallback feedback', async t => {
  const f = setup();
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>Unavailable</html>', {status:503}));
  const result = await f.engine.run('打开车窗');
  assert.equal(result.status, 'failed');
  assert.equal(f.calls.length, 0);
  assert.ok(result.events.some(e => e.type === 'node_failed' && String(e.payload.error).includes('HTTP 503')));
});

test('OpenSparX explicit none cannot trigger fixed or keyword vehicle fallback', async t => {
  const f = setup();
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({model:OPENSPARX_MODEL,choices:[{message:{content:'{"reply":"没有要执行的动作","action":"none","actions":[]}'},finish_reason:'stop'}]})));
  const result = await f.engine.run('do not open windows');
  assert.equal(result.status, 'completed'); assert.equal(f.calls.length, 0);
  assert.deepEqual(f.world.getSnapshot().car.windows, {fl:0,fr:0,rl:0,rr:0});
});

test('OpenSparX valid action uses real simulated actuator feedback including jam', async t => {
  const f = setup(); f.world.setFault('rr');
  t.mock.method(globalThis, 'fetch', async (_url: any, options: any) => {
    const request = JSON.parse(options.body); assert.equal(request.model,OPENSPARX_MODEL); assert.equal(request.json_mode,true);
    return new Response(JSON.stringify({model:OPENSPARX_MODEL,choices:[{message:{content:'{"reply":"正在打开车窗","action":"windows.open_all","actions":[{"name":"windows.open_all","parameters":{}}]}'},finish_reason:'stop'}]}));
  });
  const result = await f.engine.run('打开车窗');
  assert.equal(result.status,'failed'); assert.deepEqual(f.calls,['open_all']);
  assert.deepEqual(f.world.getSnapshot().car.windows,{fl:100,fr:100,rl:100,rr:0});
});

import childGraph from './fixtures/child-care-contract.json';

test('Explicit simulation text never reuses cached camera frame; child flow asks for an image', async t => {
  const graph = structuredClone(childGraph);
  (graph.nodes[0].data as any).lastImage = 'data:image/png;base64,cached';
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => { requests++; throw new Error('should not infer'); });
  const callbacks: GraphCallbacks = { showRearVideo: async () => 'opened', updateNodeStatus() {}, updateKernel() {}, updateMemory() {}, updateSafety() {}, updateMiddleware() {}, log() {}, getSimulatorState() {}, updateSimulatorState() {} };
  const result = await new GraphEngine(graph.nodes as any, graph.edges, callbacks).run('你好', { useCameraFrame: false });
  assert.equal(result.status, 'failed'); assert.equal(requests, 0);
  assert.ok(result.events.some(e => e.type === 'node_failed' && String(e.payload.error).includes('需要上传一张图片')));
  assert.equal(result.events.some(e => e.nodeId === 'recog_child_pose'), false);
});

for (const sample of [
  { status:'risk', confidence:0.95, branch:'cockpit_alert_once' },
  { status:'normal', confidence:0.95, branch:'child_normal_reply' },
  { status:'unknown', confidence:0, branch:'fallback_low_conf' },
  { status:'risk', confidence:0.4, branch:'fallback_low_conf' },
  { status:'normal', confidence:0.79, branch:'fallback_low_conf' },
  { status:'risk', confidence:0.8, branch:'cockpit_alert_once' },
  { status:'normal', confidence:0.8, branch:'child_normal_reply' },
  { status:'invalid', confidence:1, branch:'' },
]) test(`Saved child-care flow routes ${sample.status}/${sample.confidence} exclusively`, async t => {
  const messages: string[] = [];
  const callbacks: GraphCallbacks = { showRearVideo: async () => 'opened', updateNodeStatus() {}, updateKernel() {}, updateMemory() {}, updateSafety() {}, updateMiddleware() {}, log() {}, getSimulatorState() {}, updateSimulatorState(c,k,v) { if(c==='hmi' && k==='message') messages.push(v); } };
  const frame = 'data:image/png;base64,test-frame';
  t.mock.method(globalThis, 'fetch', async (_url:any, options:any) => {
    const req=JSON.parse(options.body);
    assert.equal(req.json_mode, true);
    assert.equal(req.messages[1].content[1].image_url.url, frame);
    const content = sample.status==='invalid' ? 'child_standing' : JSON.stringify({status:sample.status, confidence:sample.confidence, risk_action:'test', summary:'测试判断'});
    return new Response(JSON.stringify({model:OPENSPARX_MODEL,choices:[{message:{content},finish_reason:'stop'}]}));
  });
  const result = await new GraphEngine(childGraph.nodes as any, childGraph.edges, callbacks).run({type:'image',content:frame,text:'你好'}, {useCameraFrame:false});
  assert.equal(result.status, sample.branch ? 'completed' : 'failed');
  const branches = result.events.filter(e => e.type==='node_completed' && ['cockpit_alert_once','child_normal_reply','fallback_low_conf'].includes(e.nodeId || '')).map(e=>e.nodeId);
  assert.deepEqual(branches, sample.branch ? [sample.branch] : []);
  assert.equal(messages.some(m => /已解除|静默监测/.test(m)), false);
  assert.equal(messages.filter(Boolean).length, sample.branch === 'cockpit_alert_once' || !sample.branch ? 1 : 0, 'opened risk video and failures reach the HMI assistant');
  if (sample.branch === 'cockpit_alert_once') assert.equal(messages.filter(Boolean)[0], '检测到后排儿童可能存在危险，已显示后排画面。');
  const records = result.events.filter(e => e.type === 'node_completed' && e.nodeId === 'event_log_safety');
  assert.equal(records.length, sample.branch ? 1 : 0);
  assert.equal(result.events.some(e => e.nodeId === 'risk_monitor_5s' || e.nodeId === 'output_final'), false);
  if (sample.branch) {
    const record = (records[0].payload.output as any).event_record;
    assert.equal(record.outcome, sample.branch === 'fallback_low_conf' ? 'unknown' : sample.status);
    assert.equal(record.observed_status, sample.status);
    assert.equal(record.model_score, sample.confidence);
    assert.equal(record.model, OPENSPARX_MODEL);
    assert.equal(record.input_ref, `${result.runId}:input`);
    assert.equal(record.scope, 'current-session');
  } else assert.match(messages.at(-1)!, /本次分析失败，未得出儿童状态结论/);
});

test('Ordinary OpenSparX greeting reaches HMI without a visual schema', async t => {
  const messages: string[]=[];
  t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({model:OPENSPARX_MODEL,choices:[{message:{content:'你好，有什么可以帮你？'},finish_reason:'stop'}]})));
  const nodes:any[]=[{id:'in',type:'input',data:{inputType:'camera',lastImage:'data:image/png;base64,old'}},{id:'llm',type:'llm',data:{model:OPENSPARX_MODEL}},{id:'out',type:'output',data:{}}];
  const callbacks:GraphCallbacks={updateNodeStatus(){},updateKernel(){},updateMemory(){},updateSafety(){},updateMiddleware(){},log(){},getSimulatorState(){},updateSimulatorState(c,k,v){if(c==='hmi'&&k==='message')messages.push(v);}};
  const result=await new GraphEngine(nodes,[{id:'a',source:'in',target:'llm'},{id:'b',source:'llm',target:'out'}],callbacks).run('你好',{useCameraFrame:false});
  assert.equal(result.status,'completed'); assert.equal(messages.at(-1),'你好，有什么可以帮你？');
});

import { modelTestRequest, modelTestResponse } from '../src/domain/modelTest';
test('Standalone model test sends greeting or image without scenario prompts and rejects invalid responses', () => {
  const greeting=modelTestRequest(OPENSPARX_MODEL,'你好');
  assert.deepEqual(greeting.messages,[{role:'user',content:'你好'}]);
  assert.equal(greeting.json_mode,false);
  const picture=modelTestRequest(OPENSPARX_MODEL,'看图','data:image/png;base64,test');
  assert.equal((picture.messages[0].content as any[])[1].image_url.url,'data:image/png;base64,test');
  assert.throws(()=>modelTestRequest(OPENSPARX_MODEL,''));
  for(const response of [{}, {model:'other',choices:[{message:{content:'你好'}}]}, {model:OPENSPARX_MODEL,choices:[{message:{content:'partial'},finish_reason:'length'}]}]) assert.throws(()=>modelTestResponse(response,OPENSPARX_MODEL));
  assert.equal(modelTestResponse({model:OPENSPARX_MODEL,choices:[{message:{content:'你好'},finish_reason:'stop'}]},OPENSPARX_MODEL).content,'你好');
});



test('Saved project contract stays in sync and keeps no preset results or active legacy evidence', async () => {
  const { readFile } = await import('node:fs/promises');
  const saved = JSON.parse(await readFile('../backend/projects/儿童关怀.json', 'utf8'));
  // React Flow persists measured geometry; it is not part of the executable contract.
  const executableNodes = (nodes: any[]) => nodes.map(({measured: _measured, ...node}) => node);
  assert.deepEqual(executableNodes(saved.nodes), executableNodes(childGraph.nodes));
  assert.deepEqual(saved.edges, childGraph.edges);
  assert.deepEqual(saved.meta.runtime_runs, []);
  assert.ok(saved.meta.legacy_child_care_snapshot.runtime_runs.length);
  const recognition = saved.nodes.find((n: any) => n.type === 'recognition').data;
  for (const key of ['defaultResult', 'confidence', 'fallbackResult', 'fallbackConfidence']) assert.equal(key in recognition, false);
});

test('Child flow replaces previous risk image, keeps one record per run and surfaces outages separately', async t => {
  const hmi: Record<string, unknown> = {};
  const callbacks: GraphCallbacks = { showRearVideo: async () => 'opened', updateNodeStatus() {}, updateKernel() {}, updateMemory() {}, updateSafety() {}, updateMiddleware() {}, log() {}, getSimulatorState() {}, updateSimulatorState(c,k,v) { if(c==='hmi') hmi[k]=v; } };
  let status = 'risk';
  t.mock.method(globalThis, 'fetch', async () => status === 'offline' ? new Response('{}', {status:503}) : Response.json({model:OPENSPARX_MODEL,choices:[{message:{content:JSON.stringify({status,confidence:.95,risk_action:'test',summary:`evidence-${status}`})},finish_reason:'stop'}]}));
  const engine = new GraphEngine(childGraph.nodes as any, childGraph.edges, callbacks);
  for (const next of ['risk', 'normal', 'unknown', 'offline']) {
    status = next;
    const frame = `data:image/png;base64,${next}`;
    const result = await engine.run({type:'image',content:frame}, {useCameraFrame:false});
    assert.equal(result.status, next === 'offline' ? 'failed' : 'completed');
    if (next === 'offline') {
      assert.match(String(hmi.message), /本次分析失败/);
      assert.equal(hmi.care_frame, '');
      assert.equal(result.events.some(e=>e.type==='node_completed' && e.nodeId==='event_log_safety'), false);
    } else {
      assert.equal(hmi.care_frame, '');
      assert.equal(hmi.care_summary, '');
      assert.equal(hmi.message, next === 'risk' ? '检测到后排儿童可能存在危险，已显示后排画面。' : '');
      assert.equal((result.finalOutput as any).event_record.outcome, next);
      assert.equal(hmi.alert, next === 'risk' ? 'warning' : 'none');
    }
  }
});
