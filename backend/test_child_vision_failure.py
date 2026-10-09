import unittest
from unittest.mock import patch
from fastapi import HTTPException
from app.schemas.inference_schema import ChatRequestSchema
from app.services.inference_service import InferenceService
class VisionFailureTests(unittest.TestCase):
 def test_image_does_not_use_mock(self):
  request=ChatRequestSchema(model='missing-vision',messages=[{'role':'user','content':[{'type':'image_url','image_url':{'url':'data:image/png;base64,aA=='}}]}])
  with patch('app.services.inference_service.requests.post',side_effect=ConnectionError('offline')):
   with self.assertRaises(HTTPException) as error: InferenceService.chat_completions(request)
  self.assertEqual(error.exception.status_code,503)
 def test_text_failure_does_not_use_mock(self):
  request=ChatRequestSchema(model='text',messages=[{'role':'user','content':'hello'}])
  with patch('app.services.inference_service.requests.post',side_effect=ConnectionError('offline')),patch.object(InferenceService,'_mock_response',return_value={'mock':True}) as fallback:
   with self.assertRaises(HTTPException) as error: InferenceService.chat_completions(request)
   self.assertEqual(error.exception.status_code,503)
   fallback.assert_not_called()
if __name__ == '__main__': unittest.main()
