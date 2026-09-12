import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Outbox } from '../../src/lib/realtime/outbox';

describe('Outbox', () => {
  let sent: Array<[string, Record<string, unknown>]>;
  let box: Outbox;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    sent = [];
    box = new Outbox((e, p) => sent.push([e, p]));
  });
  afterEach(() => vi.useRealTimers());

  it('cursor-only traffic is capped at 15 Hz and keeps the latest value', () => {
    for (let i = 0; i < 100; i++) {
      box.queue('cursor', { c: [i, i] });
      vi.advanceTimersByTime(10);
    }
    vi.advanceTimersByTime(100);
    expect(sent.length).toBeLessThanOrEqual(16);
    expect(sent.length).toBeGreaterThanOrEqual(14);
    expect(sent.at(-1)![1]).toEqual({ c: [99, 99] });
    expect(box.idle).toBe(true);
  });

  it('drags are capped at 20 Hz and carry the cursor instead of a separate message', () => {
    for (let i = 0; i < 200; i++) {
      box.queue('cursor', { c: [i, 0] });
      box.queue('drag', { p: { a: { x: i } } });
      vi.advanceTimersByTime(5);
    }
    vi.advanceTimersByTime(100);
    expect(sent.length).toBeLessThanOrEqual(21);
    expect(sent.every(([e]) => e === 'drag')).toBe(true);
    expect(sent.at(-1)![1]).toEqual({ p: { a: { x: 199 } }, c: [199, 0] });
  });

  it('sends nothing while idle', () => {
    box.queue('cursor', { c: [1, 1] });
    vi.advanceTimersByTime(200);
    const n = sent.length;
    vi.advanceTimersByTime(5000);
    expect(sent.length).toBe(n);
    expect(box.idle).toBe(true);
  });

  it('coalesces other events to the latest value per event', () => {
    box.queue('select', { ids: ['a'] });
    box.queue('select', { ids: ['a', 'b'] });
    vi.advanceTimersByTime(100);
    expect(sent).toEqual([['select', { ids: ['a', 'b'] }]]);
  });

  it('flush sends immediately and stop drops pending', () => {
    box.queue('cursor', { c: [2, 2] });
    box.flush();
    expect(sent.length).toBe(1);
    box.queue('cursor', { c: [3, 3] });
    box.stop();
    vi.advanceTimersByTime(1000);
    expect(sent.length).toBe(1);
  });
});
