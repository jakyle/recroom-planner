<script lang="ts">
  import { onMount } from 'svelte';
  import { ensureSession } from '../lib/supabase/auth';
  import { claimShareLink } from '../lib/supabase/members';
  import { navigate } from '../lib/router';

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

<h1>Joining…</h1>
{#if error}
  <p class="error" data-test="join-error">{error}</p>
  <p><a href="#/">Home</a></p>
{/if}
