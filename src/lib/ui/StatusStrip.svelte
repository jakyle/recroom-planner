<script lang="ts">
  import { theme, cycleTheme } from './theme.svelte';
  import type { CanvasUi } from '../canvas/ui.svelte';
  import type { Viewport } from '../canvas/viewport.svelte';
  import type { DocumentStore } from '../model/store.svelte';
  import { formatLength } from '../geom/units';

  let {
    live = 'offline',
    offlineLabel = 'offline',
    access = '',
    ui = null,
    viewport = null,
    store = null,
  }: {
    live?: 'online' | 'offline' | 'connecting';
    offlineLabel?: string;
    access?: string;
    ui?: CanvasUi | null;
    viewport?: Viewport | null;
    store?: DocumentStore | null;
  } = $props();

  const themeLabel = $derived({ system: 'theme: auto', light: 'theme: day', dark: 'theme: night' }[theme()]);
  const snapLabel = $derived(ui ? { grid: `snap 1'-0"`, fine: 'snap 1"', free: 'snap off' }[ui.snap] : `snap 1'-0"`);
</script>

<footer class="status" aria-label="Status">
  {#if ui}
    <span data-test="status-cursor">x {formatLength(ui.cursor[0])}  y {formatLength(ui.cursor[1])}</span>
    <button class="btn btn--quiet btn--sm" data-test="status-snap" title="Cycle snap mode (S)" onclick={() => ui.cycleSnap()}>{snapLabel}</button>
    <button class="btn btn--quiet btn--sm" data-test="status-grid" title="Toggle grid (G)" onclick={() => ui.toggleGrid()}>grid {ui.grid ? 'on' : 'off'}</button>
    {#if viewport}<span data-test="status-zoom">{viewport.pxPerFt.toFixed(0)} px/ft</span>{/if}
    {#if ui.readout}<span class="status__readout" data-test="status-readout">{ui.readout}</span>{/if}
  {:else}
    <span>x 0'-0"  y 0'-0"</span>
    <span>snap 1'-0"</span>
    <span>scale 1/4" = 1'-0"</span>
  {/if}
  <span class="status__spacer"></span>
  {#if store && store.unsynced.size > 0}<span class="status__warn" data-test="status-unsynced">{store.unsynced.size} unsaved</span>{/if}
  {#if store && store.pendingWrites > 0}<span class="muted">saving…</span>{/if}
  {#if access}<span>{access}</span>{/if}
  <span data-test="status-live">
    <span class={`dot ${live === 'online' ? 'dot--ok' : live === 'connecting' ? 'dot--warn' : ''}`}></span>{live === 'offline' ? offlineLabel : live}
  </span>
  <button class="btn btn--quiet btn--sm" onclick={cycleTheme}>{themeLabel}</button>
</footer>

<style>
  .status__readout { color: var(--blueprint); }
  .status__warn { color: var(--danger); }
</style>
