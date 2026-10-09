import io
import unittest
import wave
from unittest.mock import patch

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from app.api.audio import router
from app.services.asr_service import ASRService, MAX_BYTES

def wav(seconds=1, rate=16000, channels=1, width=2):
    out = io.BytesIO()
    with wave.open(out, 'wb') as stream:
        stream.setnchannels(channels); stream.setsampwidth(width); stream.setframerate(rate)
        stream.writeframes(b'\0' * int(seconds * rate) * channels * width)
    return out.getvalue()

class ASRTests(unittest.TestCase):
    def setUp(self):
        app = FastAPI(); app.include_router(router, prefix='/v1/audio'); self.client = TestClient(app)
    def post(self, data, mime='audio/wav'):
        return self.client.post('/v1/audio/transcriptions', content=data, headers={'content-type':mime})
    def test_pcm_and_duration(self):
        pcm, rate, duration = ASRService.read_pcm(wav())
        self.assertEqual((len(pcm), rate, duration), (32000,16000,1))
    def test_invalid_formats_and_truncation(self):
        for value in [b'bad', wav(channels=2), wav(width=1), wav(rate=8000), wav()[:-20]]:
            with self.subTest(size=len(value)):
                self.assertEqual(self.post(value).status_code,422)
    def test_short_long_and_oversized(self):
        for value in [wav(.1),wav(31)]: self.assertEqual(self.post(value).status_code,422)
        self.assertEqual(self.post(b'x'*(MAX_BYTES+1)).status_code,413)
    def test_content_type(self):
        self.assertEqual(self.post(wav(),'audio/webm').status_code,415)
    def test_missing_model_is_unavailable(self):
        with patch.object(ASRService,'status',return_value={'available':False,'message':'模型未安装'}):
            response=self.post(wav()); self.assertEqual(response.status_code,503); self.assertEqual(response.json()['detail'],'模型未安装')
    def test_silence_does_not_run_model(self):
        with patch.object(ASRService,'status',return_value={'available':True}):
            self.assertEqual(self.post(wav()).status_code,422)
    def test_busy_does_not_queue_recordings(self):
        ASRService._lock.acquire()
        try:
            with patch.object(ASRService,'status',return_value={'available':True}): self.assertEqual(self.post(wav()).status_code,429)
        finally: ASRService._lock.release()
    def test_route_returns_only_real_service_result(self):
        result={'text':'空调调到23度','source':'local_asr','model':'SenseVoiceSmall-int8'}
        with patch.object(ASRService,'transcribe',return_value=result) as call:
            self.assertEqual(self.post(wav()).json(),result); call.assert_called_once()
        with patch.object(ASRService,'transcribe',side_effect=HTTPException(503,'识别失败')):
            self.assertEqual(self.post(wav()).status_code,503)

if __name__ == '__main__': unittest.main()
