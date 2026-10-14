"""Task-local discovery must preserve facts and complete selected contracts."""
import copy
import importlib
import importlib.util
import json
import sqlite3
import unittest
from unittest.mock import patch

from app.services.node_capability_service import authoring_catalog
from app.services.hmi_control_contract import CONTROLS
from app.services.node_data_schema import patch_data_schema


class CapabilitySelectionTests(unittest.TestCase):
    def setUp(self):
        self.catalog = authoring_catalog()
        self.catalog['nodes']['car_control']['hmi_controls'] = copy.deepcopy(CONTROLS)
        if importlib.util.find_spec('app.services.capability_selection') is None:
            self.fail('task-local capability selection has not been implemented')
        self.api = importlib.import_module('app.services.capability_selection')

    def index(self, connections=None):
        return self.api.capability_index(self.catalog, connections or [])

    def test_id_short_chinese_and_safe_or_query_recall(self):
        index = self.index()
        for query, wanted in [('action:windows.close_all', 'action:windows.close_all'),
                              ('关窗', 'action:windows.close_all'),
                              ('目标温度 完全无关词', 'hmi:ac.temp'),
                              ('" : * OR NEAR(无关) 目标温度', 'hmi:ac.temp')]:
            with self.subTest(query=query):
                result = self.api.search_capabilities(query, index, [], embedding_provider=None)
                self.assertIn(wanted, [item['id'] for item in result['candidates']])
                self.assertEqual(19, len(result['node_overview']))
        exact = self.api.search_capabilities('action:windows.close_all', index, [], embedding_provider=None)
        self.assertEqual('exact_id', exact['candidates'][0]['recall_source'])

    def test_negation_is_not_permission_and_synonym_failure_keeps_overview(self):
        index = self.index()
        result = self.api.search_capabilities('不要关窗；只有用户明确确认才操作', index, [], embedding_provider=None)
        self.assertIn('action:windows.close_all', [item['id'] for item in result['candidates']])
        # This is explicitly the lexical-only failure path; hybrid paraphrase
        # quality is measured separately with real and injected embeddings.
        result = self.api.search_capabilities('把玻璃升到最顶端', index, [], embedding_provider=None)
        self.assertTrue(result['fallback'])
        self.assertEqual([], result['candidates'])
        self.assertEqual(len(index), len(result['capability_overview']))

    def test_empty_and_fts_unavailable_return_complete_overview_without_ranked_candidates(self):
        index = self.index()
        empty = self.api.search_capabilities('zzunmatchedzz', index, [], embedding_provider=None)
        self.assertTrue(empty['fallback'])
        self.assertEqual([], empty['candidates'])
        self.assertEqual(len(index), len(empty['capability_overview']))
        with patch('app.services.capability_selection.sqlite3.connect', side_effect=sqlite3.OperationalError('unavailable')):
            result = self.api.search_capabilities('关窗', index, [], embedding_provider=None)
        self.assertTrue(result['fallback'])
        self.assertEqual([], result['candidates'])
        self.assertEqual(len(index), len(result['capability_overview']))
        self.assertEqual(empty['index_hash'], result['index_hash'])

    def test_top_k_preserves_required_refs_and_all_ties_within_limit(self):
        index = self.index()
        result = self.api.search_capabilities('目标温度', index, ['node:interaction', 'hmi:display.mode'], embedding_provider=None)
        self.assertIn('node:interaction', [item['id'] for item in result['candidates']])
        self.assertIn('hmi:display.mode', [item['id'] for item in result['candidates']])
        # Equal scores within the default limit remain available.
        repeated = [dict(index[0], id=f'node:test_{i}', purpose='共同行为', node_type=f'test_{i}') for i in range(30)]
        result = self.api.search_capabilities('共同行为', repeated, [], embedding_provider=None)
        self.assertEqual(30, len(result['candidates']))

    def test_index_hash_tracks_contract_and_permission_changes(self):
        first = self.api.search_capabilities('关窗', self.index(), [], embedding_provider=None)['index_hash']
        changed = copy.deepcopy(self.catalog)
        changed['nodes']['car_control']['fields']['targetStatus']['max'] = 99
        second = self.api.search_capabilities('关窗', self.api.capability_index(changed, []), [], embedding_provider=None)['index_hash']
        self.assertNotEqual(first, second)
        connections = [{'server_id': 'bound', 'configured': True, 'available': None,
                        'tools': [{'name': 'read', 'description': '读取数据', 'allow_trials': False}]}]
        first = self.api.search_capabilities('读取数据', self.index(connections), [], embedding_provider=None)['index_hash']
        connections[0]['tools'][0]['allow_trials'] = True
        second = self.api.search_capabilities('读取数据', self.index(connections), [], embedding_provider=None)['index_hash']
        self.assertNotEqual(first, second)

    def test_short_index_is_smaller_than_full_catalog_and_indeterminate_type_needs_selection(self):
        index = self.index()
        # Internal index documents now include embedding text and cache hashes.
        # The model-visible complete fallback must remain a short discovery view.
        discovery = self.api.search_capabilities('zzunmatchedzz', index, [], embedding_provider=None)['capability_overview']
        self.assertEqual(len(index), len(discovery))
        self.assertLess(len(json.dumps(discovery, ensure_ascii=False, separators=(',', ':'))),
                        len(json.dumps(self.catalog, ensure_ascii=False, separators=(',', ':'))))
        view = self.api.resolve_selection(['node:car_control'], self.catalog, {}, [])
        self.assertTrue(view['selection_incomplete'])
        self.assertIn('operation_selection_required', [item['code'] for item in view['diagnostics']])
        view = self.api.resolve_selection(['node:tool'], self.catalog, {}, [])
        self.assertTrue(view['selection_incomplete'])
        self.assertEqual([], view['mcp_connections'])

    def test_selected_action_excludes_other_operation_fields(self):
        view = self.api.resolve_selection(['action:windows.close_all'], self.catalog, {}, [])
        fields = view['catalog']['nodes']['car_control']['fields']
        self.assertNotIn('controlId', fields)
        self.assertNotIn('color', fields)
        self.assertIn('area', fields)
        self.assertIn('targetStatus', fields)

    def test_selected_hmi_contract_and_schema_do_not_restore_other_controls(self):
        selection = {'requirements': [{'requirement_id': 'R1', 'capability_ids': ['hmi:ac.temp']}], 'unresolved': []}
        original = json.dumps(self.catalog, sort_keys=True)
        view = self.api.resolve_selection(selection, self.catalog, {}, [])
        car = view['catalog']['nodes']['car_control']
        self.assertEqual(['ac.temp'], list(car['hmi_controls']))
        self.assertEqual(16, car['hmi_controls']['ac.temp']['min'])
        self.assertEqual(30, car['hmi_controls']['ac.temp']['max'])
        self.assertEqual(['ac.temp'], car['fields']['controlId']['enum'])
        self.assertNotIn('seat.heat.0', json.dumps(car, ensure_ascii=False))
        self.assertEqual(['ac.temp'], patch_data_schema(view['catalog'])['properties']['controlId']['enum'])
        self.assertIn('hmi', view['catalog']['connection_contract']['consumers'])
        self.assertEqual(original, json.dumps(self.catalog, sort_keys=True))

    def test_selected_action_keeps_protocol_and_does_not_load_all_hmi(self):
        view = self.api.resolve_selection(['action:windows.close_all'], self.catalog, {}, [])
        car = view['catalog']['nodes']['car_control']
        self.assertEqual({}, car['hmi_controls'])
        self.assertNotIn('seat.heat.0', json.dumps(car, ensure_ascii=False))
        self.assertIn('actions', json.dumps(view['catalog']['connection_contract']))
        self.assertIn('targetStatus', car['fields'])
        self.assertIn('node:car_control', view['selected_ids'])
        self.assertNotIn('llm', view['catalog']['nodes'])

    def test_existing_legacy_nodes_are_readable_preserved_not_new_creation(self):
        project = {'nodes': [{'id': 'saved', 'type': 'interaction', 'data': {'plan': {'old': True}}}], 'edges': []}
        view = self.api.resolve_selection([], self.catalog, project, [])
        self.assertIn('interaction', view['catalog']['nodes'])
        facts = view['facts']['node:interaction']
        self.assertFalse(facts['create_allowed'])
        self.assertTrue(facts['existing_readable'])
        self.assertFalse(view['selection_incomplete'])
        new = self.api.resolve_selection(['node:interaction'], self.catalog, {}, [])
        self.assertIn('creation_disallowed', [d['code'] for d in new['diagnostics']])

    def test_unknown_mcp_and_discovery_failure_cannot_become_gap(self):
        connections = [{'server_id': 'external', 'configured': True, 'available': None,
                        'tools': [{'name': 'fetch', 'allow_trials': False}]}]
        index = self.index(connections)
        summary = next(item for item in index if item['id'] == 'mcp:external/fetch')
        self.assertFalse(summary['known'])
        self.assertEqual('unknown', summary['purpose'])
        self.assertTrue(summary['facts']['configured'])
        self.assertIsNone(summary['facts']['existing_readable'])
        unrelated = self.api.resolve_selection(['node:output'], self.catalog, {}, connections)
        self.assertFalse(unrelated['selection_incomplete'])
        view = self.api.resolve_selection(['mcp:external/fetch'], self.catalog, {}, connections)
        self.assertTrue(view['selection_incomplete'])
        self.assertFalse(view['facts']['mcp:external/fetch']['trial_authorized'])
        self.assertNotIn('capability_gap', [d['code'] for d in view['diagnostics']])
        connections[0].update(available=False, issue='discovery timeout')
        view = self.api.resolve_selection(['mcp:external/fetch'], self.catalog, {}, connections)
        self.assertIn('connection_unavailable', [d['code'] for d in view['diagnostics']])
        self.assertNotIn('capability_gap', [d['code'] for d in view['diagnostics']])

    def test_mcp_only_selected_schema_loaded_and_unknown_selection_reported(self):
        connections = [{'server_id': 'ext', 'configured': True, 'available': True,
                        'tools': [{'name': 'one', 'description': '读取当前测量', 'allow_trials': True, 'input_schema': {'type': 'object'}},
                                  {'name': 'two', 'description': '未选工具', 'allow_trials': False, 'input_schema': {'secret_not_selected': True}}]}]
        view = self.api.resolve_selection(['mcp:ext/one', 'mcp:unregistered/nope'], self.catalog, {}, connections)
        self.assertEqual(['one'], [tool['name'] for tool in view['mcp_connections'][0]['tools']])
        self.assertNotIn('secret_not_selected', json.dumps(view))
        self.assertIn('unknown_capability_id', [d['code'] for d in view['diagnostics']])
        self.assertTrue(view['selection_incomplete'])


if __name__ == '__main__':
    unittest.main()
