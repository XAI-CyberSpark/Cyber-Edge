/** Local energy endpointing after browser echo/noise suppression, not a semantic VAD.
 * Short pauses stay in the same utterance. Silence never becomes an assistant request.
 */
export class SpeechEndpoint {
  private frames = 0;
  private square = 0;
  private windowFrames = 0;
  private voiced = 0;
  private quiet = 0;
  private noise = .001;
  hasSpeech = false;
  ended = false;
  private rate: number;
  constructor(rate: number) { this.rate = rate; }
  get seconds() { return this.frames / this.rate; }
  push(samples: Float32Array): 'utterance' | 'silence' | undefined {
    if (this.ended) return;
    const windowSize = Math.round(this.rate * .02);
    for (const sample of samples) {
      this.frames++; this.square += sample * sample; this.windowFrames++;
      if (this.windowFrames < windowSize) continue;
      const rms = Math.sqrt(this.square / this.windowFrames);
      this.square = 0; this.windowFrames = 0;
      const audible = rms > Math.max(.006, this.noise * 3);
      if (audible) { this.voiced += .02; this.quiet = 0; }
      else {
        this.quiet += .02;
        this.noise = this.noise * .95 + Math.min(rms, .004) * .05;
        if (!this.hasSpeech && this.quiet > .12) this.voiced = 0;
      }
      if (this.voiced >= .18) this.hasSpeech = true;
      if (this.hasSpeech && this.quiet >= 1.1) { this.ended = true; return 'utterance'; }
      if (!this.hasSpeech && this.seconds >= 8) { this.ended = true; return 'silence'; }
    }
  }
}
