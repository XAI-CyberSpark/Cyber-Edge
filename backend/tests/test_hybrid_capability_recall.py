"""Injected vectors exercise retrieval mechanics, never model semantic quality."""
import copy
import math
import sqlite3
import threading
import unittest
from unittest.mock import patch

from app.services import capability_selection as selection
from app.services.hmi_control_contract import CONTROLS
from app.services.node_capability_service import authoring_catalog


class VectorProvider:
    """A deterministic embedding boundary with independent, literal vectors."""
    fingerprint = 'test-model@revision-one'
    metadata = {'model_id': 'test-model', 'revision': 'one', 'dimension': 3}

    def __init__(self, document_vectors=None, query_vectors=None):
        self.document_vectors = document_vectors or {}
        self.query_vectors = query_vectors or {}
        self.document_batches = []
        self.queries = []

    def embed_documents(self, documents):
        self.document_batches.append(list(documents))
        return [next((vector for term, vector in self.document_vectors.items() if term in text),
                     [0.0, 0.0, 1.0]) for text in documents]

    def embed_query(self, query):
        self.queries.append(query)
        return next((vector for term, vector in self.query_vectors.items() if term in query),
                    [1.0, 0.0, 0.0])


def records(count=40):
    # Literal independent purposes make a small-budget ranking visible.
    return [{'id': f'action:item{i:02}', 'node_type': 'tool', 'operation': f'item{i:02}',
             'purpose': f'资料条目第{i}项', 'inputs': '参数', 'outputs': '结果',
             'source': 'simulation', 'limits': ['simulation_only'], 'known': True,
             'facts': {'create_allowed': True, 'trial_authorized': False}}
            for i in range(count)]


