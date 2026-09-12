<script lang="ts">
  import TitleBlock from '../lib/ui/TitleBlock.svelte';
  import StatusStrip from '../lib/ui/StatusStrip.svelte';
  let { hash }: { hash: string } = $props();
</script>

<div class="page">
  <TitleBlock revision="404">
    {#snippet title()}Rec Room Planner{/snippet}
  </TitleBlock>
  <div class="page__body">
    <section class="card">
      <div class="card__body">
        <span class="label">Nothing here</span>
        <p class="note">No page at <code>{hash}</code>.</p>
        <div><a class="btn" href="#/">Back to your plans</a></div>
      </div>
    </section>
  </div>
  <StatusStrip live="offline" />
</div>
