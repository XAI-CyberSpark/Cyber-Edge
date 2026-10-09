import asyncio
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from app.services import mcp_runtime as mcp
from app.services.node_capability_service import validate_capabilities

class RegistryTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.path=Path(self.temp.name)/'servers.json'
        self.config={'servers':{'lab':{'url':'https://example.invalid/mcp','tools':{'lookup':{},'safe_read':{'allow_trials':True}}}}}
        self.path.write_text(json.dumps(self.config));self.patch=patch.object(mcp,'SETTINGS_PATH',self.path);self.patch.start()
    def tearDown(self):self.patch.stop();self.temp.cleanup()
    def test_registered_identity_only(self):
        self.assertEqual(mcp.binding('lab','lookup')['url'],'https://example.invalid/mcp')
        with self.assertRaises(mcp.MCPRuntimeError):mcp.binding('missing','lookup')
        with self.assertRaises(mcp.MCPRuntimeError):mcp.binding('lab','other')
    def test_trial_authorization_is_configured_not_model_or_server_annotations(self):
        with self.assertRaises(mcp.MCPRuntimeError):mcp.binding('lab','lookup',trial=True)
        self.assertTrue(mcp.binding('lab','safe_read',trial=True))
    def test_node_rejects_connection_overrides_and_checks_registration(self):
        node={'tool_id':'mcp','serverId':'lab','toolName':'lookup','arguments':{'name':{'$ref':'input.text'}}}
        self.assertTrue(mcp.validate_mcp_node(node))
        for key in ['url','headers','command','apiKey','endpoint','env']:
            with self.assertRaises(mcp.MCPRuntimeError):mcp.validate_mcp_node({**node,key:'forbidden'})
        with self.assertRaises(mcp.MCPRuntimeError):mcp.validate_mcp_node({**node,'arguments':[]})
    def test_config_failure_is_not_silently_empty_catalog(self):
        self.path.write_text('{')
        with self.assertRaises(mcp.MCPRuntimeError):mcp.settings()
        self.path.unlink();self.assertEqual(mcp.settings(),{})
    def test_mcp_after_json_model_uses_its_own_argument_contract(self):
        nodes=[{'id':'i','type':'input','data':{'flowVersion':2}},{'id':'m','type':'llm','data':{'model':'fixture','outputFormat':'json','outputFields':{'station':'string'}}},{'id':'t','type':'tool','data':{'tool_id':'mcp','serverId':'lab','toolName':'lookup','arguments':{'station':{'$ref':'input.data.station'}}}}]
        edges=[{'source':'i','target':'m'},{'source':'m','target':'t'}]
        self.assertEqual(validate_capabilities(nodes,edges)[0],[])
    def test_api_rejects_extra_fields_and_large_body_before_invocation(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from app.api.mcp_runtime import router
        from unittest.mock import AsyncMock
        app=FastAPI();app.include_router(router,prefix='/v1/mcp')
        result={'source':'mcp','data':{'value':3}}
        with patch.object(mcp,'invoke',new=AsyncMock(return_value=result)) as invoke:
            with TestClient(app) as client:
                body={'server_id':'lab','tool_name':'lookup','arguments':{}}
                self.assertEqual(client.post('/v1/mcp/invoke',json={**body,'url':'https://other.invalid'}).status_code,422)
                self.assertEqual(client.post('/v1/mcp/invoke',content='x'*(mcp.MAX_BYTES+1)).status_code,413)
                invoke.assert_not_called()
                self.assertEqual(client.post('/v1/mcp/invoke',json=body).json(),result)
                invoke.assert_awaited_once_with('lab','lookup',{})

    def test_only_explicit_credential_names_are_delegated(self):
        self.config['servers']['lab']['headers_env']={'Authorization':'MCP_TEST_AUTH'}
        self.path.write_text(json.dumps(self.config))
        with patch.dict(os.environ,{'MCP_TEST_AUTH':'test-value','UNRELATED_SECRET':'no'},clear=True):
            self.assertEqual(mcp.credential_environment(),{'MCP_TEST_AUTH':'test-value'})
        with patch.object(mcp,'CREDENTIAL_ENV',{'MCP_TEST_AUTH':'delegated'}):
            self.assertEqual(mcp.credential_environment(),{'MCP_TEST_AUTH':'delegated'})

    def test_credentials_are_required_before_worker_launch(self):
        with patch.dict(os.environ,{},clear=True):
            with self.assertRaisesRegex(mcp.MCPRuntimeError,'凭据环境变量'):
                asyncio.run(mcp._worker({'url':'https://example.invalid/mcp','tools':{},'headers_env':{'Authorization':'MISSING'}},'list'))

@unittest.skipUnless(os.environ.get('OAKEGDE_TEST_MCP_URL'),'set OAKEGDE_TEST_MCP_URL for live protocol fixture')
class LiveProtocolTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();root=Path(self.temp.name)
        self.settings=root/'servers.json';self.runtime=root/'runtime.json'
        self.settings.write_text(json.dumps({'servers':{'lab':{'url':os.environ['OAKEGDE_TEST_MCP_URL'],'tools':{'charging_status':{'allow_trials':True},'exhibit_details':{}}}}}))
        self.runtime.write_text(json.dumps({'python':sys.executable,'sdk_path':os.environ['OAKEGDE_TEST_MCP_SDK']}))
        self.patches=[patch.object(mcp,'SETTINGS_PATH',self.settings),patch.object(mcp,'RUNTIME_PATH',self.runtime)]
        for p in self.patches:p.start()
    def tearDown(self):
        for p in self.patches:p.stop()
        self.temp.cleanup()
    async def test_discovery_filters_unregistered_tools(self):
        tools=await mcp.discover('lab')
        self.assertEqual({t['name'] for t in tools},{'charging_status','exhibit_details'})
        self.assertEqual(tools[0]['input_schema']['required'],['station'])
        self.assertNotIn('url',tools[0])
    async def test_actual_structured_result_and_arguments(self):
        north=await mcp.invoke('lab','charging_status',{'station':'north'},trial=True)
        south=await mcp.invoke('lab','charging_status',{'station':'south'},trial=True)
        self.assertEqual(north['data']['available'],2);self.assertEqual(south['data']['available'],0)
        self.assertEqual(north['source'],'mcp');self.assertEqual(north['data']['source'],'test_fixture')
    async def test_bad_parameters_and_tool_error_do_not_succeed(self):
        with self.assertRaisesRegex(mcp.MCPRuntimeError,'Schema'):await mcp.invoke('lab','charging_status',{'station':12})
        with self.assertRaisesRegex(mcp.MCPRuntimeError,'返回失败'):await mcp.invoke('lab','charging_status',{'station':'missing'})
    async def test_authorization_blocks_real_network_call(self):
        with self.assertRaisesRegex(mcp.MCPRuntimeError,'授权'):await mcp.invoke('lab','forbidden_write',{'value':'no'})
        with self.assertRaisesRegex(mcp.MCPRuntimeError,'试跑'):await mcp.invoke('lab','exhibit_details',{'code':'A'},trial=True)
        value=await mcp.invoke('lab','exhibit_details',{'code':'A'})
        self.assertIsNone(value['data'])
        self.assertEqual(json.loads(value['text'])['code'],'A')

    async def test_actual_graph_trial_uses_registered_protocol_tool(self):
        from app.services.scenario_execution import execute_candidate
        def n(id,type,data):return {'id':id,'type':type,'data':data,'position':{'x':0,'y':0}}
        graph={'nodes':[n('i','input',{'flowVersion':2}),n('t','tool',{'tool_id':'mcp','serverId':'lab','toolName':'charging_status','arguments':{'station':{'$ref':'input.text'}}}),n('o','output',{'responseText':'available={{input.data.available}}'})],
               'edges':[{'id':'it','source':'i','target':'t'},{'id':'to','source':'t','target':'o'}]}
        plan={'cases':[{'name':station,'steps':[{'input':station,'status':'completed','assertions':[{'path':['outputs','t','data','available'],'op':'equals','value':count},{'path':['outputs','t','source'],'op':'equals','value':'mcp'}]}]} for station,count in [('north',2),('south',0)]]}
        report=await execute_candidate(graph,plan)
        self.assertEqual(report['status'],'passed',json.dumps(report,ensure_ascii=False))
        self.assertEqual(report['tool_calls'],2);self.assertEqual(report['model_calls'],0)
        self.assertEqual(report['tool_source'],'registered_mcp')
