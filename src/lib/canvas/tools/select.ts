import { aabb, aabbUnion, centerOf, footprint, polygonsIntersect, rectContainsPolygon, rectToPoly, rotatePoint, type AABB, type Pt } from '../../geom/transform';
import { applyGuides, guideCandidates, snapAngle, snapValue } from '../../geom/snap';
import { insideSignFor, mountOnWall, projectOnWall, wallOutline } from '../../geom/walls';
import { formatLength } from '../../geom/units';
import type { ObjectRow } from '../../model/types';
import { propsOf } from '../../model/types';
import type { Handle, Tool, ToolCtx, ToolEvent } from './types';

type Mode =
  | { kind: 'idle' }
  | { kind: 'maybe-move'; origin: Pt; primary: string; wasSelected: boolean; shift: boolean }
  | { kind: 'move'; origin: Pt; primary: string; starts: Map<string, ObjectRow> }
  | { kind: 'marquee'; origin: Pt }
  | { kind: 'resize'; corner: Exclude<Handle, { kind: 'rotate' }>['corner']; start: ObjectRow }
  | { kind: 'rotate'; center: Pt; startAngle: number; starts: Map<string, ObjectRow> };

const DRAG_THRESHOLD_PX = 3;

export function interiorPoint(ctx: ToolCtx): Pt {
  const shells = [...ctx.store.walls.values()].filter((w) => w.scope === 'shell');
  if (shells.length === 0) return [174, 378];
  const box = aabbUnion(shells.map((w) => aabb(wallOutline(w))));
  return [(box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2];
}

function boxOf(o: ObjectRow) {
  return { x: o.x, y: o.y, w: o.w, d: o.d, rot: o.rot };
}

export class SelectTool implements Tool {
  cursor = 'default';
  private mode: Mode = { kind: 'idle' };
  rotateArmed = false;

  pointerDown(e: ToolEvent, ctx: ToolCtx): void {
    const { store, ui } = ctx;
    ui.contextMenu = null;
    if (e.button !== 0) return;

    if (e.handle && ctx.canEdit && store.selection.size > 0) {
      const selected = store.selectedObjects();
      if (e.handle.kind === 'rotate' || this.rotateArmed) {
        const center = selected.length === 1 ? centerOf(boxOf(selected[0])) : groupCenter(selected);
        this.mode = { kind: 'rotate', center, startAngle: angleTo(center, e.world), starts: new Map(selected.map((o) => [o.id, { ...o }])) };
        return;
      }
      if (selected.length === 1 && !propsOf(selected[0]).size_locked) {
        this.mode = { kind: 'resize', corner: e.handle.corner, start: { ...selected[0] } };
        return;
      }
    }

    if (this.rotateArmed && ctx.canEdit && store.selection.size > 0) {
      const selected = store.selectedObjects();
      const center = selected.length === 1 ? centerOf(boxOf(selected[0])) : groupCenter(selected);
      this.mode = { kind: 'rotate', center, startAngle: angleTo(center, e.world), starts: new Map(selected.map((o) => [o.id, { ...o }])) };
      return;
    }

    if (e.hitId) {
      const wasSelected = store.selection.has(e.hitId);
      if (e.shift) store.select([e.hitId], 'toggle');
      else if (!wasSelected) store.select([e.hitId]);
      this.mode = { kind: 'maybe-move', origin: e.world, primary: e.hitId, wasSelected, shift: e.shift };
      return;
    }

    if (!e.shift) store.clearSelection();
    this.mode = { kind: 'marquee', origin: e.world };
    ui.marquee = { minX: e.world[0], minY: e.world[1], maxX: e.world[0], maxY: e.world[1] };
  }

  pointerMove(e: ToolEvent, ctx: ToolCtx): void {
    const { store, ui, viewport } = ctx;
    const m = this.mode;
    if (m.kind === 'idle') {
      this.cursor = e.handle ? (e.handle.kind === 'rotate' ? 'grab' : 'nwse-resize') : e.hitId ? 'move' : 'default';
      return;
    }
    if (m.kind === 'maybe-move') {
      const [sx, sy] = viewport.toScreen(...m.origin);
      if (Math.hypot(e.screen[0] - sx, e.screen[1] - sy) < DRAG_THRESHOLD_PX) return;
      if (!ctx.canEdit) return;
      const starts = new Map(store.selectedObjects().map((o) => [o.id, { ...o }]));
      this.mode = { kind: 'move', origin: m.origin, primary: m.primary, starts };
    }
    const mode = this.mode;
    if (mode.kind === 'move') {
      this.moveTo(e, ctx, mode);
    } else if (mode.kind === 'marquee') {
      ui.marquee = {
        minX: Math.min(mode.origin[0], e.world[0]),
        minY: Math.min(mode.origin[1], e.world[1]),
        maxX: Math.max(mode.origin[0], e.world[0]),
        maxY: Math.max(mode.origin[1], e.world[1]),
      };
      ui.marqueeMode = e.world[0] >= mode.origin[0] ? 'intersect' : 'enclose';
    } else if (mode.kind === 'resize') {
      this.resizeTo(e, ctx, mode);
    } else if (mode.kind === 'rotate') {
      this.rotateTo(e, ctx, mode);
    }
  }

  pointerUp(e: ToolEvent, ctx: ToolCtx): void {
    const { store, ui } = ctx;
    const m = this.mode;
    this.mode = { kind: 'idle' };
    this.rotateArmed = false;
    if (m.kind === 'maybe-move') {
      if (m.wasSelected && !m.shift) store.select([m.primary]);
      return;
    }
    if (m.kind === 'marquee') {
      const box = ui.marquee;
      ui.marquee = null;
      if (!box) return;
      const ids: string[] = [];
      for (const o of store.objects.values()) {
        if (!store.isInteractive(o)) continue;
        const fp = footprint(boxOf(o));
        const hit = ui.marqueeMode === 'enclose' ? rectContainsPolygon(box, fp) : polygonsIntersect(rectToPoly(box), fp);
        if (hit) ids.push(o.id);
      }
      store.select(ids, e.shift ? 'add' : 'replace');
      return;
    }
    if (m.kind === 'move' || m.kind === 'resize' || m.kind === 'rotate') {
      const changes = new Map(ui.preview);
      ui.clearTransient();
      if (changes.size === 0) return;
      const label = m.kind === 'move' ? 'move' : m.kind === 'resize' ? 'resize' : 'rotate';
      void store.updateObjects([...changes.keys()], (o) => ({ ...(changes.get(o.id) ?? {}) }), label);
    }
  }

  cancel(ctx: ToolCtx): void {
    this.mode = { kind: 'idle' };
    this.rotateArmed = false;
    ctx.ui.clearTransient();
  }

  private moveTo(e: ToolEvent, ctx: ToolCtx, m: Extract<Mode, { kind: 'move' }>): void {
    const { store, ui, viewport } = ctx;
    const primary = m.starts.get(m.primary);
    if (!primary) return;
    let dx = e.world[0] - m.origin[0];
    let dy = e.world[1] - m.origin[1];
    if (e.shift) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    const snapMode = e.alt ? 'free' : ui.snap;
    dx = snapValue(primary.x + dx, snapMode) - primary.x;
    dy = snapValue(primary.y + dy, snapMode) - primary.y;

    const movingIds = new Set(m.starts.keys());
    const others = [...store.objects.values()].filter((o) => !movingIds.has(o.id) && store.isLayerVisible(o.layer_id)).map((o) => aabb(footprint(boxOf(o))));
    const wallBoxes = [...store.walls.values()].filter((w) => !store.demoWalls.has(w.id)).map((w) => aabb(wallOutline(w)));
    const moving = aabb(footprint({ ...boxOf(primary), x: primary.x + dx, y: primary.y + dy }));
    const g = e.alt ? { dx: 0, dy: 0, guides: [] } : applyGuides(moving, guideCandidates(others, wallBoxes), viewport.px(6));
    dx += g.dx;
    dy += g.dy;
    ui.guides = g.guides;

    const inside = interiorPoint(ctx);
    for (const [id, start] of m.starts) {
      const wall = start.wall_id ? store.walls.get(start.wall_id) : null;
      if ((start.mount === 'wall' || start.mount === 'recessed') && wall) {
        const target: Pt = [centerOf(boxOf(start))[0] + dx, centerOf(boxOf(start))[1] + dy];
        const { t } = projectOnWall(wall, target);
        const tSnapped = snapValue(t - start.w / 2, snapMode) + start.w / 2;
        ui.preview.set(id, mountOnWall(wall, tSnapped, start.w, start.d, insideSignFor(wall, inside)));
      } else {
        ui.preview.set(id, { x: start.x + dx, y: start.y + dy });
      }
    }
    const p = ui.preview.get(m.primary) ?? {};
    ui.readout = `x ${formatLength(p.x ?? primary.x)}  y ${formatLength(p.y ?? primary.y)}  Δ ${formatLength(dx)}, ${formatLength(dy)}`;
  }

  private resizeTo(e: ToolEvent, ctx: ToolCtx, m: Extract<Mode, { kind: 'resize' }>): void {
    const { ui } = ctx;
    const s = m.start;
    const c = centerOf(boxOf(s));
    const local = rotatePoint(e.world, c, -s.rot);
    const lx = local[0] - (c[0] - s.w / 2);
    const ly = local[1] - (c[1] - s.d / 2);
    const snapMode = e.alt ? 'free' : ui.snap;
    let x0 = 0;
    let x1 = s.w;
    let y0 = 0;
    let y1 = s.d;
    const corner = m.corner;
    if (corner.includes('e')) x1 = Math.max(1, snapValue(lx, snapMode));
    if (corner.includes('w')) x0 = Math.min(s.w - 1, snapValue(lx, snapMode));
    if (corner.includes('n')) y1 = Math.max(1, snapValue(ly, snapMode));
    if (corner.includes('s')) y0 = Math.min(s.d - 1, snapValue(ly, snapMode));
    const w = x1 - x0;
    const d = y1 - y0;
    const localCenter: Pt = [x0 + w / 2 - s.w / 2, y0 + d / 2 - s.d / 2];
    const nc = rotatePoint([c[0] + localCenter[0], c[1] + localCenter[1]], c, s.rot);
    ui.preview.set(s.id, { x: nc[0] - w / 2, y: nc[1] - d / 2, w, d });
    ui.readout = `${formatLength(w)} × ${formatLength(d)}`;
  }

  private rotateTo(e: ToolEvent, ctx: ToolCtx, m: Extract<Mode, { kind: 'rotate' }>): void {
    const { ui } = ctx;
    const now = angleTo(m.center, e.world);
    const single = m.starts.size === 1;
    if (single) {
      const [start] = m.starts.values();
      const target = snapAngle(start.rot + (now - m.startAngle), e.alt);
      ui.preview.set(start.id, { rot: target });
      const bb = aabb(footprint({ ...boxOf(start), rot: target }));
      ui.readout = `${target.toFixed(1)}°  bbox ${formatLength(bb.maxX - bb.minX)} × ${formatLength(bb.maxY - bb.minY)}`;
      return;
    }
    const delta = snapAngle(now - m.startAngle, e.alt);
    for (const [id, start] of m.starts) {
      const c = rotatePoint(centerOf(boxOf(start)), m.center, delta);
      ui.preview.set(id, { x: c[0] - start.w / 2, y: c[1] - start.d / 2, rot: snapAngle(start.rot + delta, true) });
    }
    ui.readout = `group ${delta.toFixed(1)}°`;
  }
}

function angleTo(center: Pt, p: Pt): number {
  return (Math.atan2(p[1] - center[1], p[0] - center[0]) * 180) / Math.PI - 90;
}

export function groupCenter(objs: ObjectRow[]): Pt {
  const box = aabbUnion(objs.map((o) => aabb(footprint(boxOf(o)))));
  return [(box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2];
}

export function selectionBox(objs: ObjectRow[], preview: Map<string, Partial<ObjectRow>>): AABB | null {
  if (objs.length === 0) return null;
  return aabbUnion(objs.map((o) => aabb(footprint(boxOf({ ...o, ...(preview.get(o.id) ?? {}) })))));
}
