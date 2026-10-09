import json
import unittest
import subprocess
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from fastapi import HTTPException
from app.services.authoring_diagnostics import run_diagnostics,sanitize_run_diagnostics

def session(trace=None,brief=None,nodes=None):
    return SimpleNamespace(trace=trace or [],brief=brief,revision=2,project=SimpleNamespace(nodes=nodes or []))

class DiagnosticsTests(unittest.TestCase):
    def test_tool_status_classifies_rejection_without_raw_inputs(self):
        from app.services.authoring_diagnostics import tool_status
        data=tool_status('oakegde_delegate',{'error':'引用的成果不存在。', 'secret':'private'},session(brief=object()))
        self.assertEqual(data['rejection_code'],'unknown_artifact_reference')
        self.assertTrue(data['brief_registered'])
        self.assertNotIn('private',json.dumps(data))
        unknown=tool_status('oakegde_delegate',{'error':'private provider body'},session())
        self.assertEqual(unknown['rejection_code'],'tool_rejected')
        self.assertNotIn('private',json.dumps(unknown))

    def test_specialist_outcome_keeps_reason_but_not_private_response(self):
        from app.services.authoring_diagnostics import tool_status
        result=tool_status('oakegde_delegate',{'error':'子Agent未交付有效成果。','run':{
            'delivery_attempts':0,'model_outcome':{'failure_reason':'truncated','api_calls':1,'reasoning':'private'}}},session())
        self.assertEqual(result['specialist_outcome'],{'api_calls':1,'failure_reason':'truncated'})
        self.assertEqual(result['delivery_attempts'],0)
        self.assertNotIn('private',json.dumps(result))

    def test_sdk_failure_metadata_excludes_private_text_and_unknown_reason(self):
        raw={'completed':False,'failed':True,'api_calls':3,'failure_reason':'timeout','failure_retryable':True,
             'error':'synthetic-secret','messages':[{'content':'private reasoning'}],'final_response':'synthetic-secret'}
        result=run_diagnostics(raw,session())
        self.assertEqual(result['failure_reason'],'timeout')
        self.assertEqual(result['api_calls'],3)
        self.assertEqual(result['stage'],'before_brief')
        self.assertNotIn('synthetic-secret',json.dumps(result));self.assertNotIn('messages',result)
        self.assertNotIn('failure_reason',run_diagnostics({**raw,'failure_reason':'synthetic-secret'},session()))

    def test_wire_types_and_strings_are_allowlisted(self):
        self.assertEqual(sanitize_run_diagnostics({'api_calls':True,'revision':-1,'node_count':1.5,
            'tool_calls':1_000_001,'completed':'true','stage':'private','last_tool':'terminal','exception_type':'secret'}),{})
        self.assertEqual(sanitize_run_diagnostics(None),{})

    def test_stages_and_last_argument_failure_are_observations_not_inferred_cause(self):
        trace=[{'tool':'oakegde_patch_graph','ok':False,'result':{'argument_contracts':[{}],'error':'sensitive'}}]
        result=run_diagnostics({'completed':True},session(trace,brief=True))
        self.assertEqual(result['failed_tool_calls'],1)
        self.assertEqual(result['last_tool_error'],'argument_contract')
        self.assertEqual(result['stage'],'building_graph')
        self.assertNotIn('failure_reason',result)
        for tool,detail,stage in [('oakegde_inspect',{},'checking_graph'),('oakegde_trial',{'status':'failed'},'executing_graph'),
            ('oakegde_trial',{'status':'passed','content_review':{'status':'error'}},'reviewing_output'),('oakegde_submit',{},'submitting')]:
            result=run_diagnostics(None,session([{'tool':tool,'ok':True,'result':detail}],brief=True))
            self.assertEqual(result['stage'],stage)

    def test_exception_summary_never_copies_exception_message(self):
        result=run_diagnostics(None,session(),exception=RuntimeError('provider body with synthetic-secret'))
        self.assertEqual(result['termination'],'exception');self.assertEqual(result['exception_type'],'RuntimeError')
        self.assertNotIn('synthetic-secret',json.dumps(result))
        custom=type('synthetic_secret',(Exception,),{})
        self.assertEqual(run_diagnostics(None,session(),exception=custom())['exception_type'],'other')

class FailureMessageTests(unittest.TestCase):
    def test_intake_failure_explains_stage_without_copying_provider_text(self):
        from app.services.authoring_diagnostics import public_failure_message
        text=public_failure_message({'stage':'intake','failure_reason':'model_not_found','error':'private-secret'})
        self.assertIn('尚未进入场景构建',text)
        self.assertIn('配置的模型不可用',text)
        self.assertNotIn('private-secret',text)
        text=public_failure_message({'stage':'intake','completed':True})
        self.assertIn('未交付',text)
        self.assertNotIn('模型不可用',text)

