import { describe, it, expect } from 'vitest';
import { CURSOR_COLORS, pickColor } from '../src/lib/ui/colors';

describe('pickColor', () => {
  it('cycles through the palette by index', () => {
    expect(pickColor(0)).toBe(CURSOR_COLORS[0]);
    expect(pickColor(CURSOR_COLORS.length)).toBe(CURSOR_COLORS[0]);
    expect(pickColor(3)).toBe(CURSOR_COLORS[3]);
  });
  it('palette has 8 distinct hex colors', () => {
    expect(new Set(CURSOR_COLORS).size).toBe(8);
    for (const c of CURSOR_COLORS) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });
});
