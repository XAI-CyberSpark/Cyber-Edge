import copy,json,time,unittest
from unittest.mock import AsyncMock
from app.services.connection_contract import connection_diagnostics
from app.services.authoring_team import CompletionBudget
from app.services.execution_review import evidence_bundle,validate_review,review_execution
from app.services.test_plan_preflight import inspect_test_plan
from tests.test_authoring_session import session,ready,PLAN,PATCH,BRIEF
from tests.test_execution_review import REQUEST,BRIEF as REVIEW_BRIEF,PROVIDER,execution,review

def graph(fmt='json',target=None):
    nodes=[{'id':'a','type':'llm','data':{'outputFormat':fmt,'outputFields':{'v':'number'}}},{'id':'bridge','type':'logic','data':{'condition':'true'}},target or {'id':'t','type':'tool','data':{'tool_id':'nav'}}]
    return nodes,[{'id':'ab','source':'a','target':'bridge'},{'id':'bt','source':'bridge','target':'t'}]

class ProgressContractTests(unittest.IsolatedAsyncioTestCase):
    def test_lineage_reports_edges_and_stops_at_new_model(self):
        nodes,edges=graph();d=connection_diagnostics(nodes,edges)[0]
        self.assertEqual(d['code'],'GRAPH_CONNECTION_CONTRACT');self.assertEqual([e['edge_id'] for e in d['path']],['ab','bt']);self.assertEqual(d['target_node_id'],'t');self.assertEqual(len(d['repairs']),3)
        nodes[1]={'id':'bridge','type':'llm','data':{'outputFormat':'actions'}}
        self.assertEqual(connection_diagnostics(nodes,edges),[])
        edges[0]['sourceHandle']='error';self.assertEqual(connection_diagnostics(nodes,edges),[])

    def test_hmi_and_mcp_explicit_binding_contracts(self):
        for kind,data in [('car_control',{'executionMode':'hmi','controlId':'ac.temp','valueField':'v'}),('tool',{'tool_id':'mcp','arguments':{'n':{'$ref':'input.data.v'}}})]:
            nodes,edges=graph('actions',{'id':'t','type':kind,'data':data});edges=[{'id':'at','source':'a','target':'t'}]
            self.assertEqual(connection_diagnostics(nodes,edges)[0]['target_node_id'],'t')
            nodes[0]['data']['outputFormat']='json';self.assertFalse(connection_diagnostics(nodes,edges))
            nodes[0]['data']['outputFields']={'wrong':'number'};self.assertTrue(connection_diagnostics(nodes,edges))
        nodes,edges=graph('json',{'id':'t','type':'car_control','data':{'executionMode':'hmi','controlId':'ac.temp','valueField':'v'}});nodes[0]['data']['outputFields']['v']='string'
        self.assertIn('需要 number',connection_diagnostics(nodes,edges)[0]['message'])

    def test_patch_feedback_and_inspect_share_diagnostics(self):
        s=session();s.record_brief(BRIEF);p=copy.deepcopy(PATCH)
        p['upsert_nodes'] += [{'id':'a','type':'llm','position':{'x':20,'y':20},'set_data':{'outputFormat':'json','outputFields':{'v':'number'}}},{'id':'t','type':'tool','position':{'x':40,'y':20},'set_data':{'tool_id':'nav'}}]
        p['upsert_edges'] += [{'id':'ia','source':'i','target':'a'},{'id':'at','source':'a','target':'t'}]
        d=s.patch(p)['contract_diagnostics'];self.assertEqual(d[0]['path'][0]['edge_id'],'at')
        self.assertEqual(d,[v for v in s.inspect({'revision':1})['contract_diagnostics'] if v['code']=='GRAPH_CONNECTION_CONTRACT'])
        self.assertIn('producers',s.capabilities()['connection_contract']);self.assertIn('connection_contract',s.record_brief(BRIEF))

    async def test_progress_and_submit_gate_do_not_block_host_draft(self):
        s=session();ready(s);s.plan=None
        self.assertIn('oakegde_test_plan',s.inspect({'revision':1})['next_required_step'])
        r=await s.invoke('oakegde_submit',{'revision':1});self.assertEqual(r['code'],'SUBMIT_TRIAL_REQUIRED');self.assertIsNone(s.result)
        s.incomplete_result();self.assertFalse(s.result['build_report']['can_apply'])
        s=session();ready(s);await s.trial({'revision':1});s.project.nodes[-1]['data']['responseText']='changed without revision'
        self.assertEqual((await s.invoke('oakegde_submit',{'revision':1}))['code'],'SUBMIT_TRIAL_REQUIRED')

    def test_reminder_call_and_time_threshold_once_no_budget_extension(self):
        for by_time in [False,True]:
            s=session();b=CompletionBudget();kwargs={'messages':[{'role':'user','content':'task'}]}
            self.assertIs(b.remind_plan(s,kwargs),kwargs)
            if by_time:b.started-=361
            else:b.attempts=21
            before=(b.deadline,b.limit,b.attempts)
            result=b.remind_plan(s,kwargs);self.assertIn('AUTHORING_PLAN_DUE',result['messages'][0]['content']);self.assertEqual(before,(b.deadline,b.limit,b.attempts));self.assertEqual(kwargs['messages'][0]['role'],'user')
            self.assertIs(b.remind_plan(s,kwargs),kwargs);self.assertEqual(len(s.trace),1)
        s=session();ready(s);b=CompletionBudget();b.attempts=21;self.assertIs(b.remind_plan(s,kwargs),kwargs)
        s.plan=None;b.plan_reminder_sent=False
        self.assertIn('AUTHORING_PLAN_DUE',b.remind_plan(s,{'system':'rules','messages':[]})['system'])

    def test_weak_assertion_and_event_warning_before_lock_and_inspect(self):
        s=session();ready(s);s.plan=None;s.project.nodes[0]['data'].update(flowVersion=2,eventName='arrived')
        p=copy.deepcopy(PLAN);step=p['cases'][0]['steps'][0];step['input']={'text':json.dumps({'$event':{'name':'arrived'}})};step['assertions']=[{'path':['nodes','o'],'op':'exists'}]
        r=s.set_plan({'revision':1,'plan':p});self.assertEqual({d['code'] for d in r['warnings']},{'PLAN_ASSERTION_WEAK','PLAN_EVENT_UNMATCHED'})
        self.assertTrue(any('"message"' in d['message'] for d in r['warnings']));self.assertEqual(len(s.inspect({'revision':1})['contract_diagnostics']),2)