class HybridCapabilityRecallTests(unittest.TestCase):
    def setUp(self):
        if hasattr(selection, '_VECTOR_CACHE'):
            selection._VECTOR_CACHE.clear()
        self.catalog = authoring_catalog()
        self.catalog['nodes']['car_control']['hmi_controls'] = copy.deepcopy(CONTROLS)

    def index(self, connections=None):
        return selection.capability_index(self.catalog, connections or [])

    def test_builtin_tools_have_independent_registered_purposes(self):
        index = {item['id']: item for item in self.index()}
        self.assertIn('音乐', index['action:music']['purpose'])
        self.assertIn('导航', index['action:nav']['purpose'])
        self.assertIn('电话', index['action:call_phone']['purpose'])
        self.assertEqual(3, len({index[id]['document_hash'] for id in
                                ('action:music', 'action:nav', 'action:call_phone')}))
        self.assertIn('interface_simulation_only', index['action:music']['limits'])

    def test_registered_node_details_supply_json_branch_and_hmi_discovery(self):
        index = self.index()
        expected = [('outputFields', 'node:input'), ('true false', 'node:logic'), ('HMI助手', 'node:output')]
        for query, id in expected:
            with self.subTest(query=query):
                result = selection.search_capabilities(query, index, [], embedding_provider=None)
                self.assertFalse(result['fallback'])
                found = next((item for item in result['candidates'] if item['id'] == id), None)
                self.assertIsNotNone(found)
                self.assertIn('lexical_score', found)

    def test_semantic_documents_use_operation_purpose_without_shared_protocol_noise(self):
        index = {i['id']: i for i in self.index()}
        # Semantic documents are the registered behavioral descriptions; identity
        # and shared transport field strings remain in the lexical boundary.
        self.assertEqual('关闭车窗', index['action:windows.close_all']['semantic_text'])
        self.assertEqual('目标温度', index['hmi:ac.temp']['semantic_text'])
        self.assertNotIn('action_result', index['action:windows.close_all']['semantic_text'])
        self.assertIn('JSON', index['node:input']['semantic_text'])
        self.assertIn('true / false', index['node:logic']['semantic_text'])
        self.assertIn('HMI助手', index['node:output']['semantic_text'])

    def test_full_mcp_description_and_schema_meanings_exclude_example_values(self):
        description = '读取当前记录。' * 30 + '保留完整备注说明'
        connections = [{'server_id': 's', 'configured': True, 'available': True,
                        'tools': [{'name': 'read', 'description': description,
                                   'input_schema': {'type': 'object', 'properties': {
                                       'record': {'type': 'string', 'description': '记录标识符',
                                                  'default': 'DO_NOT_INDEX_DEFAULT', 'examples': ['DO_NOT_INDEX_EXAMPLE']}}}}]}]
        record = next(i for i in self.index(connections) if i['id'] == 'mcp:s/read')
        self.assertIn('保留完整备注说明', record['semantic_text'])
        self.assertIn('记录标识符', record['semantic_text'])
        self.assertNotIn('DO_NOT_INDEX', record['semantic_text'])

    def test_unknown_mcp_purpose_is_not_inferred_from_names(self):
        index = self.index([{'server_id': 'forecast', 'configured': True, 'available': True,
                             'tools': [{'name': 'weather', 'allow_trials': False}]}])
        item = next(item for item in index if item['id'] == 'mcp:forecast/weather')
        self.assertEqual('unknown', item['purpose'])
        self.assertFalse(item['known'])
        self.assertNotIn('weather', item['semantic_text'])
        self.assertEqual(('forecast', 'weather'), (item['server_id'], item['tool_name']))

    def test_semantic_paraphrase_recalls_tool_without_lexical_overlap(self):
        index = records()
        index[0]['purpose'] = '关闭车窗'
        provider = VectorProvider({'关闭车窗': [4.0, 0.0, 0.0]})
        result = selection.search_capabilities('把玻璃升到最顶端', index, [], embedding_provider=provider)
        self.assertFalse(result['fallback'])
        self.assertEqual('action:item00', result['candidates'][0]['id'])
        self.assertEqual('hybrid', result['retrieval_status'])
        self.assertEqual('semantic', result['candidates'][0]['recall_source'])
        self.assertLess(len(result['candidates']), len(index))
        self.assertNotIn('semantic_text', result['candidates'][0])

    def test_rank_fusion_preserves_exact_identity_and_required_ref(self):
        index = records()
        index[0]['purpose'] = '关闭车窗'
        index[1]['purpose'] = '关闭车窗并返回当前状态'
        provider = VectorProvider({'返回当前状态': [1.0, 0.0, 0.0], '关闭车窗': [0.6, 0.8, 0.0]})
        result = selection.search_capabilities('action:item39 关闭车窗', index, ['action:item38'],
                                               embedding_provider=provider)
        ids = [item['id'] for item in result['candidates']]
        self.assertEqual('action:item39', ids[0])
        self.assertIn('action:item38', ids)
        fused = next(item for item in result['candidates'] if item['id'] == 'action:item01')
        self.assertEqual('hybrid_rrf', fused['recall_source'])
        self.assertGreater(fused['score'], 0)
        self.assertIsNotNone(fused['lexical_score'])
        self.assertIsNotNone(fused['semantic_score'])

    def test_long_narration_does_not_force_full_index_and_keeps_late_intent(self):
        index = records()
        index[0]['purpose'] = '关闭车窗'
        index[1]['purpose'] = '播放音乐'
        provider = VectorProvider({'关闭车窗': [1.0, 0.0, 0.0], '播放音乐': [0.0, 1.0, 0.0]},
                                  {'关窗': [1.0, 0.0, 0.0], '放首歌': [0.0, 1.0, 0.0]})
        query = '关窗。' + '这段背景用于说明昨天经过的城市和旅途中看到的景物。' * 35 + '最后请放首歌。'
        result = selection.search_capabilities(query, index, [], embedding_provider=provider)
        self.assertFalse(result['fallback'])
        self.assertLess(len(result['candidates']), len(index))
        self.assertTrue({'action:item00', 'action:item01'} <= {i['id'] for i in result['candidates']})
        self.assertTrue(all(len(text) <= 400 for text in provider.queries))

    def test_provider_failure_leaves_lexical_results_and_explicit_degradation(self):
        index = records()
        index[0]['purpose'] = '关闭车窗'
        provider = VectorProvider()
        with patch.object(provider, 'embed_documents', side_effect=RuntimeError('offline')):
            result = selection.search_capabilities('关闭车窗', index, [], embedding_provider=provider)
        self.assertFalse(result['fallback'])
        self.assertEqual('action:item00', result['candidates'][0]['id'])
        self.assertEqual('degraded', result['retrieval_status'])
        self.assertEqual('unavailable', result['semantic_status'])
        self.assertIn('semantic_recall_unavailable', [item['code'] for item in result['diagnostics']])

    def test_lexical_failure_still_uses_semantic_results(self):
        index = records()
        index[0]['purpose'] = '关闭车窗'
        provider = VectorProvider({'关闭车窗': [1.0, 0.0, 0.0]})
        with patch.object(selection.sqlite3, 'connect', side_effect=sqlite3.OperationalError('offline')):
            result = selection.search_capabilities('把玻璃升到最顶端', index, [], embedding_provider=provider)
        self.assertFalse(result['fallback'])
        self.assertEqual('action:item00', result['candidates'][0]['id'])
        self.assertEqual('degraded', result['retrieval_status'])

    def test_both_unavailable_and_no_evidence_keep_overview_without_false_gap(self):
        index = records()
        provider = VectorProvider()
        for failure in (False, True):
            with self.subTest(failure=failure):
                if failure:
                    with patch.object(selection.sqlite3, 'connect', side_effect=sqlite3.OperationalError()), \
                            patch.object(provider, 'embed_query', side_effect=RuntimeError()):
                        result = selection.search_capabilities('zzunmatchedzz', index, [], embedding_provider=provider)
                else:
                    result = selection.search_capabilities('zzunmatchedzz', index, [], embedding_provider=provider)
                self.assertTrue(result['fallback'])
                self.assertEqual([], result['candidates'])
                self.assertEqual(len(index), len(result['capability_overview']))
                self.assertNotIn('capability_gap', [item['code'] for item in result['diagnostics']])

    def test_both_backends_unavailable_keep_explicit_id_and_complete_overview(self):
        index = records()
        provider = VectorProvider()
        with patch.object(selection.sqlite3, 'connect', side_effect=sqlite3.OperationalError()), \
                patch.object(provider, 'embed_documents', side_effect=RuntimeError()):
            result = selection.search_capabilities('action:item00', index, [], embedding_provider=provider)
        self.assertTrue(result['fallback'])
        self.assertEqual(1, len(result['candidates']))
        self.assertEqual(len(index), len(result['capability_overview']))
        self.assertEqual('action:item00', result['candidates'][0]['id'])

    def test_wrong_dimension_nonfinite_and_zero_vectors_degrade_safely(self):
        index = records()
        index[0]['purpose'] = '关闭车窗'
        for bad in ([1.0, 0.0], [1.0, math.nan, 0.0], [math.inf, 0.0, 0.0], [0.0, 0.0, 0.0]):
            with self.subTest(vector=bad):
                provider = VectorProvider({'关闭车窗': bad})
                if hasattr(selection, '_VECTOR_CACHE'):
                    selection._VECTOR_CACHE.clear()
                result = selection.search_capabilities('关闭车窗', index, [], embedding_provider=provider)
                self.assertFalse(result['fallback'])
                self.assertEqual('degraded', result['retrieval_status'])
                self.assertEqual('action:item00', result['candidates'][0]['id'])

    def test_dynamic_permissions_refresh_without_reembedding_static_document(self):
        connections = [{'server_id': 's', 'configured': True, 'available': True,
                        'tools': [{'name': 'measure', 'description': '读取测量数据', 'allow_trials': False}]}]
        provider = VectorProvider({'读取测量数据': [1.0, 0.0, 0.0]})
        before_index = self.index(connections)
        before = selection.search_capabilities('测量数据', before_index, [], embedding_provider=provider)
        connections[0]['tools'][0]['allow_trials'] = True
        connections[0]['available'] = False
        after_index = self.index(connections)
        after = selection.search_capabilities('测量数据', after_index, [], embedding_provider=provider)
        self.assertNotEqual(before['index_hash'], after['index_hash'])
        self.assertEqual(1, len(provider.document_batches))
        before_mcp = next(item for item in before_index if item['id'] == 'mcp:s/measure')
        after_mcp = next(item for item in after_index if item['id'] == 'mcp:s/measure')
        self.assertEqual(before_mcp['document_hash'], after_mcp['document_hash'])
        candidate = next(item for item in after['candidates'] if item['id'] == 'mcp:s/measure')
        self.assertTrue(candidate['facts']['trial_authorized'])
        self.assertFalse(candidate['facts']['connection_available'])

    def test_single_entry_update_and_model_revision_invalidate_cached_vectors(self):
        connections = [{'server_id': 's', 'configured': True, 'available': True,
                        'tools': [{'name': 'one', 'description': '读取测量数据', 'input_schema': {'type': 'object'}},
                                  {'name': 'two', 'description': '显示结果', 'input_schema': {'type': 'object'}}]}]
        provider = VectorProvider({'读取测量数据': [1.0, 0.0, 0.0]})
        index = self.index(connections)
        selection.search_capabilities('测量数据', index, [], embedding_provider=provider)
        connections[0]['tools'][0]['input_schema']['properties'] = {'value': {'type': 'number'}}
        changed = self.index(connections)
        selection.search_capabilities('测量数据', changed, [], embedding_provider=provider)
        self.assertEqual(1, len(provider.document_batches[1]))
        self.assertNotEqual(next(i for i in index if i['id'] == 'mcp:s/one')['document_hash'],
                            next(i for i in changed if i['id'] == 'mcp:s/one')['document_hash'])
        provider.fingerprint = 'test-model@revision-two'
        selection.search_capabilities('测量数据', changed, [], embedding_provider=provider)
        self.assertEqual(len(changed), len(provider.document_batches[2]))

    def test_ordered_cache_rebuild_and_ranking_are_deterministic(self):
        index = records()
        index[0]['purpose'] = '关闭车窗'
        provider = VectorProvider({'关闭车窗': [1.0, 0.0, 0.0]})
        first = selection.search_capabilities('关窗', index, [], embedding_provider=provider)
        second = selection.search_capabilities('关窗', list(reversed(index)), [], embedding_provider=provider)
        self.assertEqual([i['id'] for i in first['candidates']], [i['id'] for i in second['candidates']])
        self.assertEqual(1, len(provider.document_batches))

    def test_node_creation_permission_changes_current_facts_without_reembedding(self):
        provider = VectorProvider()
        before_index = self.index()
        selection.search_capabilities('应用动作', before_index, [], embedding_provider=provider)
        self.catalog['nodes']['tool']['generatable'] = False
        after = selection.search_capabilities('应用动作', self.index(), ['node:tool'], embedding_provider=provider)
        self.assertEqual(1, len(provider.document_batches))
        node = next(i for i in after['candidates'] if i['id'] == 'node:tool')
        self.assertFalse(node['facts']['create_allowed'])

    def test_one_operation_purpose_change_keeps_sibling_vector_cache(self):
        provider = VectorProvider()
        before = self.index()
        selection.search_capabilities('音乐', before, [], embedding_provider=provider)
        self.catalog['nodes']['tool']['operation_summaries']['music'] = '更新音乐媒体选择界面'
        after = self.index()
        before_by_id, after_by_id = ({i['id']: i for i in index} for index in (before, after))
        self.assertNotEqual(before_by_id['action:music']['document_hash'], after_by_id['action:music']['document_hash'])
        self.assertEqual(before_by_id['action:nav']['document_hash'], after_by_id['action:nav']['document_hash'])
        selection.search_capabilities('音乐', after, [], embedding_provider=provider)
        # The whole tool node overview also contains the changed catalog.
        self.assertEqual(2, len(provider.document_batches[1]))

    def test_identical_tool_names_keep_distinct_server_bindings_and_permissions(self):
        connections = [{'server_id': 'a', 'configured': True, 'available': True,
                        'tools': [{'name': 'read', 'description': '读取测量数据', 'allow_trials': False}]},
                       {'server_id': 'b', 'configured': False, 'available': False,
                        'tools': [{'name': 'read', 'description': '读取不同测量数据', 'allow_trials': True}]}]
        provider = VectorProvider({'测量数据': [1.0, 0.0, 0.0]})
        index = self.index(connections)
        result = selection.search_capabilities('mcp:b/read', index, ['mcp:a/read'], embedding_provider=provider)
        candidates = {i['id']: i for i in result['candidates']}
        self.assertEqual('mcp:b/read', result['candidates'][0]['id'])
        self.assertFalse(candidates['mcp:b/read']['facts']['configured'])
        self.assertFalse(candidates['mcp:a/read']['facts']['trial_authorized'])
        self.assertNotEqual(next(i for i in index if i['id'] == 'mcp:a/read')['document_hash'],
                            next(i for i in index if i['id'] == 'mcp:b/read')['document_hash'])

    def test_explicit_none_has_lexical_only_status_without_provider_failure(self):
        index = records()
        index[0]['purpose'] = '关闭车窗'
        with patch('app.services.capability_selection.get_embedding_provider', side_effect=AssertionError('must not load')):
            result = selection.search_capabilities('关闭车窗', index, [], embedding_provider=None)
        self.assertEqual('lexical_only', result['retrieval_status'])
        self.assertEqual('disabled', result['semantic_status'])
        self.assertEqual([], result['diagnostics'])

    def test_dense_only_skips_fts_and_reports_effective_semantic_mode(self):
        index = records()
        index[0]['purpose'] = '关闭车窗'
        provider = VectorProvider({'关闭车窗': [1.0, 0.0, 0.0]})
        with patch.object(selection.sqlite3, 'connect', side_effect=AssertionError('disabled lexical index was built')):
            result = selection.search_capabilities('把玻璃升到最顶端', index, [], embedding_provider=provider,
                                                   lexical_enabled=False)
        self.assertFalse(result['fallback'])
        self.assertEqual('semantic_only', result['retrieval_status'])
        self.assertEqual('action:item00', result['candidates'][0]['id'])
        self.assertEqual([], result['diagnostics'])

    def test_dense_only_provider_failure_preserves_forced_id_and_complete_discovery(self):
        index = records()
        provider = VectorProvider()
        with patch.object(provider, 'embed_documents', side_effect=RuntimeError('offline')):
            result = selection.search_capabilities('action:item00', index, [], embedding_provider=provider,
                                                   lexical_enabled=False)
        self.assertTrue(result['fallback'])
        self.assertEqual('degraded', result['retrieval_status'])
        self.assertEqual(['action:item00'], [item['id'] for item in result['candidates']])
        self.assertEqual(len(index), len(result['capability_overview']))

    def test_busy_vector_cache_has_bounded_wait_and_lexical_degradation(self):
        index = records()
        index[0]['purpose'] = '关闭车窗'
        provider = VectorProvider()
        held, release = threading.Event(), threading.Event()

        def hold_cache():
            with selection._VECTOR_CACHE_LOCK:
                held.set()
                release.wait(2)

        thread = threading.Thread(target=hold_cache)
        thread.start()
        self.assertTrue(held.wait(1))
        try:
            with patch.object(selection, '_VECTOR_CACHE_WAIT_SECONDS', 0.02, create=True):
                result = selection.search_capabilities('关闭车窗', index, [], embedding_provider=provider)
        finally:
            release.set()
            thread.join(1)
        self.assertEqual('degraded', result['retrieval_status'])
        self.assertFalse(result['fallback'])
        self.assertEqual('action:item00', result['candidates'][0]['id'])
        self.assertIn('embedding_cache_busy', [i.get('reason') for i in result['diagnostics']])

    def test_invalid_query_vectors_do_not_reuse_valid_document_scores(self):
        index = records()
        index[0]['purpose'] = '关闭车窗'
        provider = VectorProvider({'关闭车窗': [1.0, 0.0, 0.0]}, {'关闭车窗': [1.0, 0.0]})
        result = selection.search_capabilities('关闭车窗', index, [], embedding_provider=provider)
        self.assertEqual('unavailable', result['semantic_status'])
        self.assertFalse(result['fallback'])
        self.assertEqual('action:item00', result['candidates'][0]['id'])

    def test_true_score_ties_obey_hard_top_k_and_keep_complete_overview(self):
        index = records()
        for item in index:
            item['purpose'] = '关闭车窗'
        provider = VectorProvider({'关闭车窗': [1.0, 0.0, 0.0]})
        result = selection.search_capabilities('关闭车窗', index, [], embedding_provider=provider)
        self.assertFalse(result['fallback'])
        self.assertEqual([item['id'] for item in index[:32]], [item['id'] for item in result['candidates']])
        self.assertEqual(len(index), len(result['capability_overview']))

    def test_default_factory_is_used_without_breaking_three_positional_arguments(self):
        index = records()
        index[0]['purpose'] = '关闭车窗'
        provider = VectorProvider({'关闭车窗': [1.0, 0.0, 0.0]})
        with patch('app.services.capability_selection.get_embedding_provider', return_value=provider):
            result = selection.search_capabilities('把玻璃升到最顶端', index, [])
        self.assertEqual('hybrid', result['retrieval_status'])
        self.assertEqual('action:item00', result['candidates'][0]['id'])


