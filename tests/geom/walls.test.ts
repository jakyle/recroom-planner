import { describe, it, expect } from 'vitest';
import { wallOutline, pointAlong, openingRect, swingArc, wallLength, insideSignFor, projectOnWall } from '../../src/lib/geom/walls';

const wall = { ax: 0, ay: 0, bx: 100, by: 0, thickness: 6 };

describe('walls', () => {
  it('length and point along', () => {
    expect(wallLength(wall)).toBe(100);
    expect(pointAlong(wall, 25)).toEqual([25, 0]);
  });
  it('outline is a rectangle around the centerline', () => {
    expect(wallOutline(wall)).toEqual([[0, 3], [100, 3], [100, -3], [0, -3]]);
  });
  it('opening rect sits in the wall', () => {
    const r = openingRect(wall, { offset: 10, width: 36 });
    expect(r).toEqual([[10, 3], [46, 3], [46, -3], [10, -3]]);
  });
  it('door swing arc: leaf perpendicular from the hinge toward the interior', () => {
    const inside = insideSignFor(wall, [50, 40]);
    expect(inside).toBe(1);
    const arc = swingArc(wall, { offset: 10, width: 36, swing: 'in', hinge: 'a_side' }, inside);
    expect(arc.hinge).toEqual([10, 0]);
    expect(Math.round(arc.end[0])).toBe(10);
    expect(Math.round(arc.end[1])).toBe(36);
    expect(arc.path).toContain('A 36 36');
    const out = swingArc(wall, { offset: 10, width: 36, swing: 'out', hinge: 'a_side' }, inside);
    expect(Math.round(out.end[1])).toBe(-36);
  });
  it('projects a point onto the wall', () => {
    const p = projectOnWall(wall, [30, 5]);
    expect(p.t).toBe(30);
    expect(p.d).toBe(5);
    expect(projectOnWall(wall, [-10, 0]).t).toBe(0);
  });
});
