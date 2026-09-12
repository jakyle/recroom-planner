import { SvelteMap } from 'svelte/reactivity';
import type { AABB, Pt } from '../geom/transform';
import type { Guide, SnapMode } from '../geom/snap';
import { SNAP_MODES } from '../geom/snap';
import type { ObjectRow } from '../model/types';

export type ToolName = 'select' | 'pan' | 'measure' | 'object' | 'text' | 'walkway';

export type Measure = { points: Pt[]; cursor: Pt | null; closed: boolean };

export type PendingBox = { x: number; y: number; w: number; d: number };

/** Transient, per-user canvas state that never persists to the document (tool, snap, previews, overlays). */
export class CanvasUi {
  tool = $state<ToolName>('select');
  snap = $state<SnapMode>('grid');
  grid = $state(true);
  halos = $state(false);
  cursor = $state<Pt>([0, 0]);
  readout = $state('');
  preview = new SvelteMap<string, Partial<ObjectRow>>();
  marquee = $state<AABB | null>(null);
  marqueeMode = $state<'intersect' | 'enclose'>('intersect');
  guides = $state<Guide[]>([]);
  measure = $state<Measure>({ points: [], cursor: null, closed: false });
  hoverId = $state<string | null>(null);
  hoverAt = $state<Pt>([0, 0]);
  contextMenu = $state<{ x: number; y: number } | null>(null);
  pendingBox = $state<PendingBox | null>(null);
  dialog = $state<null | { kind: 'object'; box: PendingBox }>(null);
  spaceHeld = $state(false);

  constructor() {
    try {
      const g = localStorage.getItem('rr.grid');
      if (g === '0') this.grid = false;
      const s = localStorage.getItem('rr.snap') as SnapMode | null;
      if (s && SNAP_MODES.includes(s)) this.snap = s;
    } catch {
      /* ignore */
    }
  }

  toggleGrid(): void {
    this.grid = !this.grid;
    try {
      localStorage.setItem('rr.grid', this.grid ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  cycleSnap(): void {
    this.setSnap(SNAP_MODES[(SNAP_MODES.indexOf(this.snap) + 1) % SNAP_MODES.length]);
  }

  setSnap(mode: SnapMode): void {
    this.snap = mode;
    try {
      localStorage.setItem('rr.snap', mode);
    } catch {
      /* ignore */
    }
  }

  clearTransient(): void {
    this.preview.clear();
    this.marquee = null;
    this.guides = [];
    this.readout = '';
    this.pendingBox = null;
  }

  resetMeasure(): void {
    this.measure = { points: [], cursor: null, closed: false };
  }
}
