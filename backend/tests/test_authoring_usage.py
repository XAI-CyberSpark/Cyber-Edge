import asyncio
import unittest
from app.services.model_providers import COMPLETION_USAGE_OBSERVER, _observe_usage

class UsageTests(unittest.IsolatedAsyncioTestCase):
    async def test_usage_is_request_local_and_never_collects_content(self):
        async def collect(value):
            result=[];token=COMPLETION_USAGE_OBSERVER.set(result.append)
            try:
                await asyncio.sleep(0)
                _observe_usage({'usage':{'input_tokens':value,'output_tokens':2,'api_key':'synthetic-secret'},'content':'private'})
                return result
            finally:COMPLETION_USAGE_OBSERVER.reset(token)
        first,second=await asyncio.gather(collect(3),collect(9))
        self.assertEqual(first[0]['input_tokens'],3);self.assertEqual(second[0]['input_tokens'],9)
        self.assertNotIn('synthetic-secret',str(first)+str(second));self.assertNotIn('private',str(first)+str(second))
        self.assertIsNone(COMPLETION_USAGE_OBSERVER.get())
    async def test_missing_usage_is_unknown_not_zero(self):
        result=[];token=COMPLETION_USAGE_OBSERVER.set(result.append)
        try:
            _observe_usage({});_observe_usage({'usage':{'input_tokens':False,'output_tokens':-2,'cache_creation_input_tokens':0}})
        finally:COMPLETION_USAGE_OBSERVER.reset(token)
        self.assertTrue(all(v is None for v in result[0].values()))
        self.assertIsNone(result[1]['input_tokens']);self.assertIsNone(result[1]['output_tokens']);self.assertEqual(result[1]['cache_write_tokens'],0)
