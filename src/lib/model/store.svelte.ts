import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import type { Repo, ScenarioData } from '../supabase/repo';
import type { Batch, GroupRow, LayerRow, Mount, ObjectRow, Op, OpeningRow, Row, SlabRow, TableName, WallRow } from './types';
import { defaultZ } from './types';
import { aabb, footprint, type AABB } from '../geom/transform';

export type LayerUi = { visible: boolean; opacity: number };
export type SelectMode = 'replace' | 'toggle' | 'add';
export type Notice = { id: number; text: string; action?: { label: string; run: () => void } };

const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

/**
 * The open scenario as reactive maps plus the commit pipeline (R2.12, R7.10, R15.6, R15.11).
 * Every mutation is a Batch of ops: applied locally first, recorded for undo, then written through the repo.
 */
export class DocumentStore {
  projectId = $state('');
  scenarioId = $state('');
  loading = $state(false);
  error = $state('');

  layers = new SvelteMap<string, LayerRow>();
  walls = new SvelteMap<string, WallRow>();
  openings = new SvelteMap<string, OpeningRow>();
  objects = new SvelteMap<string, ObjectRow>();
  groups = new SvelteMap<string, GroupRow>();
  demoWalls = new SvelteSet<string>();
  slab = $state<SlabRow | null>(null);

  selection = new SvelteSet<string>();
  activeLayerId = $state<string | null>(null);
  layerUi = new SvelteMap<string, LayerUi>();
  unsynced = new SvelteSet<string>();

  undoStack = $state<Batch[]>([]);
  redoStack = $state<Batch[]>([]);
  pendingWrites = $state(0);
  notices = $state<Notice[]>([]);
  /** Bumped after every successful own write and every applied remote row; panels refetch on it. */
  revision = $state(0);
  userId: string | null = null;
  nameOf: (userId: string | null | undefined) => string = () => 'someone';
  /** Called after each successful write (stored row) or delete (null) so the session can broadcast `committed`/`deleted` (R15.7). */
  onWritten: ((op: Op, stored: Row | null) => void) | null = null;
  retryDelays = [500, 1500, 3500];
  private inflight = new Map<string, number>();
  private deferred = new Map<string, { table: TableName; row: Row; deleted: boolean }>();
  private failed: Op[] = [];
  private noticeSeq = 0;

  constructor(private repo: Repo) {}

  async load(projectId: string, scenarioId: string): Promise<void> {
    this.loading = true;
    this.error = '';
    this.projectId = projectId;
    this.scenarioId = scenarioId;
    try {
      const data = await this.repo.load(projectId, scenarioId);
      this.ingest(data);
      this.undoStack = [];
      this.redoStack = [];
      this.selection.clear();
      this.restoreLayerUi();
      if (!this.activeLayerId || !this.layers.has(this.activeLayerId)) {
        const furnishing = [...this.layers.values()].find((l) => l.key === 'furnishing');
        this.activeLayerId = furnishing?.id ?? [...this.layers.keys()][0] ?? null;
      }
    } catch (e) {
      this.error = String((e as Error).message ?? e);
    } finally {
      this.loading = false;
    }
  }

  ingest(data: ScenarioData): void {
    this.layers.clear();
    this.walls.clear();
    this.openings.clear();
    this.objects.clear();
    this.groups.clear();
    this.demoWalls.clear();
    for (const l of data.layers) this.layers.set(l.id as string, l as LayerRow);
    for (const w of data.walls) this.walls.set(w.id as string, w as WallRow);
    for (const o of data.openings) this.openings.set(o.id as string, o as OpeningRow);
    for (const o of data.objects) this.objects.set(o.id as string, o as ObjectRow);
    for (const g of data.groups) this.groups.set(g.id as string, g as GroupRow);
    for (const s of data.wallStates) this.demoWalls.add(s.wall_id as string);
    this.slab = (data.slab as SlabRow | null) ?? null;
  }

  private layerUiKey(): string {
    return `rr.layers.${this.projectId}`;
  }

  private restoreLayerUi(): void {
    let saved: Record<string, LayerUi> = {};
    try {
      saved = JSON.parse(localStorage.getItem(this.layerUiKey()) ?? '{}');
    } catch {
      saved = {};
    }
    this.layerUi.clear();
    for (const id of this.layers.keys()) this.layerUi.set(id, saved[id] ?? { visible: true, opacity: 1 });
  }

  private persistLayerUi(): void {
    try {
      localStorage.setItem(this.layerUiKey(), JSON.stringify(Object.fromEntries(this.layerUi)));
    } catch {
      /* storage unavailable */
    }
  }

