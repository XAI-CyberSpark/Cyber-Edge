import { BotEngine } from '@/vendor/bloub/engine';
import { defaultCycle } from '@/vendor/bloub/cycles';
import { RAYON } from '@/vendor/bloub/repere';
import { STATE_BY_ID, type StateId } from '@/vendor/bloub/states';

/** Preview transport only. All poses and transitions stay in the unmodified upstream engine. */
export class AvatarPlayback {
  readonly engine: BotEngine;
  private clock = 0;
  private enteredAt = 0;
  private index = 0;
  private blocks = defaultCycle().blocks;
  cycling = false;
  constructor(state: StateId = 'alert') { this.engine = new BotEngine(RAYON, state); }
  get state() { return this.engine.state; }
  get elapsed() { return this.clock - this.enteredAt; }
  get duration() { return STATE_BY_ID.get(this.state)!.duration; }
  get frame() { return this.engine.sample(this.clock); }
  select(state: StateId) { this.cycling = false; this.engine.setState(state, this.clock); this.enteredAt = this.clock; }
  restart() { this.clock = 0; this.enteredAt = 0; this.engine.reset(this.state, 0); }
  seek(seconds: number) {
    if (!Number.isFinite(seconds)) return;
    this.cycling = false; this.engine.reset(this.state, 0); this.enteredAt = 0;
    this.clock = Math.max(0, Math.min(this.duration, seconds));
  }
  startCycle() {
    this.cycling = true; this.index = 0; this.clock = 0; this.enteredAt = 0;
    this.engine.reset(this.blocks[0].state, 0);
  }
  advance(delta: number) {
    if (!Number.isFinite(delta) || delta < 0) return;
    // Same maximum frame delta as upstream; hidden tabs never jump through a sequence.
    this.clock += Math.min(delta, 0.064);
    if (this.cycling && this.elapsed >= this.blocks[this.index].duration) {
      this.index = (this.index + 1) % this.blocks.length;
      this.engine.setState(this.blocks[this.index].state, this.clock);
      this.enteredAt = this.clock;
    }
  }
}
