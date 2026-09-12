<script lang="ts">
  import { onMount } from 'svelte';
  import type { Session } from '@supabase/supabase-js';
  import { ensureSession, isAnonymous, linkGoogle } from '../lib/supabase/auth';
  import { getProject, renameProject, type ProjectRow } from '../lib/supabase/projects';
  import {
    listMembers,
    myMembership,
    rotateShareLink,
    setDisplayName,
    setMemberAccess,
    removeMember,
    touchLastSeen,
    type MemberRow,
  } from '../lib/supabase/members';
  import { listScenarios, forkScenario, promoteScenario, type ScenarioRow } from '../lib/supabase/scenarios';
  import { joinUrl, readTokens, stashTokens, type TokenPair } from '../lib/share';
  import { navigate } from '../lib/router';

  let { projectId, scenarioId }: { projectId: string; scenarioId: string | null } = $props();

  let session = $state<Session | null>(null);
  let project = $state<ProjectRow | null>(null);
  let me = $state<MemberRow | null>(null);
  let members = $state<MemberRow[]>([]);
  let scenarios = $state<ScenarioRow[]>([]);
  let error = $state('');
  let nameDraft = $state('');
  let projectNameDraft = $state('');
  let googleDismissed = $state(false);
  let copied = $state('');
  let tokens = $state<TokenPair | null>(null);

  const isOwner = $derived(me?.access === 'owner');
  const canEdit = $derived(me?.access === 'owner' || me?.access === 'edit');
  const current = $derived(scenarios.find((s) => s.id === scenarioId) ?? null);
  const kinds = ['view', 'edit'] as const;

  onMount(load);

  async function load() {
    error = '';
    tokens = readTokens(projectId);
    try {
      session = await ensureSession();
      me = await myMembership(projectId);
      if (!me) {
        error = 'You are not a member of this project. Open the link you were given.';
        return;
      }
      project = await getProject(projectId);
      projectNameDraft = project.name;
      scenarios = await listScenarios(projectId);
      if (me.access === 'owner') members = await listMembers(projectId);
      if (!scenarioId) {
        const primary = scenarios.find((s) => s.is_primary) ?? scenarios[0];
        if (primary) navigate({ name: 'project', projectId, scenarioId: primary.id });
      }
      void touchLastSeen(projectId);
    } catch (e) {
      error = String((e as Error).message ?? e);
    }
  }

  async function saveName() {
    await setDisplayName(projectId, nameDraft);
    me = await myMembership(projectId);
  }

  async function saveProjectName() {
    if (!project || projectNameDraft.trim() === project.name) return;
    await renameProject(projectId, projectNameDraft.trim());
    project = await getProject(projectId);
  }

  async function copy(kind: 'view' | 'edit') {
    const t = tokens?.[kind];
    if (!t) return;
    await navigator.clipboard.writeText(joinUrl(t));
    copied = kind;
    setTimeout(() => (copied = ''), 1500);
  }

  async function rotate(kind: 'view' | 'edit') {
    if (!confirm(`Rotate the ${kind} link? The old one stops working immediately.`)) return;
    const t = await rotateShareLink(projectId, kind);
    stashTokens(projectId, { [kind]: t });
    tokens = readTokens(projectId);
  }

  async function fork() {
    if (!current) return;
    const name = prompt('Name for the new scenario', `Copy of ${current.name}`);
    if (!name) return;
    const id = await forkScenario(current.id, name);
    scenarios = await listScenarios(projectId);
    navigate({ name: 'project', projectId, scenarioId: id });
  }

  async function promote(id: string) {
    await promoteScenario(id);
    scenarios = await listScenarios(projectId);
  }

  async function changeAccess(userId: string, access: 'view' | 'edit') {
    await setMemberAccess(projectId, userId, access);
    members = await listMembers(projectId);
  }

  async function remove(userId: string) {
    if (!confirm('Remove this member?')) return;
    await removeMember(projectId, userId);
    members = await listMembers(projectId);
  }
