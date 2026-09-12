import { footprint, type Box, type Poly } from './transform';

/** Uniform or per-side expansion in inches of the object's local rect. front = +d side, back = −d, left = −w, right = +w. */
export type HaloSpec = { all?: number; front?: number; back?: number; left?: number; right?: number };

export function haloPolygon(b: Box, h: HaloSpec): Poly {
  const l = h.left ?? h.all ?? 0;
  const r = h.right ?? h.all ?? 0;
  const f = h.front ?? h.all ?? 0;
  const k = h.back ?? h.all ?? 0;
  const expanded: Box = { x: b.x - l, y: b.y - k, w: b.w + l + r, d: b.d + k + f, rot: 0 };
  const c: [number, number] = [b.x + b.w / 2, b.y + b.d / 2];
  const a = (b.rot * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return footprint(expanded).map(([x, y]) => {
    const dx = x - c[0];
    const dy = y - c[1];
    return [c[0] + dx * cos - dy * sin, c[1] + dx * sin + dy * cos];
  });
}

export function haloIsEmpty(h: HaloSpec | null | undefined): boolean {
  if (!h) return true;
  return !((h.all ?? 0) || (h.front ?? 0) || (h.back ?? 0) || (h.left ?? 0) || (h.right ?? 0));
}

/** R7.17 built-in halos by preset key. */
export const BUILTIN_HALOS: Record<string, HaloSpec> = {
  pool_table: { all: 60 },
  power_rack: { left: 24, right: 24, front: 48, back: 0 },
  half_rack: { left: 24, right: 24, front: 48, back: 0 },
  bench: { all: 24 },
  treadmill: { back: 78, left: 20, right: 20, front: 0 },
};
