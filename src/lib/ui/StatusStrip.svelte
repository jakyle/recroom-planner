<script lang="ts">
  import { theme, cycleTheme } from './theme.svelte';

  let {
    live = 'offline',
    access = '',
  }: { live?: 'online' | 'offline' | 'connecting'; access?: string } = $props();

  const themeLabel = $derived({ system: 'theme: auto', light: 'theme: day', dark: 'theme: night' }[theme()]);
</script>

<footer class="status" aria-label="Status">
  <span title="Cursor position (plan view arrives in P1)">x 0'-0"  y 0'-0"</span>
  <span>snap 1'-0"</span>
  <span>scale 1/4" = 1'-0"</span>
  <span class="status__spacer"></span>
  {#if access}<span>{access}</span>{/if}
  <span>
    <span class={`dot ${live === 'online' ? 'dot--ok' : live === 'connecting' ? 'dot--warn' : ''}`}></span>{live}
  </span>
  <button class="btn btn--quiet btn--sm" onclick={cycleTheme}>{themeLabel}</button>
</footer>
