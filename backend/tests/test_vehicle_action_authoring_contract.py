"""Ordinary fixed-window nodes keep the actions contract across the full graph.

Inference is injected only at the external model boundary. The production TS
engine, branch evaluator and isolated vehicle all run; no API or user data is
read. Initial windows are prepared through graph actions, since the public trial
control registry does not register window controls.
"""
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from app.schemas.orchestration_schema import WorkflowGenerateRequestSchema
from app.schemas.project_schema import ProjectSchema
from app.services.connection_contract import connection_diagnostics
from app.services.flow_contract import FLOW_INSTRUCTIONS
from app.services.node_capability_service import authoring_catalog, validate_capabilities
from app.services.orchestration_service import OrchestrationService
from app.services.scenario_execution import execute_candidate
from app.services.scenario_builder import (
    BRIEF_INSTRUCTIONS, REVIEW_INSTRUCTIONS, ScenarioBrief, ScenarioBuilder, inspect_candidate,
)


ROOT = Path(__file__).resolve().parents[2]
INITIAL_WINDOWS = {'fl': 17, 'fr': 29, 'rl': 43, 'rr': 68}
BRIEF = {'title': '窗口动作契约', 'goal': '只关闭右后窗', 'requirements': [
    {'id': 'R1', 'description': '只关闭右后窗', 'acceptance': '右后窗关闭，其余车窗保持',
     'source_quote': '只关闭右后窗'}], 'experience_outline': ['授权后关闭右后窗'], 'questions': []}
COVERAGE = [{'requirement_id': 'R1', 'status': 'simulated',
             'node_ids': ['decide', 'authorized', 'close_rr', 'done'], 'note': '隔离车窗仿真'}]


def node(node_id, kind, **data):
    return {'id': node_id, 'type': kind, 'position': {'x': 0, 'y': 0}, 'data': data}


def edge(source, target, handle=None):
    return {'id': source + '-' + target + (handle or ''), 'source': source,
            'target': target, **({'sourceHandle': handle} if handle else {})}


def equal(path, value):
    return {'path': path, 'op': 'equals', 'value': value}


def project():
    nodes = [node('start', 'input', flowVersion=2)]
    edges = []
    previous = 'start'
    for area, (key, value) in enumerate(INITIAL_WINDOWS.items(), start=1):
        node_id = 'prepare_' + key
        nodes.append(node(node_id, 'car_control', action='windows', parameter='open_all', module='vehicleControl',
                          signalKey='WINDOW_POSITION', function='set', area=area,
                          targetStatus=value))
        edges.append(edge(previous, node_id))
        previous = node_id
    nodes.extend([
        node('command', 'wait', eventName='message', prompt='请输入指令。', match='any'),
        node('decide', 'llm', providerId='openai', model='gpt-test', outputFormat='actions',
             systemPrompt='仅在用户明确授权关闭右后窗时输出windows.close_all；'
                          '否定、询问或其他车窗不授权本图动作，返回action=none、actions=[]和回复。'),
        node('authorized', 'logic', logic_type='if',
             condition="input.actions.some(a => a.name === 'windows.close_all')"),
        node('close_rr', 'car_control', action='windows', parameter='close_all', module='vehicleControl', signalKey='WINDOW_POSITION',
             function='set', area=4, targetStatus=0),
        node('done', 'output', responseText='右后窗已关闭。'),
        node('no_action', 'output', responseText='{{outputs.decide.reply}}'),
        node('failed', 'fallback', joinMode='any', responseText='车窗操作未完成。'),
    ])
    edges.extend([
        edge(previous, 'command'), edge('command', 'decide'), edge('decide', 'authorized'),
        edge('authorized', 'close_rr', 'true'), edge('authorized', 'no_action', 'false'),
        edge('close_rr', 'done'), edge('decide', 'failed', 'error'),
        edge('close_rr', 'failed', 'error'),
    ])
    return {'id': 'vehicle-action-contract', 'name': 'vehicle-action-contract',
            'nodes': nodes, 'edges': edges, 'meta': {}}


