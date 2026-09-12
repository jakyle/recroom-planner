import { describe, it, expect } from 'vitest';
import { snapValue, snapAngle, guideCandidates, applyGuides } from '../../src/lib/geom/snap';

describe('snapValue', () => {
  it('grid = 12", fine = 1", free = none', () => {
    expect(snapValue(17, 'grid')).toBe(12);
    expect(snapValue(17.6, 'fine')).toBe(18);
    expect(snapValue(17.6, 'free')).toBe(17.6);
  });
});

describe('snapAngle', () => {
  it('15° default, free passthrough', () => {
    expect(snapAngle(22, false)).toBe(15);
    expect(snapAngle(22, true)).toBe(22);
    expect(snapAngle(-7, false)).toBe(0);
    expect(snapAngle(359, false)).toBe(0);
  });
});

describe('guides', () => {
  it('aligns an edge to a nearby edge within tolerance', () => {
    const cands = guideCandidates([{ minX: 100, minY: 0, maxX: 200, maxY: 50 }]);
    const moving = { minX: 96, minY: 60, maxX: 146, maxY: 110 };
    const r = applyGuides(moving, cands, 6);
    expect(r.dx).toBe(4);
    expect(r.dy).toBe(0);
    expect(r.guides.some((g) => g.axis === 'x' && g.at === 100)).toBe(true);
  });
  it('ignores candidates far away on the other axis', () => {
    const cands = guideCandidates([{ minX: 100, minY: 0, maxX: 200, maxY: 50 }]);
    expect(applyGuides({ minX: 96, minY: 300, maxX: 146, maxY: 350 }, cands, 6, 100).dx).toBe(0);
    expect(applyGuides({ minX: 96, minY: 120, maxX: 146, maxY: 170 }, cands, 6, 100).dx).toBe(4);
  });
  it('no snap outside tolerance', () => {
    const cands = guideCandidates([{ minX: 100, minY: 0, maxX: 200, maxY: 50 }]);
    expect(applyGuides({ minX: 70, minY: 300, maxX: 90, maxY: 350 }, cands, 6).dx).toBe(0);
  });
});
