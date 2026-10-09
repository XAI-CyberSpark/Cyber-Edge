import base64
import copy
import unittest
from unittest.mock import patch,AsyncMock
from fastapi import HTTPException
from app.services.multimodal_messages import provider_messages,MAX_IMAGE_BYTES
from app.services import model_providers as mp
from app.schemas.inference_schema import ChatRequestSchema

PNG=base64.b64encode(b'\x89PNG\r\n\x1a\nfixture').decode()
URL='data:image/png;base64,'+PNG
MESSAGES=[{'role':'system','content':'Interpret actual image'},{'role':'user','content':[{'type':'text','text':'What is visible?'},{'type':'image_url','image_url':{'url':URL}}]}]

class MultimodalMessages(unittest.IsolatedAsyncioTestCase):
    def test_native_anthropic_conversion_preserves_bytes_and_does_not_mutate_input(self):
        before=copy.deepcopy(MESSAGES);out=provider_messages(MESSAGES,'anthropic')
        self.assertEqual(out[1]['content'][1],{'type':'image','source':{'type':'base64','media_type':'image/png','data':PNG}})
        self.assertEqual(out[1]['content'][0],MESSAGES[1]['content'][0]);self.assertEqual(MESSAGES,before)
    def test_chat_completions_multiple_images_and_provider_detail_mapping(self):
        messages=copy.deepcopy(MESSAGES);messages[1]['content'].append({'type':'image_url','image_url':{'url':'https://images.example.test/example.png','detail':'auto'}})
        for provider in ['openai','minimax']:
            out=provider_messages(messages,provider)
            self.assertEqual(out[1]['content'][1]['image_url']['url'],URL)
            self.assertEqual(out[1]['content'][2]['image_url']['detail'],'default' if provider=='minimax' else 'auto')
        out=provider_messages(messages,'anthropic');self.assertEqual(out[1]['content'][2]['source'],{'type':'url','url':'https://images.example.test/example.png'})
    async def test_invalid_images_fail_before_network_and_do_not_leak_payload(self):
        provider=mp.Provider('anthropic','Claude','https://api.anthropic.com/v1','test','secret')
        for url in ['file:///private/SECRET_IMAGE','data:image/png;base64,SECRET_IMAGE','data:image/svg+xml;base64,SECRET_IMAGE','https://user:SECRET_IMAGE@example.test/a.png','data:image/jpeg;base64,'+PNG]:
            message=copy.deepcopy(MESSAGES);message[1]['content'][1]['image_url']['url']=url
            with patch.object(mp.httpx.AsyncClient,'post',new=AsyncMock()) as post:
                with self.assertRaises(HTTPException) as error:await mp.complete(provider,message)
            post.assert_not_called();self.assertNotIn('SECRET_IMAGE',error.exception.detail)
    def test_oversized_image_and_unknown_blocks_are_not_silently_dropped(self):
        message=copy.deepcopy(MESSAGES);message[1]['content'][1]['image_url']['url']='data:image/png;base64,'+'A'*(4*((MAX_IMAGE_BYTES+2)//3)+4)
        with self.assertRaises(HTTPException) as error:provider_messages(message,'anthropic')
        self.assertEqual(error.exception.status_code,413)
        for part in [{'type':'input_audio','data':'something'},{'type':'image_url','image_url':None},{'type':'text','text':42}]:
            with self.assertRaises(HTTPException):provider_messages([{'role':'user','content':[part]}],'minimax')
    async def test_async_trial_and_sync_runtime_share_real_protocol_payload(self):
        import httpx
        provider=mp.Provider('anthropic','Claude','https://api.anthropic.com/v1','test','secret')
        response=httpx.Response(200,json={'stop_reason':'end_turn','model':'test','content':[{'type':'text','text':'result'}]},request=httpx.Request('POST',provider.base_url+'/messages'))
        with patch.object(mp.httpx.AsyncClient,'post',new=AsyncMock(return_value=response)) as async_post:
            self.assertEqual(await mp.complete(provider,MESSAGES),'result')
        with patch.object(mp,'resolve',return_value=provider),patch.object(mp.httpx.Client,'post',return_value=response) as sync_post:
            result=mp.runtime_chat(ChatRequestSchema(provider_id='anthropic',model='test',messages=MESSAGES))
        self.assertEqual(result['choices'][0]['message']['content'],'result')
        self.assertEqual(async_post.call_args.kwargs['json']['messages'],sync_post.call_args.kwargs['json']['messages'])
    def test_text_contract_and_system_text_blocks_stay_compatible(self):
        text=[{'role':'system','content':'instructions'},{'role':'user','content':'hello'},{'role':'assistant','content':'answer'}]
        self.assertEqual(provider_messages(text,'anthropic'),text)
        text[0]['content']=[{'type':'text','text':'one'},{'type':'text','text':'two'}]
        self.assertEqual(provider_messages(text,'anthropic')[0]['content'],'one\ntwo')
        with self.assertRaises(HTTPException):provider_messages([{'role':'system','content':MESSAGES[1]['content']}],'anthropic')
