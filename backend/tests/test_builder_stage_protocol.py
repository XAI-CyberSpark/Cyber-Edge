import json
import unittest
from unittest.mock import AsyncMock, patch
from types import SimpleNamespace

import httpx
from fastapi import HTTPException

from app.schemas.orchestration_schema import WorkflowGenerateRequestSchema
from app.services.scenario_builder import ScenarioBuilder, ContentReview, BRIEF_INSTRUCTIONS, REVIEW_INSTRUCTIONS
from tests.test_scenario_builder_recovery import BRIEF, draft


def executed_report():
    return {'status':'passed','runtime_verified':True,'model_calls':0,'cases':[{'name':'实际路径','passed':True,
        'steps':[{'index':0,'status':'completed','passed':True,'evidence':{'hmi':{'message':'完成'}}}]}]}


def passed_review(messages):
    context=json.loads(messages[-1]['content'])
    checks=[{'case_index':ci,'step_index':si,'verdict':'pass','findings':[],
        'evidence_ids':[entry['evidence_id'] for entry in step['evidence_index']]}
        for ci,case in enumerate(context['actual_execution']['cases']) for si,step in enumerate(case['steps'])]
    return json.dumps({'issues':[],'strengths':[],'checks':checks})


class BuilderStageProtocolTests(unittest.IsolatedAsyncioTestCase):
    async def test_mcp_requirement_cannot_be_released_as_static_output(self):
        prompt='通过MCP读取数据'
        brief={**BRIEF,'goal':prompt,'requirements':[{'id':'R1','description':prompt,
              'acceptance':'真实工具返回','source_quote':prompt}]}
        async def complete(messages):
            if messages[0]['content']==BRIEF_INSTRUCTIONS:
                return json.dumps({'brief':brief,'selection':{'requirements':[{'requirement_id':'R1',
                    'capability_ids':['node:input','node:output','action:music'],
                    'required_execution_source':'mcp'}],'unresolved':[]}})
            if messages[0]['content']==REVIEW_INSTRUCTIONS:return passed_review(messages)
            return json.dumps(draft())
        executor=AsyncMock(return_value=executed_report())
        with patch('app.services.mcp_runtime.safe_connection_snapshot',return_value=[]):
            result=[data async for event,data in ScenarioBuilder(WorkflowGenerateRequestSchema(prompt=prompt),
                 complete,executor=executor,max_attempts=1).events() if event=='result'][0]
        self.assertFalse(result['build_report']['can_apply'])
        self.assertEqual(result['build_report']['status'],'capability_gap')
        executor.assert_not_called()

    async def test_unexecuted_draft_cannot_be_applied_despite_positive_content_review(self):
        async def complete(messages):
            if messages[0]['content']==BRIEF_INSTRUCTIONS:
                return json.dumps({'brief':BRIEF,'selection':{'requirements':[{'requirement_id':'R1',
                    'capability_ids':['node:input','node:output']}],'unresolved':[]}})
            if messages[0]['content']==REVIEW_INSTRUCTIONS:return passed_review(messages)
            return json.dumps(draft())
        for report in ({'status':'not_supported','issue':'Node unavailable','runtime_verified':False},
                       {'status':'passed','runtime_verified':True,'cases':[]}):
            with self.subTest(status=report['status']):
                result=[data async for event,data in ScenarioBuilder(WorkflowGenerateRequestSchema(prompt='显示完成'),
                    complete,executor=AsyncMock(return_value=report),max_attempts=1).events() if event=='result'][0]
                self.assertFalse(result['build_report']['can_apply'])
                self.assertIn('execution_evidence_incomplete',json.dumps(result['build_report']))

    async def test_readable_legacy_type_cannot_create_a_new_instance(self):
        project=draft()['workflow']
        project.update(id='existing',name='existing')
        project['nodes'].append({'id':'saved_old','type':'interaction','position':{'x':4,'y':8},'data':{}})
        async def complete(messages):
            if messages[0]['content']==BRIEF_INSTRUCTIONS:
                return json.dumps({'brief':BRIEF,'selection':{'requirements':[{'requirement_id':'R1',
                    'capability_ids':['node:input','node:output']}],'unresolved':[]}})
            candidate=draft();candidate['workflow']['nodes'].append({'id':'new_instance','type':'interaction',
                    'position':{'x':10,'y':20},'data':{}})
            return json.dumps(candidate)
        executor=AsyncMock()
        result=[data async for event,data in ScenarioBuilder(WorkflowGenerateRequestSchema(prompt='显示完成',current_project=project),
                complete,executor=executor,max_attempts=1).events() if event=='result'][0]
        self.assertFalse(result['build_report']['can_apply'])
        self.assertIn('creation_disallowed_instance',json.dumps(result['build_report']))
        executor.assert_not_called()

    async def test_forged_evidence_id_cannot_unlock_actual_step_review(self):
        async def complete(messages):
            if messages[0]['content']==BRIEF_INSTRUCTIONS:
                return json.dumps({'brief':BRIEF,'selection':{'requirements':[{'requirement_id':'R1',
                    'capability_ids':['node:input','node:output']}],'unresolved':[]}})
            if messages[0]['content']==REVIEW_INSTRUCTIONS:
                return json.dumps({'issues':[],'strengths':[],'checks':[{'case_index':0,'step_index':0,
                     'verdict':'pass','evidence_ids':['invented-id'],'findings':[]}]})
            return json.dumps(draft())
        async def execute(project,plan):
            return {'status':'passed','runtime_verified':True,'cases':[{'name':'actual','passed':True,
                'steps':[{'index':0,'status':'completed','passed':True,'evidence':{'hmi':{'message':'完成'}}}]}]}
        result=[data async for event,data in ScenarioBuilder(WorkflowGenerateRequestSchema(prompt='显示完成'),
                   complete,executor=execute,max_attempts=1).events() if event=='result'][0]
        self.assertFalse(result['build_report']['can_apply'])
        self.assertIn('invalid_evidence_id',json.dumps(result['build_report']))

    async def test_selected_discovery_keeps_unselected_tool_discoverable(self):
        from app.services.capability_selection import capability_index
        from app.services.node_capability_service import CATALOG
        builder=ScenarioBuilder(WorkflowGenerateRequestSchema(prompt='显示完成'))
        builder.connection_snapshot=[{'server_id':'ext','configured':True,'available':None,'tools':[
            {'name':'one','description':'第一个工具','allow_trials':True,'execution_authorized':True},
            {'name':'two','description':'第二个工具','allow_trials':True,'execution_authorized':True}]}]
        builder.capability_index=capability_index(CATALOG,builder.connection_snapshot)
        with patch('app.services.mcp_runtime.discover_selected',AsyncMock(return_value=[{
            'server_id':'ext','configured':True,'available':True,'tools':[
                {'name':'one','description':'第一个工具','inputSchema':{'type':'object'},'allow_trials':True,'execution_authorized':True},
                {'name':'two','description':'第二个工具','inputSchema':{'type':'object'},'allow_trials':True,'execution_authorized':True}]}])):
            await builder._load_selection(['mcp:ext/one'])
        self.assertIn('mcp:ext/two',{item['id'] for item in builder.capability_index})
        self.assertEqual([tool['name'] for record in builder.capability_view['mcp_connections'] for tool in record['tools']],['one'])

    async def test_device_requirement_cannot_be_released_as_simulated_coverage(self):
        prompt='真实执行车窗关闭'
        brief={**BRIEF,'goal':prompt,'requirements':[{'id':'R1','description':prompt,
               'acceptance':'真实回执','source_quote':prompt}]}
        async def complete(messages):
            if messages[0]['content']==BRIEF_INSTRUCTIONS:
                return json.dumps({'brief':brief,'selection':{'requirements':[{'requirement_id':'R1',
                    'capability_ids':['node:input','node:output','action:windows.close_all'],
                    'required_execution_source':'device'}],'unresolved':[]}})
            value=draft();value['requirement_coverage'][0]['status']='simulated'
            return json.dumps(value)
        executor=AsyncMock()
        with patch('app.services.mcp_runtime.safe_connection_snapshot',return_value=[]):
            result=[data async for event,data in ScenarioBuilder(WorkflowGenerateRequestSchema(prompt=prompt),
                    complete,executor=executor,max_attempts=1).events() if event=='result'][0]
        self.assertFalse(result['build_report']['can_apply'])
        self.assertEqual(result['build_report']['status'],'capability_gap')
        executor.assert_not_called()

    async def test_draft_unselected_node_contract_is_loaded_before_execution(self):
        builds=[];executor=AsyncMock(return_value=executed_report())
        async def complete(messages):
            if messages[0]['content']==BRIEF_INSTRUCTIONS:
                return json.dumps({'brief':BRIEF,'selection':{'requirements':[{'requirement_id':'R1',
                    'capability_ids':['node:output']}],'unresolved':[]}})
            if messages[0]['content']==REVIEW_INSTRUCTIONS:return passed_review(messages)
            builds.append(json.loads(messages[1]['content']))
            return json.dumps(draft())
        result=[data async for event,data in ScenarioBuilder(WorkflowGenerateRequestSchema(prompt='显示完成'),
                  complete,executor=executor,max_attempts=2).events() if event=='result'][0]
        self.assertEqual(len(builds),2)
        self.assertIn('input',builds[1]['capabilities']['nodes'])
        self.assertEqual(result['build_report']['capability_loads'],1)
        self.assertEqual(executor.await_count,1)

    async def test_direct_missing_reloads_full_short_index_before_claiming_gap(self):
        builds=[];executions=[]
        async def complete(messages):
            if messages[0]['content']==BRIEF_INSTRUCTIONS:
                return json.dumps({'brief':BRIEF,'selection':{'requirements':[{'requirement_id':'R1',
                    'capability_ids':['node:input','node:output']}],'unresolved':[]}})
            if messages[0]['content']==REVIEW_INSTRUCTIONS:return passed_review(messages)
            builds.append(json.loads(messages[1]['content']))
            value=draft()
            if len(builds)==1:value['requirement_coverage'][0].update(status='missing',node_ids=[],note='目录未见显示能力')
            return json.dumps(value)
        async def execute(project,plan):
            executions.append(project);return executed_report()
        result=[data async for event,data in ScenarioBuilder(WorkflowGenerateRequestSchema(prompt='显示完成'),
                 complete,executor=execute,max_attempts=2).events() if event=='result'][0]
        self.assertTrue(result['build_report']['can_apply'])
        self.assertEqual(len(executions),1)
        self.assertIn('available_capabilities',builds[1])
        self.assertEqual(result['build_report']['capability_loads'],1)

    async def test_exhausted_unconfirmed_missing_is_selection_incomplete_not_gap(self):
        async def complete(messages):
            if messages[0]['content']==BRIEF_INSTRUCTIONS:
                return json.dumps({'brief':BRIEF,'selection':{'requirements':[{'requirement_id':'R1',
                    'capability_ids':['node:input','node:output']}],'unresolved':[]}})
            value=draft();value['requirement_coverage'][0].update(status='missing',node_ids=[],note='未选定')
            return json.dumps(value)
        execute=AsyncMock()
        result=[data async for event,data in ScenarioBuilder(WorkflowGenerateRequestSchema(prompt='显示完成'),
                 complete,executor=execute,max_attempts=1).events() if event=='result'][0]
        self.assertEqual(result['build_report']['status'],'needs_changes')
        self.assertFalse(result['build_report']['can_apply'])
        self.assertIn('selection_incomplete',json.dumps(result['build_report']))
        execute.assert_not_called()

    async def test_incremental_usage_survives_later_fatal_error_without_result(self):
        from app.services import model_providers, orchestration_logging
        from app.services.scenario_builder import build_events
        records=[];posts=0
        provider=model_providers.Provider('deepseek','DeepSeek','https://api.deepseek.com','deepseek-flash','PRIVATE-KEY')
        def transport(request):
            nonlocal posts
            posts+=1
            if posts==2:return httpx.Response(401,json={'error':'PRIVATE-ERROR'})
            return httpx.Response(200,json={'choices':[{'finish_reason':'stop','message':{'content':json.dumps(
                {'brief':BRIEF,'queries':[{'requirement_id':'R1','query':'显示完成文字'}]})}}],
                 'usage':{'prompt_tokens':123,'completion_tokens':45}})
        original=httpx.AsyncClient
        def client(**kwargs):return original(**kwargs,transport=httpx.MockTransport(transport))
        with patch.object(model_providers,'resolve',return_value=provider),patch.object(httpx,'AsyncClient',side_effect=client),\
             patch.object(orchestration_logging,'_write',side_effect=records.append),\
             patch('app.services.capability_selection.get_embedding_provider',return_value=None),\
             patch('app.services.hermes_authoring.configured_engine',return_value=SimpleNamespace(engine='bounded',agent_mode='single')):
            with self.assertRaises(HTTPException):
                _=[event async for event in build_events(WorkflowGenerateRequestSchema(prompt='显示完成',provider_id='deepseek'))]
        self.assertFalse(any(record['event']=='result' for record in records))
        completed=[record for record in records if record['event']=='model_completion']
        self.assertEqual(completed[0]['input_tokens'],123)
        self.assertEqual(completed[0]['output_tokens'],45)
        self.assertEqual(len(completed),2)
        self.assertEqual(['understand','select'],[record['stage'] for record in completed])
        self.assertNotIn('PRIVATE',json.dumps(records))

    async def test_explicit_stage_schema_does_not_depend_on_system_text(self):
        builder=ScenarioBuilder(WorkflowGenerateRequestSchema(prompt='显示完成'))
        complete=AsyncMock(return_value=json.dumps({'issues':[],'strengths':[]}))
        with patch('app.services.model_providers.complete',complete):
            await builder.call('review',[{'role':'system','content':'a revised review prompt'}],contract=ContentReview)
        self.assertIn('issues',complete.call_args.args[2]['properties'])

    async def test_total_budget_prevents_ninth_completion(self):
        complete=AsyncMock(return_value='{}')
        builder=ScenarioBuilder(WorkflowGenerateRequestSchema(prompt='x'),complete)
        for _ in range(8):
            await builder.call('generic',[{'role':'system','content':'generic'}],contract=None)
        with self.assertRaises(ValueError):
            await builder.call('generic',[{'role':'system','content':'generic'}],contract=None)
        self.assertEqual(complete.await_count,8)

    async def test_review_limit_is_three_across_request(self):
        complete=AsyncMock(return_value='{}')
        builder=ScenarioBuilder(WorkflowGenerateRequestSchema(prompt='x'),complete)
        for _ in range(3):await builder.call('review',[{'role':'system','content':'generic'}],contract=None)
        with self.assertRaises(ValueError):
            await builder.call('review',[{'role':'system','content':'generic'}],contract=None)
        self.assertEqual(complete.await_count,3)

    async def test_capability_need_uses_existing_build_attempt_and_never_runs_pending(self):
        builds=0; contexts=[];executions=[]
        async def complete(messages):
            nonlocal builds
            if messages[0]['content']==BRIEF_INSTRUCTIONS:
                return json.dumps({'brief':BRIEF,'selection':{'requirements':[{'requirement_id':'R1',
                    'capability_ids':['node:input','node:output']}],'unresolved':[]}})
            if messages[0]['content']==REVIEW_INSTRUCTIONS:return passed_review(messages)
            builds+=1;contexts.append(json.loads(messages[1]['content']))
            if builds==1:return json.dumps({'kind':'capability_need','requirement_ids':['R1'],
                'capability_ids':['node:logic'],'reason':'需要条件契约'})
            return json.dumps(draft())
        async def execute(project,plan):
            executions.append(project)
            return executed_report()
        result=[data async for event,data in ScenarioBuilder(WorkflowGenerateRequestSchema(prompt='显示完成'),
                 complete,executor=execute,max_attempts=2).events() if event=='result'][0]
        self.assertEqual(builds,2)
        self.assertEqual(len(executions),1)
        self.assertTrue(result['build_report']['can_apply'])
        self.assertIn('logic',contexts[1]['capabilities']['nodes'])
        self.assertEqual(result['build_report']['capability_loads'],1)


if __name__=='__main__':unittest.main()
