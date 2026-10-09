import unittest
from types import SimpleNamespace
from fastapi import HTTPException
from pydantic import ValidationError
from app.services.model_reasoning import capabilities, request_fields, bind_hermes_reasoning, ReasoningSettings
from app.services.model_providers import Provider, _request
from app.schemas.orchestration_schema import WorkflowGenerateRequestSchema

class ReasoningTests(unittest.TestCase):
    def test_capabilities_are_model_specific(self):
        self.assertEqual(capabilities('minimax','MiniMax-M3')['efforts'],[])
        self.assertTrue(capabilities('minimax','MiniMax-M3')['can_disable'])
        self.assertFalse(capabilities('minimax','MiniMax-M3.1-Flash-Preview')['can_disable'])
        self.assertFalse(capabilities('openai','gpt-4.1')['supported'])
        self.assertFalse(capabilities('anthropic','claude-unknown')['supported'])
        self.assertIn('xhigh',capabilities('anthropic','claude-sonnet-5')['efforts'])
    def test_reject_unsupported_and_invalid_settings(self):
        for provider,model,settings in [('minimax','MiniMax-M3',{'enabled':True,'effort':'high'}),('minimax','MiniMax-M3.1-Flash-Preview',{'enabled':False}),('openai','gpt-4.1',{'enabled':True}),('anthropic','claude-sonnet-5',{'enabled':False,'effort':'high'}),('openai','gpt-5',{'enabled':False})]:
            with self.subTest(model=model,settings=settings), self.assertRaises(HTTPException):request_fields(provider,model,settings)
        for settings in [{'enabled':'false'},{'enabled':True,'effort':'ultra'},{'enabled':True,'other':1}]:
            with self.assertRaises(ValidationError):ReasoningSettings.model_validate(settings)
    def test_wire_fields_and_request_roundtrip(self):
        cases=[('minimax','MiniMax-M3',{'enabled':True},{'thinking':{'type':'adaptive'}}),('minimax','MiniMax-M3',{'enabled':False},{'thinking':{'type':'disabled'}}),('anthropic','claude-sonnet-5',{'enabled':True,'effort':'xhigh'},{'thinking':{'type':'adaptive'},'output_config':{'effort':'xhigh'}}),('openai','gpt-5.2',{'enabled':True,'effort':'high'},{'reasoning_effort':'high'}),('openai','gpt-5.2',{'enabled':False},{'reasoning_effort':'none'})]
        for id,model,settings,fields in cases:
            with self.subTest(model=model,settings=settings):
                req=WorkflowGenerateRequestSchema(prompt='test',provider_id=id,model=model,reasoning=settings)
                self.assertEqual(req.model_dump(exclude_none=True)['reasoning'],settings)
                provider=Provider(id,id,'https://example.invalid/v1',model,'synthetic')
                payload=_request(provider,[{'role':'user','content':'test'}],reasoning=req.reasoning)[2]
                for key,value in fields.items():self.assertEqual(payload[key],value)
    def test_sdk_binding_overrides_stale_fields_without_mutating_input(self):
        for id,model,settings in [('minimax','MiniMax-M3',{'enabled':False}),('openai','gpt-5.2',{'enabled':True,'effort':'high'}),('anthropic','claude-sonnet-5',{'enabled':True,'effort':'low'})]:
            with self.subTest(provider=id):
                calls=[];agent=SimpleNamespace(_interruptible_api_call=lambda kwargs:calls.append(kwargs))
                provider={'id':id,'model':model};bind_hermes_reasoning(agent,provider,settings)
                source={'thinking':{'type':'disabled'},'output_config':{'effort':'max'},'extra_body':{'reasoning':{'effort':'medium'},'reasoning_split':True},'tool_choice':{'type':'tool','name':'deliver'}}
                agent._interruptible_api_call(source);wire=calls[0]
                expected=request_fields(id,model,settings)
                for key,value in expected.items():self.assertEqual((wire['extra_body'] if id=='minimax' and key=='thinking' else wire)[key],value)
                self.assertNotIn('reasoning',wire['extra_body'])
                self.assertEqual(source['extra_body']['reasoning'],{'effort':'medium'})
                if id=='anthropic':self.assertEqual(wire['tool_choice'],{'type':'auto'})
    def test_legacy_requests_keep_existing_defaults(self):
        self.assertEqual(request_fields('minimax','MiniMax-M3',None),{})
        calls=[];agent=SimpleNamespace(_interruptible_api_call=lambda k:calls.append(k));bind_hermes_reasoning(agent,{'id':'minimax','model':'MiniMax-M3'},None)
        original={};agent._interruptible_api_call(original);self.assertIs(calls[0],original)