class ThresholdTopKPolicyTests(unittest.TestCase):
    def test_default_hard_top_k_breaks_equal_scores_by_identity(self):
        index = records(40)
        for item in index:
            item['purpose'] = '共享行为'
        result = selection.search_capabilities('共享行为', list(reversed(index)), [], embedding_provider=None)
        self.assertEqual([item['id'] for item in index[:32]], [item['id'] for item in result['candidates']])
        self.assertEqual({'type': 'relative_rrf_threshold_top_k_v1', 'min_score': 0.35, 'top_k': 32,
                          'score_normalization': 'relative_to_best_rrf',
                          'forced_ids': []}, result['selection_policy'])
        self.assertEqual({1.0}, {item['normalized_score'] for item in result['candidates']})
        self.assertEqual(40, len(result['capability_overview']))

    def test_threshold_and_top_k_intersect_without_character_budget(self):
        index = records(20)
        for item in index:
            item['inputs'] = '很长的能力参数说明' * 2000
        scores = {item['id']: 20 - i for i, item in enumerate(index)}
        provider = VectorProvider()
        with patch.object(selection, '_semantic_scores', return_value=(scores, provider.metadata)):
            result = selection.search_capabilities('无词法查询', index, [], embedding_provider=provider,
                                                   lexical_enabled=False, min_score=0.95, top_k=20)
            limited = selection.search_capabilities('无词法查询', index, [], embedding_provider=provider,
                                                    lexical_enabled=False, min_score=0.0, top_k=2)
        self.assertEqual([item['id'] for item in index[:4]], [item['id'] for item in result['candidates']])
        self.assertEqual([item['id'] for item in index[:2]], [item['id'] for item in limited['candidates']])
        self.assertTrue(all(0.95 <= item['normalized_score'] <= 1 for item in result['candidates']))
        self.assertGreater(sum(len(str(item)) for item in limited['candidates']), 6000)

    def test_exact_and_required_refs_are_explicit_exceptions_to_threshold_and_k(self):
        index = records(5)
        scores = {item['id']: 5 - i for i, item in enumerate(index)}
        provider = VectorProvider()
        with patch.object(selection, '_semantic_scores', return_value=(scores, provider.metadata)):
            result = selection.search_capabilities('action:item04', index, ['action:item03', 'action:unknown'],
                                                   embedding_provider=provider, lexical_enabled=False,
                                                   min_score=1.0, top_k=1)
        self.assertEqual(['action:item04', 'action:item00', 'action:item03'],
                         [item['id'] for item in result['candidates']])
        self.assertEqual(['action:item04', 'action:item03'], result['selection_policy']['forced_ids'])
        self.assertEqual(['exact_id', 'semantic', 'required_ref'],
                         [item['recall_source'] for item in result['candidates']])
        self.assertIsNone(result['candidates'][0]['normalized_score'])
        self.assertIn('required_reference_unknown', [item['code'] for item in result['diagnostics']])

    def test_no_evidence_keeps_only_forced_candidates_and_complete_safe_overview(self):
        index = records(5)
        result = selection.search_capabilities('zzunmatchedzz', index, ['action:item03'], embedding_provider=None)
        self.assertTrue(result['fallback'])
        self.assertEqual(['action:item03'], [item['id'] for item in result['candidates']])
        self.assertIsNone(result['candidates'][0]['normalized_score'])
        self.assertEqual(5, len(result['capability_overview']))
        self.assertIn({'code': 'recall_no_evidence', 'status': 'selection_incomplete'}, result['diagnostics'])
        self.assertNotIn('capability_gap', [item['code'] for item in result['diagnostics']])

    def test_scored_required_ref_keeps_fused_position_without_consuming_ordinary_k(self):
        index = records(20)
        scores = {item['id']: 20 - i for i, item in enumerate(index)}
        provider = VectorProvider()
        with patch.object(selection, '_semantic_scores', return_value=(scores, provider.metadata)):
            result = selection.search_capabilities('无词法查询', index, ['action:item00', 'action:item19'],
                                                   embedding_provider=provider, lexical_enabled=False,
                                                   min_score=0.35, top_k=1)
        self.assertEqual(['action:item00', 'action:item01', 'action:item19'],
                         [item['id'] for item in result['candidates']])
        self.assertEqual(['required_ref', 'semantic', 'required_ref'],
                         [item['recall_source'] for item in result['candidates']])
        self.assertEqual(1.0, result['candidates'][0]['normalized_score'])
        self.assertIsNone(result['candidates'][-1]['normalized_score'])

    def test_invalid_threshold_and_k_rejected_before_retrieval(self):
        for kwargs in ({'min_score': True}, {'min_score': float('nan')}, {'min_score': float('inf')},
                       {'min_score': -0.1}, {'min_score': 1.1}, {'min_score': '0.5'},
                       {'top_k': True}, {'top_k': 0}, {'top_k': -1}, {'top_k': 1.5}, {'top_k': '2'}):
            with self.subTest(kwargs=kwargs), \
                    patch.object(selection.sqlite3, 'connect', side_effect=AssertionError('invalid policy queried')):
                with self.assertRaisesRegex(ValueError, 'invalid_recall_selection_policy'):
                    selection.search_capabilities('查询', records(), [], embedding_provider=None, **kwargs)
