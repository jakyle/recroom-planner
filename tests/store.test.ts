import { describe, it, expect, beforeEach } from 'vitest';
import { DocumentStore } from '../src/lib/model/store.svelte';
import type { Repo, ScenarioData } from '../src/lib/supabase/repo';
import type { Row } from '../src/lib/model/types';

function fakeRepo(overrides: Partial<Repo> = {}): Repo & { calls: string[] } {
  const calls: string[] = [];
  const data: ScenarioData = {
    layers: [
      { id: 'L1', project_id: 'P', key: 'walls', name: 'Walls', color: '#000', sort: 0, builtin: true, locked: false, version: 1 },
      { id: 'L2', project_id: 'P', key: 'furnishing', name: 'Furnishing', color: '#777', sort: 8, builtin: true, locked: false, version: 1 },
    ],
    walls: [],
    openings: [],
    groups: [],
    objects: [{ id: 'O1', scenario_id: 'S', layer_id: 'L2', name: 'Sofa', x: 0, y: 0, z: 0, w: 84, d: 38, h: 34, rot: 0, mount: 'floor', wall_id: null, group_id: null, z_order: 1, tags: [], image_path: null, halo: null, locked: false, props: {}, version: 3 }],
    wallStates: [],
    slab: null,
  };
  const repo: Repo & { calls: string[] } = {
    calls,
    async insert(table, row) {
      calls.push(`insert ${table} ${row.id}`);
      return { ...row, version: 1 };
    },
    async update(table, id, patch) {
      calls.push(`update ${table} ${id} ${Object.keys(patch).join(',')}`);
      return { id, ...patch, version: 99 };
    },
    async remove(table, id) {
      calls.push(`remove ${table} ${id}`);
    },
    async removeWallState() {},
    async load() {
      return data;
    },
    ...overrides,
  };
  return repo;
}