  setLayerVisible(id: string, visible: boolean): void {
    const ui = this.layerUi.get(id) ?? { visible: true, opacity: 1 };
    this.layerUi.set(id, { ...ui, visible });
    this.persistLayerUi();
  }

  setLayerOpacity(id: string, opacity: number): void {
    const ui = this.layerUi.get(id) ?? { visible: true, opacity: 1 };
    this.layerUi.set(id, { ...ui, opacity });
    this.persistLayerUi();
  }

  /** Alt-click the eye: show only this layer (R7.19); calling again on the solo layer restores all. */
  soloLayer(id: string): void {
    const others = [...this.layers.keys()].filter((k) => k !== id);
    const alreadySolo = others.every((k) => !(this.layerUi.get(k)?.visible ?? true)) && (this.layerUi.get(id)?.visible ?? true);
    for (const k of this.layers.keys()) this.setLayerVisible(k, alreadySolo ? true : k === id);
  }

  applyVisibilityPreset(keys: string[] | null): void {
    for (const l of this.layers.values()) this.setLayerVisible(l.id, keys === null ? true : keys.includes(l.key));
  }

  isLayerVisible(id: string): boolean {
    return this.layerUi.get(id)?.visible ?? true;
  }

  isLayerLocked(id: string): boolean {
    return this.layers.get(id)?.locked ?? false;
  }

  layerOpacity(id: string): number {
    return this.layerUi.get(id)?.opacity ?? 1;
  }

  select(ids: string[], mode: SelectMode = 'replace'): void {
    const expanded = this.expandGroups(ids);
    if (mode === 'replace') {
      this.selection.clear();
      for (const id of expanded) this.selection.add(id);
    } else if (mode === 'add') {
      for (const id of expanded) this.selection.add(id);
    } else {
      for (const id of expanded) if (this.selection.has(id)) this.selection.delete(id); else this.selection.add(id);
    }
  }

  clearSelection(): void {
    this.selection.clear();
  }

  /** Grouped objects select together (R7.21). */
  private expandGroups(ids: string[]): string[] {
    const out = new Set(ids);
    for (const id of ids) {
      const g = this.objects.get(id)?.group_id;
      if (g) for (const o of this.objects.values()) if (o.group_id === g) out.add(o.id);
    }
    return [...out];
  }

  selectedObjects(): ObjectRow[] {
    return [...this.selection].map((id) => this.objects.get(id)).filter((o): o is ObjectRow => !!o);
  }

  /** Objects that can be hit on the canvas: layer visible and not locked, object not locked. */
  isInteractive(o: ObjectRow): boolean {
    return this.isLayerVisible(o.layer_id) && !this.isLayerLocked(o.layer_id) && !o.locked;
  }

  private table(name: TableName): SvelteMap<string, Row> {
    const map = {
      objects: this.objects,
      object_groups: this.groups,
      walls: this.walls,
      openings: this.openings,
      layers: this.layers,
    }[name as Exclude<TableName, 'scenario_wall_states' | 'slabs'>];
    return map as unknown as SvelteMap<string, Row>;
  }

  applyLocal(op: Op): void {
    if (op.table === 'slabs') {
      if (op.type === 'delete') this.slab = null;
      else this.slab = { ...(this.slab ?? {}), ...(op.type === 'create' ? op.row : op.after) } as SlabRow;
      return;
    }
    if (op.table === 'scenario_wall_states') {
      const wallId = (op.type === 'create' ? op.row.wall_id : op.type === 'delete' ? op.row.wall_id : op.after.wall_id) as string;
      if (op.type === 'delete') this.demoWalls.delete(wallId);
      else this.demoWalls.add(wallId);
      return;
    }
    const map = this.table(op.table);
    if (op.type === 'create') map.set(op.row.id as string, op.row);
    else if (op.type === 'delete') map.delete(op.id);
    else {
      const cur = map.get(op.id);
      if (cur) map.set(op.id, { ...cur, ...op.after });
    }
  }

  private inScope(table: TableName, row: Row): boolean {
    switch (table) {
      case 'layers':
        return row.project_id === this.projectId;
      case 'walls':
        return row.scenario_id === this.scenarioId || (row.scope === 'shell' && row.project_id === this.projectId);
      case 'openings':
        return this.walls.has(row.wall_id as string);
      default:
        return row.scenario_id === this.scenarioId;
    }
  }