def case(name, command, assertions, status='completed'):
    return {'name': name, 'steps': [
        {'input': '准备独立车辆', 'status': 'waiting', 'assertions': [
            equal(['car', 'windows'], INITIAL_WINDOWS),
            equal(['actions', 'length'], 4), equal(['nodes', 'command'], 'waiting'),
        ]},
        {'input': command, 'status': status, 'assertions': assertions},
    ]}


def no_movement(reply):
    return [equal(['car', 'windows'], INITIAL_WINDOWS), equal(['actions', 'length'], 4),
            equal(['hmi', 'message'], reply), equal(['nodes', 'close_rr'], 'skipped')]


def response(action, reply):
    return {'choices': [{'finish_reason': 'stop', 'message': {'role': 'assistant',
        'content': json.dumps({'action': action, 'actions': [] if action == 'none' else [
            {'name': action, 'parameters': {}}], 'reply': reply}, ensure_ascii=False)}}]}


def typescript_result(script):
    """Run a bundled production TS entry in a disposable test process."""
    node_bin = shutil.which('node')
    if not node_bin:
        raise AssertionError('Production graph tests require Node')
    with tempfile.TemporaryDirectory(prefix='oakegde-vehicle-contract-') as directory:
        bundle = str(Path(directory) / 'vehicle-contract.mjs')
        esbuild = (ROOT / 'studio/node_modules/esbuild/lib/main.js').as_uri()
        build_script = 'import {build} from ' + json.dumps(esbuild) + '; await build(' + json.dumps({
            'stdin': {'contents': script, 'resolveDir': str(ROOT / 'studio'), 'loader': 'ts'},
            'bundle': True, 'platform': 'node', 'format': 'esm', 'outfile': bundle,
            'tsconfig': str(ROOT / 'studio/tsconfig.app.json'),
            'define': {'import.meta.env.VITE_API_URL': '""'},
        }) + ');'
        built = subprocess.run([node_bin, '--input-type=module', '-e', build_script],
                               capture_output=True, text=True, encoding='utf-8', timeout=20)
        if built.returncode:
            raise AssertionError(built.stderr)
        executed = subprocess.run([node_bin, bundle], capture_output=True, text=True,
                                  encoding='utf-8', timeout=20)
        if executed.returncode:
            raise AssertionError(executed.stderr)
        return json.loads(executed.stdout)


class VehicleAuthoringGuidanceTests(unittest.TestCase):
    def test_fixed_window_fixture_passes_builder_inspection(self):
        errors, _, _ = inspect_candidate(ProjectSchema.model_validate(project()),
                                         ScenarioBrief.model_validate(BRIEF), COVERAGE)
        self.assertEqual(errors, [])

    def test_public_catalog_distinguishes_fixed_windows_from_json_binding_exceptions(self):
        # The public model-facing description must name the same ordinary-input
        # requirement as the machine-readable checker; fixed parameters do not
        # authorize a JSON route that the compiler rejects.
        catalog = authoring_catalog()
        ordinary = catalog['connection_contract']['consumers']['ordinary']
        self.assertEqual(ordinary['accepts'], ['actions'])
        car = catalog['nodes']['car_control']
        self.assertIn('outputFormat=actions', car['inputs'])
        self.assertIn('WINDOW_POSITION', car['description'])
        self.assertIn('outputFormat=actions', car['description'])
        self.assertIn('logic', car['description'])
        self.assertIn('JSON', car['inputs'])
        self.assertIn('HMI', car['inputs'])
        self.assertIn('MCP', catalog['nodes']['llm']['description'])

    def test_generated_and_general_flow_guidance_keep_ordinary_vehicle_actions_required(self):
        generated = OrchestrationService._build_messages(
            WorkflowGenerateRequestSchema(prompt='只关闭指定车窗'))[0]['content']
        for guidance in (generated, FLOW_INSTRUCTIONS):
            with self.subTest(guidance=guidance[:40]):
                self.assertIn('WINDOW_POSITION', guidance)
                self.assertIn('outputFormat=actions', guidance)
                self.assertIn('固定参数不改变', guidance)


