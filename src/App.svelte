<script lang="ts">
  import { route } from './lib/router.svelte';
  import Landing from './routes/Landing.svelte';
  import Join from './routes/Join.svelte';
  import Project from './routes/Project.svelte';
  import Setup from './routes/Setup.svelte';
  import NotFound from './routes/NotFound.svelte';

  const r = $derived(route());
</script>

<main>
  {#if r.name === 'landing'}
    <Landing />
  {:else if r.name === 'join'}
    <Join token={r.token} />
  {:else if r.name === 'project'}
    {#key r.projectId}
      <Project projectId={r.projectId} scenarioId={r.scenarioId} />
    {/key}
  {:else if r.name === 'setup'}
    <Setup />
  {:else}
    <NotFound hash={r.hash} />
  {/if}
</main>
