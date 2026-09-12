export const FREE_TIER_MESSAGES_PER_MONTH = 2_000_000;
export const WARN_FRACTION = 0.5;

export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Fraction of the UTC month elapsed at `d`, never zero. */
export function monthFraction(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  return Math.max(1e-6, (d.getTime() - start) / (end - start));
}

/**
 * Local counter of realtime messages this client sent or received for one project, projected linearly over
 * the month against the free-tier budget (R15.4, R2.8). Persisted so reloads don't reset the estimate.
 */
export class MessageBudget {
  count = 0;
  private month: string;
  private dirty = 0;

  constructor(
    private key: string,
    private storage: Pick<Storage, 'getItem' | 'setItem'> | null = null,
    now = new Date(),
  ) {
    this.month = monthKey(now);
    try {
      const raw = storage?.getItem(key);
      if (raw) {
        const saved = JSON.parse(raw) as { month: string; count: number };
        if (saved.month === this.month && Number.isFinite(saved.count)) this.count = saved.count;
      }
    } catch {
      /* ignore */
    }
  }

  add(n = 1, now = new Date()): number {
    const m = monthKey(now);
    if (m !== this.month) {
      this.month = m;
      this.count = 0;
    }
    this.count += n;
    this.dirty += n;
    if (this.dirty >= 25) this.persist();
    return this.count;
  }

  persist(): void {
    this.dirty = 0;
    try {
      this.storage?.setItem(this.key, JSON.stringify({ month: this.month, count: this.count }));
    } catch {
      /* ignore */
    }
  }

  estimate(now = new Date()): number {
    return Math.round(this.count / monthFraction(now));
  }

  fraction(now = new Date()): number {
    return this.estimate(now) / FREE_TIER_MESSAGES_PER_MONTH;
  }

  warn(now = new Date()): boolean {
    return this.fraction(now) >= WARN_FRACTION;
  }
}
