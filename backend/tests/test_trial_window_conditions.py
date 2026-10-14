"""Case-owned window conditions initialize the isolated trial, never the graph."""
import copy
import math
import unittest
from pathlib import Path

from pydantic import ValidationError

from app.schemas.execution_schema import ExecutionPlan
from app.schemas.orchestration_schema import WorkflowGenerateRequestSchema
from app.schemas.project_schema import ProjectSchema
from app.services.authoring_session import AuthoringSession
from app.services.scenario_execution import execute_candidate


ROOT = Path(__file__).resolve().parents[2]
WINDOWS = {'fl': 17, 'fr': 29, 'rl': 43, 'rr': 68}
ZERO_WINDOWS = {'fl': 0, 'fr': 0, 'rl': 0, 'rr': 0}


def equal(path, value):
    return {'path': path, 'op': 'equals', 'value': value}


def graph():
    return {'id': 'trial-window-conditions', 'name': 'trial-window-conditions', 'nodes': [
        {'id': 'i', 'type': 'input', 'position': {'x': 0, 'y': 0}, 'data': {'flowVersion': 2}},
        {'id': 'o', 'type': 'output', 'position': {'x': 100, 'y': 0}, 'data': {'responseText': '完成'}},
    ], 'edges': [{'id': 'io', 'source': 'i', 'target': 'o'}], 'meta': {}}


def plan(**conditions):
    return {'cases': [{'name': '独立初始条件', **conditions, 'steps': [
        {'input': '开始', 'status': 'completed', 'assertions': [equal(['hmi', 'message'], '完成')]}
    ]}]}


class WindowConditionSchemaTests(unittest.TestCase):
    def accepted(self, value):
        try:
            return ExecutionPlan.model_validate(value)
        except ValidationError as exc:
            self.fail(f'Valid trial window conditions must be accepted: {exc}')

    def test_complete_finite_window_numbers_and_boundaries_are_preserved(self):
        values = {'fl': 0, 'fr': 100, 'rl': 23.5, 'rr': 68}
        parsed = self.accepted(plan(initial_windows=values))
        self.assertEqual(parsed.model_dump()['cases'][0]['initial_windows'], values)

    def test_optional_conditions_keep_zero_and_healthy_defaults(self):
        for conditions in ({}, {'initial_windows': None, 'blocked_window': None}):
            with self.subTest(conditions=conditions):
                parsed = self.accepted(plan(**conditions)).model_dump()['cases'][0]
                self.assertIn('initial_windows', parsed)
                self.assertIsNone(parsed['initial_windows'])
                self.assertIsNone(parsed['blocked_window'])

    def test_only_single_registered_window_or_null_can_be_blocked(self):
        for value in ('fl', 'fr', 'rl', 'rr', None):
            with self.subTest(value=value):
                parsed = self.accepted(plan(blocked_window=value)).model_dump()['cases'][0]
                self.assertEqual(parsed['blocked_window'], value)

    def test_initial_windows_rejects_missing_extra_keys_and_nonnumeric_positions(self):
        invalid = [[], 'all open', True, 50, {}, {'rr': 68},
                   {**WINDOWS, 'other': 50}, {**WINDOWS, 'constructor': 50}]
        for bad in (True, False, '17', None, [], {}, -1, 101, math.nan, math.inf, -math.inf):
            invalid.append({**WINDOWS, 'fl': bad})
        for value in invalid:
            with self.subTest(value=value), self.assertRaises(ValidationError):
                ExecutionPlan.model_validate(plan(initial_windows=value))

    def test_invalid_faults_cannot_enter_plan(self):
        for value in ('', 'RR', 'all', 'front_left', True, 0, 1, [], ['rr'], {'window': 'rr'}):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                ExecutionPlan.model_validate(plan(blocked_window=value))

    def test_agent_plan_cannot_revise_initial_windows_or_fault_after_lock(self):
        original = self.accepted(plan(initial_windows=WINDOWS, blocked_window='rr')).model_dump()
        session = AuthoringSession(WorkflowGenerateRequestSchema(prompt='显示完成'))
        session.project = ProjectSchema.model_validate(graph())
        session.set_plan({'revision': 0, 'plan': original})
        for field, value in [('initial_windows', {**WINDOWS, 'rr': 0}), ('blocked_window', None)]:
            revised = copy.deepcopy(original)
            revised['cases'][0][field] = value
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, '测试计划已锁定'):
                session.set_plan({'revision': 0, 'plan': revised})
            self.assertEqual(session.plan.model_dump(), original)
            self.assertEqual(session.trials, 0)

    def test_caller_plan_cannot_revise_initial_windows_or_fault(self):
        original = self.accepted(plan(initial_windows=WINDOWS, blocked_window='rr')).model_dump()
        request = WorkflowGenerateRequestSchema(prompt='显示完成', acceptance_tests=original)
        session = AuthoringSession(request)
        session.project = ProjectSchema.model_validate(graph())
        for field, value in [('initial_windows', {**WINDOWS, 'rr': 0}), ('blocked_window', None)]:
            revised = copy.deepcopy(original)
            revised['cases'][0][field] = value
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, '测试计划已锁定'):
                session.set_plan({'revision': 0, 'plan': revised})
            self.assertEqual(session.plan.model_dump(), original)


class WindowConditionExecutionTests(unittest.IsolatedAsyncioTestCase):
    async def test_ipc_reports_actual_initial_snapshot_without_workflow_actions(self):
        tests = plan(initial_windows=WINDOWS, blocked_window='rr')
        tests['cases'][0]['steps'][0]['assertions'] += [
            equal(['car', 'windows'], WINDOWS), equal(['actions', 'length'], 0),
        ]

        async def inference(_):
            self.fail('Initialization must not call a model')

        try:
            report = await execute_candidate(graph(), tests, inference=inference, source_root=ROOT)
        except ValidationError as exc:
            self.fail(f'Valid trial window conditions must reach the production worker: {exc}')
        self.assertEqual(report['status'], 'passed', report)
        self.assertEqual(report['model_calls'], 0)
        step = report['cases'][0]['steps'][0]
        self.assertEqual(step['evidence']['initial_vehicle'],
                         {'windows': WINDOWS, 'blocked_window': 'rr'})
        self.assertEqual(step['evidence']['actions'], [])


if __name__ == '__main__':
    unittest.main()
