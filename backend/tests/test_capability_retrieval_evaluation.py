"""Retrieval metrics use independent relevance units and explicit denominators."""
import importlib.util
from contextlib import redirect_stderr, redirect_stdout
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch


class RetrievalEvaluationTests(unittest.TestCase):
    def setUp(self):
        path = Path(__file__).parents[2] / 'scripts' / 'evaluate_capability_retrieval.py'
        spec = importlib.util.spec_from_file_location('retrieval_eval', path)
        self.api = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.api)

    def test_policy_evidence_separates_forced_ids_from_ordinary_top_k(self):
        policy = {'type': 'relative_rrf_threshold_top_k_v1', 'min_score': .5, 'top_k': 2,
                  'score_normalization': 'relative_to_best_rrf',
                  'forced_ids': ['node:existing', 'action:exact']}
        result = {'candidates': [
            {'id': 'action:exact', 'normalized_score': .2, 'recall_source': 'exact_id'},
            {'id': 'node:first', 'normalized_score': 1.0, 'recall_source': 'fts5_bm25'},
            {'id': 'node:second', 'normalized_score': .8, 'recall_source': 'fts5_bm25'},
            {'id': 'node:existing', 'normalized_score': None, 'recall_source': 'required_ref'}],
            'selection_policy': policy}
        row = self.api.evaluate_case({'required_ids': ['node:first'],
                 'required_refs': ['node:existing'], 'expected_retrieval': {'max_candidates': 3}}, result, 1)
        self.assertEqual(policy, row.get('selection_policy'))
        self.assertEqual({'action:exact': .2, 'node:first': 1.0, 'node:second': .8,
                          'node:existing': None}, row['candidate_normalized_scores'])
        self.assertEqual(['node:existing'], row['forced_required_ref_ids'])
        self.assertEqual(['action:exact'], row['exact_id_ids'])
        self.assertEqual(['node:existing', 'action:exact'], row['threshold_exempt_ids'])
        self.assertEqual(['node:existing', 'action:exact'], row['top_k_exempt_ids'])
        self.assertEqual(2, row['ordinary_candidate_count'])
        self.assertTrue(row['ordinary_top_k_met'])
        self.assertTrue(row['ordinary_threshold_met'])
        self.assertEqual(2, row['candidate_count_above_top_k'])
        self.assertFalse(row['candidate_budget_met'])
        self.assertEqual('historical_gold_max_candidates', row['candidate_budget_scope'])

    def test_legacy_results_do_not_invent_selection_policy_or_scores(self):
        row = self.api.evaluate_case({'required_ids': ['node:output']},
                                    {'candidates': [{'id': 'node:output'}]}, 1)
        self.assertIn('selection_policy', row)
        self.assertIsNone(row['selection_policy'])
        self.assertEqual({'node:output': None}, row['candidate_normalized_scores'])
        self.assertIsNone(row['ordinary_top_k_met'])
        self.assertIsNone(row['ordinary_threshold_met'])
        self.assertEqual([], row['threshold_exempt_ids'])

    def test_cli_rejects_invalid_selection_parameters_before_writing_evidence(self):
        parent = Path(__file__).parents[2] / '.demo-runtime' / 'optimization-dev111'
        with tempfile.TemporaryDirectory(dir=parent) as directory:
            output = Path(directory) / 'report.json'
            for option, value in [('--min-score', '-.1'), ('--min-score', '1.01'),
                                  ('--min-score', 'nan'), ('--min-score', 'inf'),
                                  ('--min-score', '-inf'), ('--top-k', '0'),
                                  ('--top-k', '-1'), ('--top-k', '1.5')]:
                with self.subTest(option=option, value=value), \
                        patch.object(sys, 'argv', ['evaluate', '--output', str(output), option, value]), \
                        redirect_stderr(io.StringIO()):
                    with self.assertRaises(SystemExit) as raised:
                        self.api.main()
                    self.assertEqual(2, raised.exception.code)
                    self.assertFalse(output.exists())

    def test_cli_applies_policy_to_current_modes_without_passing_it_to_baseline(self):
        from app.services import capability_embeddings, node_capability_service

        class Provider:
            fingerprint = 'retrieval-evaluation-test-v1'
            metadata = {'model_id': 'injected-vectors', 'dimension': 2}
            closed = False

            def embed_query(self, query):
                return [1.0, 0.0]

            def embed_documents(self, documents):
                return [[1.0, 0.0] if 'densehit' in text else [0.0, 1.0] for text in documents]

            def close(self):
                self.closed = True

        provider = Provider()
        fixture = {'dataset_id': 'policy-regression', 'connection_snapshots': {'static': []},
                   'cases': [{'id': 'known', 'split': 'development', 'query': 'sharedmeaning',
                              'connection_snapshot': 'static', 'required_ids': ['node:first'],
                              'required_refs': ['node:second']}]}
        catalog = {'nodes': {kind: {'name': 'sharedmeaning', 'generatable': True}
                             for kind in ('first', 'second')}}
        catalog['nodes']['first']['description'] = 'densehit'
        parent = Path(__file__).parents[2] / '.demo-runtime' / 'optimization-dev111'
        with tempfile.TemporaryDirectory(dir=parent) as directory:
            dataset, output, baseline = (Path(directory) / name for name in ('dataset.json', 'report.json', 'old.py'))
            dataset.write_text(json.dumps(fixture), encoding='utf-8')
            baseline.write_text("def capability_index(catalog, connections):\n    return []\n"
                "def search_capabilities(query, index, refs):\n"
                "    return {'candidates': [{'id': 'node:first'}, {'id': 'node:second'}]}\n", encoding='utf-8')
            args = ['evaluate', '--dataset', str(dataset), '--output', str(output), '--baseline', str(baseline),
                    '--min-score', '.7', '--top-k', '1']
            with patch.object(sys, 'argv', args), redirect_stdout(io.StringIO()), \
                    patch.object(node_capability_service, 'CATALOG', catalog), \
                    patch.object(capability_embeddings, 'get_embedding_provider', return_value=provider):
                try:
                    self.api.main()
                except SystemExit as exc:
                    self.fail(f'valid selection parameters were rejected: {exc.code}')
            report = json.loads(output.read_text(encoding='utf-8'))
        self.assertTrue(provider.closed)
        self.assertFalse(report['intent_rewrite_evaluation']['executed'])
        self.assertEqual('dataset_original_queries', report['intent_rewrite_evaluation']['query_source'])
        self.assertFalse(report['intent_rewrite_evaluation']['real_authoring_llm_called'])
        self.assertEqual('historical_gold_max_candidates', report['candidate_budget_scope'])
        for mode in ('bm25', 'dense', 'hybrid'):
            row = report['modes'][mode]['cases'][0]
            self.assertEqual(.7, row['selection_policy']['min_score'])
            self.assertEqual(1, row['selection_policy']['top_k'])
            self.assertEqual(2, row['candidate_count'])
            self.assertEqual(1, row['ordinary_candidate_count'])
            self.assertTrue(row['ordinary_top_k_met'])
            self.assertTrue(row['ordinary_threshold_met'])
            self.assertEqual(['node:second'], row['forced_required_ref_ids'])
        self.assertIsNone(report['modes']['baseline']['cases'][0]['selection_policy'])

    def test_availability_gate_fails_when_one_task_misses_one_capability(self):
        required = [f'action:tool_{i}' for i in range(100)]
        rows = [self.api.evaluate_case({'required_ids': required},
                {'candidates': [{'id': id} for id in required[:count]]}, 1)
                for count in [100] * 29 + [99]]
        summary = self.api.aggregate(rows)
        self.assertGreater(summary['mean_recall'], .999)
        gate = summary['availability_gate']
        self.assertEqual('all_required_rate', gate['metric'])
        self.assertEqual(.999, gate['target'])
        self.assertEqual(29 / 30, gate['observed'])
        self.assertFalse(gate['sample_passed'])

    def test_small_perfect_sample_does_not_claim_population_999_target(self):
        rows = [self.api.evaluate_case({'required_ids': ['node:output']},
                {'candidates': [{'id': 'node:output'}]}, 1) for _ in range(30)]
        gate = self.api.aggregate(rows)['availability_gate']
        self.assertTrue(gate['sample_passed'])
        self.assertEqual(30, gate['known_tasks'])
        self.assertFalse(gate['population_target_validated'])

    def test_unknown_only_sample_is_not_a_passing_availability_gate(self):
        row = self.api.evaluate_case({'required_ids': []}, {'candidates': []}, 1)
        self.assertFalse(self.api.aggregate([row])['availability_gate']['sample_passed'])

    def test_complete_overview_is_available_without_claiming_ranked_recall_improved(self):
        case = {'required_ids': ['hmi:ac.temp', 'action:windows.close_all']}
        result = {'candidates': [{'id': 'action:music'}],
                  'capability_overview': [{'id': id} for id in case['required_ids']]}
        row = self.api.evaluate_case(case, result, 1)
        self.assertEqual(0, row['recall'])
        self.assertFalse(row['ranked_all_required_recalled'])
        self.assertTrue(row['all_required_recalled'])
        self.assertTrue(self.api.aggregate([row])['availability_gate']['sample_passed'])

    def test_cli_keeps_failed_evidence_and_exits_nonzero_on_missing_capability(self):
        from app.services import capability_selection
        fixture = {'dataset_id': 'gate-regression', 'connection_snapshots': {'static': []},
                   'cases': [{'id': 'miss', 'split': 'development', 'query': '显示提示',
                              'connection_snapshot': 'static', 'required_ids': ['node:output']}]}
        parent = Path(__file__).parents[2] / '.demo-runtime' / 'optimization-dev110' / 'availability-review'
        with tempfile.TemporaryDirectory(dir=parent) as directory:
            dataset = Path(directory) / 'dataset.json'
            output = Path(directory) / 'report.json'
            dataset.write_text(json.dumps(fixture), encoding='utf-8')
            args = ['evaluate', '--modes', 'bm25', '--dataset', str(dataset), '--output', str(output)]
            with patch.object(sys, 'argv', args), redirect_stdout(io.StringIO()), \
                    patch.object(capability_selection, 'search_capabilities', return_value={'candidates': []}):
                with self.assertRaises(SystemExit) as raised:
                    self.api.main()
            self.assertEqual(2, raised.exception.code)
            report = json.loads(output.read_text(encoding='utf-8'))
            self.assertFalse(report['modes']['bm25']['summary']['availability_gate']['sample_passed'])
            self.assertEqual([['node:output']], report['modes']['bm25']['cases'][0]['unavailable_units'])

    def test_alternatives_count_once_and_missing_required_ref_is_separate(self):
        case = {'required_ids': ['node:input'], 'acceptable_groups': [['node:output', 'node:fallback']],
                'required_refs': ['node:interaction'], 'expected_retrieval': {'max_candidates': 3}}
        result = {'candidates': [{'id': 'node:output'}, {'id': 'node:fallback'}, {'id': 'node:input'}],
                  'fallback': False, 'diagnostics': []}
        row = self.api.evaluate_case(case, result, 10)
        self.assertEqual(1, row['recall'])
        self.assertEqual(0.5, row['recall_at_1'])
        self.assertEqual(1, row['mrr'])
        self.assertFalse(row['required_refs_preserved'])
        self.assertLess(row['ndcg_at_10'], 1)

    def test_unknown_queries_do_not_inflate_recall_and_absent_gold_is_zero(self):
        unknown = self.api.evaluate_case({'required_ids': [], 'acceptable_groups': []},
                                        {'candidates': [], 'fallback': True}, 1)
        missed = self.api.evaluate_case({'required_ids': ['action:nav']},
                                       {'candidates': [{'id': 'action:music'}], 'fallback': False}, 2)
        self.assertIsNone(unknown['recall'])
        self.assertIsNone(unknown['mrr'])
        self.assertEqual(0, missed['recall'])
        self.assertEqual(0, missed['mrr'])
        summary = self.api.aggregate([unknown, missed])
        self.assertEqual(1, summary['relevance_cases'])
        self.assertEqual(0, summary['mean_recall'])
        self.assertEqual(0.5, summary['fallback_rate'])

    def test_unknown_identity_and_nullable_budget_keep_accuracy_denominator_explicit(self):
        case = {'required_ids': ['mcp:opaque/no_description'],
                'expected_retrieval': {'known_task': False, 'max_candidates': None}}
        row = self.api.evaluate_case(case, {'candidates': [{'id': 'mcp:opaque/no_description'}]}, 1)
        self.assertEqual(1, row['recall'])
        summary = self.api.aggregate([row])
        self.assertEqual(0, summary['relevance_cases'])
        self.assertIsNone(summary['mean_recall'])
        self.assertTrue(row['candidate_budget_met'])
