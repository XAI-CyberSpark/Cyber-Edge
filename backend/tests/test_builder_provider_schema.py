"""Build/repair submission unions must remain valid provider tool parameters."""
import copy
import json
import unittest
from unittest.mock import patch

import httpx
from jsonschema import Draft202012Validator

from app.schemas.orchestration_schema import WorkflowGenerateRequestSchema
from app.services import model_providers
from app.services.scenario_builder import ScenarioBuilder


DRAFT = {
    'project_name': '独立Schema夹具', 'summary': '显示完成',
    'workflow': {'nodes': [
        {'id': 'i', 'type': 'input', 'position': {'x': 0, 'y': 0}, 'data': {'flowVersion': 2}},
        {'id': 'o', 'type': 'output', 'position': {'x': 300, 'y': 0}, 'data': {'responseText': '完成'}},
    ], 'edges': [{'id': 'io', 'source': 'i', 'target': 'o'}], 'meta': {}},
    'requirement_coverage': [{'requirement_id': 'R1', 'status': 'implemented',
                              'node_ids': ['o'], 'note': '显示固定文字'}],
    'execution_plan': {'cases': [{'name': '启动', 'steps': [
        {'input': '开始', 'assertions': [{'path': ['hmi', 'message'], 'op': 'equals', 'value': '完成'}]},
    ]}]},
}
NEED = {'kind': 'capability_need', 'requirement_ids': ['R1'],
        'capability_ids': ['node:output'], 'reason': '需要已选输出契约'}


class BuilderProviderSchemaTests(unittest.IsolatedAsyncioTestCase):
    async def submission(self, stage, value):
        provider = model_providers.Provider('deepseek', 'DeepSeek', 'https://provider.invalid',
                                             'deepseek-flash', 'synthetic-key')
        parameters = []

        def transport(request):
            body = json.loads(request.content)
            parameters.append(body['tools'][0]['function']['parameters'])
            return httpx.Response(200, json={'choices': [{'finish_reason': 'tool_calls', 'message': {
                'content': None, 'tool_calls': [{'id': 'fixture-call', 'type': 'function', 'function': {
                    'name': 'submit_scenario', 'arguments': json.dumps(value, ensure_ascii=False)},
                }],
            }}]})

        original = httpx.AsyncClient
        with patch.object(model_providers, 'resolve', return_value=provider), \
             patch.object(httpx, 'AsyncClient', side_effect=lambda **kwargs: original(
                 **kwargs, transport=httpx.MockTransport(transport))):
            builder = ScenarioBuilder(WorkflowGenerateRequestSchema(prompt='显示完成', provider_id='deepseek'))
            result = await builder.call(stage, [{'role': 'system', 'content': '独立阶段夹具'}], contract='draft')
        return parameters[0], result

    async def test_build_tool_parameters_expose_object_root(self):
        schema, result = await self.submission('build', DRAFT)
        self.assertEqual(result, DRAFT)
        self.assertEqual(schema.get('type'), 'object', 'provider function parameters require an explicit object root')

    async def test_repair_tool_parameters_expose_object_root(self):
        schema, result = await self.submission('repair', NEED)
        self.assertEqual(result, NEED)
        self.assertEqual(schema.get('type'), 'object', 'repair shares the same provider submission contract')

    async def test_submission_union_accepts_workflow_or_capability_need(self):
        schema, _ = await self.submission('build', DRAFT)
        validator = Draft202012Validator(schema)
        self.assertTrue(validator.is_valid(DRAFT))
        self.assertTrue(validator.is_valid(NEED))

    async def test_submission_union_keeps_required_plan_and_capability_need_fields(self):
        schema, _ = await self.submission('repair', NEED)
        validator = Draft202012Validator(schema)
        without_plan = copy.deepcopy(DRAFT)
        without_plan.pop('execution_plan')
        for invalid in (without_plan, {**NEED, 'requirement_ids': []}, {}, 'capability_need'):
            with self.subTest(invalid=invalid):
                self.assertFalse(validator.is_valid(invalid))


if __name__ == '__main__':
    unittest.main()
