<script lang="ts">
  import { onMount } from 'svelte';
  import { envOk } from '../lib/supabase/client';
  import { ensureSession } from '../lib/supabase/auth';
  import { createProject, listMyProjects } from '../lib/supabase/projects';
  import { stashTokens } from '../lib/share';
  import { navigate } from '../lib/router';

  let name = $state('Pool room');
  let template = $state<'empty' | 'pool_room'>('empty');
  let busy = $state(false);
  let error = $state('');
  let mine = $state<Array<{ id: string; name: string; access: string }>>([]);

  onMount(async () => {
    if (!envOk) {
      error = 'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY';
      return;
    }
    try {
      await ensureSession();
      mine = await listMyProjects();
    } catch (e) {
      error = String((e as Error).message ?? e);
    }
  });

  async function create() {
    busy = true;
    error = '';
    try {
      const created = await createProject(name.trim(), template);
      stashTokens(created.project_id, { view: created.view_token, edit: created.edit_token });
      navigate({ name: 'project', projectId: created.project_id, scenarioId: null });
    } catch (e) {
      error = String((e as Error).message ?? e);
    } finally {
      busy = false;
    }
  }
</script>

<h1>Rec Room Planner</h1>
{#if error}<p class="error" data-test="error">{error}</p>{/if}

<section class="panel">
  <h2>New project</h2>
  <label>Name <input data-test="project-name" bind:value={name} /></label>
  <label>
    Start from
    <select data-test="template" bind:value={template}>
      <option value="empty">Empty room</option>
      <option value="pool_room">Pool room (63×29)</option>
    </select>
  </label>
  <button data-test="create" disabled={busy || !name.trim()} onclick={create}>Create</button>
</section>

<section class="panel">
  <h2>My projects</h2>
  {#if mine.length === 0}<p>None yet. Create one or open a link someone shared.</p>{/if}
  <ul>
    {#each mine as p (p.id)}
      <li><a href={`#/p/${p.id}`}>{p.name}</a> <small>({p.access})</small></li>
    {/each}
  </ul>
</section>

<p><a href="#/setup">Setup check</a></p>
