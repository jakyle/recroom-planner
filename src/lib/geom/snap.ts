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
type Cand = { at: number; lo: number; hi: number };
export type GuideSet = { xs: Cand[]; ys: Cand[] };

/** Edge and center lines of other objects (edges only for walls) become alignment candidates (R6.4). Each keeps its extent on the other axis. */
export function guideCandidates(boxes: AABB[], edgesOnly: AABB[] = []): GuideSet {
  const xs: Cand[] = [];
  const ys: Cand[] = [];
  for (const b of boxes) {
    for (const at of [b.minX, b.maxX, (b.minX + b.maxX) / 2]) xs.push({ at, lo: b.minY, hi: b.maxY });
    for (const at of [b.minY, b.maxY, (b.minY + b.maxY) / 2]) ys.push({ at, lo: b.minX, hi: b.maxX });
  }
  for (const b of edgesOnly) {
    for (const at of [b.minX, b.maxX]) xs.push({ at, lo: b.minY, hi: b.maxY });
    for (const at of [b.minY, b.maxY]) ys.push({ at, lo: b.minX, hi: b.maxX });
  }
  return { xs, ys };
}

function nearest(values: number[], cands: Cand[], tol: number, lo: number, hi: number, reach: number): { d: number; at: number } | null {
  let best: { d: number; at: number } | null = null;
  for (const c of cands) {
    if (c.hi + reach < lo || c.lo - reach > hi) continue;
    for (const m of values) {
      const d = c.at - m;
      if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, at: c.at };
    }
  }
  return best;
}

/** Correction (dx, dy) that aligns the moving box's edges/center to the nearest candidate within tol (world units), considering only candidates within `reach` on the other axis. */
export function applyGuides(moving: AABB, cands: GuideSet, tol: number, reach = 120): { dx: number; dy: number; guides: Guide[] } {
  const bx = nearest([moving.minX, moving.maxX, (moving.minX + moving.maxX) / 2], cands.xs, tol, moving.minY, moving.maxY, reach);
  const by = nearest([moving.minY, moving.maxY, (moving.minY + moving.maxY) / 2], cands.ys, tol, moving.minX, moving.maxX, reach);
  const guides: Guide[] = [];
  if (bx) guides.push({ axis: 'x', at: bx.at });
  if (by) guides.push({ axis: 'y', at: by.at });
  return { dx: bx?.d ?? 0, dy: by?.d ?? 0, guides };
}
