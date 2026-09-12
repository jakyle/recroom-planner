export type Pt = [number, number];
export type Poly = Pt[];
export type Box = { x: number; y: number; w: number; d: number; rot: number };
export type AABB = { minX: number; minY: number; maxX: number; maxY: number };

export const deg = (r: number): number => (r * 180) / Math.PI;
export const rad = (d: number): number => (d * Math.PI) / 180;

export function centerOf(b: Box): Pt {
  return [b.x + b.w / 2, b.y + b.d / 2];
}

export function rotatePoint(p: Pt, c: Pt, degrees: number): Pt {
  const a = rad(degrees);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = p[0] - c[0];
  const dy = p[1] - c[1];
  return [c[0] + dx * cos - dy * sin, c[1] + dx * sin + dy * cos];
}

/** Rotated w×d rectangle, rotation about its center (R4.11). */
export function footprint(b: Box): Poly {
  const corners: Poly = [
    [b.x, b.y],
    [b.x + b.w, b.y],
    [b.x + b.w, b.y + b.d],
    [b.x, b.y + b.d],
  ];
  if (!b.rot) return corners;
  const c = centerOf(b);
  return corners.map((p) => rotatePoint(p, c, b.rot));
}

export function aabb(poly: Poly): AABB {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of poly) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

export function aabbUnion(boxes: AABB[]): AABB {
  return boxes.reduce(
    (u, b) => ({ minX: Math.min(u.minX, b.minX), minY: Math.min(u.minY, b.minY), maxX: Math.max(u.maxX, b.maxX), maxY: Math.max(u.maxY, b.maxY) }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}

export function pointInPolygon(p: Pt, poly: Poly): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function orient(p: Pt, q: Pt, r: Pt): number {
  return Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
}

export function segmentsIntersect(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  return orient(a, b, c) !== orient(a, b, d) && orient(c, d, a) !== orient(c, d, b);
}

export function polygonsIntersect(a: Poly, b: Poly): boolean {
  if (pointInPolygon(a[0], b) || pointInPolygon(b[0], a)) return true;
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++)
      if (segmentsIntersect(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return true;
  return false;
}

export function rectToPoly(r: AABB): Poly {
  return [
    [r.minX, r.minY],
    [r.maxX, r.minY],
    [r.maxX, r.maxY],
    [r.minX, r.maxY],
  ];
}

export function rectContainsPolygon(r: AABB, poly: Poly): boolean {
  return poly.every(([x, y]) => x >= r.minX && x <= r.maxX && y >= r.minY && y <= r.maxY);
}

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export function polygonArea(poly: Poly): number {
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) s += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  return Math.abs(s / 2);
}

export function polylineLength(pts: Poly, closed = false): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
  if (closed && pts.length > 2) l += dist(pts[pts.length - 1], pts[0]);
  return l;
}

/** Distance from point p to segment a–b and the closest point. */
export function pointToSegment(p: Pt, a: Pt, b: Pt): { d: number; pt: Pt; t: number } {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2));
  const pt: Pt = [a[0] + vx * t, a[1] + vy * t];
  return { d: dist(p, pt), pt, t };
}
