<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    title,
    testId = undefined,
    actions,
    children,
  }: { title: string; testId?: string; actions?: Snippet; children: Snippet } = $props();
</script>

<section class="panel" data-test={testId}>
  <div class="panel__head">
    <h2>{title}</h2>
    <span class="spacer"></span>
    {#if actions}{@render actions()}{/if}
  </div>
  <div class="panel__body">{@render children()}</div>
</section>
