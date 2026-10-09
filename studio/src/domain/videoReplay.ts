import type { RuntimeRunResult } from './runtime';

export type ReplayFrame = { sourceId: string; mediaTime: number; fileName?: string };
export type ReplayInput = { type: 'image'; content: string; text?: string; replay: ReplayFrame };
type Runner = (input: ReplayInput, signal: AbortSignal) => Promise<RuntimeRunResult>;
export type ReplayState = {
  loop: boolean; name: string; phase: 'empty' | 'ready' | 'playing' | 'paused' | 'ended' | 'error';
  time: number; duration: number; analyzing: boolean; popup: boolean; error: string;
  result: string; sampleTime: number | null; displayedSample: number | null;
};
export const replayTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;

/** One owned video element: moving it between preview and HMI never starts a second playback. */
export class VideoReplay {
  private state: ReplayState = { loop: false, name: '', phase: 'empty', time: 0, duration: 0, analyzing: false, popup: false, error: '', result: '', sampleTime: null, displayedSample: null };
  private listeners = new Set<() => void>();
  private video: HTMLVideoElement | null = null;
  private url = '';
  private sourceId = '';
  private revision = 0;
  private runner?: Runner;
  private controller?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;
  private warned = false;
  private preview: HTMLElement | null = null;
  private screen: HTMLElement | null = null;
  private cleanup: Array<() => void> = [];
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getSnapshot = () => this.state;
  private update(patch: Partial<ReplayState>) { this.state = { ...this.state, ...patch }; this.place(); this.listeners.forEach(fn => fn()); }
  private place() {
    const target = this.state.popup ? this.screen : this.preview;
    if (target && this.video && this.video.parentElement !== target) target.appendChild(this.video);
  }
  attachPreview = (el: HTMLElement | null) => { this.preview = el; this.place(); };
  attachScreen = (el: HTMLElement | null) => { this.screen = el; this.place(); };
  setRunner(runner?: Runner) { this.runner = runner; if (!runner) this.pause(); }
  private cancel() { this.revision++; clearTimeout(this.timer); this.timer = undefined; this.controller?.abort(); }
  private release() {
    this.cancel(); this.cleanup.forEach(fn => fn()); this.cleanup = [];
    if (this.video) { this.video.pause(); this.video.removeAttribute('src'); this.video.load(); this.video.remove(); this.video = null; }
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = ''; this.sourceId = ''; this.warned = false;
  }
  load(file: File) {
    this.release();
    if ((!file.type.startsWith('video/') && !/\.(mp4|mov|webm|m4v)$/i.test(file.name)) || file.size > 500 * 1024 * 1024) {
      this.update({ phase: 'error', name: '', time: 0, duration: 0, result: '', sampleTime: null, displayedSample: null, popup: false, analyzing: false, error: '请选择浏览器支持的视频（MP4 / MOV / WebM，最大 500 MB）。' }); return;
    }
    this.url = URL.createObjectURL(file); this.sourceId = `replay-${crypto.randomUUID()}`;
    const video = document.createElement('video'); this.video = video;
    video.loop = this.state.loop; video.muted = true; video.playsInline = true; video.preload = 'metadata'; video.setAttribute('aria-label', '本地后排视频回放');
    const on = (name: string, fn: () => void) => { video.addEventListener(name, fn); this.cleanup.push(() => video.removeEventListener(name, fn)); };
    on('loadedmetadata', () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) { this.fail('视频时长无效，请更换文件。'); return; }
      this.update({ phase: 'ready', duration: video.duration });
    });
    on('timeupdate', () => this.update({ time: video.currentTime }));
    on('playing', () => { this.update({ phase: 'playing' }); this.schedule(0); });
    on('pause', () => { this.cancel(); this.update({ phase: video.ended ? 'ended' : this.state.phase === 'error' ? 'error' : 'paused', analyzing: false, popup: false }); });
    on('ended', () => { this.cancel(); this.update({ phase: 'ended', analyzing: false, popup: false, time: video.currentTime }); });
    on('seeked', () => { if (!video.paused) this.schedule(0); });
    on('error', () => this.fail('视频无法解码或读取，请换用兼容的 MP4（H.264）文件。'));
    this.update({ name: file.name, phase: 'empty', time: 0, duration: 0, analyzing: false, popup: false, error: '', result: '', sampleTime: null, displayedSample: null });
    video.src = this.url; video.load();
  }
  setLoop(loop: boolean) { if (this.video) this.video.loop = loop; this.update({ loop }); }
  async play() {
    if (!this.video || !this.runner || !this.state.duration) return;
    if (this.state.phase !== 'playing') this.warned = false;
    if (this.video.ended) { this.warned = false; this.video.currentTime = 0; }
    this.update({ error: '' });
    try { await this.video.play(); } catch { this.fail('浏览器未能播放视频，请重新点击播放或更换文件。'); }
  }
  pause() { this.cancel(); this.video?.pause(); this.update({ phase: this.state.phase === 'playing' ? 'paused' : this.state.phase, analyzing: false, popup: false }); }
  seek(time: number) { if (this.video && this.state.duration) { this.cancel(); this.warned = false; this.video.currentTime = Math.min(this.state.duration, Math.max(0, time)); this.update({ time: this.video.currentTime, popup: false, analyzing: false, result: '', sampleTime: null }); } }
  dismiss() { this.update({ popup: false }); }
  show(frame: ReplayFrame): 'opened' | 'already-notified' {
    if (!this.video || this.video.paused || this.state.phase !== 'playing' || frame.sourceId !== this.sourceId) throw new Error('回放已停止或视频已更换，未展示旧画面。');
    if (this.warned) return 'already-notified';
    if (!this.screen) throw new Error('中控视频展示区域未连接。');
    this.warned = true; this.update({ popup: true, displayedSample: frame.mediaTime });
    return 'opened';
  }
  private fail(error: string) { this.cancel(); this.video?.pause(); this.update({ phase: 'error', analyzing: false, popup: false, error }); }
  private schedule(delay: number) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.sample(), delay);
  }
  private async sample() {
    const video = this.video;
    if (!video || video.paused || video.ended || !this.runner || this.state.phase !== 'playing') return;
    if (this.controller) { this.schedule(200); return; }
    if (video.readyState < 2 || !video.videoWidth) { this.schedule(200); return; }
    const revision = this.revision, controller = new AbortController(); this.controller = controller;
    const mediaTime = video.currentTime;
    this.update({ analyzing: true });
    try {
      const canvas = document.createElement('canvas'), scale = Math.min(1, 768 / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale)); canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('浏览器无法抽取视频画面。');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const result = await this.runner({ type: 'image', content: canvas.toDataURL('image/jpeg', .8), text: '只判断当前抽取的座舱画面。', replay: { sourceId: this.sourceId, mediaTime, fileName: this.state.name } }, controller.signal);
      if (controller.signal.aborted || revision !== this.revision) return;
      if (result.status === 'failed') {
        const failure = result.events.find(e => e.type === 'node_failed');
        throw new Error(String(failure?.payload.error || '本次识别失败，请查看运行记录。'));
      }
      const output = result.finalOutput as { decision_status?: string } | undefined;
      if (output?.decision_status === 'normal') this.warned = false;
      this.update({ result: output?.decision_status === 'risk' ? '最近画面：发现风险' : output?.decision_status === 'normal' ? '最近画面：未见明确风险' : '最近画面：无法判断', sampleTime: mediaTime });
    } catch (cause) {
      if (!controller.signal.aborted && revision === this.revision) this.fail(cause instanceof Error ? cause.message : '抽帧识别失败。');
    } finally {
      if (this.controller === controller) { this.controller = undefined; this.update({ analyzing: false }); if (this.state.phase === 'playing') this.schedule(2000); }
    }
  }
  dispose() { this.release(); this.runner = undefined; this.update({ ...this.state, name: '', phase: 'empty', popup: false, analyzing: false }); }
}