</script>

{#if error}
  <p class="error" data-test="error">{error}</p>
  <p><a href="#/">Home</a></p>
{:else if project && me}
  <header>
    <a href="#/">←</a>
    {#if isOwner}
      <input data-test="project-name" bind:value={projectNameDraft} onblur={saveProjectName} />
    {:else}
      <h1 data-test="project-name">{project.name}</h1>
    {/if}
    <span data-test="my-access">{me.access}</span>
    {#if me.display_name}<span data-test="my-name" style={`color:${me.color}`}>{me.display_name}</span>{/if}
  </header>

  {#if !me.display_name}
    <section class="panel" data-test="name-dialog">
      <h2>What should we call you?</h2>
      <input data-test="display-name" bind:value={nameDraft} placeholder="Your name" />
      <button data-test="save-name" disabled={!nameDraft.trim()} onclick={saveName}>Save</button>
    </section>
  {/if}

  {#if isOwner && session && isAnonymous(session) && !googleDismissed}
    <div class="banner" data-test="google-banner">
      You own this project with a browser-only identity. Link a Google account so you don't lose it.
      <button onclick={linkGoogle}>Link Google</button>
      <button onclick={() => (googleDismissed = true)}>Later</button>
    </div>
  {/if}

  {#if isOwner}
    <section class="panel" data-test="share-panel">
      <h2>Share</h2>
      {#each kinds as kind (kind)}
        <div>
          <strong>{kind} link</strong>
          {#if tokens?.[kind]}
            <code data-test={`${kind}-link`} data-url={joinUrl(tokens[kind]!)}>{joinUrl(tokens[kind]!)}</code>
            <button onclick={() => copy(kind)}>{copied === kind ? 'Copied' : 'Copy'}</button>
          {:else}
            <em>not available in this browser — rotate to get a new one</em>
          {/if}
          <button data-test={`rotate-${kind}`} onclick={() => rotate(kind)}>Rotate</button>
        </div>
      {/each}
    </section>

    <section class="panel" data-test="members-panel">
      <h2>Members</h2>
      <table>
        <thead><tr><th>Name</th><th>Access</th><th>Last seen</th><th></th></tr></thead>
        <tbody>
          {#each members as m (m.user_id)}
            <tr data-test="member-row">
              <td style={`color:${m.color}`}>{m.display_name || '(unnamed)'}</td>
              <td>
                {#if m.access === 'owner'}
                  owner
                {:else}
                  <select
                    value={m.access}
                    onchange={(e) => changeAccess(m.user_id, (e.currentTarget as HTMLSelectElement).value as 'view' | 'edit')}
                  >
                    <option value="view">view</option>
                    <option value="edit">edit</option>
                  </select>
                {/if}
              </td>
              <td>{new Date(m.last_seen_at).toLocaleString()}</td>
              <td>{#if m.access !== 'owner'}<button onclick={() => remove(m.user_id)}>Remove</button>{/if}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/if}

  <section class="panel" data-test="scenarios-panel">
    <h2>Scenarios</h2>
    <ul>
      {#each scenarios.filter((s) => !s.archived) as s (s.id)}
        <li>
          <a href={`#/p/${projectId}/s/${s.id}`} data-test="scenario-link" aria-current={s.id === scenarioId}>{s.name}</a>
          {#if s.is_primary}
            <strong> ★ primary</strong>
          {:else if canEdit}
            <button onclick={() => promote(s.id)}>Promote</button>
          {/if}
        </li>
      {/each}
    </ul>
    {#if canEdit && current}<button data-test="fork" onclick={fork}>Fork "{current.name}"</button>{/if}
  </section>

  <section class="panel">
    <p><em>Canvas arrives in Phase P1.</em></p>
  </section>
{:else}
  <p>Loading…</p>
{/if}
