<script lang="ts">
  import { onMount } from 'svelte';
  import { ensureSession } from '../lib/supabase/auth';
  import { claimShareLink } from '../lib/supabase/members';
  import { navigate } from '../lib/router';
  import TitleBlock from '../lib/ui/TitleBlock.svelte';
  import StatusStrip from '../lib/ui/StatusStrip.svelte';

  let { token }: { token: string } = $props();
  let error = $state('');

  onMount(async () => {
    try {
      await ensureSession();
      const r = await claimShareLink(token);
      navigate({ name: 'project', projectId: r.project_id, scenarioId: null });
    } catch (e) {
      error = String((e as Error).message ?? e);
    }
  });
</script>

<div class="page">
  <TitleBlock revision="join">
    {#snippet title()}Rec Room Planner{/snippet}
  </TitleBlock>
  <div class="page__body">
    <section class="card">
      <div class="card__body">
        {#if error}
          <span class="label">Couldn't open this link</span>
          <p class="error" data-test="join-error">{error}</p>
          <p class="note">Ask the owner for a current link. Links stop working when the owner rotates them.</p>
          <div><a class="btn" href="#/">Back to your plans</a></div>
        {:else}
          <span class="label">Opening plan</span>
          <p class="note">Checking your link…</p>
        {/if}
      </div>
    </section>
  </div>
  <StatusStrip live={error ? 'offline' : 'connecting'} />
</div>
