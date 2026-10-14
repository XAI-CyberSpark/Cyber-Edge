"""Local vector work must keep the async authoring stream responsive."""
import asyncio
import json
import threading
import unittest
from unittest.mock import patch

from app.schemas.orchestration_schema import WorkflowGenerateRequestSchema
from app.services.scenario_builder import ScenarioBuilder, BRIEF_INSTRUCTIONS


class BuilderHybridRecallTests(unittest.IsolatedAsyncioTestCase):
    async def test_recall_runs_off_loop_after_interpretation_with_existing_refs(self):
        request = WorkflowGenerateRequestSchema(
            prompt='只修改标签',
            conversation_history=[{'role': 'user', 'content': '保留原来的输入。'},
                                  {'role': 'assistant', 'content': '建议更换入口'}],
            current_project={'id': 'p', 'name': 'test', 'nodes': [
                {'id': 'in', 'type': 'input', 'position': {'x': 1, 'y': 2}, 'data': {}}], 'edges': []})
        loop_thread = threading.get_ident()
        calls = []

        def local_recall(query, index, refs, **options):
            calls.append((threading.get_ident(), query, refs))
            return {'candidates': [], 'node_overview': [], 'diagnostics': [],
                    'fallback': False, 'strategy': 'bm25_embedding_rrf_v1', 'index_hash': 'test'}

        async def complete(messages):
            if messages[0]['content']==BRIEF_INSTRUCTIONS:
                original=json.loads(messages[1]['content'])['user_context']
                self.assertEqual('保留原来的输入。',original['user_history'][0]['content'])
                return json.dumps({'brief':{'title':'标签修改','goal':'只修改标签','requirements':[
                    {'id':'R1','description':'修改现有标签','acceptance':'标签更新','source_quote':'只修改标签'}],
                    'experience_outline':['修改标签']},'queries':[{'requirement_id':'R1','query':'修改现有显示标签'}]})
            return json.dumps({'requirements':[{'requirement_id':'R1','capability_ids':['node:output']}], 'unresolved':[]})

        with patch('app.services.capability_selection.search_capabilities', side_effect=local_recall), \
                patch('app.services.mcp_runtime.safe_connection_snapshot', return_value=[]):
            events = ScenarioBuilder(request,completion=complete).events()
            try:
                event, _ = await asyncio.wait_for(anext(events), 3)
                self.assertEqual([],calls)
                event, _ = await asyncio.wait_for(anext(events), 3)
            finally:
                await events.aclose()
        self.assertEqual('thinking', event)
        self.assertEqual(1, len(calls))
        self.assertNotEqual(loop_thread, calls[0][0])
        self.assertEqual('修改现有显示标签', calls[0][1])
        self.assertIn('node:input', calls[0][2])
