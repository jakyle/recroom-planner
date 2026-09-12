<script lang="ts">
  import type { CanvasUi, ToolName } from '../canvas/ui.svelte';

  let { ui, canEdit }: { ui: CanvasUi; canEdit: boolean } = $props();

  const tools: Array<{ name: ToolName; glyph: string; label: string; key: string; edit: boolean }> = [
    { name: 'select', glyph: '⌖', label: 'Select', key: 'V', edit: false },
    { name: 'pan', glyph: '✥', label: 'Pan', key: 'M', edit: false },
    { name: 'measure', glyph: '⟷', label: 'Measure', key: 'X', edit: false },
    { name: 'object', glyph: '▭', label: 'Object', key: 'O', edit: true },
    { name: 'text', glyph: 'T', label: 'Text note', key: 'T', edit: true },
    { name: 'walkway', glyph: '⇹', label: 'Walkway', key: 'W', edit: true },
  ];
  const later: Array<{ glyph: string; label: string }> = [
    { glyph: '▬', label: 'Wall · Phase P3' },
    { glyph: '⊓', label: 'Opening · Phase P3' },
    { glyph: '⟋', label: 'Run · Phase P5' },
    { glyph: '◫', label: 'Zone · Phase P6' },
    { glyph: '💬', label: 'Comment · Phase P4' },
  ];
</script>

<nav class="rail" aria-label="Tools">
  {#each tools as t (t.name)}
    <button
      class={`rail__tool ${ui.tool === t.name ? 'rail__tool--active' : ''}`}
      data-test={`tool-${t.name}`}
      title={`${t.label} (${t.key})`}
      aria-label={t.label}
      aria-pressed={ui.tool === t.name}
      disabled={t.edit && !canEdit}
      onclick={() => (ui.tool = t.name)}
    >{t.glyph}</button>
  {/each}
  <span class="rail__gap"></span>
  {#each later as t (t.label)}
    <span class="rail__tool rail__tool--later" title={t.label} aria-hidden="true">{t.glyph}</span>
  {/each}
</nav>
