import type { Pt, Poly } from './transform';

export type WallSeg = { ax: number; ay: number; bx: number; by: number; thickness: number };
export type OpeningGeom = {
  offset: number;
  width: number;
  swing?: 'in' | 'out' | 'none';
  hinge?: 'a_side' | 'b_side' | 'none';
};

export function wallLength(w: WallSeg): number {
  return Math.hypot(w.bx - w.ax, w.by - w.ay);
}

export function wallDir(w: WallSeg): Pt {
  const l = wallLength(w) || 1;
  return [(w.bx - w.ax) / l, (w.by - w.ay) / l];
}

/** Left-hand normal of A→B. */
export function wallNormal(w: WallSeg): Pt {
  const [dx, dy] = wallDir(w);
  return [-dy, dx];
}

export function pointAlong(w: WallSeg, t: number): Pt {
  const [dx, dy] = wallDir(w);
  return [w.ax + dx * t, w.ay + dy * t];
}

export function wallOutline(w: WallSeg): Poly {
  const [nx, ny] = wallNormal(w);
  const h = w.thickness / 2;
  return [
    [w.ax + nx * h, w.ay + ny * h],
    [w.bx + nx * h, w.by + ny * h],
    [w.bx - nx * h, w.by - ny * h],
    [w.ax - nx * h, w.ay - ny * h],
  ];
}

export function openingRect(w: WallSeg, o: OpeningGeom): Poly {
  const [nx, ny] = wallNormal(w);
  const h = w.thickness / 2;
  const a = pointAlong(w, o.offset);
  const b = pointAlong(w, o.offset + o.width);
  return [
    [a[0] + nx * h, a[1] + ny * h],
    [b[0] + nx * h, b[1] + ny * h],
    [b[0] - nx * h, b[1] - ny * h],
    [a[0] - nx * h, a[1] - ny * h],
  ];
}

/** Which side of a wall the room interior is on: +1 if `interiorPoint` lies on the +normal side. */
export function insideSignFor(w: WallSeg, interiorPoint: Pt): 1 | -1 {
  const [nx, ny] = wallNormal(w);
  const v: Pt = [interiorPoint[0] - w.ax, interiorPoint[1] - w.ay];
  return v[0] * nx + v[1] * ny >= 0 ? 1 : -1;
}

/** Door leaf + quarter-circle swing arc. insideSign: see insideSignFor. */
export function swingArc(
  w: WallSeg,
  o: OpeningGeom,
  insideSign: 1 | -1,
): { hinge: Pt; end: Pt; path: string; leaf: [Pt, Pt] } {
  const [dx, dy] = wallDir(w);
  const [nx, ny] = wallNormal(w);
  const side = (o.swing === 'out' ? -1 : 1) * insideSign;
  const hingeAtA = o.hinge !== 'b_side';
  const hinge = pointAlong(w, hingeAtA ? o.offset : o.offset + o.width);
  const dir: Pt = hingeAtA ? [dx, dy] : [-dx, -dy];
  const r = o.width;
  const leafEnd: Pt = [hinge[0] + nx * side * r, hinge[1] + ny * side * r];
  const arcStart: Pt = [hinge[0] + dir[0] * r, hinge[1] + dir[1] * r];
  // sweep flag: cross(dir, leafDir) > 0 means counter-clockwise in a y-up world → SVG sweep 1 in y-up coordinates
  const cross = dir[0] * (ny * side) - dir[1] * (nx * side);
  const sweep = cross > 0 ? 1 : 0;
  const path = `M ${arcStart[0]} ${arcStart[1]} A ${r} ${r} 0 0 ${sweep} ${leafEnd[0]} ${leafEnd[1]}`;
  return { hinge, end: leafEnd, path, leaf: [hinge, leafEnd] };
}

/** Double door: two leaves of width/2 hinged at each end. */
export function doubleSwing(w: WallSeg, o: OpeningGeom, insideSign: 1 | -1) {
  const half = o.width / 2;
  return [
    swingArc(w, { offset: o.offset, width: half, swing: o.swing, hinge: 'a_side' }, insideSign),
    swingArc(w, { offset: o.offset + half, width: half, swing: o.swing, hinge: 'b_side' }, insideSign),
  ];
}

/** Position along the wall (0..length) of the closest point to p, and its distance from the centerline. */
export function projectOnWall(w: WallSeg, p: Pt): { t: number; d: number } {
  const [dx, dy] = wallDir(w);
  const vx = p[0] - w.ax;
  const vy = p[1] - w.ay;
  const t = Math.max(0, Math.min(wallLength(w), vx * dx + vy * dy));
  const q = pointAlong(w, t);
  return { t, d: Math.hypot(p[0] - q[0], p[1] - q[1]) };
}
