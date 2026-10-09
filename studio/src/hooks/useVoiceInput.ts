import { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl } from '@/lib/api';
import { VoiceCapture } from '@/lib/voiceCapture';
import { SpeechEndpoint } from '@/lib/speechEndpoint';

export type VoicePhase = 'idle' | 'requesting' | 'recording' | 'transcribing';
type Session = { token: number; recorder: VoiceCapture; endpoint?: SpeechEndpoint; partial?: Promise<void>; lastPartial: number };

export function useVoiceInput(onTranscript: (text: string) => void) {
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const [transcript, setTranscript] = useState('');
  const state = useRef<VoicePhase>('idle');
  const session = useRef<Session | null>(null);
  const controllers = useRef(new Set<AbortController>());
  const epoch = useRef(0);
  const callback = useRef(onTranscript);
  useEffect(() => { callback.current = onTranscript; }, [onTranscript]);
  const release = useCallback(() => {
    epoch.current++;
    session.current?.recorder.dispose(); session.current = null;
    controllers.current.forEach(controller => controller.abort()); controllers.current.clear();
    state.current = 'idle';
  }, []);
  const cancel = useCallback(() => {
    release(); setPhase('idle'); setSeconds(0); setError(''); setTranscript('');
  }, [release]);
  const fail = useCallback((message: string) => {
    release(); setPhase('idle'); setError(message); setTranscript('');
  }, [release]);
  const transcribe = useCallback(async (audio: Blob, token: number, partial: boolean) => {
    const abort = new AbortController(); controllers.current.add(abort);
    const timer = window.setTimeout(() => abort.abort(), 20000);
    try {
      // A cancelled HTTP request may still be decoding server-side. Retry its busy response,
      // but never overlap recognition requests from this utterance or queue stale snapshots.
      for (let attempt = 0; attempt < 5; attempt++) {
        if (token !== epoch.current || abort.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        const response = await fetch(apiUrl('/v1/audio/transcriptions'), { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: audio, signal: abort.signal });
        const data = await response.json();
        if (token !== epoch.current || abort.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        if (partial && (response.status === 422 || response.status === 429)) return '';
        if (response.status === 429 && attempt < 4) {
          await new Promise(resolve => window.setTimeout(resolve, 500)); continue;
        }
        if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : '语音识别失败，请重试。');
        const result = typeof data.text === 'string' ? data.text.trim() : '';
        if (!result && !partial) throw new Error('没有听到清晰语音，请再说一次。');
        return result;
      }
      return '';
    } finally { window.clearTimeout(timer); controllers.current.delete(abort); }
  }, []);
  const stop = useCallback(async () => {
    if (state.current !== 'recording' || !session.current) return;
    const current = session.current;
    state.current = 'transcribing'; setPhase('transcribing');
    try {
      const audio = await current.recorder.stop(); // Release mic immediately, including during slow ASR.
      await current.partial; // Let the last snapshot finish before final decoding; do not cancel into 429.
      if (current.token !== epoch.current) return;
      const result = await transcribe(audio, current.token, false);
      if (current.token !== epoch.current) return;
      session.current = null; state.current = 'idle'; setPhase('idle'); setTranscript(result);
      callback.current(result); // Exactly one final utterance, never an interim hypothesis.
    } catch (cause) {
      if (current.token === epoch.current) fail(cause instanceof Error && cause.name === 'AbortError' ? '识别超时，请重试。' : cause instanceof Error ? cause.message : '语音识别失败，请重试。');
    }
  }, [fail, transcribe]);
  const start = async () => {
    if (state.current !== 'idle') return;
    const current: Session = { token: ++epoch.current, recorder: new VoiceCapture(), lastPartial: 0 };
    session.current = current;
    state.current = 'requesting'; setPhase('requesting'); setSeconds(0); setError(''); setTranscript('');
    try {
      const started = await current.recorder.start(() => { void stop(); }, () => {
        if (current.token === epoch.current) fail('麦克风已断开，请检查设备后重试。');
      }, (samples, rate) => {
        if (current.token !== epoch.current || state.current !== 'recording') return;
        current.endpoint ??= new SpeechEndpoint(rate);
        const end = current.endpoint.push(samples);
        if (end === 'silence') { fail('没有听到说话，请点击麦克风再试一次。'); return; }
        if (end === 'utterance') { void stop(); return; }
        const elapsed = current.endpoint.seconds;
        if (!current.endpoint.hasSpeech || current.partial || elapsed - current.lastPartial < .75) return;
        current.lastPartial = elapsed;
        const audio = current.recorder.snapshot();
        current.partial = transcribe(audio, current.token, true).then(result => {
          if (current.token === epoch.current && state.current === 'recording' && result) setTranscript(result);
        }).catch(cause => {
          if (current.token === epoch.current) fail(cause instanceof Error && cause.name === 'AbortError' ? '识别超时，请重试。' : cause instanceof Error ? cause.message : '语音识别失败，请重试。');
        }).finally(() => { current.partial = undefined; });
      });
      if (current.token !== epoch.current || !started) return;
      state.current = 'recording'; setPhase('recording');
    } catch (cause) {
      if (current.token !== epoch.current) return;
      const name = cause instanceof Error ? cause.name : '';
      fail(name === 'NotAllowedError' ? '未获得麦克风权限，请允许后再次点击麦克风。'
        : name === 'NotFoundError' ? '没有找到麦克风，请连接设备后重试。'
        : name === 'NotReadableError' ? '麦克风无法使用，可能正在被其他应用占用。'
        : cause instanceof Error ? cause.message : '无法打开麦克风，请重试。');
    }
  };
  useEffect(() => {
    if (phase !== 'recording') return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - started) / 1000); setSeconds(Math.min(30, elapsed));
      if (elapsed >= 8 && !session.current?.endpoint?.hasSpeech) fail('没有听到说话，请点击麦克风再试一次。');
      else if (elapsed >= 30) void stop();
    }, 250);
    return () => window.clearInterval(timer);
  }, [phase, fail, stop]);
  useEffect(() => {
    const hide = () => { if (document.hidden && state.current !== 'idle') cancel(); };
    const leave = () => cancel();
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', leave);
    return () => { document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', leave); release(); };
  }, [cancel, release]);
  return { phase, seconds, error, transcript, start, stop, cancel, active: phase !== 'idle' };
}
