<script lang="ts">
  import type { DocumentStore } from '../model/store.svelte';
  import { MOUNTS, propsOf, mergeProps, type Mount } from '../model/types';
  import { formatLength, parseLength } from '../geom/units';
  import type { HaloSpec } from '../geom/halo';
  import Panel from './Panel.svelte';

  let { store, canEdit }: { store: DocumentStore; canEdit: boolean } = $props();

  const selected = $derived(store.selectedObjects());
  const one = $derived(selected.length === 1 ? selected[0] : null);
  const layers = $derived([...store.layers.values()].sort((a, b) => a.sort - b.sort));
  const walls = $derived([...store.walls.values()]);
  const allTags = $derived([...new Set([...store.objects.values()].flatMap((o) => o.tags))].sort());

  let tagDraft = $state('');

  function ids(): string[] {
    return selected.map((o) => o.id);
  }

  function setLength(field: 'x' | 'y' | 'z' | 'w' | 'd' | 'h', raw: string) {
    const v = parseLength(raw);
    if (v === null || !one) return;
    if ((field === 'w' || field === 'd') && v < 1) return;
    void store.updateObjects([one.id], () => ({ [field]: v }), `set ${field}`);
  }

  function setRot(raw: string) {
    const v = Number(raw);
    if (!Number.isFinite(v) || !one) return;
    void store.updateObjects([one.id], () => ({ rot: ((v % 360) + 360) % 360 }), 'rotate');
  }

  function setName(raw: string) {
    if (!one || raw.trim() === one.name) return;
    void store.updateObjects([one.id], () => ({ name: raw.trim() || 'Object' }), 'rename');
  }

  function setText(raw: string) {
    if (!one) return;
    void store.updateObjects([one.id], (o) => ({ props: mergeProps(o, { text: raw }) }), 'edit note');
  }

  function setMount(mount: Mount) {
    void store.updateObjects(ids(), () => ({ mount, wall_id: mount === 'wall' || mount === 'recessed' ? undefined : null }), 'mount');
  }

  function setWall(wallId: string) {
    void store.updateObjects(ids(), () => ({ wall_id: wallId || null }), 'wall');
  }

  function setLayer(layerId: string) {
    void store.updateObjects(ids(), () => ({ layer_id: layerId }), 'layer');
  }

  function toggleLocked() {
    const lock = !selected.every((o) => o.locked);
    void store.updateObjects(ids(), () => ({ locked: lock }), lock ? 'lock' : 'unlock');
  }

  function toggleSizeLock() {
    if (!one) return;
    void store.updateObjects([one.id], (o) => ({ props: mergeProps(o, { size_locked: !propsOf(o).size_locked }) }), 'size lock');
  }

  function addTag(raw: string) {
    const t = raw.trim().toLowerCase();
    if (!t) return;
    void store.updateObjects(ids(), (o) => ({ tags: o.tags.includes(t) ? o.tags : [...o.tags, t] }), 'tag');
    tagDraft = '';
  }

  function removeTag(t: string) {
    void store.updateObjects(ids(), (o) => ({ tags: o.tags.filter((x) => x !== t) }), 'untag');
  }

  function setHalo(side: keyof HaloSpec, raw: string) {
    if (!one) return;
    const v = raw.trim() === '' ? undefined : parseLength(raw);
    if (v === null) return;
    const halo = { ...((one.halo as HaloSpec | null) ?? {}) };
    if (v === undefined) delete halo[side];
    else halo[side] = v;
    void store.updateObjects([one.id], () => ({ halo: Object.keys(halo).length ? halo : null }), 'halo');
  }

  function setProp(key: 'cost' | 'product_url' | 'vendor' | 'notes', raw: string) {
    if (!one) return;
    const value = key === 'cost' ? (raw.trim() === '' ? undefined : Number(raw)) : raw.trim() || undefined;
    void store.updateObjects([one.id], (o) => ({ props: mergeProps(o, { [key]: value }) }), `set ${key}`);
  }

  const commonTags = $derived(selected.length ? selected.map((o) => new Set(o.tags)).reduce((a, b) => new Set([...a].filter((t) => b.has(t)))) : new Set<string>());
  const halo = $derived((one?.halo as HaloSpec | null) ?? {});
  const p = $derived(one ? propsOf(one) : {});
  const commit = (fn: (v: string) => void) => (e: Event) => fn((e.currentTarget as HTMLInputElement).value);
  const onEnter = (e: KeyboardEvent) => {
    if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
  };
