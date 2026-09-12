import { describe, it, expect } from 'vitest';
import { formatLength, parseLength, roundToEighth } from '../../src/lib/geom/units';

describe('formatLength', () => {
  it('formats whole feet and inches', () => {
    expect(formatLength(150)).toBe(`12'-6"`);
    expect(formatLength(0)).toBe(`0'-0"`);
    expect(formatLength(756)).toBe(`63'-0"`);
    expect(formatLength(-18)).toBe(`-1'-6"`);
  });
  it('formats fractions to the eighth', () => {
    expect(formatLength(3.5)).toBe(`0'-3½"`);
    expect(formatLength(12.125)).toBe(`1'-0⅛"`);
    expect(formatLength(12.1)).toBe(`1'-0⅛"`);
  });
  it('inches-only mode', () => {
    expect(formatLength(150, { inchesOnly: true })).toBe(`150"`);
  });
});

describe('parseLength', () => {
  it('parses the accepted forms', () => {
    expect(parseLength(`12'6"`)).toBe(150);
    expect(parseLength(`12'-6"`)).toBe(150);
    expect(parseLength('12-6')).toBe(150);
    expect(parseLength('150"')).toBe(150);
    expect(parseLength("12.5'")).toBe(150);
    expect(parseLength('150')).toBe(150);
    expect(parseLength(`3½"`)).toBe(3.5);
    expect(parseLength(`0'-3 1/2"`)).toBe(3.5);
    expect(parseLength("12'")).toBe(144);
  });
  it('rejects garbage', () => {
    expect(parseLength('abc')).toBeNull();
    expect(parseLength('')).toBeNull();
  });
});

describe('roundToEighth', () => {
  it('rounds', () => {
    expect(roundToEighth(3.49)).toBe(3.5);
    expect(roundToEighth(3.07)).toBe(3.125);
  });
});
