import { dist, polygonArea, polylineLength, type Pt } from '../../geom/transform';
import { snapValue } from '../../geom/snap';
import { formatLength } from '../../geom/units';
import type { Tool, ToolCtx, ToolEvent } from './types';

export class PanTool implements Tool {
  cursor = 'grab';
  private last: Pt | null = null;

  pointerDown(e: ToolEvent): void {
    this.last = e.screen;
    this.cursor = 'grabbing';
  }
  pointerMove(e: ToolEvent, ctx: ToolCtx): void {
    if (!this.last) return;
    ctx.viewport.pan(e.screen[0] - this.last[0], e.screen[1] - this.last[1]);
    this.last = e.screen;
  }
  pointerUp(): void {
    this.last = null;
    this.cursor = 'grab';
  }
  cancel(): void {
    this.last = null;
  }
}

/** Click-click distance, chained polyline, closing on the first point gives area (R7.12). */
export class MeasureTool implements Tool {
  cursor = 'crosshair';

  private snap(e: ToolEvent, ctx: ToolCtx): Pt {
    const mode = e.alt ? 'free' : ctx.ui.snap;
    return [snapValue(e.world[0], mode), snapValue(e.world[1], mode)];
  }

  pointerDown(e: ToolEvent, ctx: ToolCtx): void {
    if (e.button !== 0) return;
    const m = ctx.ui.measure;
    if (m.closed) ctx.ui.resetMeasure();
    const p = this.snap(e, ctx);
    const pts = ctx.ui.measure.points;
    if (pts.length >= 3 && dist(p, pts[0]) <= ctx.viewport.px(8)) {
      ctx.ui.measure = { points: pts, cursor: null, closed: true };
      ctx.ui.readout = measureReadout(pts, null, true);
      return;
    }
    if (e.detail >= 2 && pts.length >= 2) {
      ctx.ui.measure = { points: pts, cursor: null, closed: false };
      return;
    }
    ctx.ui.measure = { points: [...pts, p], cursor: p, closed: false };
  }
  pointerMove(e: ToolEvent, ctx: ToolCtx): void {
    const m = ctx.ui.measure;
    if (m.closed || m.points.length === 0) return;
    const p = this.snap(e, ctx);
    ctx.ui.measure = { ...m, cursor: p };
    ctx.ui.readout = measureReadout(m.points, p, false);
  }
  pointerUp(): void {}
  cancel(ctx: ToolCtx): void {
    ctx.ui.resetMeasure();
    ctx.ui.readout = '';
  }
  key(e: KeyboardEvent, ctx: ToolCtx): boolean {
    if (e.key === 'Enter') {
      const m = ctx.ui.measure;
      ctx.ui.measure = { ...m, cursor: null };
      return true;
    }
    return false;
  }
}

export function measureReadout(points: Pt[], cursor: Pt | null, closed: boolean): string {
  const pts = cursor ? [...points, cursor] : points;
  if (pts.length < 2) return '';
  if (closed) return `perimeter ${formatLength(polylineLength(points, true))}  area ${(polygonArea(points) / 144).toFixed(1)} sq ft`;
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const seg = dist(prev, last);
  const dx = last[0] - prev[0];
  const dy = last[1] - prev[1];
  const total = polylineLength(pts);
  return pts.length === 2
    ? `${formatLength(seg)}  (dx ${formatLength(dx)}, dy ${formatLength(dy)})`
    : `segment ${formatLength(seg)}  total ${formatLength(total)}`;
}

/** Drag a box, then the object dialog fills in name and dimensions (R13.4 subset). */
export class ObjectTool implements Tool {
  cursor = 'crosshair';
  private origin: Pt | null = null;