class PublicStreamTests(unittest.IsolatedAsyncioTestCase):
    async def test_stream_keeps_human_message_and_revalidates_diagnostics(self):
        from app.api.orchestration import _stream_orchestration
        from app.schemas.orchestration_schema import WorkflowGenerateRequestSchema
        async def fail(_):
            raise HTTPException(503,{'code':'hermes_incomplete','message':'synthetic-secret',
                'diagnostics':{'api_calls':2,'failure_reason':'truncated','error':'synthetic-secret','messages':['private']}})
            yield
        with patch('app.api.orchestration.build_events',fail):
            output=''.join([v async for v in _stream_orchestration(WorkflowGenerateRequestSchema(prompt='test'))])
        self.assertIn('event: error',output)
        self.assertNotIn('synthetic-secret',output);self.assertNotIn('private',output)
        data=json.loads(output.split('data: ')[1]);self.assertEqual(data['diagnostics'],{'api_calls':2,'failure_reason':'truncated'})
        self.assertIn('未完成',data['message'])

class WorkerTests(unittest.TestCase):
    def test_actual_worker_reports_returned_failure_and_exception_without_sdk_text(self):
        backend=Path(__file__).resolve().parents[1]
        worker=backend/'app/agents/hermes_worker.py'
        for mode in ('returned','exception','truncated','invalid_response','empty_response','loop_error','interpreter_shutdown','session_busy'):
            with self.subTest(mode=mode),tempfile.TemporaryDirectory() as temp:
                root=Path(temp);runtime=root/'runtime';(runtime/'tools').mkdir(parents=True)
                (runtime/'tools/__init__.py').write_text('')
                (runtime/'tools/registry.py').write_text('''class Registry:
    def __init__(self):self.handlers={};self.toolsets={}
    def register(self, name, handler, **kwargs):self.handlers[name]=handler;self.toolsets[name]=kwargs["toolset"]
registry=Registry()
''')
                (runtime/'run_agent.py').write_text('''import json
from tools.registry import registry
class AIAgent:
    def __init__(self, **kwargs):
        self.model=kwargs['model'];self.base_url=kwargs['base_url'];self.valid_tool_names={name for name in registry.handlers if registry.toolsets[name] in kwargs['enabled_toolsets']}
    def _interruptible_api_call(self, kwargs):return {}
    def interrupt(self):pass
    def run_conversation(self, prompt, **kwargs):
        if self.valid_tool_names=={'oakegde_route_turn'}:
            registry.handlers['oakegde_route_turn']({'mode':'build','reply':''})
            return {'completed':True}
        prompt=json.loads(prompt)['latest_user_request']
        registry.handlers['oakegde_brief']({})
        if prompt=='exception':raise RuntimeError('synthetic-secret private provider body')
        return {'completed':False,'failed':True,'api_calls':2,'failure_reason':('rate_limit' if prompt=='returned' else prompt),'failure_retryable':True,
                'error':'synthetic-secret','messages':[{'content':'private reasoning'}],'final_response':'private response'}
    def close(self):pass
''')
                settings=root/'settings.json';settings.write_text(json.dumps({'anthropic':{'api_key':'synthetic-secret','model':'claude-test'}}))
                payload={'api_call_timeout_seconds':150,'request':{'prompt':mode,'provider_id':'anthropic','model':'claude-test'},
                    'backend_root':str(backend),'runtime_root':str(runtime),'settings_path':str(settings),'commit':'test-pinned',
                    'provider':{'id':'anthropic','model':'claude-test','base_url':'https://api.anthropic.com/v1','api_key':'synthetic-secret'}}
                proc=subprocess.run([sys.executable,str(worker)],input=json.dumps(payload),text=True,cwd=root,capture_output=True,timeout=15)
                self.assertEqual(proc.returncode,1 if mode=='exception' else 0)
                records=[json.loads(line) for line in proc.stdout.splitlines()]
                error=records[-1];self.assertEqual(error['type'],'error')
                diagnostic=error['data']['diagnostics'];self.assertEqual(diagnostic['termination'],'exception' if mode=='exception' else 'returned')
                self.assertEqual(diagnostic['last_tool'],'oakegde_brief')
                self.assertEqual(diagnostic['last_tool_error'],'argument_contract')
                self.assertEqual(diagnostic['failed_tool_calls'],1)
                if mode=='exception':self.assertEqual(diagnostic['exception_type'],'RuntimeError')
                else:self.assertEqual(diagnostic['failure_reason'],'rate_limit' if mode=='returned' else mode)
                self.assertNotIn('synthetic-secret',proc.stdout);self.assertNotIn('private reasoning',proc.stdout)