describe('DocumentStore', () => {
  let repo: ReturnType<typeof fakeRepo>;
  let store: DocumentStore;

  beforeEach(async () => {
    localStorage.clear();
    repo = fakeRepo();
    store = new DocumentStore(repo);
    await store.load('P', 'S');
  });

  it('loads and picks the furnishing layer as active', () => {
    expect(store.objects.size).toBe(1);
    expect(store.activeLayerId).toBe('L2');
  });

  it('creates an object locally first, then writes', async () => {
    const row = store.newObject({ name: 'Rack', w: 53, d: 34, h: 90, mount: 'floor_anchored' });
    const p = store.createObjects([row]);
    expect(store.objects.has(row.id)).toBe(true);
    await p;
    expect(repo.calls).toEqual([`insert objects ${row.id}`]);
    expect(store.objects.get(row.id)?.layer_id).toBe('L2');
    expect(store.objects.get(row.id)?.z_order).toBe(2);
  });

  it('updates with version from the repo and records undo', async () => {
    await store.updateObjects(['O1'], () => ({ x: 120 }), 'move');
    expect(store.objects.get('O1')?.x).toBe(120);
    expect(store.objects.get('O1')?.version).toBe(99);
    expect(store.undoStack.length).toBe(1);
    await store.undo();
    expect(store.objects.get('O1')?.x).toBe(0);
    expect(store.redoStack.length).toBe(1);
    await store.redo();
    expect(store.objects.get('O1')?.x).toBe(120);
  });

  it('skips no-op updates', async () => {
    await store.updateObjects(['O1'], () => ({ x: 0 }));
    expect(repo.calls).toEqual([]);
    expect(store.undoStack.length).toBe(0);
  });

  it('deletes and restores via undo', async () => {
    store.select(['O1']);
    await store.deleteObjects(['O1']);
    expect(store.objects.has('O1')).toBe(false);
    expect(store.selection.size).toBe(0);
    await store.undo();
    expect(store.objects.get('O1')?.name).toBe('Sofa');
  });

  it('flags unsynced rows and toasts Retry when a write fails', async () => {
    store.retryDelays = [0, 0, 0];
    repo.update = async () => {
      throw new Error('boom');
    };
    await store.updateObjects(['O1'], () => ({ x: 5 }));
    expect(store.objects.get('O1')?.x).toBe(5);
    expect(store.unsynced.has('O1')).toBe(true);
    expect(store.notices[0].text).toContain('boom');
    expect(store.notices[0].action?.label).toBe('Retry');
  });

  it('applyRemote is last-writer-wins by version and never records undo', () => {
    expect(store.applyRemote('objects', { id: 'O1', scenario_id: 'S', x: 40, version: 2 })).toBe(false);
    expect(store.objects.get('O1')?.x).toBe(0);
    expect(store.applyRemote('objects', { id: 'O1', scenario_id: 'S', x: 40, version: 4 })).toBe(true);
    expect(store.objects.get('O1')?.x).toBe(40);
    expect(store.applyRemote('objects', { id: 'O9', scenario_id: 'OTHER', x: 1, version: 1 })).toBe(false);
    expect(store.objects.has('O9')).toBe(false);
    expect(store.undoStack.length).toBe(0);
    store.removeRemote('objects', 'O1');
    expect(store.objects.has('O1')).toBe(false);
  });

  it('refresh diffs the refetched scenario in but keeps unsynced rows', async () => {
    const mine = store.newObject({ id: 'MINE', name: 'Mine', w: 10, d: 10, h: 10 });
    store.objects.set('MINE', mine);
    store.unsynced.add('MINE');
    repo.load = async () => ({
      layers: [
        { id: 'L1', project_id: 'P', key: 'walls', name: 'Walls', color: '#000', sort: 0, builtin: true, locked: false, version: 1 },
        { id: 'L2', project_id: 'P', key: 'furnishing', name: 'Furnishing', color: '#777', sort: 8, builtin: true, locked: false, version: 1 },
      ],
      walls: [],
      openings: [],
      groups: [],
      wallStates: [],
      slab: null,
      objects: [
        { id: 'O1', scenario_id: 'S', layer_id: 'L2', name: 'Sofa moved', x: 99, y: 0, z: 0, w: 84, d: 38, h: 34, rot: 0, mount: 'floor', wall_id: null, group_id: null, z_order: 1, tags: [], image_path: null, halo: null, locked: false, props: {}, version: 7 },
        { id: 'NEW', scenario_id: 'S', layer_id: 'L2', name: 'New', x: 1, y: 1, z: 0, w: 1, d: 1, h: 1, rot: 0, mount: 'floor', wall_id: null, group_id: null, z_order: 2, tags: [], image_path: null, halo: null, locked: false, props: {}, version: 1 },
      ],
    });
    await store.refresh();
    expect(store.objects.get('O1')?.x).toBe(99);
    expect(store.objects.has('NEW')).toBe(true);
    expect(store.objects.has('MINE')).toBe(true);
  });

  it('retries a failing write with backoff, then toasts with Retry and keeps the row unsynced', async () => {
    store.retryDelays = [0, 0, 0];
    let attempts = 0;
    repo.update = async (table, id, patch) => {
      attempts += 1;
      if (attempts < 5) throw new Error('flaky');
      return { id, ...patch, version: 50 };
    };
    await store.updateObjects(['O1'], () => ({ x: 7 }));
    expect(attempts).toBe(4);
    expect(store.unsynced.has('O1')).toBe(true);
    expect(store.notices.at(-1)?.action?.label).toBe('Retry');
    store.notices.at(-1)!.action!.run();
    await new Promise((r) => setTimeout(r, 0));
    expect(store.unsynced.has('O1')).toBe(false);
    expect(store.objects.get('O1')?.version).toBe(50);
  });

  it("undo over a peer's newer change toasts with their name", async () => {
    store.userId = 'me';
    store.nameOf = (id) => (id === 'peer' ? 'Bob' : 'someone');
    repo.update = async (table, id, patch) => ({ id, ...patch, version: 4, updated_by: 'me' });
    await store.updateObjects(['O1'], () => ({ x: 120 }), 'move');
    store.applyRemote('objects', { id: 'O1', scenario_id: 'S', x: 200, version: 5, updated_by: 'peer' });
    await store.undo();
    expect(store.objects.get('O1')?.x).toBe(0);
    expect(store.notices.at(-1)?.text).toBe("Undid over Bob's newer change");
  });

  it('undo over my own later change is silent', async () => {
    store.userId = 'me';
    let v = 3;
    repo.update = async (table, id, patch) => ({ id, ...patch, version: ++v, updated_by: 'me' });
    await store.updateObjects(['O1'], () => ({ x: 120 }), 'move');
    await store.updateObjects(['O1'], () => ({ name: 'Couch' }), 'rename');
    await store.undo();
    await store.undo();
    expect(store.notices.length).toBe(0);
  });

  it('applies a deferred remote row once the in-flight write lands', async () => {
    let release: (v: unknown) => void = () => {};
    repo.update = async (table, id, patch) => {
      await new Promise((r) => (release = r));
      return { id, ...patch, version: 4 };
    };
    const p = store.updateObjects(['O1'], () => ({ x: 10 }), 'move');
    await new Promise((r) => setTimeout(r, 0));
    expect(store.applyRemote('objects', { id: 'O1', scenario_id: 'S', name: 'Peer', version: 9 })).toBe(false);
    release(null);
    await p;
    expect(store.objects.get('O1')?.name).toBe('Peer');
    expect(store.objects.get('O1')?.version).toBe(9);
  });

  it('groups select together and ungroup clears', async () => {
    const b = store.newObject({ name: 'Table', w: 48, d: 24, h: 18 });
    await store.createObjects([b]);
    store.select(['O1', b.id]);
    await store.groupSelected();
    const gid = store.objects.get('O1')?.group_id;
    expect(gid).toBeTruthy();
    expect(store.objects.get(b.id)?.group_id).toBe(gid);
    store.clearSelection();
    store.select(['O1']);
    expect(store.selection.size).toBe(2);
    await store.ungroupSelected();
    expect(store.objects.get('O1')?.group_id).toBeNull();
    expect(store.groups.size).toBe(0);
  });

  it('layer visibility is local and solo toggles', () => {
    store.setLayerVisible('L1', false);
    expect(store.isLayerVisible('L1')).toBe(false);
    store.setLayerVisible('L1', true);
    store.soloLayer('L2');
    expect(store.isLayerVisible('L1')).toBe(false);
    expect(store.isLayerVisible('L2')).toBe(true);
    store.soloLayer('L2');
    expect(store.isLayerVisible('L1')).toBe(true);
    expect(JSON.parse(localStorage.getItem('rr.layers.P')!).L1.visible).toBe(true);
  });

  it('duplicate offsets by a foot and selects the copies', async () => {
    const ids = await store.duplicateObjects(['O1']);
    expect(ids.length).toBe(1);
    expect(store.objects.get(ids[0])?.x).toBe(12);
    expect(store.selection.has(ids[0])).toBe(true);
  });

  it('aligns and distributes', async () => {
    const b = store.newObject({ name: 'B', x: 100, y: 50, w: 20, d: 20, h: 10 });
    const c = store.newObject({ name: 'C', x: 300, y: 90, w: 40, d: 20, h: 10 });
    await store.createObjects([b, c]);
    store.select(['O1', b.id, c.id]);
    await store.alignSelected('bottom');
    expect(store.objects.get(b.id)?.y).toBe(0);
    expect(store.objects.get(c.id)?.y).toBe(0);
    await store.distributeSelected('x');
    expect(store.objects.get('O1')?.x).toBe(0);
    expect(store.objects.get(c.id)?.x).toBe(300);
    expect(store.objects.get(b.id)?.x).toBe(182);
  });
});
