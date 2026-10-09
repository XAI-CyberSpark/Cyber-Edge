import unittest
from unittest.mock import patch
import requests
from fastapi import HTTPException
from app.schemas.inference_schema import ChatRequestSchema
from app.services.inference_service import InferenceService
from app.services.opensparx_service import MODEL_ID, OpenSparXService

class OpenSparXTests(unittest.TestCase):
    def request(self, **kwargs):
        return ChatRequestSchema(model=MODEL_ID, messages=[{'role': 'user', 'content': '打开车窗'}], **kwargs)

    def test_unavailable_never_uses_legacy_mock(self):
        with patch.object(OpenSparXService, '_post', side_effect=requests.ConnectionError('offline')), patch.object(InferenceService, '_mock_response') as mock:
            with self.assertRaises(HTTPException) as error:
                InferenceService.chat_completions(self.request())
            self.assertEqual(error.exception.status_code, 503)
            mock.assert_not_called()

    def test_multimodal_payload_and_json_mode_reach_independent_service(self):
        request = self.request(json_mode=True)
        request.messages[0]['content'] = [{'type': 'text', 'text': '识别图片'}, {'type': 'image_url', 'image_url': {'url': 'data:image/png;base64,AAAA'}}]
        result = {'model': MODEL_ID, 'choices': [{'message': {'content': '{"status":"unknown"}'}, 'finish_reason': 'stop'}]}
        with patch.object(OpenSparXService, '_post', return_value=result) as post:
            self.assertEqual(InferenceService.chat_completions(request), result)
            url, payload, timeout = post.call_args.args
            self.assertIn('11435/v1/chat/completions', url)
            self.assertEqual(payload['messages'], request.messages)
            self.assertEqual(payload['response_format'], {'type': 'json_object'})
            self.assertEqual(timeout, (3, 180))

    def test_incomplete_empty_or_wrong_model_is_failure(self):
        for result in [{}, {'model': 'other'}, {'model': MODEL_ID, 'choices': []}, {'model': MODEL_ID, 'choices': [{'finish_reason': 'length', 'message': {'content': '{}'}}]}, {'model': MODEL_ID, 'choices': [{'message': {'content': ''}}]}]:
            with self.subTest(result=result), patch.object(OpenSparXService, '_post', return_value=result):
                with self.assertRaises(HTTPException):
                    InferenceService.chat_completions(self.request())

    def test_json_mode_rejects_unstructured_model_text(self):
        result = {'model': MODEL_ID, 'choices': [{'message': {'content': '普通回复'}, 'finish_reason': 'stop'}]}
        with patch.object(OpenSparXService, '_post', return_value=result):
            with self.assertRaises(HTTPException):
                InferenceService.chat_completions(self.request(json_mode=True))

    def test_context_overflow_reports_counts_without_raw_upstream_data(self):
        response = requests.Response()
        response.status_code = 400
        response._content = b'{"error":"request (4296 tokens) exceeds the available context size (4096 tokens), try increasing it; private upstream data"}'
        with patch.object(OpenSparXService, '_post', side_effect=requests.HTTPError(response=response)):
            with self.assertRaises(HTTPException) as error:
                InferenceService.chat_completions(self.request())
        self.assertEqual(error.exception.status_code, 422)
        self.assertIn('4296 tokens', error.exception.detail)
        self.assertIn('4096 tokens', error.exception.detail)
        self.assertNotIn('private upstream', error.exception.detail)

    def test_other_upstream_errors_remain_service_failures(self):
        response = requests.Response()
        response.status_code = 400
        response._content = b'{"error":"private internal failure"}'
        with patch.object(OpenSparXService, '_post', side_effect=requests.HTTPError(response=response)):
            with self.assertRaises(HTTPException) as error:
                InferenceService.chat_completions(self.request())
        self.assertEqual(error.exception.status_code, 503)
        self.assertNotIn('private internal', error.exception.detail)

    def test_status_does_not_claim_available_when_model_missing(self):
        with patch.object(OpenSparXService, '_post', side_effect=requests.HTTPError()):
            self.assertFalse(OpenSparXService.status()['available'])

if __name__ == '__main__':
    unittest.main()
