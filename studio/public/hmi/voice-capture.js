// AudioWorklet: no audio is played; send bounded mono PCM blocks to the UI.
class CabinVoiceCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(2048);
    this.offset = 0;
    this.frames = 0;
    this.active = true;
    this.port.onmessage = ({ data }) => {
      if (data === 'stop') {
        this.active = false;
        this.flush();
        this.port.postMessage({ done: true });
      }
    };
  }
  flush() {
    if (!this.offset) return;
    const samples = this.buffer.slice(0, this.offset);
    this.port.postMessage({ samples }, [samples.buffer]);
    this.offset = 0;
  }
  process(inputs) {
    const channels = inputs[0];
    if (!this.active || !channels?.length) return true;
    for (let i = 0; i < channels[0].length && this.frames < sampleRate * 30; i++) {
      let value = 0;
      for (const channel of channels) value += channel[i] || 0;
      this.buffer[this.offset++] = value / channels.length;
      this.frames++;
      if (this.offset === this.buffer.length) this.flush();
    }
    if (this.frames >= sampleRate * 30) {
      this.active = false;
      this.flush();
      this.port.postMessage({ limit: true });
    }
    return true;
  }
}
registerProcessor('cabin-voice-capture', CabinVoiceCapture);