  private rowKey(table: TableName, row: Row): string {
    return table === 'scenario_wall_states' ? `${row.scenario_id}:${row.wall_id}` : (row.id as string);
  }

  /** Apply a peer's row when it is newer than ours (LWW per row, R15.7, R15.9). Never touches the undo stack. */
  applyRemote(table: TableName, row: Row): boolean {
    if (!this.inScope(table, row)) return false;
    const id = this.rowKey(table, row);
    if (this.inflight.has(id)) {
      this.deferred.set(id, { table, row, deleted: false });
      return false;
    }
    if (table === 'scenario_wall_states') {
      this.demoWalls.add(row.wall_id as string);
      this.revision += 1;
      return true;
    }
    if (table === 'slabs') {
      if (((this.slab?.version as number | undefined) ?? 0) >= ((row.version as number) ?? 0)) return false;
      this.slab = { ...(this.slab ?? {}), ...row } as SlabRow;
      this.revision += 1;
      return true;
    }
    const map = this.table(table);
    const cur = map.get(id);
    if (cur && ((cur.version as number) ?? 0) >= ((row.version as number) ?? 0)) return false;
    map.set(id, cur ? { ...cur, ...row } : row);
    if (table === 'layers' && !this.layerUi.has(id)) this.layerUi.set(id, { visible: true, opacity: 1 });
    this.revision += 1;
    return true;
  }

  /** Drop a row a peer deleted (postgres DELETE payloads carry only the key). */
  removeRemote(table: TableName, id: string, row: Row = {}): boolean {
    const key = table === 'scenario_wall_states' ? this.rowKey(table, row) : id;
    if (this.inflight.has(key)) {
      this.deferred.set(key, { table, row: { ...row, id }, deleted: true });
      return false;
    }
    if (table === 'scenario_wall_states') {
      if (row.scenario_id !== this.scenarioId) return false;
      this.demoWalls.delete(row.wall_id as string);
    } else if (table === 'slabs') {
      if (!this.slab || this.slab.id !== id) return false;
      this.slab = null;
    } else {
      const map = this.table(table);
      if (!map.has(id)) return false;
      map.delete(id);
      this.selection.delete(id);
    }
    this.revision += 1;
    return true;
  }

  private applyDeferred(id: string): void {
    const d = this.deferred.get(id);
    if (!d) return;
    this.deferred.delete(id);
    if (d.deleted) this.removeRemote(d.table, d.row.id as string, d.row);
    else this.applyRemote(d.table, d.row);
  }

  /** Refetch the scenario and diff it into the store, keeping rows with unsaved or in-flight local changes (R15.8). */
  async refresh(): Promise<void> {
    if (!this.projectId || !this.scenarioId) return;
    const data = await this.repo.load(this.projectId, this.scenarioId);
    const keep = (id: string) => this.unsynced.has(id) || this.inflight.has(id);
    const sync = (map: SvelteMap<string, Row>, rows: Row[]) => {
      const ids = new Set(rows.map((r) => r.id as string));
      for (const id of [...map.keys()]) {
        if (ids.has(id) || keep(id)) continue;
        map.delete(id);
        this.selection.delete(id);
      }
      for (const r of rows) {
        const id = r.id as string;
        if (keep(id)) continue;
        const cur = map.get(id);
        if (!cur || ((cur.version as number) ?? 0) < ((r.version as number) ?? 0)) map.set(id, cur ? { ...cur, ...r } : r);
      }
    };
    sync(this.table('layers'), data.layers);
    sync(this.table('walls'), data.walls);
    sync(this.table('openings'), data.openings);
    sync(this.table('object_groups'), data.groups);
    sync(this.table('objects'), data.objects);
    const demo = new Set(data.wallStates.map((s) => s.wall_id as string));
    for (const id of [...this.demoWalls]) if (!demo.has(id)) this.demoWalls.delete(id);
    for (const id of demo) this.demoWalls.add(id);
    const slab = data.slab as SlabRow | null;
    if (!slab) this.slab = null;
    else if (!this.slab || (this.slab.version ?? 0) < (slab.version ?? 0)) this.slab = slab;
    for (const id of this.layers.keys()) if (!this.layerUi.has(id)) this.layerUi.set(id, { visible: true, opacity: 1 });
    this.revision += 1;
  }

  static inverse(op: Op): Op {
    if (op.type === 'create') return { type: 'delete', table: op.table, id: op.row.id as string, row: op.row };
    if (op.type === 'delete') return { type: 'create', table: op.table, row: op.row };
    return { type: 'update', table: op.table, id: op.id, before: op.after, after: op.before };
  }