  private snap(e: ToolEvent, ctx: ToolCtx): Pt {
    const mode = e.alt ? 'free' : ctx.ui.snap;
    return [snapValue(e.world[0], mode), snapValue(e.world[1], mode)];
  }
  pointerDown(e: ToolEvent, ctx: ToolCtx): void {
    if (e.button !== 0 || !ctx.canEdit) return;
    this.origin = this.snap(e, ctx);
    ctx.ui.pendingBox = { x: this.origin[0], y: this.origin[1], w: 0, d: 0 };
  }
  pointerMove(e: ToolEvent, ctx: ToolCtx): void {
    if (!this.origin) return;
    const p = this.snap(e, ctx);
    const box = { x: Math.min(this.origin[0], p[0]), y: Math.min(this.origin[1], p[1]), w: Math.abs(p[0] - this.origin[0]), d: Math.abs(p[1] - this.origin[1]) };
    ctx.ui.pendingBox = box;
    ctx.ui.readout = `${formatLength(box.w)} × ${formatLength(box.d)}`;
  }
  pointerUp(e: ToolEvent, ctx: ToolCtx): void {
    if (!this.origin) return;
    const box = ctx.ui.pendingBox ?? { x: this.origin[0], y: this.origin[1], w: 0, d: 0 };
    this.origin = null;
    ctx.ui.pendingBox = null;
    ctx.ui.readout = '';
    const w = box.w >= 6 ? box.w : 24;
    const d = box.d >= 6 ? box.d : 24;
    ctx.ui.dialog = { kind: 'object', box: { x: box.x, y: box.y, w, d } };
  }
  cancel(ctx: ToolCtx): void {
    this.origin = null;
    ctx.ui.pendingBox = null;
  }
}

/** Click places a text callout on the annotations layer (R7.13). */
export class TextTool implements Tool {
  cursor = 'text';
  pointerDown(): void {}
  pointerMove(): void {}
  pointerUp(e: ToolEvent, ctx: ToolCtx): void {
    if (e.button !== 0 || !ctx.canEdit) return;
    const layer = [...ctx.store.layers.values()].find((l) => l.key === 'annotations');
    const mode = e.alt ? 'free' : ctx.ui.snap;
    const row = ctx.store.newObject({
      name: 'Note',
      layer_id: layer?.id,
      x: snapValue(e.world[0], mode),
      y: snapValue(e.world[1], mode),
      w: 48,
      d: 12,
      h: 0,
      props: { kind: 'text', text: 'Note' },
    });
    void ctx.store.createObjects([row], 'add note').then(() => ctx.store.select([row.id]));
    ctx.ui.tool = 'select';
  }
  cancel(): void {}
}

/** Drag a rectangle that must stay clear (R7.17 walkway). */
export class WalkwayTool implements Tool {
  cursor = 'crosshair';
  private origin: Pt | null = null;
  private snap(e: ToolEvent, ctx: ToolCtx): Pt {
    const mode = e.alt ? 'free' : ctx.ui.snap;
    return [snapValue(e.world[0], mode), snapValue(e.world[1], mode)];
  }
  pointerDown(e: ToolEvent, ctx: ToolCtx): void {
    if (e.button !== 0 || !ctx.canEdit) return;
    this.origin = this.snap(e, ctx);
    ctx.ui.pendingBox = { x: this.origin[0], y: this.origin[1], w: 0, d: 0 };
  }
  pointerMove(e: ToolEvent, ctx: ToolCtx): void {
    if (!this.origin) return;
    const p = this.snap(e, ctx);
    ctx.ui.pendingBox = { x: Math.min(this.origin[0], p[0]), y: Math.min(this.origin[1], p[1]), w: Math.abs(p[0] - this.origin[0]), d: Math.abs(p[1] - this.origin[1]) };
    ctx.ui.readout = `walkway ${formatLength(ctx.ui.pendingBox.w)} × ${formatLength(ctx.ui.pendingBox.d)}`;
  }
  pointerUp(e: ToolEvent, ctx: ToolCtx): void {
    if (!this.origin) return;
    const box = ctx.ui.pendingBox;
    this.origin = null;
    ctx.ui.pendingBox = null;
    ctx.ui.readout = '';
    if (!box || box.w < 6 || box.d < 6) return;
    const layer = [...ctx.store.layers.values()].find((l) => l.key === 'annotations');
    const row = ctx.store.newObject({ name: 'Walkway', layer_id: layer?.id, x: box.x, y: box.y, w: box.w, d: box.d, h: 0, props: { kind: 'walkway' } });
    void ctx.store.createObjects([row], 'add walkway').then(() => ctx.store.select([row.id]));
    ctx.ui.tool = 'select';
  }
  cancel(ctx: ToolCtx): void {
    this.origin = null;
    ctx.ui.pendingBox = null;
  }
}
