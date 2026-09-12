import { describe, it, expect } from 'vitest';
import { MessageBudget, monthFraction, monthKey, FREE_TIER_MESSAGES_PER_MONTH } from '../../src/lib/realtime/budget';

function mem(): Pick<Storage, 'getItem' | 'setItem'> {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

describe('MessageBudget', () => {
  const day10 = new Date(Date.UTC(2026, 8, 10, 12));

  it('month helpers', () => {
    expect(monthKey(day10)).toBe('2026-09');
    expect(monthFraction(new Date(Date.UTC(2026, 8, 16)))).toBeCloseTo(0.5, 5);
  });

  it('projects the month from the count so far', () => {
    const b = new MessageBudget('rr.rt.P', mem(), new Date(Date.UTC(2026, 8, 1)));
    const noon15 = new Date(Date.UTC(2026, 8, 16));
    b.add(1000, noon15);
    expect(b.estimate(noon15)).toBe(2000);
    expect(b.fraction(noon15)).toBeCloseTo(2000 / FREE_TIER_MESSAGES_PER_MONTH, 9);
    expect(b.warn(noon15)).toBe(false);
    b.add(600_000, noon15);
    expect(b.warn(noon15)).toBe(true);
  });

  it('persists and rolls over at month end', () => {
    const s = mem();
    const a = new MessageBudget('rr.rt.P', s, day10);
    a.add(50, day10);
    a.persist();
    const b = new MessageBudget('rr.rt.P', s, day10);
    expect(b.count).toBe(50);
    b.add(1, new Date(Date.UTC(2026, 9, 1)));
    expect(b.count).toBe(1);
  });
});
