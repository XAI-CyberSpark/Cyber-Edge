export type RearVideoSource = { source: 'local_replay' | 'browser_stream'; streamUrl?: string };
export type RearVideoState = { visible: boolean; expanded: boolean; phase: 'idle' | 'connecting' | 'playing' | 'error'; mode: RearVideoSource['source']; error: string };
export class RearVideo {
  private state: RearVideoState = { visible: false, expanded: false, phase: 'idle', mode: 'local_replay', error: '' };
  private listeners = new Set<() => void>();
  private video: HTMLVideoElement | null = null;
  private anchor: HTMLElement | null = null;
  private cancelPending?: () => void;
  private demoUrl: string;
  constructor(demoUrl: string) { this.demoUrl = demoUrl; }
  getSnapshot = () => this.state;
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  private update(patch: Partial<RearVideoState>) { this.state = { ...this.state, ...patch }; this.listeners.forEach(fn => fn()); }
  attach = (el: HTMLElement | null) => { this.anchor = el; if (!el) this.close(); else if (this.video && this.video.parentElement !== el) el.appendChild(this.video); };
  toggleExpanded = () => this.update({ expanded: !this.state.expanded });
  close = () => { this.cancelPending?.(); this.video?.pause(); this.update({ visible: false, expanded: false, phase: 'idle', error: '' }); };
  async show(config: RearVideoSource, signal?: AbortSignal): Promise<'opened'> {
    signal?.throwIfAborted();
    if (!this.anchor) throw new Error('后排视频窗口未连接。');
    let sourceUrl = this.demoUrl;
    if (config.source === 'browser_stream') {
      try { const u = new URL(config.streamUrl || ''); if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error(); sourceUrl = u.href; }
      catch { throw new Error('请在视频节点配置可播放的 HTTP(S) 视频流地址。'); }
    } else if (config.source !== 'local_replay') throw new Error('后排视频来源无效。');
    this.close();
    if (!this.video) {
      this.video = document.createElement('video'); this.video.muted = true; this.video.playsInline = true; this.video.preload = 'auto';
      this.video.setAttribute('aria-label', '后排视频画面');
      this.video.addEventListener('error', () => { if (this.state.visible && this.state.phase === 'playing') this.update({ phase: 'error', error: '后排视频连接中断。' }); });
      this.anchor.appendChild(this.video);
    }
    const video = this.video;
    video.loop = config.source === 'local_replay';
    this.update({ visible: true, expanded: false, phase: 'connecting', mode: config.source, error: '' });
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => { clearTimeout(timer); video.removeEventListener('playing', ready); video.removeEventListener('error', failed); signal?.removeEventListener('abort', abort); this.cancelPending = undefined; };
      const finish = (error?: string, cancelled = false) => {
        if (settled) return; settled = true; cleanup();
        if (error) { video.pause(); this.update(cancelled ? { visible: false, phase: 'idle' } : { phase: 'error', error }); reject(new Error(error)); }
        else { this.update({ phase: 'playing' }); resolve('opened'); }
      };
      const ready = () => signal?.aborted ? finish('本次展示已取消。', true) : finish();
      const failed = () => finish('后排视频未连接，请检查视频源。');
      const abort = () => finish('本次展示已取消。', true);
      const timer = setTimeout(() => finish('后排视频连接超时。'), 10000);
      this.cancelPending = abort;
      video.addEventListener('playing', ready); video.addEventListener('error', failed); signal?.addEventListener('abort', abort, { once: true });
      if (video.getAttribute('src') !== sourceUrl) video.src = sourceUrl;
      if (video.ended) video.currentTime = 0;
      void video.play().then(() => { if (!video.paused && video.readyState >= 2) ready(); }).catch(failed);
    });
  }
  dispose() { this.close(); if (this.video) { this.video.removeAttribute('src'); this.video.load(); this.video.remove(); this.video = null; } }
}
