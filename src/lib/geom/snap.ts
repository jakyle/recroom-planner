import type { AABB } from './transform';

export type SnapMode = 'grid' | 'fine' | 'free';

export const SNAP_MODES: SnapMode[] = ['grid', 'fine', 'free'];

export function snapValue(v: number, mode: SnapMode): number {
  if (mode === 'grid') return Math.round(v / 12) * 12;
  if (mode === 'fine') return Math.round(v);
  return v;
}

export function snapStep(mode: SnapMode): number {
  return mode === 'grid' ? 12 : mode === 'fine' ? 1 : 0;
}

/** Rotation snaps to 15° unless free (R6.6). Result in [0, 360). */
export function snapAngle(deg: number, free: boolean): number {
  const n = ((deg % 360) + 360) % 360;
  const v = free ? n : Math.round(n / 15) * 15;
  return v >= 360 ? v - 360 : v;
}

export type Guide = { axis: 'x' | 'y'; at: number };
export type GuideSet = { xs: number[]; ys: number[] };

/** Edge and center lines of other objects (and wall faces) become alignment candidates (R6.4). */
export function guideCandidates(boxes: AABB[]): GuideSet {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const b of boxes) {
    xs.push(b.minX, b.maxX, (b.minX + b.maxX) / 2);
    ys.push(b.minY, b.maxY, (b.minY + b.maxY) / 2);
  }
  return { xs, ys };
}

function nearest(values: number[], cands: number[], tol: number): { d: number; at: number } | null {
  let best: { d: number; at: number } | null = null;
  for (const m of values)
    for (const c of cands) {
      const d = c - m;
      if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, at: c };
    }
  return best;
}

/** Correction (dx, dy) that aligns the moving box's edges/center to the nearest candidate within tol (world units). */
export function applyGuides(moving: AABB, cands: GuideSet, tol: number): { dx: number; dy: number; guides: Guide[] } {
  const bx = nearest([moving.minX, moving.maxX, (moving.minX + moving.maxX) / 2], cands.xs, tol);
  const by = nearest([moving.minY, moving.maxY, (moving.minY + moving.maxY) / 2], cands.ys, tol);
  const guides: Guide[] = [];
  if (bx) guides.push({ axis: 'x', at: bx.at });
  if (by) guides.push({ axis: 'y', at: by.at });
  return { dx: bx?.d ?? 0, dy: by?.d ?? 0, guides };
}
