import { describe, it, expect } from 'vitest';
import {
  footprint,
  aabb,
  pointInPolygon,
  polygonsIntersect,
  rectContainsPolygon,
  rotatePoint,
  centerOf,
  polygonArea,
} from '../../src/lib/geom/transform';

const box = { x: 0, y: 0, w: 100, d: 50, rot: 0 };

describe('footprint', () => {
  it('unrotated corners', () => {
    expect(footprint(box)).toEqual([[0, 0], [100, 0], [100, 50], [0, 50]]);
  });
  it('rotates about the center', () => {
    const p = footprint({ ...box, rot: 90 }).map(([x, y]) => [Math.round(x), Math.round(y)]);
    expect(p).toEqual([[75, -25], [75, 75], [25, 75], [25, -25]]);
  });
});

describe('aabb', () => {
  it('bounds a rotated box', () => {
    const b = aabb(footprint({ ...box, rot: 90 }));
    expect([Math.round(b.minX), Math.round(b.minY), Math.round(b.maxX), Math.round(b.maxY)]).toEqual([25, -25, 75, 75]);
  });
});

describe('hit tests', () => {
  it('point in polygon', () => {
    expect(pointInPolygon([10, 10], footprint(box))).toBe(true);
    expect(pointInPolygon([110, 10], footprint(box))).toBe(false);
  });
  it('polygons intersect and containment', () => {
    const other = footprint({ x: 90, y: 40, w: 30, d: 30, rot: 0 });
    expect(polygonsIntersect(footprint(box), other)).toBe(true);
    expect(polygonsIntersect(footprint(box), footprint({ x: 200, y: 0, w: 10, d: 10, rot: 0 }))).toBe(false);
    expect(rectContainsPolygon({ minX: -1, minY: -1, maxX: 101, maxY: 51 }, footprint(box))).toBe(true);
    expect(rectContainsPolygon({ minX: 0, minY: 0, maxX: 50, maxY: 50 }, footprint(box))).toBe(false);
  });
});

describe('rotatePoint / centerOf / area', () => {
  it('works', () => {
    expect(centerOf(box)).toEqual([50, 25]);
    const [x, y] = rotatePoint([1, 0], [0, 0], 90);
    expect([Math.round(x), Math.round(y)]).toEqual([0, 1]);
    expect(polygonArea(footprint(box))).toBe(5000);
  });
});