class EvidenceIdTests(unittest.IsolatedAsyncioTestCase):
    async def test_id_fills_original_including_nodes_and_records_usage(self):
        run=execution();run['cases'][0]['steps'][0]['evidence']['nodes']={'n':'skipped'}
        bundle=evidence_bundle(REQUEST,REVIEW_BRIEF,run);step=bundle['cases'][0]['steps'][0]
        id=next(e['evidence_id'] for e in step['evidence_index'] if e['evidence_path']==['nodes','n'])
        value=review();f=value['checks'][0]['findings'][0];f.pop('observed_quote');f.pop('evidence_path');f['evidence_id']=id
        checked=validate_review(value,bundle);self.assertEqual(checked.checks[0].findings[0].observed_quote,'skipped')
        result=await review_execution(REQUEST,REVIEW_BRIEF,run,provider=PROVIDER,completion=AsyncMock(return_value=json.dumps(value)))
        self.assertEqual(result['status'],'needs_changes');self.assertEqual(result['evidence_id_references'],1)
        self.assertEqual(result['issues'][0]['evidence_path'],['nodes','n'])
        # Caller-authored conflicting text cannot replace host evidence.
        f.update(observed_quote='success',evidence_path=['fake']);self.assertEqual(validate_review(value,bundle).checks[0].findings[0].observed_quote,'skipped')

    def test_ids_stable_but_reject_cross_step_stale_and_forged(self):
        run=execution();run['cases'][0]['steps'].append(copy.deepcopy(run['cases'][0]['steps'][0]));bundle=evidence_bundle(REQUEST,REVIEW_BRIEF,run)
        self.assertEqual(bundle,evidence_bundle(REQUEST,REVIEW_BRIEF,run))
        other=bundle['cases'][0]['steps'][1]['evidence_index'][0]['evidence_id']
        for id in [other,'ev-invented']:
            v=review();v['checks'][0]['findings'][0]['evidence_id']=id
            with self.assertRaisesRegex(ValueError,'invalid_evidence_id'):validate_review(v,bundle)
        original=evidence_bundle(REQUEST,REVIEW_BRIEF,execution());id=next(e['evidence_id'] for e in original['cases'][0]['steps'][0]['evidence_index'] if e['evidence_path']==['hmi','message'])
        v=review();v['checks'][0]['findings'][0]['evidence_id']=id
        with self.assertRaisesRegex(ValueError,'invalid_evidence_id'):validate_review(v,evidence_bundle(REQUEST,REVIEW_BRIEF,execution('different')))
        v=review(False);v['checks'][0]['evidence_ids']=['invented']
        with self.assertRaisesRegex(ValueError,'invalid_evidence_id'):validate_review(v,original)

    async def test_quote_diff_has_bounded_original_and_actual(self):
        v=review();v['checks'][0]['findings'][0]['observed_quote']='错误片段'
        r=await review_execution(REQUEST,REVIEW_BRIEF,execution('x'*1200),provider=PROVIDER,completion=AsyncMock(return_value=json.dumps(v)))
        d=r['details'][0]['quote_difference'];self.assertEqual(d['observed_excerpt'],'错误片段');self.assertEqual(d['expected_length'],1200);self.assertLessEqual(len(d['expected_excerpt']),320)