  private opId(op: Op): string {
    if (op.table === 'scenario_wall_states') {
      const r = op.type === 'update' ? op.after : op.row;
      return `${r.scenario_id}:${r.wall_id}`;
    }
    return op.type === 'create' ? (op.row.id as string) : op.id;
  }

  private async write(op: Op): Promise<Row | null> {
    if (op.table === 'scenario_wall_states') {
      if (op.type === 'delete') await this.repo.removeWallState(this.scenarioId, op.row.wall_id as string);
      else await this.repo.insert('scenario_wall_states', op.type === 'create' ? op.row : op.after);
      return null;
    }
    if (op.type === 'create') return this.repo.insert(op.table, op.row);
    if (op.type === 'update') return this.repo.update(op.table, op.id, op.after);
    await this.repo.remove(op.table, op.id);
    return null;
  }

  /** Three retries with backoff before giving up (R15.10). */
  private async writeWithRetry(op: Op): Promise<Row | null> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.write(op);
      } catch (e) {
        if (attempt >= this.retryDelays.length) throw e;
        await new Promise((r) => setTimeout(r, this.retryDelays[attempt]));
      }
    }
  }

  /** Fold the stored row back in: the whole row once no other write for it is in flight, else only the version fields. */
  private absorb(op: Op, stored: Row | null, last: boolean): void {
    if (!stored || op.type === 'delete') return;
    op.version = stored.version as number;
    const patch = last ? stored : { version: stored.version, updated_at: stored.updated_at, updated_by: stored.updated_by };
    if (op.table === 'slabs') {
      this.slab = { ...(this.slab ?? {}), ...patch } as SlabRow;
      return;
    }
    if (op.table === 'scenario_wall_states') return;
    const id = op.type === 'create' ? (op.row.id as string) : op.id;
    const map = this.table(op.table);
    const cur = map.get(id);
    if (cur) map.set(id, { ...cur, ...patch });
  }

  notify(text: string, action?: Notice['action']): number {
    const id = ++this.noticeSeq;
    this.notices = [...this.notices, { id, text, action }];
    return id;
  }

  dismiss(id: number): void {
    this.notices = this.notices.filter((n) => n.id !== id);
  }

  /** Apply locally, record for undo, then persist with retries. Never awaits before the local apply (R7.10, R15.6, R15.10). */
  async commit(batch: Batch, record = true): Promise<void> {
    if (batch.ops.length === 0) return;
    for (const op of batch.ops) this.applyLocal(op);
    if (record) {
      this.undoStack = [...this.undoStack, batch];
      this.redoStack = [];
    }
    this.pendingWrites += batch.ops.length;
    for (const op of batch.ops) {
      const id = this.opId(op);
      this.inflight.set(id, (this.inflight.get(id) ?? 0) + 1);
      let stored: Row | null = null;
      let ok = false;
      try {
        stored = await this.writeWithRetry(op);
        ok = true;
        this.unsynced.delete(id);
      } catch (e) {
        this.unsynced.add(id);
        this.failed.push(op);
        this.notify(`Save failed: ${String((e as Error).message ?? e)}`, { label: 'Retry', run: () => void this.retryFailed() });
      } finally {
        this.pendingWrites -= 1;
        const n = (this.inflight.get(id) ?? 1) - 1;
        const last = n <= 0;
        if (last) this.inflight.delete(id);
        else this.inflight.set(id, n);
        if (ok) {
          this.absorb(op, stored, last);
          this.revision += 1;
          this.onWritten?.(op, stored);
        }
        if (last) this.applyDeferred(id);
      }
    }
  }

  /** Re-run every write that exhausted its retries (the toast's Retry button). */
  async retryFailed(): Promise<void> {
    const ops = this.failed;
    this.failed = [];
    this.notices = this.notices.filter((n) => n.action?.label !== 'Retry');
    await this.commit({ label: 'retry', ops }, false);
  }

  async undo(): Promise<void> {
    const batch = this.undoStack.at(-1);
    if (!batch) return;
    this.undoStack = this.undoStack.slice(0, -1);
    const over = new Set<string>();
    for (const op of batch.ops) {
      if (op.type === 'delete' || op.version === undefined) continue;
      const id = op.type === 'create' ? (op.row.id as string) : op.id;
      const cur = op.table === 'slabs' ? (this.slab as Row | null) : op.table === 'scenario_wall_states' ? null : this.table(op.table).get(id);
      if (cur && cur.version !== op.version && cur.updated_by && cur.updated_by !== this.userId) over.add(this.nameOf(cur.updated_by as string));
    }
    const inverse: Batch = { label: `undo ${batch.label}`, ops: [...batch.ops].reverse().map(DocumentStore.inverse) };
    this.redoStack = [...this.redoStack, batch];
    if (over.size) this.notify(`Undid over ${[...over].join(', ')}'s newer change`);
    await this.commit(inverse, false);
  }

  async redo(): Promise<void> {
    const batch = this.redoStack.at(-1);
    if (!batch) return;
    this.redoStack = this.redoStack.slice(0, -1);
    this.undoStack = [...this.undoStack, batch];
    await this.commit(batch, false);
  }

  newObject(init: Partial<ObjectRow> & { w: number; d: number; h: number }): ObjectRow {
    const layerId = init.layer_id ?? this.activeLayerId ?? [...this.layers.keys()][0];
    const mount = (init.mount ?? 'floor') as Mount;
    const zOrder = Math.max(0, ...[...this.objects.values()].map((o) => o.z_order)) + 1;
    return {
      id: init.id ?? newId(),
      scenario_id: this.scenarioId,
      layer_id: layerId,
      preset_id: init.preset_id ?? null,
      name: init.name ?? 'Object',
      x: init.x ?? 0,
      y: init.y ?? 0,
      z: init.z ?? defaultZ(mount, init.h),
      w: init.w,
      d: init.d,
      h: init.h,
      rot: init.rot ?? 0,
      mount,
      wall_id: init.wall_id ?? null,
      group_id: init.group_id ?? null,
      z_order: init.z_order ?? zOrder,
      tags: init.tags ?? [],
      image_path: init.image_path ?? null,
      halo: init.halo ?? null,
      locked: init.locked ?? false,
      props: init.props ?? {},
      version: 1,
      updated_at: new Date().toISOString(),
      updated_by: null,
    };
  }

  createObjects(rows: ObjectRow[], label = 'add'): Promise<void> {
    return this.commit({ label, ops: rows.map((row) => ({ type: 'create', table: 'objects', row: row as unknown as Row })) });
  }

  updateObjects(ids: string[], patch: (o: ObjectRow) => Partial<ObjectRow>, label = 'edit'): Promise<void> {
    const ops: Op[] = [];
    for (const id of ids) {
      const cur = this.objects.get(id);
      if (!cur) continue;
      const after = patch(cur) as Row;
      const before: Row = {};
      for (const k of Object.keys(after)) before[k] = (cur as unknown as Row)[k];
      const changed = Object.keys(after).some((k) => JSON.stringify(after[k]) !== JSON.stringify(before[k]));
      if (changed) ops.push({ type: 'update', table: 'objects', id, before, after });
    }
    return this.commit({ label, ops });
  }

  deleteObjects(ids: string[], label = 'delete'): Promise<void> {
    const ops: Op[] = [];
    for (const id of ids) {
      const cur = this.objects.get(id);
      if (cur) ops.push({ type: 'delete', table: 'objects', id, row: cur as unknown as Row });
      this.selection.delete(id);
    }
    return this.commit({ label, ops });
  }

  async duplicateObjects(ids: string[], offset = 12): Promise<string[]> {
    const rows: ObjectRow[] = [];
    for (const id of ids) {
      const cur = this.objects.get(id);
      if (!cur) continue;
      rows.push(this.newObject({ ...cur, id: newId(), x: cur.x + offset, y: cur.y + offset, group_id: null, z_order: undefined }));
    }
    await this.createObjects(rows, 'duplicate');
    this.select(rows.map((r) => r.id));
    return rows.map((r) => r.id);
  }

  async groupSelected(name = ''): Promise<void> {
    const ids = [...this.selection];
    if (ids.length < 2) return;
    const group: Row = { id: newId(), scenario_id: this.scenarioId, name, version: 1 };
    const ops: Op[] = [{ type: 'create', table: 'object_groups', row: group }];
    for (const id of ids) {
      const cur = this.objects.get(id);
      if (cur) ops.push({ type: 'update', table: 'objects', id, before: { group_id: cur.group_id }, after: { group_id: group.id } });
    }
    await this.commit({ label: 'group', ops });
  }

  async ungroupSelected(): Promise<void> {
    const groupIds = new Set([...this.selection].map((id) => this.objects.get(id)?.group_id).filter((g): g is string => !!g));
    const ops: Op[] = [];
    for (const o of this.objects.values())
      if (o.group_id && groupIds.has(o.group_id)) ops.push({ type: 'update', table: 'objects', id: o.id, before: { group_id: o.group_id }, after: { group_id: null } });
    for (const g of groupIds) {
      const row = this.groups.get(g);
      if (row) ops.push({ type: 'delete', table: 'object_groups', id: g, row: row as unknown as Row });
    }
    await this.commit({ label: 'ungroup', ops });
  }

  reorder(ids: string[], where: 'front' | 'back'): Promise<void> {
    const all = [...this.objects.values()].map((o) => o.z_order);
    const base = where === 'front' ? Math.max(0, ...all) + 1 : Math.min(0, ...all) - ids.length;
    return this.updateObjects(ids, (o) => ({ z_order: base + ids.indexOf(o.id) }), where === 'front' ? 'bring to front' : 'send to back');
  }

  setLayerLocked(id: string, locked: boolean): Promise<void> {
    const cur = this.layers.get(id);
    if (!cur) return Promise.resolve();
    return this.commit({ label: locked ? 'lock layer' : 'unlock layer', ops: [{ type: 'update', table: 'layers', id, before: { locked: cur.locked }, after: { locked } }] });
  }

  /** Align selected objects' bounding boxes (R24.10). */
  alignSelected(edge: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'): Promise<void> {
    const objs = this.selectedObjects();
    if (objs.length < 2) return Promise.resolve();
    const boxes = new Map(objs.map((o) => [o.id, aabb(footprint({ x: o.x, y: o.y, w: o.w, d: o.d, rot: o.rot }))] as [string, AABB]));
    const all = [...boxes.values()];
    const minX = Math.min(...all.map((b) => b.minX));
    const maxX = Math.max(...all.map((b) => b.maxX));
    const minY = Math.min(...all.map((b) => b.minY));
    const maxY = Math.max(...all.map((b) => b.maxY));
    return this.updateObjects(
      objs.map((o) => o.id),
      (o) => {
        const b = boxes.get(o.id)!;
        switch (edge) {
          case 'left': return { x: o.x + (minX - b.minX) };
          case 'right': return { x: o.x + (maxX - b.maxX) };
          case 'center': return { x: o.x + ((minX + maxX) / 2 - (b.minX + b.maxX) / 2) };
          case 'bottom': return { y: o.y + (minY - b.minY) };
          case 'top': return { y: o.y + (maxY - b.maxY) };
          default: return { y: o.y + ((minY + maxY) / 2 - (b.minY + b.maxY) / 2) };
        }
      },
      `align ${edge}`,
    );
  }

  /** Space selected objects evenly along an axis, keeping the outermost two in place (R24.10). */
  distributeSelected(axis: 'x' | 'y'): Promise<void> {
    const objs = this.selectedObjects();
    if (objs.length < 3) return Promise.resolve();
    const items = objs
      .map((o) => ({ o, b: aabb(footprint({ x: o.x, y: o.y, w: o.w, d: o.d, rot: o.rot })) }))
      .sort((p, q) => (axis === 'x' ? p.b.minX - q.b.minX : p.b.minY - q.b.minY));
    const lo = axis === 'x' ? items[0].b.minX : items[0].b.minY;
    const last = items[items.length - 1].b;
    const hi = axis === 'x' ? last.maxX : last.maxY;
    const total = items.reduce((s, it) => s + (axis === 'x' ? it.b.maxX - it.b.minX : it.b.maxY - it.b.minY), 0);
    const gap = (hi - lo - total) / (items.length - 1);
    const target = new Map<string, number>();
    let cursor = lo;
    for (const it of items) {
      const size = axis === 'x' ? it.b.maxX - it.b.minX : it.b.maxY - it.b.minY;
      target.set(it.o.id, cursor - (axis === 'x' ? it.b.minX : it.b.minY));
      cursor += size + gap;
    }
    return this.updateObjects(
      objs.map((o) => o.id),
      (o) => (axis === 'x' ? { x: o.x + (target.get(o.id) ?? 0) } : { y: o.y + (target.get(o.id) ?? 0) }),
      `distribute ${axis}`,
    );
  }

  /** Objects sorted for rendering: by layer sort, then z_order. */
  orderedObjects(): ObjectRow[] {
    const sortOf = (id: string) => this.layers.get(id)?.sort ?? 0;
    return [...this.objects.values()].sort((a, b) => sortOf(a.layer_id) - sortOf(b.layer_id) || a.z_order - b.z_order);
  }
}
