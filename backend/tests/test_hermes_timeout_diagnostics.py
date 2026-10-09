import asyncio
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from fastapi import HTTPException
from app.schemas.orchestration_schema import WorkflowGenerateRequestSchema
from app.services.hermes_authoring import EngineConfig,hermes_events,SDK_COMMIT
from app.services.model_providers import Provider

TOOLS=['oakegde_capabilities','oakegde_read_graph','oakegde_brief','oakegde_patch_graph','oakegde_test_plan','oakegde_inspect','oakegde_trial','oakegde_submit']
ZERO_COUNTS={k:0 for k in ('completion_attempts','normalizations','call_timeouts','status_revisions','patch_total','patch_rejected','overload_retries','truncation_retries')}
PROVIDER=Provider('anthropic','test','https://api.anthropic.com/v1','claude-test','synthetic-secret')

class HostTimeoutDiagnosticsTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.worker=self.root/'worker.py'
        self.config=EngineConfig(engine='hermes',runtime_root=str(self.root),python=sys.executable)
        self.resolver=patch('app.services.hermes_authoring.model_providers.resolve',return_value=PROVIDER);self.resolver.start()
    def tearDown(self):self.resolver.stop();self.temp.cleanup()
    def write_worker(self,events):
        names=TOOLS if self.config.agent_mode=='single' else [n for n in TOOLS if n not in (
            'oakegde_brief','oakegde_patch_graph','oakegde_test_plan')]+['oakegde_delegate','oakegde_apply_artifact']
        ready=json.dumps(json.dumps({'type':'ready','data':{
            'tools':names,'commit':SDK_COMMIT,'agent_mode':self.config.agent_mode}}))
        lines=[f'print({ready},flush=True)']
        for event in events:lines.append(f'print({json.dumps(json.dumps(event))},flush=True)')
        self.worker.write_text('import json,sys,time\ninit=json.loads(sys.stdin.readline())\n'+'\n'.join(lines)+'\ntime.sleep(60)\n')
    async def run_timeout(self,events):
        self.write_worker(events)
        stream=hermes_events(WorkflowGenerateRequestSchema(prompt='test',provider_id='anthropic'),self.config,worker=self.worker,verify=False,timeout=.5)
        with self.assertRaises(HTTPException) as error:
            async for _ in stream:pass
        return error.exception
    async def test_timeout_reports_stage_from_observed_tool_status(self):
        error=await self.run_timeout([{'type':'tool_status','data':{'tool':'oakegde_brief','ok':True,'revision':0}},
                              {'type':'tool_status','data':{'tool':'oakegde_trial','ok':True,'revision':3}}])
        self.assertEqual(error.status_code,503)
        detail=error.detail
        self.assertEqual(detail['code'],'hermes_incomplete')
        self.assertIn('时间预算',detail['message'])
        self.assertEqual(detail['diagnostics'],{**ZERO_COUNTS,'interrupted':True,'termination':'host_timeout','stage':'executing_graph',
            'tool_calls':2,'last_tool':'oakegde_trial','last_tool_ok':True,'revision':3,'brief_registered':True})
        self.assertNotIn('synthetic-secret',json.dumps(detail))
    async def test_team_apply_records_brief_for_timeout_stage(self):
        self.config.agent_mode='team'
        error=await self.run_timeout([
            {'type':'tool_status','data':{'tool':'oakegde_delegate','ok':True,'revision':0,'brief_registered':False}},
            {'type':'tool_status','data':{'tool':'oakegde_apply_artifact','ok':True,'revision':0,'brief_registered':True}},
            {'type':'thinking','data':{'content':'正在委派状态与路径设计员，基于图版本 0…'}}])
        self.assertTrue(error.detail['diagnostics']['brief_registered'])
        self.assertEqual(error.detail['diagnostics']['stage'],'building_graph')
        self.assertEqual(error.detail['diagnostics']['termination'],'host_timeout')

    async def test_team_delivery_without_application_is_before_brief(self):
        self.config.agent_mode='team'
        error=await self.run_timeout([
            {'type':'tool_status','data':{'tool':'oakegde_delegate','ok':True,'revision':0,'brief_registered':False}},
            {'type':'tool_status','data':{'tool':'oakegde_apply_artifact','ok':False,'revision':0,'brief_registered':False}}])
        self.assertFalse(error.detail['diagnostics']['brief_registered'])
        self.assertEqual(error.detail['diagnostics']['stage'],'before_brief')

    async def test_timeout_before_any_tool_reports_before_brief(self):
        error=await self.run_timeout([])
        detail=error.detail
        self.assertEqual(detail['diagnostics'],{**ZERO_COUNTS,'interrupted':True,'termination':'host_timeout','stage':'before_brief',
            'tool_calls':0,'brief_registered':False,'revision':0})
    async def test_timeout_stage_mapping_for_inspect_and_submit(self):
        for tool,stage in [('oakegde_inspect','checking_graph'),('oakegde_submit','submitting')]:
            error=await self.run_timeout([{'type':'tool_status','data':{'tool':'oakegde_brief','ok':True,'revision':0}},
                                  {'type':'tool_status','data':{'tool':tool,'ok':True,'revision':1}}])
            self.assertEqual(error.detail['diagnostics']['stage'],stage)
    async def test_failed_brief_does_not_count_as_registered(self):
        error=await self.run_timeout([{'type':'tool_status','data':{'tool':'oakegde_brief','ok':False,'revision':0}}])
        self.assertEqual(error.detail['diagnostics']['stage'],'before_brief')
        self.assertEqual(error.detail['diagnostics']['brief_registered'],False)
    async def test_team_delegate_last_tool_survives_allowlist(self):
        self.config.agent_mode='team'
        names=[n for n in TOOLS if n not in ('oakegde_brief','oakegde_patch_graph','oakegde_test_plan')]+['oakegde_delegate','oakegde_apply_artifact']
        ready=json.dumps(json.dumps({'type':'ready','data':{'tools':names,'commit':SDK_COMMIT,'agent_mode':'team'}}))
        status=json.dumps(json.dumps({'type':'tool_status','data':{'tool':'oakegde_delegate','ok':True,'revision':0}}))
        self.worker.write_text('import json,sys,time\ninit=json.loads(sys.stdin.readline())\n'
            f'print({ready},flush=True)\nprint({status},flush=True)\ntime.sleep(60)\n')
        stream=hermes_events(WorkflowGenerateRequestSchema(prompt='test',provider_id='anthropic'),self.config,worker=self.worker,verify=False,timeout=.5)
        with self.assertRaises(HTTPException) as error:
            async for _ in stream:pass
        self.assertEqual(error.exception.detail['diagnostics']['last_tool'],'oakegde_delegate')

if __name__=='__main__':unittest.main()
