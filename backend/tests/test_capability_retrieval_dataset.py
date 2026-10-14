"""Independent retrieval gold must remain grounded in registered contracts.

These checks validate the benchmark consumed by the evaluation runner. They do
not derive labels from recall, run a model, or claim semantic retrieval quality.
"""
import json
import re
import unittest
from collections import Counter
from pathlib import Path

from app.services.capability_selection import capability_index


ROOT = Path(__file__).resolve().parents[2]
DATASET_PATH = ROOT / 'benchmarks/retrieval/capability-retrieval-v1.json'


def gold_ids(case):
    return set(case['required_ids']).union(*map(set, case['acceptable_groups']))


class CapabilityRetrievalDatasetTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(DATASET_PATH.is_file(), 'independent retrieval gold dataset is missing')
        self.dataset = json.loads(DATASET_PATH.read_text(encoding='utf-8'))
        self.cases = self.dataset['cases']
        self.catalog = json.loads((ROOT / 'backend/app/services/node_capabilities.json').read_text(encoding='utf-8'))

    def test_splits_have_distinct_queries_and_stable_reviewable_labels(self):
        self.assertEqual(1, self.dataset['schema_version'])
        self.assertEqual('frozen_pre_tuning', self.dataset['gold_status'])
        self.assertGreaterEqual(len(self.cases), 40)
        counts = Counter(case['split'] for case in self.cases)
        self.assertEqual({'development', 'heldout'}, set(counts))
        for count in counts.values():
            self.assertGreaterEqual(count, 20)
        self.assertEqual(len(self.cases), len({case['id'] for case in self.cases}))
        normalized = {re.sub(r'\s+', '', case['query']).casefold() for case in self.cases}
        self.assertEqual(len(self.cases), len(normalized), 'duplicate wording leaks across splits')
        for case in self.cases:
            with self.subTest(case=case['id']):
                self.assertTrue(case['query'].strip())
                self.assertTrue(case['reasoning'].strip())
                self.assertTrue(case['evidence'])
                self.assertIsInstance(case['ambiguities'], list)
                self.assertIsInstance(case['non_authorization'], list)
                self.assertFalse({'rank', 'score', 'search_result', 'generated_graph', 'expected_topology'} & case.keys())

    def test_labels_and_evidence_resolve_to_the_case_contract_snapshot(self):
        snapshots = self.dataset['connection_snapshots']
        for case in self.cases:
            with self.subTest(case=case['id']):
                self.assertIn(case['connection_snapshot'], snapshots)
                index = capability_index(self.catalog, snapshots[case['connection_snapshot']])
                registered = {item['id'] for item in index}
                self.assertLessEqual(gold_ids(case), registered)
                self.assertEqual(len(case['required_ids']), len(set(case['required_ids'])))
                for group in case['acceptable_groups']:
                    self.assertGreaterEqual(len(group), 2)
                    self.assertEqual(len(group), len(set(group)))
                    self.assertFalse(set(group) & set(case['required_ids']))
                    self.assertTrue(case['ambiguities'], 'equivalence needs an explicit contract explanation')
                for evidence in case['evidence']:
                    source_path = (ROOT / evidence['path']).resolve()
                    self.assertTrue(source_path.is_relative_to(ROOT))
                    self.assertTrue(source_path.is_file(), evidence['path'])
                    self.assertTrue(evidence['note'].strip())
                    if source_path.suffix == '.json':
                        value = json.loads(source_path.read_text(encoding='utf-8'))
                        self.assertTrue(evidence['pointer'].startswith('/'))
                        for segment in evidence['pointer'].split('/')[1:]:
                            segment = segment.replace('~1', '/').replace('~0', '~')
                            value = value[int(segment)] if isinstance(value, list) else value[segment]
                        self.assertIsNotNone(value)

    def test_each_builtin_tool_operation_has_individual_cases_in_both_splits(self):
        operations = set(self.catalog['nodes']['tool']['fields']['tool_id']['enum']) - {'mcp'}
        for split in ('development', 'heldout'):
            cases = [case for case in self.cases if case['split'] == split]
            for operation in operations:
                with self.subTest(split=split, operation=operation):
                    matching = [case for case in cases if case['required_ids'] == ['action:' + operation]]
                    self.assertTrue(matching, 'tool operations need independent labels, not a shared generic tool label')
                    self.assertTrue(all(case['non_authorization'] for case in matching))

    def test_dataset_covers_nodes_and_broad_hmi_and_canonical_vehicle_operations(self):
        covered = set().union(*(gold_ids(case) for case in self.cases))
        self.assertLessEqual({'node:' + kind for kind in self.catalog['nodes']}, covered)
        hmi = {id[4:] for id in covered if id.startswith('hmi:')}
        self.assertGreaterEqual(len(hmi), 30)
        self.assertLessEqual({'ac', 'doors', 'locks', 'lights', 'display', 'mirrors', 'steering',
                              'driving', 'autopilot', 'safety', 'service', 'glovebox', 'seat', 'sunshade'},
                             {id.split('.')[0] for id in hmi})
        self.assertLessEqual({'action:windows.close_all', 'action:windows.open_all',
                              'action:emergency.protocol', 'action:hazard_lights.on',
                              'action:ambient_light.set', 'action:ambient_light.restore'}, covered)

    def test_known_tasks_have_selective_expectations_and_unknowns_do_not_claim_capability(self):
        unknown_count = 0
        for case in self.cases:
            with self.subTest(case=case['id']):
                expected = case['expected_retrieval']
                index = capability_index(self.catalog, self.dataset['connection_snapshots'][case['connection_snapshot']])
                if expected['known_task']:
                    self.assertTrue(gold_ids(case))
                    self.assertFalse(expected['allow_full_fallback'])
                    self.assertIs(type(expected['max_candidates']), int)
                    self.assertLess(expected['max_candidates'], len(index))
                    self.assertGreaterEqual(expected['max_candidates'], len(case['required_ids']) + len(case['acceptable_groups']))
                else:
                    unknown_count += 1
                    self.assertTrue(expected['allow_full_fallback'])
                    self.assertIsNone(expected['max_candidates'])
                    self.assertTrue(case['non_authorization'])
        self.assertGreaterEqual(unknown_count, 4)

    def test_preserved_refs_negative_history_and_mcp_limits_are_explicit(self):
        tags = {tag for case in self.cases for tag in case['tags']}
        self.assertLessEqual({'paraphrase', 'exact_id', 'multi_intent', 'long_narration', 'negation',
                              'edit_history', 'unanswerable', 'unknown_mcp'}, tags)
        for case in self.cases:
            with self.subTest(case=case['id']):
                self.assertLessEqual(set(case['required_refs']), gold_ids(case))
                if {'negation', 'edit_history', 'unknown_mcp', 'unanswerable'} & set(case['tags']):
                    self.assertTrue(case['non_authorization'])
        unknown_tools = []
        for connections in self.dataset['connection_snapshots'].values():
            for connection in connections:
                self.assertFalse({'url', 'token', 'api_key', 'command', 'environment', 'env'} & connection.keys())
                for tool in connection['tools']:
                    self.assertIs(tool['allow_trials'], False)
                    if not (tool.get('description') or tool.get('title')):
                        unknown_tools.append(tool)
        self.assertTrue(unknown_tools, 'unknown MCP coverage must use absent metadata rather than a guessed purpose')


if __name__ == '__main__':
    unittest.main()
