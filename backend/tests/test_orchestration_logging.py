import asyncio
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app.schemas.orchestration_schema import WorkflowGenerateRequestSchema
from app.services import scenario_builder
from app.services.hermes_authoring import EngineConfig
from app.services.model_providers import Provider


ROOT = Path(__file__).resolve().parents[2]
PROVIDER = Provider('anthropic', 'test', 'https://api.anthropic.com/v1', 'claude-test', 'private-api-key')
RESULT = {
    'project': {'nodes': [{'id': 'one', 'data': {'content': 'private-node'}}, {'id': 'two'}]},
    'provider': {'id': 'anthropic', 'model': 'claude-test', 'api_key': 'private-api-key'},
    'documentation_markdown': 'private-documentation',
    'build_report': {'can_apply': True, 'runtime_verified': True, 'status': 'preview'},
}


class OrchestrationLoggingTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        temporary_root = ROOT / '.demo-runtime' / 'temp'
        temporary_root.mkdir(parents=True, exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(prefix='orchestration-log-test-', dir=temporary_root)
        self.addCleanup(self.temporary.cleanup)
        self.log_path = Path(self.temporary.name) / 'logs' / 'orchestration.jsonl'
        logging_module = scenario_builder.orchestration_logging
        log_patch = patch.object(logging_module, 'LOG_PATH', self.log_path)
        log_patch.__enter__()
        self.addCleanup(log_patch.__exit__, None, None, None)
        self.addCleanup(self.close_logger, logging_module)
        self.resolver = patch('app.services.model_providers.resolve', return_value=PROVIDER)
        self.resolver.start()
        self.addCleanup(self.resolver.stop)
        self.engine = patch('app.services.hermes_authoring.configured_engine', return_value=EngineConfig())
        self.engine.start()
        self.addCleanup(self.engine.stop)

    @staticmethod
    def close_logger(logging_module):
        for handler in list(logging_module._LOGGER.handlers):
            logging_module._LOGGER.removeHandler(handler)
            handler.close()

    def request(self):
        return WorkflowGenerateRequestSchema(
            prompt='private-prompt', provider_id='anthropic',
            conversation_history=[{'role': 'user', 'content': 'private-history'}],
        )

    def records(self):
        self.assertTrue(self.log_path.is_file(), 'build_events must persist its structured log')
        return [json.loads(line) for line in self.log_path.read_text(encoding='utf-8').splitlines()]

    async def collect(self, events, request=None):
        if events is None:
            return [event async for event in scenario_builder.build_events(request or self.request())]
        with patch.object(scenario_builder.ScenarioBuilder, 'events', events):
            return [event async for event in scenario_builder.build_events(request or self.request())]

    async def collect_real_bounded(self, outputs, executor):
        # Stub only external completion/execution boundaries, keeping builder stages real.
        async def complete(provider, messages, schema, **kwargs):
            value = outputs.pop(0)
            if isinstance(value, Exception):
                raise value
            if callable(value):
                value = value(messages)
            return json.dumps(value, ensure_ascii=False)

        async def catalog():
            return []

        request = self.request().model_copy(update={'prompt': '乘客文字探险'})
        with patch('app.services.model_providers.complete', complete), \
             patch('app.services.scenario_builder.execute_candidate', executor), \
             patch('app.services.capability_selection.get_embedding_provider', return_value=None), \
             patch('app.services.mcp_runtime.catalog', catalog):
            return await self.collect(None, request)

    async def test_bounded_run_logs_understand_select_then_fixed_build_phases_in_order(self):
        # Losing a stage hook would hide where bounded authoring spent or stopped its work.
        from tests.test_model_providers import production_pipeline_fixture, production_step_review
        from app.services.scenario_execution import execute_candidate

        async def execute(project, plan):
            return await execute_candidate(project, plan, source_root=ROOT)

        intent,selection,draft=production_pipeline_fixture()
        output = await self.collect_real_bounded([intent, selection, draft, production_step_review], execute)
        self.assertEqual(output[-1][0], 'done')
        phases = [record['phase'] for record in self.records() if record['event'] == 'phase']
        self.assertEqual(phases, ['planning', 'planning', 'building_graph', 'checking_graph',
                                  'executing_graph', 'reviewing_output'])

    async def test_bounded_planning_failure_terminal_identifies_planning(self):
        # A failed specification request must not be reported as a generic authoring stop.
        failure = HTTPException(503, 'private-planning-error')

        async def execute(project, plan):
            self.fail('Planning failure must stop before execution')

        with self.assertRaises(HTTPException) as raised:
            await self.collect_real_bounded([failure], execute)
        self.assertIs(raised.exception, failure)
        terminal = self.records()[-1]
        self.assertEqual(terminal['phase'], 'planning')
        self.assertEqual(terminal['termination'], 'exception')
        self.assertNotIn('private-planning-error', self.log_path.read_text(encoding='utf-8'))

    async def test_bounded_execution_failure_terminal_identifies_execution(self):
        # Executor exceptions must retain the execution stage in the terminal record.
        from tests.test_model_providers import production_pipeline_fixture
        failure = HTTPException(503, 'private-execution-error')

        async def execute(project, plan):
            raise failure

        with self.assertRaises(HTTPException) as raised:
            intent,selection,draft=production_pipeline_fixture()
            await self.collect_real_bounded([intent, selection, draft], execute)
        self.assertIs(raised.exception, failure)
        terminal = self.records()[-1]
        self.assertEqual(terminal['phase'], 'executing_graph')
        self.assertEqual(terminal['termination'], 'exception')
        self.assertNotIn('private-execution-error', self.log_path.read_text(encoding='utf-8'))

    async def test_greeting_is_not_classified_as_validation_rejection(self):
        # Greeting responses intentionally have validation.passed=false and no draft.
        output = await self.collect(None, self.request().model_copy(update={'prompt': '你好'}))
        self.assertTrue(output[0][1]['chat_reply'])
        terminal = self.records()[-1]
        self.assertEqual(terminal['engine'], 'greeting')
        self.assertNotIn('error_category', terminal)
        self.assertEqual(terminal['termination'], 'completed')

    async def test_completed_run_persists_summary_without_changing_public_events(self):
        # Removing the unified logging wrapper must fail this real file-side-effect check.
        async def events(builder):
            yield 'thinking', {'content': 'private-thinking'}
            yield 'result', RESULT

        output = await self.collect(events)
        self.assertEqual(output[:2], [('thinking', {'content': 'private-thinking'}), ('result', RESULT)])
        self.assertEqual(output[-1][0], 'done')
        records = self.records()
        self.assertEqual(records[0]['event'], 'started')
        self.assertEqual(records[-1]['event'], 'terminal')
        self.assertEqual(records[-1]['termination'], 'completed')
        self.assertEqual(records[-1]['engine'], 'bounded')
        self.assertEqual(records[-1]['provider'], 'anthropic')
        self.assertEqual(records[-1]['model'], 'claude-test')
        self.assertEqual(records[-1]['candidate_node_count'], 2)
        self.assertIs(records[-1]['can_apply'], True)
        self.assertIs(records[-1]['runtime_verified'], True)
        self.assertEqual(len({record['run_id'] for record in records}), 1)
        self.assertEqual(len({record['request_id'] for record in records}), 1)
        self.assertGreaterEqual(records[-1]['elapsed_ms'], 0)
        encoded = self.log_path.read_text(encoding='utf-8')
        for private in ('private-prompt', 'private-history', 'private-node', 'private-api-key',
                        'private-documentation', 'private-thinking'):
            self.assertNotIn(private, encoded)

    async def test_rejected_candidate_records_failed_acceptance_without_claiming_runtime(self):
        # Losing the result flags must not make an unverified draft look applicable.
        async def events(builder):
            yield 'result', {**RESULT, 'build_report': {
                'can_apply': False, 'runtime_verified': False, 'status': 'needs_changes'}}

        await self.collect(events)
        terminal = self.records()[-1]
        self.assertIs(terminal['can_apply'], False)
        self.assertIs(terminal['runtime_verified'], False)
        self.assertEqual(terminal['error_category'], 'validation_rejected')

    async def test_needs_input_records_clarification_without_validation_rejection(self):
        # Normal clarification must not be counted as a graph validation failure.
        async def events(builder):
            yield 'result', {**RESULT, 'validation': {'passed': False}, 'build_report': {
                'can_apply': False, 'runtime_verified': False, 'status': 'needs_input'}}

        await self.collect(events)
        terminal = self.records()[-1]
        self.assertEqual(terminal.get('result_status'), 'needs_input')
        self.assertNotIn('error_category', terminal)
        self.assertIs(terminal['can_apply'], False)
        self.assertIs(terminal['runtime_verified'], False)

    async def test_capability_gap_records_missing_capability_without_validation_rejection(self):
        # A declared capability gap needs its own status while remaining inapplicable.
        async def events(builder):
            yield 'result', {**RESULT, 'validation': {'passed': False}, 'build_report': {
                'can_apply': False, 'runtime_verified': False, 'status': 'capability_gap'}}

        await self.collect(events)
        terminal = self.records()[-1]
        self.assertEqual(terminal.get('result_status'), 'capability_gap')
        self.assertNotIn('error_category', terminal)
        self.assertIs(terminal['can_apply'], False)
        self.assertIs(terminal['runtime_verified'], False)

    async def test_unknown_result_status_is_never_copied_to_logs(self):
        # Report status is model-facing data; only known categories belong in diagnostics.
        async def events(builder):
            yield 'result', {**RESULT, 'build_report': {
                'can_apply': False, 'runtime_verified': False, 'status': 'private-report-status'}}

        await self.collect(events)
        self.assertIsNone(self.records()[-1].get('result_status'))
        self.assertNotIn('private-report-status', self.log_path.read_text(encoding='utf-8'))

    async def test_preview_with_failed_validation_records_validation_rejection(self):
        # A preview label cannot hide the validator's blocking result.
        async def events(builder):
            yield 'result', {**RESULT, 'validation': {'passed': False}}

        await self.collect(events)
        terminal = self.records()[-1]
        self.assertEqual(terminal.get('error_category'), 'validation_rejected')
        self.assertEqual(terminal.get('result_status'), 'preview')

    async def test_http_failure_keeps_business_error_and_only_records_allowlisted_diagnostics(self):
        # Copying HTTPException.detail wholesale would leak messages and candidate data.
        failure = HTTPException(503, {'code': 'hermes_incomplete', 'message': 'private-error',
            'checkpoint': {'project': {'nodes': ['private-checkpoint']}},
            'diagnostics': {'failure_reason': 'timeout', 'termination': 'host_timeout',
                'stage': 'executing_graph', 'node_count': 7, 'exception_type': 'private-exception',
                'raw_output': 'private-output'}})

        async def events(builder):
            yield 'thinking', {'content': 'private-thinking'}
            raise failure

        with self.assertRaises(HTTPException) as raised:
            await self.collect(events)
        self.assertIs(raised.exception, failure)
        terminal = self.records()[-1]
        self.assertEqual(terminal['event'], 'terminal')
        self.assertEqual(terminal['termination'], 'host_timeout')
        self.assertEqual(terminal['error_category'], 'incomplete')
        self.assertEqual(terminal['failure_reason'], 'timeout')
        self.assertEqual(terminal['phase'], 'executing_graph')
        self.assertEqual(terminal['candidate_node_count'], 7)
        self.assertEqual(terminal['exception_type'], 'HTTPException')
        self.assertNotIn('private-', self.log_path.read_text(encoding='utf-8'))

    async def test_unknown_exception_type_is_not_copied_to_log(self):
        # Arbitrary exception class names can contain sensitive text just like messages.
        private_exception = type('private_exception', (RuntimeError,), {})
        failure = private_exception('private-error')

        async def events(builder):
            raise failure
            yield

        with self.assertRaises(private_exception) as raised:
            await self.collect(events)
        self.assertIs(raised.exception, failure)
        terminal = self.records()[-1]
        self.assertEqual(terminal['termination'], 'exception')
        self.assertEqual(terminal['exception_type'], 'other')
        self.assertNotIn('private', self.log_path.read_text(encoding='utf-8'))

    async def test_task_cancellation_has_one_terminal_record(self):
        # Missing finally handling leaves a request permanently running in diagnostics.
        entered = asyncio.Event()

        async def events(builder):
            entered.set()
            await asyncio.Event().wait()
            yield

        with patch.object(scenario_builder.ScenarioBuilder, 'events', events):
            task = asyncio.create_task(self.collect(events))
            await entered.wait()
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task
        terminals = [record for record in self.records() if record['event'] == 'terminal']
        self.assertEqual(len(terminals), 1)
        self.assertEqual(terminals[0]['termination'], 'cancelled')

    async def test_closed_stream_has_one_terminal_record(self):
        # A client can close a paused generator without cancelling an asyncio task.
        async def events(builder):
            yield 'thinking', {'content': 'private-thinking'}
            yield 'result', RESULT

        with patch.object(scenario_builder.ScenarioBuilder, 'events', events):
            stream = scenario_builder.build_events(self.request())
            await anext(stream)
            await stream.aclose()
        terminals = [record for record in self.records() if record['event'] == 'terminal']
        self.assertEqual(len(terminals), 1)
        self.assertEqual(terminals[0]['termination'], 'cancelled')

    async def test_json_endpoint_returns_after_recording_completed_terminal(self):
        # JSON returns on result, so waiting for done misclassifies a successful request.
        from app.api.orchestration import generate_workflow
        response = {**RESULT, 'project_name': 'fixture',
            'project': {'id': 'fixture', 'name': 'fixture', 'nodes': [], 'edges': []},
            'validation': {'passed': True, 'errors': [], 'warnings': []}}

        async def events(builder):
            yield 'result', response

        with patch.object(scenario_builder.ScenarioBuilder, 'events', events):
            output = await generate_workflow(self.request())
        self.assertTrue(output.validation.passed)
        terminals = [record for record in self.records() if record['event'] == 'terminal']
        self.assertEqual(len(terminals), 1, 'JSON response must close its authoring iterator before returning')
        self.assertEqual(terminals[0]['termination'], 'completed')

    async def test_closing_stream_releases_inner_hermes_iterator_before_returning(self):
        # Closing only the outer iterator leaves the Hermes worker cleanup to later GC.
        closed = []

        async def hermes_events(request, config, *, observer=None):
            try:
                yield 'thinking', {'content': 'private-thinking'}
                yield 'result', RESULT
            finally:
                closed.append(True)

        with patch('app.services.hermes_authoring.configured_engine', return_value=EngineConfig(engine='hermes')), \
             patch('app.services.hermes_authoring.hermes_events', hermes_events):
            stream = scenario_builder.build_events(self.request())
            await anext(stream)
            await stream.aclose()
        self.assertEqual(closed, [True], 'The worker iterator must be closed before its caller returns')
        self.assertEqual(self.records()[-1]['termination'], 'cancelled')

    async def test_closing_sse_iterator_records_terminal_and_releases_authoring(self):
        # The API's SSE wrapper must propagate close to the logged authoring iterator.
        from app.api.orchestration import _stream_orchestration
        closed = []

        async def events(builder):
            try:
                yield 'thinking', {'content': 'private-thinking'}
                yield 'result', RESULT
            finally:
                closed.append(True)

        with patch.object(scenario_builder.ScenarioBuilder, 'events', events):
            stream = _stream_orchestration(self.request())
            await anext(stream)
            await stream.aclose()
        self.assertEqual(closed, [True])
        self.assertEqual(self.records()[-1]['termination'], 'cancelled')

    async def test_concurrent_runs_keep_identity_and_result_counts_separate(self):
        # A global active run would mix the result metrics of interleaved requests.
        async def events(builder):
            yield 'thinking', {'content': 'private-thinking'}
            await asyncio.sleep(0)
            count = 1 if builder.request.prompt == 'private-first' else 3
            yield 'result', {**RESULT, 'project': {'nodes': [{}] * count}}

        first = self.request().model_copy(update={'prompt': 'private-first'})
        second = self.request().model_copy(update={'prompt': 'private-second'})
        with patch.object(scenario_builder.ScenarioBuilder, 'events', events):
            await asyncio.gather(
                self.collect(events, first), self.collect(events, second))
        records = self.records()
        self.assertEqual(len({record['run_id'] for record in records}), 2)
        self.assertEqual(len({record['request_id'] for record in records}), 2)
        terminals = [record for record in records if record['event'] == 'terminal']
        self.assertEqual(sorted(record['candidate_node_count'] for record in terminals), [1, 3])
        for terminal in terminals:
            result = next(record for record in records
                          if record['run_id'] == terminal['run_id'] and record['event'] == 'result')
            self.assertEqual(result['candidate_node_count'], terminal['candidate_node_count'])

    async def test_hermes_phase_and_tool_metadata_are_logged_without_worker_payloads(self):
        # Dropping the observer leaves worker stages invisible; copying it leaks tool data.
        engine = EngineConfig(engine='hermes', agent_mode='team')

        async def hermes_events(request, config, *, observer=None):
            if observer:
                observer({'type': 'ready', 'data': {'phase': 'intake', 'content': 'private-intake'}})
                observer({'type': 'ready', 'data': {'phase': 'authoring'}})
                observer({'type': 'tool_status', 'data': {'tool': 'oakegde_trial', 'ok': False,
                    'rejection_code': 'argument_contract', 'arguments': 'private-tool',
                    'error': 'private-error'}})
            yield 'result', RESULT

        with patch('app.services.hermes_authoring.configured_engine', return_value=engine), \
             patch('app.services.hermes_authoring.hermes_events', hermes_events):
            await self.collect(None)
        records = self.records()
        self.assertTrue(any(record['phase'] == 'intake' for record in records))
        rejected = next(record for record in records if record['event'] == 'tool_status')
        self.assertEqual(rejected['tool'], 'oakegde_trial')
        self.assertEqual(rejected['rejection_code'], 'argument_contract')
        self.assertIs(rejected['ok'], False)
        self.assertEqual(records[-1]['engine'], 'hermes')
        self.assertEqual(records[-1]['agent_mode'], 'team')
        self.assertNotIn('private-', self.log_path.read_text(encoding='utf-8'))

    async def test_malformed_worker_metadata_cannot_interrupt_generation(self):
        # Optional diagnostics must not raise for untrusted worker field types.
        async def hermes_events(request, config, *, observer=None):
            if observer:
                observer({'type': 'tool_status', 'data': {'tool': ['private-tool']}})
                observer({'type': 'tool_status', 'data': {'tool': 'oakegde_trial',
                    'rejection_code': ['private-code']}})
            yield 'result', RESULT

        with patch('app.services.hermes_authoring.configured_engine', return_value=EngineConfig(engine='hermes')), \
             patch('app.services.hermes_authoring.hermes_events', hermes_events):
            try:
                output = await self.collect(None)
            except Exception as exc:
                self.fail(f'Optional logging interrupted generation: {type(exc).__name__}')
        self.assertEqual(output[0], ('result', RESULT))
        self.assertEqual(self.records()[-1]['termination'], 'completed')
        self.assertNotIn('private-', self.log_path.read_text(encoding='utf-8'))

    async def test_unwritable_log_does_not_change_result_or_business_exception(self):
        # A log directory/file failure must not abort a successful run or mask its error.
        blocker = Path(self.temporary.name) / 'not-a-directory'
        blocker.write_text('file', encoding='utf-8')
        failure = HTTPException(503, 'private-error')

        async def success(builder):
            yield 'result', RESULT

        async def failing(builder):
            raise failure
            yield

        with patch.object(scenario_builder.orchestration_logging, 'LOG_PATH', blocker / 'orchestration.jsonl'):
            output = await self.collect(success)
            self.assertEqual(output[0], ('result', RESULT))
            self.assertEqual(output[-1][0], 'done')
            with self.assertRaises(HTTPException) as raised:
                await self.collect(failing)
            self.assertIs(raised.exception, failure)

    async def test_rotation_bounds_retained_files_and_keeps_json_lines_readable(self):
        # Removing rotation would let repeated authoring requests grow the file without a bound.
        async def events(builder):
            yield 'result', RESULT

        logging_module = scenario_builder.orchestration_logging
        with patch.object(logging_module, 'MAX_BYTES', 1400), \
             patch.object(logging_module, 'BACKUP_COUNT', 2):
            for _ in range(8):
                await self.collect(events)
        self.close_logger(logging_module)
        files = list(self.log_path.parent.glob('orchestration.jsonl*'))
        self.assertEqual(len(files), 3)
        self.assertTrue(Path(str(self.log_path) + '.1').is_file())
        for path in files:
            self.assertLessEqual(path.stat().st_size, 1400)
            for line in path.read_text(encoding='utf-8').splitlines():
                self.assertIsInstance(json.loads(line), dict)


if __name__ == '__main__':
    unittest.main()
