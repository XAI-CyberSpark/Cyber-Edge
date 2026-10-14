"""Intent interpretation precedes retrieval and cannot silently grant capabilities."""
import copy
import json
import threading
import unittest
from unittest.mock import AsyncMock, patch

from app.schemas.orchestration_schema import WorkflowGenerateRequestSchema
from app.services import model_providers
from app.services import scenario_builder as api
from app.services.authoring_context import build_stage_context
from tests.test_scenario_builder_recovery import BRIEF, draft
from tests.test_builder_stage_protocol import executed_report, passed_review


class IntentStageContextTests(unittest.TestCase):
    def test_understand_keeps_all_user_sources_without_capability_catalog(self):
        request = WorkflowGenerateRequestSchema(prompt='只显示完成', conversation_history=[
            {'role': 'user', 'content': '之前考虑过播放音乐，现在撤回。'}])
        context = build_stage_context('understand', request, None,
                                      {'candidates': [{'id': 'action:music'}]}, {}, [])
        self.assertNotIn('available_capabilities', context)
        self.assertEqual('只显示完成', context['user_context']['request'])
        self.assertEqual('之前考虑过播放音乐，现在撤回。', context['user_context']['user_history'][0]['content'])

    def test_select_usage_keeps_actual_stage_label(self):
        context = model_providers.safe_call_context({'stage': 'select', 'call_scope': 'authoring', 'attempt': 1})
        self.assertEqual('select', context.get('stage'))


