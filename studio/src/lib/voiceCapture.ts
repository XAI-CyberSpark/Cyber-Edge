/** PCM WAV makes recording portable without server-side codec/ffmpeg processes. */
export function pcmWav(chunks: Float32Array[], sampleRate: number): Blob {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const bytes = new ArrayBuffer(44 + length * 2);
  const view = new DataView(bytes);
  const word = (offset: number, value: string) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  word(0, 'RIFF'); view.setUint32(4, 36 + length * 2, true); word(8, 'WAVE'); word(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); word(36, 'data'); view.setUint32(40, length * 2, true);
  let offset = 44;
  for (const chunk of chunks) for (const value of chunk) {
    const sample = Math.max(-1, Math.min(1, value));
    view.setInt16(offset, Math.round(sample * (sample < 0 ? 32768 : 32767)), true); offset += 2;
  }
  return new Blob([bytes], { type: 'audio/wav' });
}

export class VoiceCapture {
  private stream?: MediaStream;
  private context?: AudioContext;
  private node?: AudioWorkletNode;
  private source?: MediaStreamAudioSourceNode;
  private chunks: Float32Array[] = [];
  private disposed = false;
  private finish?: () => void;
  private frames = 0;
  async start(onLimit: () => void, onEnded: () => void, onSamples?: (samples: Float32Array, sampleRate: number) => void) {
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext || !window.AudioWorkletNode) {
      throw new Error('当前浏览器不支持录音，请使用 localhost 或 HTTPS 下的新版浏览器。');
    }
    // Create/resume within the user gesture; permission may resolve much later.
    this.context = new AudioContext({ sampleRate: 16000 });
    const resume = this.context.resume();
    void resume.catch(() => undefined);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
    if (this.disposed) { stream.getTracks().forEach(track => track.stop()); return false; }
    this.stream = stream;
    stream.getAudioTracks().forEach(track => track.addEventListener('ended', onEnded, { once: true }));
    await resume;
    await this.context.audioWorklet.addModule('/hmi/voice-capture.js');
    if (this.disposed) return false;
    this.node = new AudioWorkletNode(this.context, 'cabin-voice-capture');
    this.node.port.onmessage = ({ data }: MessageEvent<{ samples?: Float32Array; done?: boolean; limit?: boolean }>) => {
      if (this.disposed) return;
      if (data.samples) {
        const remaining = this.context!.sampleRate * 30 - this.frames;
        const chunk = data.samples.slice(0, Math.max(0, remaining));
        this.chunks.push(chunk); this.frames += chunk.length;
        onSamples?.(chunk, this.context!.sampleRate);
      }
      if (data.done) this.finish?.();
      if (data.limit) onLimit();
    };
    this.source = this.context.createMediaStreamSource(stream);
    this.source.connect(this.node);
    this.node.connect(this.context.destination); // Worklet emits silence, never microphone playback.
    return true;
  }
  snapshot() { return pcmWav(this.chunks, this.context?.sampleRate || 16000); }
  async stop() {
    const sampleRate = this.context?.sampleRate || 16000;
    if (this.node) await new Promise<void>(resolve => {
      const timer = window.setTimeout(resolve, 200);
      this.finish = () => { window.clearTimeout(timer); resolve(); };
      this.node!.port.postMessage('stop');
    });
    const result = pcmWav(this.chunks, sampleRate);
    this.dispose();
    return result;
  }
  dispose() {
    this.disposed = true;
    this.stream?.getTracks().forEach(track => track.stop());
    this.source?.disconnect(); this.node?.disconnect();
    if (this.node) { this.node.port.onmessage = null; this.node.port.close(); }
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => undefined);
    this.finish?.(); this.chunks = [];
  }
}
