<script lang="ts">
  import type { DocumentStore } from '../model/store.svelte';
  import Panel from './Panel.svelte';

  let { store, canEdit }: { store: DocumentStore; canEdit: boolean } = $props();

  type Preset = { name: string; keys: string[] | null };
  const builtinPresets: Preset[] = [
    { name: 'All layers', keys: null },
    { name: 'Contractor: electrical', keys: ['walls', 'electrical', 'lighting', 'utility'] },
    { name: 'Radiant', keys: ['walls', 'flooring', 'utility'] },
    { name: 'Furnish', keys: ['walls', 'furnishing', 'gym', 'sound', 'annotations'] },
  ];
  let presets = $state<Preset[]>(loadPresets());

  function loadPresets(): Preset[] {
    try {
      const raw = localStorage.getItem('rr.layer-presets');
      return raw ? (JSON.parse(raw) as Preset[]) : builtinPresets;
    } catch {
      return builtinPresets;
    }
  }
  function savePresetFromCurrent() {
    const name = prompt('Name this layer view');
    if (!name) return;
    const keys = [...store.layers.values()].filter((l) => store.isLayerVisible(l.id)).map((l) => l.key);
    presets = [...presets.filter((p) => p.name !== name), { name, keys }];
    try {
      localStorage.setItem('rr.layer-presets', JSON.stringify(presets));
    } catch {
      /* ignore */
    }
  }

  const layers = $derived([...store.layers.values()].sort((a, b) => a.sort - b.sort));
  const counts = $derived.by(() => {
    const c = new Map<string, number>();
    for (const o of store.objects.values()) c.set(o.layer_id, (c.get(o.layer_id) ?? 0) + 1);
    return c;
  });

  function onEye(e: MouseEvent, id: string) {
    if (e.altKey) store.soloLayer(id);
    else store.setLayerVisible(id, !store.isLayerVisible(id));
  }
</script>

<Panel title="Layers" testId="layers-panel">
  {#snippet actions()}
    <select class="select" style="padding:2px 6px;font-size:11px" aria-label="Layer view preset" onchange={(e) => { const p = presets.find((x) => x.name === (e.currentTarget as HTMLSelectElement).value); if (p) store.applyVisibilityPreset(p.keys); }}>
      <option value="">View…</option>
      {#each presets as p (p.name)}<option value={p.name}>{p.name}</option>{/each}
    </select>
    <button class="btn btn--quiet btn--sm" title="Save current visibility as a view" onclick={savePresetFromCurrent}>＋</button>
  {/snippet}
  <ul class="list layers">
    {#each layers as l (l.id)}
      {@const ui = store.layerUi.get(l.id) ?? { visible: true, opacity: 1 }}
      <li class="list__item layer" class:layer--active={store.activeLayerId === l.id} data-test="layer-row" data-key={l.key}>
        <button class="layer__eye" data-test="layer-eye" title="Show / hide (Alt-click: solo)" aria-pressed={ui.visible} onclick={(e) => onEye(e, l.id)}>{ui.visible ? '●' : '○'}</button>
        <button class="layer__lock" data-test="layer-lock" title={l.locked ? 'Unlock layer (shared)' : 'Lock layer (shared)'} aria-pressed={l.locked} disabled={!canEdit} onclick={() => store.setLayerLocked(l.id, !l.locked)}>{l.locked ? '🔒' : '🔓'}</button>
        <span class="layer__swatch" style={`background:${l.color}`}></span>
        <button class="layer__name" data-test="layer-name" title="Make active layer" onclick={() => (store.activeLayerId = l.id)}>{l.name}</button>
        <span class="layer__count mono">{counts.get(l.id) ?? 0}</span>
        <input class="layer__opacity" type="range" min="0.1" max="1" step="0.1" value={ui.opacity} aria-label={`${l.name} opacity`} oninput={(e) => store.setLayerOpacity(l.id, Number((e.currentTarget as HTMLInputElement).value))} />
      </li>
    {/each}
  </ul>
</Panel>

<style>
  .layers { gap: 0; }
  .layer { padding: 4px 6px; gap: 6px; }
  .layer--active { background: var(--blueprint-soft); }
  .layer__eye, .layer__lock, .layer__name {
    background: none; border: 0; padding: 2px 4px; cursor: pointer; color: var(--ink); font: inherit; text-align: left;
  }
  .layer__eye { color: var(--blueprint); width: 22px; }
  .layer__eye[aria-pressed='false'] { color: var(--ink-3); }
  .layer__lock { font-size: 11px; width: 24px; filter: grayscale(1); opacity: 0.7; }
  .layer__lock[aria-pressed='true'] { opacity: 1; filter: none; }
  .layer__swatch { width: 10px; height: 10px; border-radius: 2px; flex: none; }
  .layer__name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .layer--active .layer__name { font-weight: 600; }
  .layer__count { color: var(--ink-3); font-size: 11px; min-width: 18px; text-align: right; }
  .layer__opacity { width: 52px; accent-color: var(--blueprint); }
</style>
