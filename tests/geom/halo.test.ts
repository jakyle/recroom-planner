import { describe, it, expect } from 'vitest';
import { haloPolygon, haloIsEmpty } from '../../src/lib/geom/halo';

describe('halo', () => {
  it('expands uniformly', () => {
    expect(haloPolygon({ x: 0, y: 0, w: 10, d: 10, rot: 0 }, { all: 5 })).toEqual([[-5, -5], [15, -5], [15, 15], [-5, 15]]);
  });
  it('expands per side', () => {
    expect(haloPolygon({ x: 0, y: 0, w: 10, d: 10, rot: 0 }, { front: 4, back: 0, left: 1, right: 2 })).toEqual([[-1, 0], [12, 0], [12, 14], [-1, 14]]);
  });
  it('empty detection', () => {
    expect(haloIsEmpty(null)).toBe(true);
    expect(haloIsEmpty({ all: 0 })).toBe(true);
    expect(haloIsEmpty({ all: 1 })).toBe(false);
  });
});
