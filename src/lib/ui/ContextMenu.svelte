<script lang="ts">
  import type { DocumentStore } from '../model/store.svelte';
  import type { CanvasUi } from '../canvas/ui.svelte';

  let { store, ui, canEdit }: { store: DocumentStore; ui: CanvasUi; canEdit: boolean } = $props();

  const ids = $derived([...store.selection]);
  const selected = $derived(store.selectedObjects());
  const grouped = $derived(selected.some((o) => o.group_id));
  const layers = $derived([...store.layers.values()].sort((a, b) => a.sort - b.sort));
  let showLayers = $state(false);

  function close() {
    ui.contextMenu = null;
    showLayers = false;
  }
  function run(fn: () => unknown) {
    fn();
    close();
  }
  function addTag() {
    const t = prompt('Tag');
    if (t) void store.updateObjects(ids, (o) => (o.tags.includes(t.toLowerCase()) ? {} : { tags: [...o.tags, t.trim().toLowerCase()] }), 'tag');
  }
</script>

{#if ui.contextMenu}
  <div class="cm-backdrop" role="presentation" onpointerdown={close} oncontextmenu={(e) => { e.preventDefault(); close(); }}></div>
  <ul class="cm" role="menu" data-test="context-menu" style={`left:${ui.contextMenu.x}px; top:${ui.contextMenu.y}px`}>
    <li><button role="menuitem" disabled={!canEdit} onclick={() => run(() => store.duplicateObjects(ids))}>Duplicate <kbd>Ctrl+D</kbd></button></li>
    {#if grouped}
      <li><button role="menuitem" disabled={!canEdit} onclick={() => run(() => store.ungroupSelected())}>Ungroup <kbd>Ctrl+Shift+G</kbd></button></li>
    {:else}
      <li><button role="menuitem" disabled={!canEdit || ids.length < 2} onclick={() => run(() => store.groupSelected())}>Group <kbd>Ctrl+G</kbd></button></li>
    {/if}
    <li><button role="menuitem" disabled={!canEdit} onclick={() => run(() => store.updateObjects(ids, (o) => ({ locked: !o.locked }), 'lock'))}>{selected.every((o) => o.locked) ? 'Unlock' : 'Lock'}</button></li>
    <li class="cm__sub">
      <button role="menuitem" disabled={!canEdit} aria-haspopup="true" onclick={() => (showLayers = !showLayers)}>Send to layer ▸</button>
      {#if showLayers}
        <ul class="cm cm--nested" role="menu">
          {#each layers as l (l.id)}
            <li><button role="menuitem" onclick={() => run(() => store.updateObjects(ids, () => ({ layer_id: l.id }), 'layer'))}><span class="sw" style={`background:${l.color}`}></span>{l.name}</button></li>
          {/each}
        </ul>
      {/if}
    </li>
    <li><button role="menuitem" disabled={!canEdit} onclick={() => run(addTag)}>Add tag…</button></li>
    <li><button role="menuitem" disabled title="Phase P4">Save to library</button></li>
    <li><button role="menuitem" disabled title="Phase P4">Add comment</button></li>
    <li class="cm__rule"></li>
    <li><button role="menuitem" disabled={!canEdit} onclick={() => run(() => store.reorder(ids, 'front'))}>Bring to front</button></li>
    <li><button role="menuitem" disabled={!canEdit} onclick={() => run(() => store.reorder(ids, 'back'))}>Send to back</button></li>
    <li class="cm__rule"></li>
    <li><button role="menuitem" class="danger" disabled={!canEdit} onclick={() => run(() => store.deleteObjects(ids))}>Delete <kbd>Del</kbd></button></li>
  </ul>
{/if}

<style>
  .cm-backdrop { position: fixed; inset: 0; z-index: 40; }
  .cm {
    position: fixed; z-index: 41; list-style: none; margin: 0; padding: 4px; min-width: 180px;
    background: var(--surface); border: 1px solid var(--rule); border-radius: var(--radius); box-shadow: var(--shadow);
  }
  .cm--nested { position: absolute; left: 100%; top: -4px; }
  .cm__sub { position: relative; }
  .cm button {
    width: 100%; display: flex; justify-content: space-between; align-items: center; gap: 12px;
    background: none; border: 0; padding: 6px 10px; border-radius: 4px; text-align: left;
    font: inherit; color: var(--ink); cursor: pointer;
  }
  .cm button:hover:not(:disabled) { background: var(--blueprint-soft); }
  .cm button:disabled { color: var(--ink-3); cursor: default; }
  .cm button.danger { color: var(--danger); }
  .cm kbd { font: 500 10px/1 var(--font-mono); color: var(--ink-3); }
  .cm__rule { border-top: 1px solid var(--rule); margin: 4px 0; }
  .sw { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 6px; }
</style>
