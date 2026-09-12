export type Send = (event: string, payload: Record<string, unknown>) => void;

/**
 * Coalesces ephemeral messages per event and flushes them on a throttle (R15.4): cursor-only traffic at
 * `cursorHz`, anything involving a drag at `dragHz`. While a drag is pending the cursor rides inside the
 * `drag` message, so a moving user never exceeds `dragHz` messages per second. No timer runs while idle.
 */
export class Outbox {
  private pending = new Map<string, Record<string, unknown>>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastFlush = -1e12;
  private lastCursor = -1e12;
  readonly cursorMs: number;
  readonly dragMs: number;
  sent = 0;

  constructor(
    private send: Send,
    cursorHz = 15,
    dragHz = 20,
  ) {
    this.cursorMs = 1000 / cursorHz;
    this.dragMs = 1000 / dragHz;
  }

  get idle(): boolean {
    return this.pending.size === 0 && this.timer === null;
  }

  queue(event: string, payload: Record<string, unknown>): void {
    this.pending.set(event, payload);
    this.schedule();
  }

  flush(): void {
    this.clearTimer();
    this.tick(true);
  }

  stop(): void {
    this.clearTimer();
    this.pending.clear();
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    this.clearTimer();
    const now = Date.now();
    const cursorOnly = this.pending.size === 1 && this.pending.has('cursor');
    const delay = cursorOnly ? this.cursorMs - (now - this.lastCursor) : this.dragMs - (now - this.lastFlush);
    this.timer = setTimeout(() => this.tick(false), Math.max(0, Math.ceil(delay)));
  }

  private tick(force: boolean): void {
    this.timer = null;
    const now = Date.now();
    const drag = this.pending.get('drag');
    const cursor = this.pending.get('cursor');
    if (drag) {
      this.pending.delete('drag');
      this.pending.delete('cursor');
      this.emit('drag', cursor && 'c' in cursor ? { ...drag, c: cursor.c } : drag);
      this.lastCursor = now;
    } else if (cursor && (force || now - this.lastCursor >= this.cursorMs - 1)) {
      this.pending.delete('cursor');
      this.emit('cursor', cursor);
      this.lastCursor = now;
    }
    for (const [event, payload] of [...this.pending]) {
      if (event === 'cursor') continue;
      this.pending.delete(event);
      this.emit(event, payload);
    }
    this.lastFlush = now;
    if (this.pending.size > 0) this.schedule();
  }

  private emit(event: string, payload: Record<string, unknown>): void {
    this.sent += 1;
    this.send(event, payload);
  }
}
