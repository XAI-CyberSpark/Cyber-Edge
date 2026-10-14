"""Ranking is a loading priority, never permission to hide registered tools."""
import copy
import json
import sqlite3
import unittest
from unittest.mock import patch

from app.schemas.orchestration_schema import WorkflowGenerateRequestSchema
from app.services import capability_selection as api
from app.services.authoring_context import build_stage_context
from app.services.node_capability_service import authoring_catalog
from app.services.scenario_builder import ScenarioBuilder


class CapabilityAvailabilityTests(unittest.TestCase):
    def setUp(self):
        self.catalog = authoring_catalog()
        self.connections = [{'server_id': 'opaque', 'configured': False, 'available': None,
                             'tools': [{'name': 'restricted', 'allow_trials': False,
                                        'execution_authorized': False}]}]
        self.index = api.capability_index(self.catalog, self.connections)

    def test_top_k_and_missing_rank_evidence_cannot_hide_registered_identity(self):
        before = copy.deepcopy(self.index)
        result = api.search_capabilities('目标温度', self.index, [], embedding_provider=None, top_k=1)
        overview = result['capability_overview']
        self.assertLess(len(result['candidates']), len(self.index))
        self.assertEqual({item['id'] for item in self.index}, {item['id'] for item in overview})
        self.assertEqual(len(self.index), len(overview))
        self.assertEqual(before, self.index)
        for query in ('关窗', 'zzunmatchedzz', ''):
            result = api.search_capabilities(query, self.index, [], embedding_provider=None)
            self.assertEqual({item['id'] for item in self.index},
                             {item['id'] for item in result['capability_overview']})

    def test_overview_keeps_unknown_purpose_and_current_permission_facts(self):
        result = api.search_capabilities('音乐', self.index, [], embedding_provider=None)
        record = next(item for item in result['capability_overview'] if item['id'] == 'mcp:opaque/restricted')
        self.assertFalse(record['known'])
        self.assertEqual('unknown', record['purpose'])
        self.assertFalse(record['facts']['configured'])
        self.assertFalse(record['facts']['trial_authorized'])
        self.assertFalse(record['facts']['create_allowed'])
        self.assertNotIn('semantic_text', json.dumps(result['capability_overview']))
        self.assertNotIn('document_hash', json.dumps(result['capability_overview']))
        record['facts']['configured'] = True
        self.assertFalse(next(item for item in self.index if item['id'] == record['id'])['facts']['configured'])

    def test_full_overview_survives_disabled_fts_and_reaches_select(self):
        with patch.object(api.sqlite3, 'connect', side_effect=sqlite3.OperationalError('disabled')):
            result = api.search_capabilities('关窗', self.index, [], embedding_provider=None)
        context = build_stage_context('select', WorkflowGenerateRequestSchema(prompt='关窗'), None, result, {}, [])
        available = context['available_capabilities']
        self.assertEqual('complete_registry_overview_v1', available['coverage_policy'])
        self.assertEqual({item['id'] for item in self.index},
                         {item['id'] for item in available['capability_overview']})
        self.assertIn('优先', available['coverage_rule'])


class CapabilityAvailabilityPlanningTests(unittest.IsolatedAsyncioTestCase):
    async def test_planner_can_choose_overview_only_id_and_load_its_full_contract(self):
        prompt = '将共享目标温度设置到24度'
        index = api.capability_index(authoring_catalog(), [])
        recall = api.search_capabilities(prompt, index, [], embedding_provider=None)
        recall['candidates'] = [item for item in recall['candidates'] if item['id'] != 'hmi:ac.temp']
        brief = {'execution_kind': 'workflow', 'title': '温度设置', 'goal': prompt,
                 'requirements': [{'id': 'R1', 'description': prompt, 'acceptance': '目标温度为24度',
                                   'source_quote': prompt}], 'experience_outline': ['设置共享温度'],
                 'assumptions': [], 'questions': []}

        async def planning(messages):
            context = json.loads(messages[1]['content'])
            if 'available_capabilities' not in context:
                return json.dumps({'brief': brief, 'queries': [{'requirement_id': 'R1', 'query': '空调目标温度24度'}]})
            view = context['available_capabilities']
            self.assertNotIn('hmi:ac.temp', {item['id'] for item in view['candidates']})
            self.assertIn('hmi:ac.temp', {item['id'] for item in view['capability_overview']})
            return json.dumps({'requirements': [
                {'requirement_id': 'R1', 'capability_ids': ['hmi:ac.temp']}], 'unresolved': []})

        builder = ScenarioBuilder(WorkflowGenerateRequestSchema(prompt=prompt), completion=planning)
        with patch.object(api, 'search_capabilities', return_value=recall), \
                patch('app.services.mcp_runtime.safe_connection_snapshot', return_value=[]):
            events = builder.events()
            try:
                self.assertEqual('thinking', (await anext(events))[0])
                self.assertEqual('thinking', (await anext(events))[0])
            finally:
                await events.aclose()
        self.assertEqual(2, builder.model_calls)
        self.assertFalse(builder.capability_view['selection_incomplete'])
        car = builder.capability_view['catalog']['nodes']['car_control']
        self.assertEqual(['ac.temp'], car['fields']['controlId']['enum'])
        self.assertEqual((16, 30), (car['hmi_controls']['ac.temp']['min'], car['hmi_controls']['ac.temp']['max']))
