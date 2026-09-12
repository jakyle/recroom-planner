<script lang="ts">
  import type { DocumentStore } from '../model/store.svelte';
  import type { Viewport } from '../canvas/viewport.svelte';
  import { formatLength } from '../geom/units';
  import { aabb, footprint } from '../geom/transform';
  import { propsOf } from '../model/types';
  import Panel from './Panel.svelte';

  let { store, viewport, canEdit }: { store: DocumentStore; viewport: Viewport; canEdit: boolean } = $props();

  let query = $state('');
  let layerFilter = $state('');
  let mountFilter = $state('');
  let sort = $state<'name' | 'layer' | 'cost'>('name');
  let bulkTag = $state('');

  const layers = $derived([...store.layers.values()].sort((a, b) => a.sort - b.sort));
  const rows = $derived.by(() => {
    const q = query.trim().toLowerCase();
    let list = [...store.objects.values()].filter((o) => {
      if (layerFilter && o.layer_id !== layerFilter) return false;
      if (mountFilter && o.mount !== mountFilter) return false;
      if (!q) return true;
      return o.name.toLowerCase().includes(q) || o.tags.some((t) => t.includes(q));
    });
    const layerName = (id: string) => store.layers.get(id)?.name ?? '';
    list = list.sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name) : sort === 'layer' ? layerName(a.layer_id).localeCompare(layerName(b.layer_id)) || a.name.localeCompare(b.name) : (propsOf(b).cost ?? 0) - (propsOf(a).cost ?? 0),
    );
    return list;
  });

  function zoomTo(id: string) {
    const o = store.objects.get(id);
    if (!o) return;
    store.select([id]);
    const box = aabb(footprint({ x: o.x, y: o.y, w: o.w, d: o.d, rot: o.rot }));
    viewport.fitTo({ minX: box.minX - 60, minY: box.minY - 60, maxX: box.maxX + 60, maxY: box.maxY + 60 });
  }

  function bulkApplyTag() {
    const t = bulkTag.trim().toLowerCase();
    if (!t) return;
    void store.updateObjects(rows.map((o) => o.id), (o) => ({ tags: o.tags.includes(t) ? o.tags : [...o.tags, t] }), 'bulk tag');
    bulkTag = '';
  }
  function bulkLayer(layerId: string) {
    if (!layerId) return;
    void store.updateObjects(rows.map((o) => o.id), () => ({ layer_id: layerId }), 'bulk layer');
  }
  function bulkDelete() {
    if (rows.length && confirm(`Delete ${rows.length} object(s)?`)) void store.deleteObjects(rows.map((o) => o.id));
  }
</script>

<Panel title={`Objects · ${rows.length}`} testId="objects-panel">
  <div class="row">
    <input class="input grow" data-test="objects-search" placeholder="Search name or tag" bind:value={query} />
    <select class="select" bind:value={sort} aria-label="Sort"><option value="name">name</option><option value="layer">layer</option><option value="cost">cost</option></select>
  </div>
  <div class="row">
    <select class="select grow" bind:value={layerFilter} aria-label="Filter by layer"><option value="">all layers</option>{#each layers as l (l.id)}<option value={l.id}>{l.name}</option>{/each}</select>
    <select class="select grow" bind:value={mountFilter} aria-label="Filter by mount"><option value="">any mount</option><option value="floor">floor</option><option value="floor_anchored">floor anchored</option><option value="wall">wall</option><option value="ceiling">ceiling</option><option value="recessed">recessed</option></select>
  </div>
  {#if rows.length === 0}
    <p class="note">Nothing matches. Add objects with the Object tool (O).</p>
  {:else}
    <ul class="list objs">
      {#each rows as o (o.id)}
        <li class="list__item" aria-current={store.selection.has(o.id)}>
          <button class="obj__btn" data-test="objects-row" onclick={() => zoomTo(o.id)}>
            <span class="obj__name">{o.name}</span>
            <span class="mono muted">{formatLength(o.w)} × {formatLength(o.d)}</span>
          </button>
          <span class="obj__layer" style={`background:${store.layers.get(o.layer_id)?.color ?? '#888'}`} title={store.layers.get(o.layer_id)?.name}></span>
        </li>
      {/each}
    </ul>
    {#if canEdit}
      <div class="row">
        <input class="input grow" placeholder="tag all shown…" bind:value={bulkTag} onkeydown={(e) => e.key === 'Enter' && bulkApplyTag()} />
        <select class="select" aria-label="Move all shown to layer" onchange={(e) => bulkLayer((e.currentTarget as HTMLSelectElement).value)}><option value="">move to…</option>{#each layers as l (l.id)}<option value={l.id}>{l.name}</option>{/each}</select>
        <button class="btn btn--sm btn--danger" onclick={bulkDelete}>Delete</button>
      </div>
    {/if}
  {/if}
</Panel>

<style>
  .objs { max-height: 260px; overflow: auto; }
  .obj__btn { flex: 1; display: flex; justify-content: space-between; gap: 8px; background: none; border: 0; padding: 2px 0; cursor: pointer; color: var(--ink); font: inherit; text-align: left; min-width: 0; }
  .obj__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .obj__layer { width: 8px; height: 8px; border-radius: 2px; flex: none; }
</style>
