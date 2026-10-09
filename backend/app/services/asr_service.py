"""Bounded local PCM transcription. Audio is held in memory and never saved."""
import importlib.util
import io
import os
from app.core.branding import brand_env
from pathlib import Path
import threading
import time
import wave

from fastapi import HTTPException

MODEL_DIR = Path(brand_env('OAKEGDE_ASR_MODEL_DIR', str(Path(__file__).resolve().parents[3] / 'models' / 'sensevoice-small-int8')))
MAX_BYTES = 3 * 1024 * 1024
MAX_SECONDS = 30


class ASRService:
    _recognizer = None
    _lock = threading.Lock()

    @classmethod
    def status(cls):
        available = (MODEL_DIR / 'model.int8.onnx').is_file() and (MODEL_DIR / 'tokens.txt').is_file() and importlib.util.find_spec('sherpa_onnx') is not None and importlib.util.find_spec('numpy') is not None
        return {'available': available, 'model': 'SenseVoiceSmall-int8', 'mode': 'local', 'max_seconds': MAX_SECONDS,
                'message': '' if available else '本地语音识别尚未准备好，请安装 ASR 依赖和模型。'}

    @staticmethod
    def read_pcm(data):
        if len(data) > MAX_BYTES:
            raise HTTPException(413, '录音过大，请控制在30秒以内。')
        try:
            with wave.open(io.BytesIO(data), 'rb') as audio:
                rate, frames = audio.getframerate(), audio.getnframes()
                if audio.getnchannels() != 1 or audio.getsampwidth() != 2 or audio.getcomptype() != 'NONE' or rate not in (16000, 22050, 24000, 32000, 44100, 48000):
                    raise ValueError('format')
                duration = frames / rate
                if not .25 <= duration <= MAX_SECONDS:
                    raise HTTPException(422, '请录制0.25到30秒的语音。')
                pcm = audio.readframes(frames)
                if len(pcm) != frames * 2:
                    raise ValueError('truncated')
                return pcm, rate, duration
        except HTTPException:
            raise
        except (wave.Error, EOFError, ValueError, OverflowError):
            raise HTTPException(422, '录音格式无效，需要单声道16位PCM WAV。')

    @classmethod
    def transcribe(cls, data):
        pcm, rate, duration = cls.read_pcm(data)
        if not cls.status()['available']:
            raise HTTPException(503, cls.status()['message'])
        if not cls._lock.acquire(blocking=False):
            raise HTTPException(429, '语音识别正在处理另一段录音，请稍后重试。')
        try:
            import numpy as np
            import sherpa_onnx
            samples = np.frombuffer(pcm, dtype='<i2').astype(np.float32) / 32768
            if float(np.sqrt(np.mean(samples * samples))) < .0005:
                raise HTTPException(422, '没有听到清晰语音，请靠近麦克风后重试。')
            started = time.perf_counter()
            if cls._recognizer is None:
                cls._recognizer = sherpa_onnx.OfflineRecognizer.from_sense_voice(
                    model=str(MODEL_DIR / 'model.int8.onnx'), tokens=str(MODEL_DIR / 'tokens.txt'),
                    num_threads=2, use_itn=True, language='auto', provider='cpu', debug=False)
            stream = cls._recognizer.create_stream()
            stream.accept_waveform(rate, samples)
            cls._recognizer.decode_stream(stream)
            text = stream.result.text.strip()
            if not text:
                raise HTTPException(422, '没有识别到文字，请重新录音。')
            return {'text': text, 'model': 'SenseVoiceSmall-int8', 'source': 'local_asr', 'duration_seconds': round(duration, 3), 'processing_ms': round((time.perf_counter() - started) * 1000)}
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(503, '本地语音识别失败，请重试；没有发送文字或执行车辆操作。') from exc
        finally:
            cls._lock.release()