class VehicleActionExecutionTests(unittest.IsolatedAsyncioTestCase):
    async def test_builder_checks_and_executes_fixed_rr_actions_graph(self):
        p = project()
        plan = {'cases': [case('仅rr关闭', '关闭右后窗', [
            equal(['car', 'windows'], {'fl': 17, 'fr': 29, 'rl': 43, 'rr': 0}),
            equal(['outputs', 'close_rr', 'action_result', 'requested'], {'rr': 0}),
            equal(['outputs', 'close_rr', 'action_result', 'success'], True),
            equal(['actions', 'length'], 5),
        ])]}
        candidate = {'project_name': '窗口动作契约', 'summary': '隔离仿真仅关闭右后窗',
                     'workflow': {k: p[k] for k in ('nodes', 'edges', 'meta')},
                     'requirement_coverage': COVERAGE, 'execution_plan': plan}

        async def complete(messages):
            if messages[0]['content'] == BRIEF_INSTRUCTIONS:
                return json.dumps(BRIEF, ensure_ascii=False)
            if messages[0]['content'] == REVIEW_INSTRUCTIONS:
                return json.dumps({'issues': [], 'strengths': []})
            return json.dumps(candidate, ensure_ascii=False)

        async def inference(_):
            return response('windows.close_all', '正在关闭右后窗。')

        async def executor(graph, tests):
            return await execute_candidate(graph, tests, inference=inference, source_root=ROOT)

        result = next(data for event, data in [item async for item in ScenarioBuilder(
            WorkflowGenerateRequestSchema(prompt='只关闭右后窗'), complete,
            executor=executor, max_attempts=1).events()] if event == 'result')
        report = result['build_report']
        self.assertTrue(report['can_apply'], result['validation'])
        self.assertTrue(report['runtime_verified'], report['execution'])
        self.assertEqual(report['trial_count'], 1)
        self.assertEqual(report['execution']['model_source'], 'injected_test_adapter')
        self.assertEqual(report['execution']['model_calls'], 1)
        self.assertEqual(report['execution']['artifact_sha256'], report['artifact_sha256'])
        self.assertFalse(any(n['data'].get('designOnly') for n in result['project']['nodes']))

    async def test_full_actions_graph_closes_only_rr_from_distinct_nonzero_positions(self):
        p = project()
        self.assertEqual(validate_capabilities(p['nodes'], p['edges'])[0], [])
        plan = {'cases': [case('仅rr关闭', '关闭右后窗', [
            equal(['car', 'windows'], {'fl': 17, 'fr': 29, 'rl': 43, 'rr': 0}),
            equal(['actions', 'length'], 5), equal(['nodes', 'close_rr'], 'success'),
            equal(['outputs', 'close_rr', 'action_result', 'requested'], {'rr': 0}),
            equal(['outputs', 'close_rr', 'action_result', 'success'], True),
            equal(['outputs', 'close_rr', 'action_result', 'actual'],
                  {'fl': 17, 'fr': 29, 'rl': 43, 'rr': 0}),
            equal(['hmi', 'message'], '右后窗已关闭。'),
        ])]}

        async def inference(_):
            return response('windows.close_all', '正在关闭右后窗。')

        report = await execute_candidate(p, plan, inference=inference, source_root=ROOT)
        self.assertEqual(report['status'], 'passed', report)
        self.assertTrue(report['runtime_verified'])
        self.assertEqual(report['model_calls'], 1)
        self.assertEqual(report['model_source'], 'injected_test_adapter')
        self.assertEqual(report['tool_calls'], 0)

    async def test_denial_question_and_other_window_do_not_authorize_fixed_rr(self):
        replies = {
            '不要关闭右后窗': '保持右后窗。',
            '右后窗现在关了吗': '右后窗尚未关闭。',
            '关闭左后窗': '本图只配置右后窗，未操作其他车窗。',
        }
        plan = {'cases': [case(command, command, no_movement(reply))
                          for command, reply in replies.items()]}

        async def inference(body):
            command = body['messages'][-1]['content']
            self.assertIn(command, replies)
            return response('none', replies[command])

        report = await execute_candidate(project(), plan, inference=inference, source_root=ROOT)
        self.assertEqual(report['status'], 'passed', report)
        self.assertEqual(report['model_calls'], 3)
        self.assertEqual(report['tool_calls'], 0)

    async def test_model_failure_routes_feedback_without_any_close_receipt(self):
        assertions = [equal(['car', 'windows'], INITIAL_WINDOWS), equal(['actions', 'length'], 4),
                      equal(['nodes', 'decide'], 'failed'), equal(['nodes', 'failed'], 'success'),
                      equal(['hmi', 'message'], '车窗操作未完成。'),
                      {'path': ['outputs', 'close_rr', 'action_result'], 'op': 'not_exists'}]

        async def inference(_):
            raise ValueError('确定性离线失败')

        report = await execute_candidate(project(), {'cases': [
            case('模型失败', '关闭右后窗', assertions, status='failed')
        ]}, inference=inference, source_root=ROOT)
        self.assertEqual(report['status'], 'passed', report)
        self.assertEqual(report['model_calls'], 1)
        self.assertEqual(report['cases'][0]['steps'][1]['status'], 'failed')

    async def test_json_cannot_gain_vehicle_action_authority_through_logic(self):
        p = project()
        llm = next(n for n in p['nodes'] if n['id'] == 'decide')
        llm['data'].update(outputFormat='json', outputFields={'authorized': 'boolean'})
        gate = next(n for n in p['nodes'] if n['id'] == 'authorized')
        gate['data']['condition'] = 'input.data.authorized === true'
        diagnostics = connection_diagnostics(p['nodes'], p['edges'])
        self.assertEqual(len(diagnostics), 1)
        self.assertEqual(diagnostics[0]['code'], 'GRAPH_CONNECTION_CONTRACT')
        self.assertEqual(diagnostics[0]['target_node_id'], 'close_rr')
        self.assertEqual([e['edge_id'] for e in diagnostics[0]['path']],
                         ['decide-authorized', 'authorized-close_rrtrue'])

        async def inference(_):
            self.fail('Protocol-invalid graphs must stop before model inference')

        report = await execute_candidate(p, {'cases': [{'name': 'JSON违约', 'steps': [
            {'input': '准备独立车辆', 'status': 'failed', 'assertions': [
                equal(['actions', 'length'], 0), equal(['car', 'windows'],
                      {'fl': 0, 'fr': 0, 'rl': 0, 'rr': 0})]}
        ]}]}, inference=inference, source_root=ROOT)
        self.assertEqual(report['status'], 'passed', report)
        self.assertEqual(report['model_calls'], 0)
        self.assertTrue(any('GRAPH_CONNECTION_CONTRACT' in n['error']
                            for n in report['cases'][0]['steps'][0]['failed_nodes']))