</script>

<Panel title={one ? 'Object' : selected.length > 1 ? `${selected.length} objects` : 'Object'} testId="inspector">
  {#if selected.length === 0}
    <p class="note">Select something on the plan. Drag a box with the Object tool (O) to add one.</p>
  {:else}
    <fieldset class="insp" disabled={!canEdit}>
      {#if one}
        <label class="field"><span class="label">Name</span><input class="input" data-test="insp-name" value={one.name} onblur={commit(setName)} onkeydown={onEnter} /></label>
        {#if p.kind === 'text'}
          <label class="field"><span class="label">Text</span><textarea class="input" rows="3" value={p.text ?? ''} onblur={commit(setText)}></textarea></label>
        {/if}
      {/if}

      <label class="field">
        <span class="label">Layer</span>
        <select class="select" data-test="insp-layer" value={one ? one.layer_id : ''} onchange={commit(setLayer)}>
          {#if !one}<option value="">(mixed)</option>{/if}
          {#each layers as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
        </select>
      </label>

      {#if one && p.kind !== 'text' && p.kind !== 'dimension'}
        <div class="grid3">
          <label class="field"><span class="label">W</span><input class="input input--mono" data-test="insp-w" value={formatLength(one.w)} disabled={p.size_locked} onblur={commit((v) => setLength('w', v))} onkeydown={onEnter} /></label>
          <label class="field"><span class="label">D</span><input class="input input--mono" data-test="insp-d" value={formatLength(one.d)} disabled={p.size_locked} onblur={commit((v) => setLength('d', v))} onkeydown={onEnter} /></label>
          <label class="field"><span class="label">H</span><input class="input input--mono" data-test="insp-h" value={formatLength(one.h)} onblur={commit((v) => setLength('h', v))} onkeydown={onEnter} /></label>
        </div>
        <div class="row">
          <button class="btn btn--sm" data-test="insp-sizelock" onclick={toggleSizeLock}>{p.size_locked ? 'Unlock size' : 'Lock size'}</button>
          <span class="muted">{p.size_locked ? 'preset dimensions' : 'resizable'}</span>
        </div>
      {/if}

      {#if one}
        <div class="grid3">
          <label class="field"><span class="label">X</span><input class="input input--mono" data-test="insp-x" value={formatLength(one.x)} onblur={commit((v) => setLength('x', v))} onkeydown={onEnter} /></label>
          <label class="field"><span class="label">Y</span><input class="input input--mono" data-test="insp-y" value={formatLength(one.y)} onblur={commit((v) => setLength('y', v))} onkeydown={onEnter} /></label>
          <label class="field"><span class="label">Z</span><input class="input input--mono" data-test="insp-z" value={formatLength(one.z)} onblur={commit((v) => setLength('z', v))} onkeydown={onEnter} /></label>
        </div>
        <div class="grid3">
          <label class="field"><span class="label">Rotation</span><input class="input input--mono" data-test="insp-rot" value={one.rot.toFixed(1)} onblur={commit(setRot)} onkeydown={onEnter} /></label>
          <label class="field" style="grid-column: span 2">
            <span class="label">Mount</span>
            <select class="select" data-test="insp-mount" value={one.mount} onchange={commit((v) => setMount(v as Mount))}>
              {#each MOUNTS as m}<option value={m}>{m.replace('_', ' ')}</option>{/each}
            </select>
          </label>
        </div>
        {#if one.mount === 'wall' || one.mount === 'recessed'}
          <label class="field">
            <span class="label">On wall</span>
            <select class="select" value={one.wall_id ?? ''} onchange={commit(setWall)}>
              <option value="">(none — drag near a wall)</option>
              {#each walls as w (w.id)}<option value={w.id}>{w.label || w.id.slice(0, 6)}</option>{/each}
            </select>
          </label>
        {/if}
      {/if}

      <div class="field">
        <span class="label">Tags</span>
        <div class="tags">
          {#each [...commonTags] as t (t)}
            <span class="chip">{t} <button class="chip__x" aria-label={`remove ${t}`} onclick={() => removeTag(t)}>×</button></span>
          {/each}
          <input class="input" list="tag-options" placeholder="add tag…" bind:value={tagDraft} onkeydown={(e) => { if (e.key === 'Enter') { addTag(tagDraft); e.preventDefault(); } }} onblur={() => addTag(tagDraft)} />
          <datalist id="tag-options">{#each allTags as t}<option value={t}></option>{/each}</datalist>
        </div>
      </div>

      {#if one && p.kind !== 'text'}
        <details>
          <summary class="label">Clearance halo</summary>
          <div class="grid3" style="margin-top:6px">
            <label class="field"><span class="label">All</span><input class="input input--mono" value={halo.all !== undefined ? formatLength(halo.all) : ''} placeholder="—" onblur={commit((v) => setHalo('all', v))} onkeydown={onEnter} /></label>
            <label class="field"><span class="label">Front</span><input class="input input--mono" value={halo.front !== undefined ? formatLength(halo.front) : ''} placeholder="—" onblur={commit((v) => setHalo('front', v))} onkeydown={onEnter} /></label>
            <label class="field"><span class="label">Back</span><input class="input input--mono" value={halo.back !== undefined ? formatLength(halo.back) : ''} placeholder="—" onblur={commit((v) => setHalo('back', v))} onkeydown={onEnter} /></label>
            <label class="field"><span class="label">Left</span><input class="input input--mono" value={halo.left !== undefined ? formatLength(halo.left) : ''} placeholder="—" onblur={commit((v) => setHalo('left', v))} onkeydown={onEnter} /></label>
            <label class="field"><span class="label">Right</span><input class="input input--mono" value={halo.right !== undefined ? formatLength(halo.right) : ''} placeholder="—" onblur={commit((v) => setHalo('right', v))} onkeydown={onEnter} /></label>
          </div>
        </details>
        <details>
          <summary class="label">Cost & source</summary>
          <div class="field" style="margin-top:6px; gap:8px">
            <label class="field"><span class="label">Cost ($)</span><input class="input input--mono" value={p.cost ?? ''} onblur={commit((v) => setProp('cost', v))} onkeydown={onEnter} /></label>
            <label class="field"><span class="label">Vendor</span><input class="input" value={p.vendor ?? ''} onblur={commit((v) => setProp('vendor', v))} onkeydown={onEnter} /></label>
            <label class="field"><span class="label">Product link</span><input class="input" value={p.product_url ?? ''} onblur={commit((v) => setProp('product_url', v))} onkeydown={onEnter} /></label>
            <label class="field"><span class="label">Notes</span><textarea class="input" rows="2" value={p.notes ?? ''} onblur={commit((v) => setProp('notes', v))}></textarea></label>
          </div>
        </details>
      {/if}

      <div class="row">
        <button class="btn btn--sm" data-test="insp-lock" onclick={toggleLocked}>{selected.every((o) => o.locked) ? 'Unlock' : 'Lock'}</button>
        <button class="btn btn--sm" onclick={() => store.duplicateObjects(ids())}>Duplicate</button>
        <button class="btn btn--sm btn--danger" data-test="insp-delete" onclick={() => store.deleteObjects(ids())}>Delete</button>
      </div>
    </fieldset>
  {/if}
</Panel>

<style>
  .insp { border: 0; padding: 0; margin: 0; display: grid; gap: 10px; min-width: 0; }
  .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; }
  .tags { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .tags .input { flex: 1; min-width: 90px; padding: 4px 6px; font-size: 12px; }
  .chip__x { background: none; border: 0; color: inherit; cursor: pointer; padding: 0 0 0 2px; font-size: 12px; }
  details > summary { cursor: pointer; list-style: none; }
  details > summary::before { content: '▸ '; color: var(--ink-3); }
  details[open] > summary::before { content: '▾ '; }
  textarea.input { resize: vertical; font-family: var(--font-ui); }
</style>
