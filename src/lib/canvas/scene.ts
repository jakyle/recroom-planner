import { aabb, aabbUnion, footprint, type AABB, type Poly, type Pt } from '../geom/transform';
import { wallOutline } from '../geom/walls';
import type { DocumentStore } from '../model/store.svelte';
import type { ObjectRow } from '../model/types';

/** Bounds of everything drawn: shell walls, objects, slab. Falls back to the seeded room. */
export function sceneBox(store: DocumentStore): AABB {
  const boxes: AABB[] = [];
  for (const w of store.walls.values()) boxes.push(aabb(wallOutline(w)));
  for (const o of store.objects.values()) boxes.push(aabb(footprint({ x: o.x, y: o.y, w: o.w, d: o.d, rot: o.rot })));
  if (boxes.length === 0) return { minX: 0, minY: 0, maxX: 348, maxY: 756 };
  return aabbUnion(boxes);
}

/** An object's box with the local preview applied, else a peer's in-flight preview (R15.1). */
export function mergedBox(
  o: ObjectRow,
  preview: Map<string, Partial<ObjectRow>>,
  remote?: Map<string, Partial<ObjectRow>>,
): { x: number; y: number; w: number; d: number; rot: number } {
  const p = preview.get(o.id) ?? remote?.get(o.id);
  return { x: p?.x ?? o.x, y: p?.y ?? o.y, w: p?.w ?? o.w, d: p?.d ?? o.d, rot: p?.rot ?? o.rot };
}

export function polyPoints(poly: Poly): string {
  return poly.map(([x, y]) => `${x},${y}`).join(' ');
}

export function pointsToPath(pts: Pt[], closed = false): string {
  if (pts.length === 0) return '';
  return `M ${pts.map(([x, y]) => `${x} ${y}`).join(' L ')}${closed ? ' Z' : ''}`;
}
