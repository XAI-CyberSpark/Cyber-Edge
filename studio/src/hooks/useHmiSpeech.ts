import { useCallback, useEffect, useRef, useState } from 'react';
export type HmiSpeechRequest = { id: number; text: string };
export function useHmiSpeech(request?: HmiSpeechRequest, active = true) {
  const [status, setStatus] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const cancel = useRef<(() => void) | null>(null);
  const seen = useRef<number | undefined>(undefined);
  const latestText = useRef('');
  const activeRef = useRef(active); activeRef.current = active;
  const stop = useCallback(() => { cancel.current?.(); cancel.current = null; setSpeaking(false); }, []);
  const speak = useCallback((text: string) => {
    stop(); if (!activeRef.current) return; latestText.current = text;
    if (!text.trim()) { setStatus(''); return; }
    const synth = window.speechSynthesis;
    if (!synth || typeof window.SpeechSynthesisUtterance !== 'function') {
      setStatus('当前浏览器不支持语音播报，已保留文字'); return;
    }
    let disposed = false, utterance: SpeechSynthesisUtterance | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clear = () => { clearTimeout(timer); synth.removeEventListener('voiceschanged', start); };
    const failed = (message: string) => { if (disposed) return; clear(); disposed = true; setSpeaking(false); setStatus(message); };
    const start = () => {
      if (disposed || utterance) return;
      // Use an installed Chinese voice; do not send passenger text to an external TTS service.
      const voice = synth.getVoices().find(v => v.localService && /^zh([_-]|$)/i.test(v.lang));
      if (!voice) return;
      clear();
      utterance = new window.SpeechSynthesisUtterance(text);
      utterance.voice = voice; utterance.lang = voice.lang;
      utterance.onstart = () => { if (!disposed) { setSpeaking(true); setStatus('正在播报'); } };
      utterance.onend = () => { if (!disposed) { clear(); setSpeaking(false); setStatus('播报完成'); } };
      utterance.onerror = () => failed('语音未能播放，可点击重新播报');
      timer = setTimeout(() => { failed('语音播放未完成，可点击重新播报'); if (utterance) { utterance.onend = null; utterance.onerror = null; } synth.cancel(); }, 120000);
      try { synth.speak(utterance); } catch { failed('语音未能播放，可点击重新播报'); }
    };
    cancel.current = () => {
      disposed = true; clear();
      if (utterance) { utterance.onstart = null; utterance.onend = null; utterance.onerror = null; synth.cancel(); }
      setStatus('播报已停止');
    };
    setStatus('准备播报');
    synth.addEventListener('voiceschanged', start);
    timer = setTimeout(() => failed('本机未提供中文语音，已保留文字'), 2000);
    start();
  }, [stop]);
  useEffect(() => {
    if (!active) { seen.current = request?.id; stop(); return; }
    if (request && seen.current !== request.id) { seen.current = request.id; speak(request.text); }
  }, [request, active, speak, stop]);
  useEffect(() => () => { cancel.current?.(); }, []);
  return { status, speaking, speak, stop, replay: () => speak(latestText.current) };
}
