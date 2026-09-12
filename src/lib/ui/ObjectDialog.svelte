<script lang="ts">
  import type { DocumentStore } from '../model/store.svelte';
  import type { CanvasUi } from '../canvas/ui.svelte';
  import { MOUNTS, defaultZ, type Mount } from '../model/types';
  import { formatLength, parseLength } from '../geom/units';

  let { store, ui }: { store: DocumentStore; ui: CanvasUi } = $props();

  const box = $derived(ui.dialog?.kind === 'object' ? ui.dialog.box : null);
  const layers = $derived([...store.layers.values()].sort((a, b) => a.sort - b.sort));

  let name = $state('Object');
  let w = $state('');
  let d = $state('');
  let h = $state(`2'-6"`);
  let mount = $state<Mount>('floor');
  let z = $state('');
  let layerId = $state('');
  let tags = $state('');
  let error = $state('');

  $effect(() => {
    if (!box) return;
    name = 'Object';
    w = formatLength(box.w);
    d = formatLength(box.d);
    h = `2'-6"`;
    mount = 'floor';
    z = '';
    layerId = store.activeLayerId ?? layers[0]?.id ?? '';
    tags = '';
    error = '';
  });

  function close() {
    ui.dialog = null;
    ui.tool = 'select';
  }

  async function create() {
    if (!box) return;
    const W = parseLength(w);
    const D = parseLength(d);
    const H = parseLength(h);
    if (W === null || D === null || H === null || W < 1 || D < 1 || H < 0) {
      error = 'Use feet-inches like 8\'-0" or inches like 96.';
      return;
    }
    const Z = z.trim() ? parseLength(z) : defaultZ(mount, H);
    if (Z === null) {
      error = 'Height off the floor must be a length.';
      return;
    }
    const row = store.newObject({
      name: name.trim() || 'Object',
      x: box.x,
      y: box.y,
      w: W,
      d: D,
      h: H,
      z: Z,
      mount,
      layer_id: layerId || undefined,
      tags: tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
      props: { size_locked: false },
    });
    await store.createObjects([row], 'add object');
    store.select([row.id]);
    close();
  }
</script>

{#if box}
  <div class="dlg-backdrop" role="presentation" onpointerdown={close}></div>
  <form class="card dlg" data-test="object-dialog" onsubmit={(e) => { e.preventDefault(); void create(); }} onpointerdown={(e) => e.stopPropagation()}>
    <div class="card__body">
      <span class="label">New object</span>
      <label class="field"><span class="label">Name</span><input class="input" data-test="dlg-name" bind:value={name} /></label>
      <div class="grid3">
        <label class="field"><span class="label">Width</span><input class="input input--mono" data-test="dlg-w" bind:value={w} /></label>
        <label class="field"><span class="label">Depth</span><input class="input input--mono" data-test="dlg-d" bind:value={d} /></label>
        <label class="field"><span class="label">Height</span><input class="input input--mono" data-test="dlg-h" bind:value={h} /></label>
      </div>
      <div class="grid3">
        <label class="field"><span class="label">Mount</span>
          <select class="select" bind:value={mount}>{#each MOUNTS as m}<option value={m}>{m.replace('_', ' ')}</option>{/each}</select>
        </label>
        <label class="field"><span class="label">Off floor (z)</span><input class="input input--mono" bind:value={z} placeholder="auto" /></label>
        <label class="field"><span class="label">Layer</span>
          <select class="select" data-test="dlg-layer" bind:value={layerId}>{#each layers as l (l.id)}<option value={l.id}>{l.name}</option>{/each}</select>
        </label>
      </div>
      <label class="field"><span class="label">Tags (comma separated)</span><input class="input" bind:value={tags} placeholder="gym, must-have" /></label>
      {#if error}<p class="error">{error}</p>{/if}
      <div class="row">
        <button class="btn btn--primary" type="submit" data-test="dlg-create">Add to plan</button>
        <button class="btn btn--quiet" type="button" onclick={close}>Cancel</button>
        <span class="muted mono">at {formatLength(box.x)}, {formatLength(box.y)}</span>
      </div>
    </div>
  </form>
{/if}

<style>
  .dlg-backdrop { position: fixed; inset: 0; z-index: 40; background: color-mix(in srgb, var(--paper) 40%, transparent); }
  .dlg { position: fixed; z-index: 41; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(460px, 94vw); }
  .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
</style>