class VehicleConnectionParityTests(unittest.TestCase):
    def test_python_and_ts_report_same_json_route_and_accept_actions_route(self):
        graphs = []
        for fmt in ('json', 'actions'):
            p = project()
            llm = next(n for n in p['nodes'] if n['id'] == 'decide')
            llm['data']['outputFormat'] = fmt
            llm['data']['outputFields'] = {'authorized': 'boolean'}
            graphs.append(p)
        expected = [connection_diagnostics(p['nodes'], p['edges']) for p in graphs]
        fields = ['category', 'code', 'node_id', 'target_node_id', 'path',
                  'actual_contract', 'expected_contract', 'repairs']
        module = (ROOT / 'studio/src/domain/connectionContract.ts').as_posix()
        script = 'import {connectionDiagnostics} from ' + json.dumps(module) + ';\n'
        script += 'const graphs=' + json.dumps(graphs, ensure_ascii=False) + ';\n'
        script += 'console.log(JSON.stringify(graphs.map(g=>connectionDiagnostics(g.nodes,g.edges))));'
        actual = typescript_result(script)
        self.assertEqual([{k: d[k] for k in fields} for d in actual[0]],
                         [{k: d[k] for k in fields} for d in expected[0]])
        self.assertEqual(len(actual[0]), 1)
        self.assertEqual(actual[1], [])
        self.assertEqual(expected[1], [])

    def test_blocked_rr_receipt_keeps_positions_and_reports_failure_in_full_graph(self):
        # The normal trial interface has no vehicle fault control. Exercise the
        # same engine with the existing VehicleWorld fault API, without adding
        # test-only control fields to production.
        imports = {'GraphEngine': 'studio/src/utils/GraphEngine.ts',
                   'ScenarioSessions': 'studio/src/domain/scenarioSession.ts',
                   'VehicleWorld': 'studio/src/domain/vehicleWorld.ts'}
        script = '\n'.join('import {' + name + '} from ' + json.dumps((ROOT / path).as_posix()) + ';'
                           for name, path in imports.items())
        script += '\nconst project=' + json.dumps(project(), ensure_ascii=False) + ';\n'
        script += 'const modelResponse=' + json.dumps(response('windows.close_all', '请求关闭右后窗。'),
                                                     ensure_ascii=False) + ';\n'
        script += '''
const world=new VehicleWorld(), sessions=new ScenarioSessions(), actions=[], hmi={};
let modelCalls=0;
globalThis.fetch=async(url)=>{
    if(new URL(String(url)).pathname!=='/v1/inference/chat/completions')throw Error('Unexpected service');
    modelCalls++;return Response.json(modelResponse);
};
const callbacks={
    updateNodeStatus(){},updateKernel(){},updateMemory(){},updateSafety(){},updateMiddleware(){},log(){},
    getSimulatorState:()=>({car:world.getSnapshot().car,hmi,scenario:{weather:'sunny'}}),
    updateSimulatorState(category,key,value){if(category!=='hmi')throw Error('Unexpected state');hmi[key]=value;},
    executeWindowTargets:async(targets)=>{
        const result=await world.moveWindows(targets,'workflow',0);actions.push(result);return result;
    },
};
const run=(input,id)=>new GraphEngine(structuredClone(project.nodes),structuredClone(project.edges),callbacks,sessions).run(input,{eventId:id});
const prepared=await run('准备独立车辆','prepare');
const before=structuredClone(world.getSnapshot().car.windows);
world.setFault('rr');
const result=await run('关闭右后窗','blocked');
console.log(JSON.stringify({prepared:prepared.status,before,status:result.status,
    windows:world.getSnapshot().car.windows,actions,hmi,snapshot:sessions.flow.snapshot(),modelCalls,
    failedNodes:result.events.filter(e=>e.type==='node_failed')}));
'''
        result = typescript_result(script)
        self.assertEqual(result['prepared'], 'waiting')
        self.assertEqual(result['before'], INITIAL_WINDOWS)
        self.assertEqual(result['status'], 'failed', result)
        self.assertEqual(result['windows'], INITIAL_WINDOWS)
        self.assertEqual(result['modelCalls'], 1)
        self.assertEqual(len(result['actions']), 5)
        self.assertEqual(result['actions'][-1]['requested'], {'rr': 0})
        self.assertFalse(result['actions'][-1]['success'])
        self.assertEqual(result['actions'][-1]['failedWindows'], ['rr'])
        self.assertEqual(result['actions'][-1]['reason'], 'blocked')
        self.assertEqual(result['snapshot']['nodes']['close_rr'], 'failed')
        self.assertEqual(result['snapshot']['nodes']['failed'], 'success')
        self.assertEqual(result['snapshot']['nodes']['done'], 'skipped')
        self.assertEqual(result['hmi']['message'], '车窗操作未完成。')
