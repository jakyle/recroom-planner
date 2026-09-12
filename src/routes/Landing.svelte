<script lang="ts">
  import { onMount } from 'svelte';
  import { envOk } from '../lib/supabase/client';
  import { ensureSession } from '../lib/supabase/auth';
  import { createProject, listMyProjects } from '../lib/supabase/projects';
  import { stashTokens } from '../lib/share';
  import { navigate } from '../lib/router';
  import TitleBlock from '../lib/ui/TitleBlock.svelte';
  import StatusStrip from '../lib/ui/StatusStrip.svelte';

  let name = $state('Pool room');
  let template = $state<'empty' | 'pool_room'>('empty');
  let busy = $state(false);
  let ready = $state(false);
  let error = $state('');
  let mine = $state<Array<{ id: string; name: string; access: string }>>([]);

  onMount(async () => {
    if (!envOk) {
      error = 'This build has no Supabase URL or key. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY and rebuild.';
      return;
    }
    try {
      await ensureSession();
      ready = true;
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

<div class="page">
  <TitleBlock revision="index">
    {#snippet title()}Rec Room Planner{/snippet}
    {#snippet actions()}<a class="btn btn--quiet btn--sm" href="#/setup">Setup check</a>{/snippet}
  </TitleBlock>

  <div class="page__body">
    <div class="hero">
      <h1>Plan the room together.</h1>
      <p class="dims">63'-0" × 29'-0" · 9'-4" ceiling · rec room + gym</p>
      <p class="note">Layered plan, live with whoever holds the link, printable at 1/4" = 1'-0".</p>
    </div>

    {#if error}<p class="error" data-test="error">{error}</p>{/if}

    <section class="card">
      <div class="card__body">
        <span class="label">Start a plan</span>
        <div class="row">
          <label class="field grow">
            <span class="label">Name</span>
            <input class="input" data-test="project-name" bind:value={name} />
          </label>
          <label class="field">
            <span class="label">Start from</span>
            <select class="select" data-test="template" bind:value={template}>
              <option value="empty">Empty room</option>
              <option value="pool_room">Pool room (63×29)</option>
            </select>
          </label>
        </div>
        <div class="row">
          <button class="btn btn--primary" data-test="create" disabled={busy || !ready || !name.trim()} onclick={create}>
            {busy ? 'Creating…' : 'Create plan'}
          </button>
          <span class="muted">You get a view link and an edit link to hand out.</span>
        </div>
      </div>
    </section>

    <section class="card">
      <div class="card__body">
        <span class="label">Your plans</span>
        {#if mine.length === 0}
          <p class="note">None on this browser yet. Create one above, or open a link someone sent you.</p>
        {:else}
          <ul class="list">
            {#each mine as p (p.id)}
              <li class="list__item">
                <a href={`#/p/${p.id}`}>{p.name}</a>
                <span class={`chip chip--${p.access}`}>{p.access}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </section>
  </div>

  <StatusStrip live={ready ? 'online' : 'connecting'} />
</div>
