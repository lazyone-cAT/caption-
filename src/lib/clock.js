/**
 * clock.js — a single, deterministic playhead shared by the preview renderer,
 * the timeline UI and the exporter.
 *
 * The clock is the master time source for the whole composition: every anime.js
 * timeline, the GIF frame picker, the video element and the caption renderer are
 * all evaluated as a pure function of `clock.time`.
 *
 * Because the time is injected (rather than read from `performance.now()` inside
 * each subsystem), we get *exactly* the same pixels in preview and in export.
 */
export class Clock {
  constructor({ duration = 0, onTick, timeProvider } = {}) {
    this.duration = Math.max(0, duration);
    this.time = 0;
    this.playing = false;
    this.rate = 1;
    this.onTick = onTick || null;
    /** When set (e.g. the Web Audio playhead), audio becomes the master clock. */
    this.timeProvider = timeProvider || null;
    this._raf = 0;
    this._lastFrame = 0;
    this._listeners = new Set();
  }

  /** @param {(()=>number)|null} fn */
  setTimeProvider(fn) {
    this.timeProvider = fn;
  }

  /** @param {(clock:Clock)=>void} fn */
  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit() {
    this.onTick?.(this);
    for (const fn of this._listeners) fn(this);
  }

  setDuration(seconds) {
    this.duration = Math.max(0, seconds);
    if (this.time > this.duration) this.time = this.duration;
  }

  seek(seconds) {
    const clamped = Math.min(Math.max(0, seconds), this.duration);
    if (clamped === this.time && !this.playing) return;
    this.time = clamped;
    this._emit();
  }

  play() {
    if (this.playing) return;
    if (this.time >= this.duration) this.time = 0;
    this.playing = true;
    this._lastFrame = performance.now();
    const loop = (now) => {
      if (!this.playing) return;
      const delta = ((now - this._lastFrame) / 1000) * this.rate;
      this._lastFrame = now;
      this.time = this.timeProvider ? this.timeProvider() : this.time + delta;
      if (this.time >= this.duration) {
        this.time = this.duration;
        this._emit();
        this.pause();
        return;
      }
      this._emit();
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
    this._emit();
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    cancelAnimationFrame(this._raf);
    this._emit();
  }

  toggle() {
    this.playing ? this.pause() : this.play();
  }

  nudge(delta) {
    this.seek(this.time + delta);
  }

  destroy() {
    this.pause();
    this._listeners.clear();
  }
}
