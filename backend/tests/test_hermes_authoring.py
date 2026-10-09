import asyncio
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch, AsyncMock, Mock
from fastapi import HTTPException
from app.schemas.orchestration_schema import WorkflowGenerateRequestSchema
from app.services.hermes_authoring import EngineConfig,hermes_events,configured_engine,SDK_COMMIT
from app.services.model_providers import Provider

TOOLS=['oakegde_capabilities','oakegde_read_graph','oakegde_brief','oakegde_patch_graph','oakegde_test_plan','oakegde_inspect','oakegde_trial','oakegde_submit']
RESPONSE={'project_name':'test','project':{'id':'test','name':'test','nodes':[],'edges':[]},'documentation_markdown':'test',
          'validation':{'passed':False,'errors':['fixture'],'warnings':[]},'build_report':{'can_apply':False,'engine':'hermes'},
          'provider':{'id':'anthropic','model':'claude-test'},'used_live_model':False}
PROVIDER=Provider('anthropic','test','https://api.anthropic.com/v1','claude-test','synthetic-secret')

class TransportTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.worker=self.root/'worker.py'
        self.config=EngineConfig(engine='hermes',runtime_root=str(self.root),python=sys.executable)
        self.resolver=patch('app.services.hermes_authoring.model_providers.resolve',return_value=PROVIDER);self.resolver.start()
    def tearDown(self):self.resolver.stop();self.temp.cleanup()
    def write_worker(self,tail):
        self.worker.write_text('import json,sys,os,time\ninit=json.loads(sys.stdin.readline())\n'+tail)
    async def events(self,**kwargs):
        return [e async for e in hermes_events(WorkflowGenerateRequestSchema(prompt='test',provider_id='anthropic'),self.config,worker=self.worker,verify=False,**kwargs)]
    async def test_real_process_protocol_and_secret_environment_not_inherited(self):
        ready={'type':'ready','data':{'tools':TOOLS,'commit':SDK_COMMIT}}
        self.write_worker("assert 'UNRELATED_PROVIDER_SECRET' not in os.environ\nassert init['provider']['api_key']=='synthetic-secret'\n"+f'print({json.dumps(json.dumps(ready))},flush=True)\n'+f'print({json.dumps(json.dumps({"type":"result","data":RESPONSE}))},flush=True)\n')
        with patch.dict(os.environ,{'UNRELATED_PROVIDER_SECRET':'must-not-inherit'}):events=await self.events()
        result=next(d for e,d in events if e=='result')
        self.assertEqual(result['provider']['model'],'claude-test')
        self.assertNotIn('synthetic-secret',json.dumps(events))
    async def test_discussion_transport_never_saves_even_when_requested(self):
        from app.schemas.project_schema import ProjectSchema
        current=ProjectSchema(id='keep',name='keep',meta={'build_report':{'old':'preserve'}})
        ready={'type':'ready','data':{'tools':['oakegde_route_turn'],'commit':SDK_COMMIT,'phase':'intake'}}
        response={**RESPONSE,'project':current.model_dump(),'chat_reply':'先讨论乘客与旅程。',
                  'build_report':{'status':'discussion','can_apply':False}}
        self.write_worker(f'print({json.dumps(json.dumps(ready))},flush=True)\n'+f'print({json.dumps(json.dumps({"type":"result","data":response}))},flush=True)\n')
        request=WorkflowGenerateRequestSchema(prompt='先讨论',provider_id='anthropic',current_project=current,save_on_success=True)
        with patch('app.services.hermes_authoring.ProjectService.save_project') as save:
            events=[e async for e in hermes_events(request,self.config,worker=self.worker,verify=False)]
        save.assert_not_called()
        self.assertEqual(events[-1][1]['project'],current.model_dump())
        self.assertEqual(events[-1][1]['chat_reply'],response['chat_reply'])

    async def test_intake_cannot_return_graph_or_claim_apply_permission(self):
        ready={'type':'ready','data':{'tools':['oakegde_route_turn'],'commit':SDK_COMMIT,'phase':'intake'}}
        for response in [RESPONSE,{**RESPONSE,'chat_reply':'pretend','build_report':{'status':'discussion','can_apply':True}},
                         {**RESPONSE,'chat_reply':'pretend','project':{'id':'x','name':'x','nodes':[{'id':'injected'}]},
                          'build_report':{'status':'discussion','can_apply':False}}]:
            with self.subTest(response=response):
                self.write_worker(f'print({json.dumps(json.dumps(ready))},flush=True)\n'+f'print({json.dumps(json.dumps({"type":"result","data":response}))},flush=True)\n')
                with self.assertRaises(HTTPException):await self.events()

    async def test_intake_handoff_accepts_authoring_surface_only_once(self):
        intake={'type':'ready','data':{'tools':['oakegde_route_turn'],'commit':SDK_COMMIT,'phase':'intake'}}
        authoring={'type':'ready','data':{'tools':TOOLS,'commit':SDK_COMMIT,'phase':'authoring'}}
        lines=[intake,authoring,{'type':'result','data':RESPONSE}]
        self.write_worker(''.join(f'print({json.dumps(json.dumps(message))},flush=True)\n' for message in lines))
        self.assertEqual((await self.events())[-1][0],'result')
        self.write_worker(''.join(f'print({json.dumps(json.dumps(message))},flush=True)\n' for message in [intake,authoring,intake]))
        with self.assertRaises(HTTPException):await self.events()

    async def test_team_transport_matches_mode_and_exact_tool_surface(self):
        names=[n for n in TOOLS if n not in ('oakegde_brief','oakegde_patch_graph','oakegde_test_plan')]+['oakegde_delegate','oakegde_apply_artifact']
        self.config.agent_mode='team'
        ready={'type':'ready','data':{'tools':names,'commit':SDK_COMMIT,'agent_mode':'team'}}
        self.write_worker("assert init['agent_mode']=='team'\n"+f'print({json.dumps(json.dumps(ready))},flush=True)\n'+f'print({json.dumps(json.dumps({"type":"result","data":RESPONSE}))},flush=True)\n')
        self.assertTrue(any(e=='result' for e,d in await self.events()))
        ready['data']['agent_mode']='single'
        self.write_worker(f'print({json.dumps(json.dumps(ready))},flush=True)\n')
        with self.assertRaises(HTTPException):await self.events()
    async def test_rejection_log_never_includes_worker_private_text(self):
        messages=[{'type':'ready','data':{'tools':TOOLS,'commit':SDK_COMMIT}},
            {'type':'tool_status','data':{'tool':'oakegde_read_graph','ok':False,
                'rejection_code':'argument_contract','error':'synthetic-secret'}},
            {'type':'result','data':RESPONSE}]
        self.write_worker(''.join(f'print({json.dumps(json.dumps(m))},flush=True)\n' for m in messages))
        with self.assertLogs('app.services.hermes_authoring',level='WARNING') as captured:
            await self.events()
        self.assertIn('argument_contract',str(captured.output))
        self.assertNotIn('synthetic-secret',str(captured.output))

    async def test_bad_tool_surface_and_unverified_result_are_rejected(self):
        for names in [TOOLS+['terminal'],[]]:
            self.write_worker(f'print({json.dumps(json.dumps({"type":"ready","data":{"tools":names,"commit":SDK_COMMIT}}))},flush=True)\n')
            with self.assertRaises(HTTPException):await self.events()
        self.write_worker(f'print({json.dumps(json.dumps({"type":"result","data":RESPONSE}))},flush=True)\n')
        with self.assertRaises(HTTPException):await self.events()
    async def test_worker_error_exposes_only_allowlisted_terminal_diagnostics(self):
        message={'type':'error','data':{'message':'synthetic-secret','trace':[{'private':'synthetic-secret'}],
            'diagnostics':{'completed':False,'api_calls':3,'failure_reason':'rate_limit','stage':'before_brief',
                'error':'synthetic-secret','last_tool':'terminal'}}}
        self.write_worker(f'print({json.dumps(json.dumps(message))},flush=True)\n')
        with self.assertRaises(HTTPException) as error:await self.events()
        self.assertEqual(error.exception.status_code,503)
        detail=error.exception.detail
        self.assertEqual(detail['diagnostics'],{'completed':False,'api_calls':3,'failure_reason':'rate_limit','stage':'before_brief'})
        self.assertEqual(detail['code'],'hermes_incomplete');self.assertNotIn('synthetic-secret',json.dumps(detail))
    async def test_group_signal_denied_falls_back_to_owned_worker_and_preserves_error(self):
        if os.name == 'nt': self.skipTest('POSIX process group check')
        process = Mock(returncode=None, pid=12345)
        process.stdin.drain = AsyncMock()
        process.stdout.readline = AsyncMock(return_value=b'{"type":"ready","data":{"tools":[]}}\n')
        process.wait = AsyncMock(return_value=-9)
        with patch('app.services.hermes_authoring.asyncio.create_subprocess_exec', AsyncMock(return_value=process)), \
             patch('app.services.hermes_authoring.os.killpg', side_effect=PermissionError('denied')):
            with self.assertRaises(HTTPException) as error:
                await self.events()
        self.assertEqual(error.exception.status_code, 503)
        process.kill.assert_called_once_with()
        process.wait.assert_awaited_once()

    async def test_malformed_worker_envelopes_return_controlled_error(self):
        for message in [None, [], {'type':'thinking','data':None},
                        {'type':'ready','data':{'tools':None}},
                        {'type':'ready','data':{'tools':[{}]}}]:
            with self.subTest(message=message):
                self.write_worker(f'print({json.dumps(json.dumps(message))},flush=True)\n')
                with self.assertRaises(HTTPException) as error:
                    await self.events()
                self.assertEqual(error.exception.status_code, 503)
    async def test_process_timeout_kills_child_group(self):
        if os.name=='nt':self.skipTest('POSIX process group check')
        pidfile=self.root/'child.pid'
        self.write_worker(f"import subprocess\np=subprocess.Popen([sys.executable,'-c','import time;time.sleep(60)'])\nopen({str(pidfile)!r},'w').write(str(p.pid))\ntime.sleep(60)\n")
        with self.assertRaises(HTTPException) as error:await self.events(timeout=.5)
        self.assertIn('时间预算',str(error.exception.detail))
        pid=int(pidfile.read_text())
        # Give the OS a short scheduling interval to reap the killed grandchild.
        for _ in range(20):
            try:os.kill(pid,0)
            except ProcessLookupError:break
            await asyncio.sleep(.02)
        else:self.fail('child remained after timeout')
    async def test_cancellation_closes_worker(self):
        pidfile=self.root/'worker.pid'
        self.write_worker(f"open({str(pidfile)!r},'w').write(str(os.getpid()))\ntime.sleep(60)\n")
        stream=hermes_events(WorkflowGenerateRequestSchema(prompt='test',provider_id='anthropic'),self.config,worker=self.worker,verify=False)
        await anext(stream)
        for _ in range(20):
            if pidfile.exists():break
            await asyncio.sleep(.02)
        pid=int(pidfile.read_text());await stream.aclose()
        with self.assertRaises(ProcessLookupError):os.kill(pid,0)
    def test_bad_server_config_does_not_silently_select_other_engine(self):
        path=self.root/'engine.json';path.write_text('{"engine":"unknown"}')
        with patch('app.services.hermes_authoring.CONFIG_PATH',path):
            with self.assertRaises(HTTPException):configured_engine()
        path.unlink()
        with patch('app.services.hermes_authoring.CONFIG_PATH',path):self.assertEqual(configured_engine().engine,'bounded')

class RoutingTests(unittest.IsolatedAsyncioTestCase):
    async def test_formal_builder_uses_configured_hermes_without_model_fallback(self):
        from app.services.scenario_builder import build_events
        seen=[]
        async def fake(request,config):
            seen.append(request.provider_id)
            yield 'result',{'test':'hermes-route'}
        with patch('app.services.hermes_authoring.configured_engine',return_value=EngineConfig(engine='hermes')),patch('app.services.hermes_authoring.hermes_events',fake):
            events=[e async for e in build_events(WorkflowGenerateRequestSchema(prompt='创建体验',provider_id='anthropic'))]
        self.assertEqual(seen,['anthropic']);self.assertEqual(events[0],('result',{'test':'hermes-route'}));self.assertEqual(events[-1][0],'done')
