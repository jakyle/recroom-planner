<script lang="ts">
  import type { DocumentStore } from '../model/store.svelte';
  import type { CanvasUi } from '../canvas/ui.svelte';
  import { formatLength } from '../geom/units';
  import { propsOf } from '../model/types';

  let { store, ui }: { store: DocumentStore; ui: CanvasUi } = $props();

  let shownId = $state<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    const id = ui.hoverId;
    if (timer) clearTimeout(timer);
    if (!id || ui.preview.size > 0) {
      shownId = null;
      return;
    }
    timer = setTimeout(() => (shownId = id), 400);
    return () => {
      if (timer) clearTimeout(timer);
    };
  });

  const o = $derived(shownId ? store.objects.get(shownId) : null);
  const p = $derived(o ? propsOf(o) : {});
  const layer = $derived(o ? store.layers.get(o.layer_id) : null);
</script>

{#if o}
  <div class="hover" data-test="hover-card" style={`left:${ui.hoverAt[0] + 14}px; top:${ui.hoverAt[1] + 14}px`}>
    <div class="hover__head">
      <strong>{o.name}</strong>
      <span class="muted">{layer?.name}</span>
    </div>
    <div class="mono">{formatLength(o.w)} × {formatLength(o.d)} × {formatLength(o.h)}</div>
    <div class="mono muted">z {formatLength(o.z)} · {o.mount.replace('_', ' ')}</div>
    {#if o.tags.length}<div class="hover__tags">{#each o.tags as t}<span class="chip">{t}</span>{/each}</div>{/if}
    {#if p.cost !== undefined || p.product_url}
      <div class="mono">{#if p.cost !== undefined}${p.cost.toLocaleString()}{/if}{#if p.product_url} · <a href={p.product_url} target="_blank" rel="noopener">link</a>{/if}</div>
    {/if}
    <div class="muted">0 comments</div>
  </div>
{/if}

<style>
  .hover {
    position: fixed; z-index: 30; pointer-events: none;
    min-width: 180px; max-width: 280px;
    background: var(--surface); border: 1px solid var(--rule); border-radius: var(--radius); box-shadow: var(--shadow);
    padding: 8px 10px; display: grid; gap: 3px; font-size: 12px;
  }
  .hover__head { display: flex; justify-content: space-between; gap: 10px; }
  .hover__tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
  .hover a { pointer-events: auto; }
</style>
