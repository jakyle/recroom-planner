<script lang="ts">
  import type { DocumentStore } from '../model/store.svelte';

  let { store }: { store: DocumentStore } = $props();

  const AUTO_DISMISS_MS = 6000;
  const scheduled = new Set<number>();

  $effect(() => {
    for (const n of store.notices) {
      if (n.action || scheduled.has(n.id)) continue;
      scheduled.add(n.id);
      setTimeout(() => {
        scheduled.delete(n.id);
        store.dismiss(n.id);
      }, AUTO_DISMISS_MS);
    }
  });
</script>

{#if store.notices.length > 0}
  <div class="toasts" aria-live="polite">
    {#each store.notices as n (n.id)}
      <div class="toast" data-test="toast" role="status">
        <span>{n.text}</span>
        {#if n.action}<button class="btn btn--sm btn--primary" data-test="toast-action" onclick={n.action.run}>{n.action.label}</button>{/if}
        <button class="btn btn--sm btn--quiet" aria-label="Dismiss" onclick={() => store.dismiss(n.id)}>×</button>
      </div>
    {/each}
  </div>
{/if}
