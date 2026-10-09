"""Run the actual worker with an isolated SDK fixture, never an external model."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

BACKEND = Path(__file__).resolve().parents[1]
REGISTRY = """
class Registry:
    def __init__(self): self.entries = {}
    def register(self, **entry): self.entries[entry['name']] = entry
registry = Registry()
"""
SDK = r"""
import json
from pathlib import Path
from tools.registry import registry
class AIAgent:
    def __init__(self, **kw):
        self.model=kw['model'];self.base_url=kw['base_url'];self.toolsets=kw['enabled_toolsets']
        self.valid_tool_names={name for name,e in registry.entries.items() if e['toolset'] in self.toolsets}
        if Path('case.txt').read_text()=='bad_surface':self.valid_tool_names.add('terminal')
        self._interruptible_api_call=lambda kwargs: {'fixture':True}
        self.session_api_calls=0
        self.closed=False
    def interrupt(self): pass
    def close(self): self.closed=True
    def run_conversation(self, message, **kwargs):
        with open('audit.jsonl','a') as out:out.write(json.dumps({'toolsets':self.toolsets,'tools':sorted(self.valid_tool_names),'message':message,'history':kwargs.get('conversation_history')})+'\n')
        self._interruptible_api_call({});self.session_api_calls+=1
        case=Path('case.txt').read_text()
        if case=='failed':
            return {'completed':False,'failed':True,'failure_reason':'auth','api_calls':1}
        if case in ('partial','interrupted'):
            return {'completed':True,case:True,'api_calls':1}
        if case=='invalid_delivery':
            assert 'error' in json.loads(registry.entries['oakegde_route_turn']['handler']({'mode':'discuss','reply':' '}))
            return {'completed':True,'api_calls':1}
        if self.toolsets==['oakegde_intake'] and case!='no_delivery' and not (case=='text_then_delivery' and self.session_api_calls==1):
            handler=registry.entries['oakegde_route_turn']['handler']
            if case=='invalid_then_valid':
                assert 'error' in json.loads(handler({'mode':'discuss','reply':' '}))
            decision={'mode':'build','reply':''} if case=='build' else {'mode':'discuss','reply':'先确认乘客人数、旅程阶段和喜欢的互动方式。'}
            assert json.loads(handler(decision))['delivered']
            assert 'error' in json.loads(handler(decision))
        return {'completed':True,'final_response':'正常讨论文本，不是图提交证据。','api_calls':1,
            'messages':[{'role':'user','content':message},{'role':'assistant','content':'正常讨论文本'}]}