class IntentSelectionPipelineTests(unittest.IsolatedAsyncioTestCase):
    async def test_queries_follow_understand_and_union_keeps_each_requirement_source(self):
        prompt = '把目标温度设到24度；把风量设到3；不要播放音乐。'
        request = WorkflowGenerateRequestSchema(prompt=prompt, conversation_history=[
            {'role': 'user', 'content': '先打开音乐，后来撤回，不再操作音乐。'}])
        brief = {**BRIEF, 'goal': prompt, 'requirements': [
            {'id': 'R1', 'description': '将空调目标温度设置为24度', 'acceptance': '目标温度24度', 'source_quote': '把目标温度设到24度'},
            {'id': 'R2', 'description': '将空调风量设置为3', 'acceptance': '风量3', 'source_quote': '把风量设到3'},
            {'id': 'R3', 'description': '不播放音乐', 'acceptance': '音乐不变', 'source_quote': '不要播放音乐'}]}
        intent = {'brief': brief, 'queries': [
            {'requirement_id': 'R1', 'query': '空调目标温度24度'},
            {'requirement_id': 'R2', 'query': '空调风量3'},
            {'requirement_id': 'R3', 'query': None}]}
        selection = {'requirements': [
            {'requirement_id': 'R1', 'capability_ids': ['hmi:ac.temp']},
            {'requirement_id': 'R2', 'capability_ids': ['hmi:ac.fan']},
            {'requirement_id': 'R3', 'capability_ids': []}], 'unresolved': []}
        trace = []
        selected_context = []
        loop_thread = threading.get_ident()
        recall_threads = []

        def local_recall(query, index, refs, **options):
            trace.append(('search', query))
            recall_threads.append(threading.get_ident())
            identity = 'hmi:ac.temp' if query == '空调目标温度24度' else 'hmi:ac.fan'
            return {'candidates': [{'id': identity, 'purpose': query}, {'id': 'node:output', 'purpose': '显示'}],
                    'node_overview': [], 'capability_overview': [{'id': row['id']} for row in index],
                    'coverage_policy': 'complete_registry_overview_v1', 'coverage_rule': '优先列表不限制全集',
                    'diagnostics': [], 'fallback': False, 'strategy': 'bm25_embedding_rrf_v1',
                    'retrieval_status': 'available', 'semantic_status': 'available', 'index_hash': 'test',
                    'selection_policy': {'min_score': options.get('min_score'), 'top_k': options.get('top_k')}}

        async def complete(messages):
            context = json.loads(messages[1]['content'])
            if messages[0]['content'] == api.BRIEF_INSTRUCTIONS:
                trace.append(('understand', None))
                self.assertEqual([('understand', None)], trace, 'Retrieval must wait for interpreted intent')
                self.assertNotIn('available_capabilities', context)
                return json.dumps(intent)
            if messages[0]['content'] == getattr(api, 'SELECT_INSTRUCTIONS', None):
                trace.append(('select', None))
                selected_context.append(context)
                return json.dumps(selection)
            raise AssertionError('Only intent and selection calls should occur before build begins')

        builder = api.ScenarioBuilder(request, completion=complete, executor=AsyncMock())
        with patch('app.services.capability_selection.search_capabilities', side_effect=local_recall), \
                patch('app.services.mcp_runtime.safe_connection_snapshot', return_value=[]):
            events = builder.events()
            try:
                self.assertEqual('thinking', (await anext(events))[0])
                self.assertEqual('thinking', (await anext(events))[0])
            finally:
                await events.aclose()
        self.assertEqual([('understand', None), ('search', '空调目标温度24度'),
                          ('search', '空调风量3'), ('select', None)], trace)
        self.assertTrue(all(worker != loop_thread for worker in recall_threads))
        context = selected_context[0]
        self.assertEqual(prompt, context['user_context']['request'])
        self.assertEqual('先打开音乐，后来撤回，不再操作音乐。', context['user_context']['user_history'][0]['content'])
        candidates = context['available_capabilities']['candidates']
        self.assertEqual({'hmi:ac.temp', 'hmi:ac.fan', 'node:output'}, {row['id'] for row in candidates})
        output = next(row for row in candidates if row['id'] == 'node:output')
        self.assertEqual({'R1', 'R2'}, {row['requirement_id'] for row in output['query_sources']})
        sources = context['available_capabilities']['query_sources']
        self.assertEqual(['R1', 'R2', 'R3'], [row['requirement_id'] for row in sources])
        self.assertEqual('把目标温度设到24度', sources[0]['source_quote'])
        self.assertEqual('将空调目标温度设置为24度', sources[0]['description'])
        self.assertIsNone(sources[2]['query'])
        self.assertEqual(2, builder.model_calls)
        self.assertIn('hmi:ac.temp', builder.capability_view['selected_ids'])

    async def test_invalid_query_mapping_retries_before_retrieval(self):
        intent = {'brief': copy.deepcopy(BRIEF), 'queries': [{'requirement_id': 'wrong', 'query': '显示文字'}]}
        messages_seen = []
        async def complete(messages):
            messages_seen.append(copy.deepcopy(messages))
            return json.dumps(intent)
        builder = api.ScenarioBuilder(WorkflowGenerateRequestSchema(prompt='显示完成'), complete)
        with patch('app.services.capability_selection.search_capabilities') as search, \
                patch('app.services.mcp_runtime.safe_connection_snapshot', return_value=[]):
            with self.assertRaises(ValueError):
                _ = [event async for event in builder.events()]
        self.assertEqual(2, len(messages_seen))
        self.assertIn('检索改写', messages_seen[1][-1]['content'])
        self.assertFalse(search.called, 'Invalid intent must never reach capability retrieval')

    async def test_selection_retries_unknown_ids_and_preserves_understood_brief(self):
        original = {'brief': copy.deepcopy(BRIEF), 'queries': [{'requirement_id': 'R1', 'query': '显示完成文字'}]}
        seen = []
        async def complete(messages):
            seen.append(copy.deepcopy(messages))
            if messages[0]['content'] == api.BRIEF_INSTRUCTIONS:
                self.assertNotIn('available_capabilities', json.loads(messages[1]['content']))
                return json.dumps(original)
            return json.dumps({'requirements': [{'requirement_id': 'R1', 'capability_ids': ['node:invented']}], 'unresolved': []})
        builder = api.ScenarioBuilder(WorkflowGenerateRequestSchema(prompt='显示完成'), complete)
        with patch('app.services.capability_selection.get_embedding_provider', return_value=None), \
                patch('app.services.mcp_runtime.safe_connection_snapshot', return_value=[]):
            with self.assertRaises(ValueError):
                _ = [event async for event in builder.events()]
        self.assertEqual(['understand', 'select', 'select'], [row['stage'] for row in builder.calls])
        self.assertEqual(original['brief']['requirements'], json.loads(seen[-1][1]['content'])['brief']['requirements'])
        self.assertEqual(3, builder.model_calls)

    async def test_completed_report_keeps_rewrite_with_its_original_requirement(self):
        intent = {'brief': copy.deepcopy(BRIEF), 'queries': [{'requirement_id': 'R1', 'query': '显示完成文字'}]}
        async def complete(messages):
            if messages[0]['content'] == api.BRIEF_INSTRUCTIONS:return json.dumps(intent)
            if messages[0]['content'] == api.SELECT_INSTRUCTIONS:
                return json.dumps({'requirements': [{'requirement_id': 'R1', 'capability_ids': ['node:input', 'node:output']}], 'unresolved': []})
            if messages[0]['content'] == api.REVIEW_INSTRUCTIONS:return passed_review(messages)
            return json.dumps(draft())
        builder = api.ScenarioBuilder(WorkflowGenerateRequestSchema(prompt='显示完成'), complete,
                                      executor=AsyncMock(return_value=executed_report()), max_attempts=1)
        with patch('app.services.capability_selection.get_embedding_provider', return_value=None), \
                patch('app.services.mcp_runtime.safe_connection_snapshot', return_value=[]):
            result = next(data for event, data in [item async for item in builder.events()] if event == 'result')
        report = result['build_report']
        self.assertIn('intent_query_sources', report)
        self.assertEqual([{'requirement_id': 'R1', 'query': '显示完成文字',
                           'description': '显示完成', 'source_quote': '显示完成'}], report['intent_query_sources'])
        self.assertEqual(report['intent_query_sources'], result['project']['meta']['build_report']['intent_query_sources'])

    async def test_all_null_queries_only_bootstrap_directory_without_embedding(self):
        prompt = '保持原来的状态。'
        brief = {**BRIEF, 'goal': prompt, 'requirements': [
            {'id': 'R1', 'description': '保持全部状态不变', 'acceptance': '没有新增操作', 'source_quote': prompt}]}
        async def complete(messages):
            if messages[0]['content'] == api.BRIEF_INSTRUCTIONS:
                return json.dumps({'brief': brief, 'queries': [{'requirement_id': 'R1', 'query': None}]})
            context = json.loads(messages[1]['content'])
            self.assertTrue(context['available_capabilities']['capability_overview'])
            self.assertTrue(any(row['code'] == 'recall_no_evidence' for row in context['available_capabilities']['diagnostics']))
            return json.dumps({'requirements': [{'requirement_id': 'R1', 'capability_ids': []}], 'unresolved': []})
        from app.services.capability_selection import search_capabilities
        searches = []
        def discovery(query, *args, **options):
            searches.append(query)
            self.assertIsNone(options.get('embedding_provider'))
            return search_capabilities(query, *args, **options)
        builder = api.ScenarioBuilder(WorkflowGenerateRequestSchema(prompt=prompt), complete)
        with patch('app.services.capability_selection.search_capabilities', side_effect=discovery), \
                patch('app.services.capability_selection.get_embedding_provider') as embedding, \
                patch('app.services.mcp_runtime.safe_connection_snapshot', return_value=[]):
            events = builder.events()
            try:
                await anext(events)
                await anext(events)
            finally:await events.aclose()
        # The single empty query constructs discovery metadata, not a positive search.
        self.assertEqual([''], searches)
        self.assertFalse(embedding.called)

    async def test_production_cannot_use_legacy_planning_result_to_bypass_select(self):
        legacy = {'brief': copy.deepcopy(BRIEF), 'selection': {'requirements': [
            {'requirement_id': 'R1', 'capability_ids': ['node:input', 'node:output']}], 'unresolved': []}}
        builder = api.ScenarioBuilder(WorkflowGenerateRequestSchema(prompt='显示完成'))
        with patch('app.services.model_providers.complete', AsyncMock(return_value=json.dumps(legacy))), \
                patch('app.services.capability_selection.search_capabilities') as search, \
                patch('app.services.mcp_runtime.safe_connection_snapshot', return_value=[]):
            with self.assertRaises(ValueError):
                _ = [event async for event in builder.events()]
        self.assertEqual(['understand', 'understand'], [row['stage'] for row in builder.calls])
        self.assertFalse(search.called)

    async def test_blank_query_is_rejected_before_retrieval(self):
        intent = {'brief': copy.deepcopy(BRIEF), 'queries': [{'requirement_id': 'R1', 'query': '  \n  '}]}
        builder = api.ScenarioBuilder(WorkflowGenerateRequestSchema(prompt='显示完成'),
                                      AsyncMock(return_value=json.dumps(intent)))
        with patch('app.services.capability_selection.search_capabilities') as search, \
                patch('app.services.mcp_runtime.safe_connection_snapshot', return_value=[]):
            with self.assertRaises(ValueError):
                _ = [event async for event in builder.events()]
        self.assertFalse(search.called)
        self.assertEqual(2, builder.model_calls)

    async def test_explicit_identity_in_effective_query_reaches_exact_pin(self):
        prompt = '使用hmi:ac.temp把目标温度设到24度。'
        brief = {**BRIEF, 'goal': prompt, 'requirements': [
            {'id': 'R1', 'description': '目标温度24度', 'acceptance': '24度', 'source_quote': prompt}]}
        async def complete(messages):
            if messages[0]['content'] == api.BRIEF_INSTRUCTIONS:
                return json.dumps({'brief': brief, 'queries': [{'requirement_id': 'R1', 'query': 'hmi:ac.temp 目标温度24度'}]})
            context = json.loads(messages[1]['content'])['available_capabilities']
            row = next(item for item in context['candidates'] if item['id'] == 'hmi:ac.temp')
            self.assertEqual('exact_id', row['query_sources'][0]['recall_source'])
            self.assertIn('hmi:ac.temp', context['selection_policy']['forced_ids'])
            return json.dumps({'requirements': [{'requirement_id': 'R1', 'capability_ids': ['hmi:ac.temp']}], 'unresolved': []})
        builder = api.ScenarioBuilder(WorkflowGenerateRequestSchema(prompt=prompt), complete)
        with patch('app.services.capability_selection.get_embedding_provider', return_value=None), \
                patch('app.services.mcp_runtime.safe_connection_snapshot', return_value=[]):
            events = builder.events()
            try:
                await anext(events)
                await anext(events)
            finally:await events.aclose()

    async def test_per_requirement_union_does_not_apply_another_global_top_k(self):
        brief = api.ScenarioBrief.model_validate({**BRIEF, 'requirements': [
            BRIEF['requirements'][0], {'id': 'R2', 'description': '第二目标', 'acceptance': '满足', 'source_quote': '第二目标'}]})
        builder = api.ScenarioBuilder(WorkflowGenerateRequestSchema(prompt='显示完成，第二目标'))
        builder.capability_index = []
        def local_recall(query, index, refs, **options):
            start = 0 if query == 'first' else 32
            return {'candidates': [{'id': f'unit:{i}', 'rank': i-start+1, 'normalized_score': 1.0}
                                   for i in range(start, start+32)], 'node_overview': [], 'capability_overview': [],
                    'diagnostics': [], 'fallback': False, 'index_hash': 'test',
                    'selection_policy': {'min_score': options['min_score'], 'top_k': options['top_k'],
                                         'forced_ids': [f'unit:{start}']}}
        with patch('app.services.capability_selection.search_capabilities', side_effect=local_recall):
            recall = await builder._recall_intent(brief, [{'requirement_id': 'R1', 'query': 'first'},
                                                        {'requirement_id': 'R2', 'query': 'second'}])
        self.assertEqual(64, len(recall['candidates']))
        self.assertEqual('per_requirement', recall['selection_policy']['scope'])
        self.assertEqual(['unit:0', 'unit:32'], recall['selection_policy']['forced_ids'])
        self.assertNotIn('rank', recall['candidates'][0])
        self.assertEqual(1, recall['candidates'][32]['query_sources'][0]['rank'])

    async def test_custom_legacy_adapters_report_the_compatibility_path(self):
        selection = {'requirements': [{'requirement_id': 'R1', 'capability_ids': ['node:input', 'node:output']}], 'unresolved': []}
        for payload, label in ((copy.deepcopy(BRIEF), 'legacy_brief_full_contracts'),
                               ({'brief': copy.deepcopy(BRIEF), 'selection': selection}, 'legacy_planning_result')):
            with self.subTest(protocol=label):
                async def complete(messages):
                    if messages[0]['content'] == api.BRIEF_INSTRUCTIONS:return json.dumps(payload)
                    if messages[0]['content'] == api.REVIEW_INSTRUCTIONS:return passed_review(messages)
                    return json.dumps(draft())
                builder = api.ScenarioBuilder(WorkflowGenerateRequestSchema(prompt='显示完成'), complete,
                                              executor=AsyncMock(return_value=executed_report()), max_attempts=1)
                with patch('app.services.mcp_runtime.safe_connection_snapshot', return_value=[]):
                    result = next(data for event, data in [item async for item in builder.events()] if event == 'result')
                report = result['build_report']
                self.assertEqual(label, report['selection_compatibility'])
                self.assertEqual(['understand', 'build', 'review'], [row['stage'] for row in report['calls']])
                self.assertEqual([], report['intent_queries'])