"""

class IntakeWorkerTests(unittest.TestCase):
    def run_worker(self, case='discuss', mode='team'):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);runtime=root/'sdk';(runtime/'tools').mkdir(parents=True)
            (runtime/'tools/__init__.py').write_text('')
            (runtime/'tools/registry.py').write_text(REGISTRY)
            (runtime/'run_agent.py').write_text(SDK)
            (root/'case.txt').write_text(case)
            settings=root/'settings.json'
            settings.write_text(json.dumps({'openai':{'api_key':'synthetic-key','model':'gpt-test'}}))
            project={'id':'keep','name':'existing','nodes':[], 'edges':[], 'meta':{'custom':'preserve'}}
            request={'prompt':'现在按刚才讨论的做' if case=='build' else '请先和我讨论旅程体验，不要生成',
                'provider_id':'openai','model':'gpt-test','save_on_success':True,'current_project':project,
                'conversation_history':[{'role':'user','content':'乘客有两位成人，分出发和返程两个阶段。'},
                                        {'role':'assistant','content':'可以设计成两段互动。'}]}
            payload={'api_call_timeout_seconds':150,'request':request,'agent_mode':mode,'backend_root':str(BACKEND),
                'runtime_root':str(runtime),'settings_path':str(settings),'commit':'fixture-commit',
                'provider':{'id':'openai','model':'gpt-test','base_url':'https://api.openai.com/v1','api_key':'synthetic-key'}}
            result=subprocess.run([sys.executable,'-u',str(BACKEND/'app/agents/hermes_worker.py')],
                input=json.dumps(payload)+'\n',cwd=root,env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'},
                text=True,capture_output=True,timeout=20)
            events=[json.loads(line) for line in result.stdout.splitlines()]
            audit=[json.loads(line) for line in (root/'audit.jsonl').read_text().splitlines()] if (root/'audit.jsonl').exists() else []
            self.assertNotIn('synthetic-key',result.stdout)
            return events,audit,request

    def test_discussion_is_success_without_constructing_team_or_changing_graph(self):
        for mode in ('single','team'):
            with self.subTest(mode=mode):
                events,audit,request=self.run_worker(mode=mode)
                results=[e['data'] for e in events if e['type']=='result']
                self.assertEqual(len(results),1,events)
                self.assertEqual(len(audit),1)
                self.assertEqual(audit[0]['tools'],['oakegde_route_turn'])
                self.assertTrue(results[0]['chat_reply'])
                self.assertFalse(results[0]['build_report']['can_apply'])
                self.assertFalse(results[0]['validation']['passed'])
                self.assertEqual(results[0]['project']['nodes'],request['current_project']['nodes'])
                self.assertEqual(results[0]['project']['meta'],{'custom':'preserve'})
                self.assertEqual(results[0]['build_report']['collaboration']['completion_attempts'],1)

    def test_handoff_receives_history_but_plain_text_cannot_complete_graph_build(self):
        events,audit,request=self.run_worker('build')
        self.assertEqual(len(audit),2,events)
        for call in audit:
            context=json.loads(call['message'])
            self.assertEqual(context['latest_user_request'],request['prompt'])
            self.assertEqual(context['conversation_history'],request['conversation_history'])
        self.assertIn('oakegde_delegate',audit[1]['tools'])
        self.assertNotIn('oakegde_route_turn',audit[1]['tools'])
        self.assertTrue(any(e['type']=='error' for e in events))
        self.assertFalse(any(e['type']=='result' for e in events))

    def test_no_delivery_does_not_fall_through_to_mutation_tools(self):
        events,audit,_=self.run_worker('no_delivery')
        self.assertEqual(len(audit),3)
        self.assertTrue(all(call['tools']==['oakegde_route_turn'] for call in audit))
        self.assertEqual(events[-1]['type'],'error')
        self.assertEqual(events[-1]['data']['diagnostics']['stage'],'intake')
        self.assertEqual(events[-1]['data']['diagnostics']['api_calls'],3)

    def test_text_completion_gets_contract_feedback_and_can_deliver(self):
        events,audit,request=self.run_worker('text_then_delivery')
        results=[e['data'] for e in events if e['type']=='result']
        self.assertEqual(len(results),1,events)
        self.assertEqual(len(audit),2)
        self.assertIn('oakegde_route_turn',audit[1]['message'])
        self.assertEqual(audit[1]['history'][0]['content'],audit[0]['message'])
        self.assertEqual(audit[1]['history'][1]['role'],'assistant')
        self.assertEqual(results[0]['project']['meta'],request['current_project']['meta'])
        self.assertFalse(results[0]['build_report']['can_apply'])
        self.assertEqual(results[0]['build_report']['collaboration']['completion_attempts'],2)

    def test_provider_failure_does_not_retry_as_a_missing_delivery(self):
        events,audit,_=self.run_worker('failed')
        self.assertEqual(len(audit),1)
        self.assertEqual(events[-1]['type'],'error')
        self.assertEqual(events[-1]['data']['diagnostics']['failure_reason'],'auth')

    def test_partial_and_interrupted_outcomes_do_not_retry(self):
        for case in ('partial','interrupted'):
            with self.subTest(case=case):
                events,audit,_=self.run_worker(case)
                self.assertEqual(len(audit),1)
                self.assertEqual(events[-1]['type'],'error')

    def test_rejected_deliveries_are_counted_without_leaking_arguments(self):
        events,audit,_=self.run_worker('invalid_delivery')
        self.assertEqual(len(audit),3)
        diagnostics=events[-1]['data']['diagnostics']
        self.assertEqual(diagnostics['tool_calls'],3)
        self.assertEqual(diagnostics['failed_tool_calls'],3)
        self.assertEqual(diagnostics['last_tool_error'],'argument_contract')
        self.assertFalse(diagnostics['last_tool_ok'])

    def test_invalid_reply_can_be_corrected_without_duplicate_delivery(self):
        events,audit,_=self.run_worker('invalid_then_valid')
        self.assertTrue(any(e['type']=='result' for e in events),events)
        self.assertEqual(len(audit),1)

    def test_intake_rejects_extra_tool_surface(self):
        events,audit,_=self.run_worker('bad_surface')
        self.assertEqual(audit,[])
        self.assertEqual(events[-1]['type'],'error')
        self.assertEqual(events[-1]['data']['diagnostics']['stage'],'intake')

if __name__=='__main__': unittest.main()
