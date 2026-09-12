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
  import { supabaseRepo } from '../lib/supabase/repo';
  import { joinUrl, readTokens, stashTokens, type TokenPair } from '../lib/share';
  import { navigate } from '../lib/router';
  import { DocumentStore } from '../lib/model/store.svelte';
  import { Viewport } from '../lib/canvas/viewport.svelte';
  import { CanvasUi } from '../lib/canvas/ui.svelte';
  import { handleKeyDown, handleKeyUp, SHORTCUTS } from '../lib/canvas/keys';
  import Plan from '../lib/canvas/Plan.svelte';
  import TitleBlock from '../lib/ui/TitleBlock.svelte';
  import StatusStrip from '../lib/ui/StatusStrip.svelte';
  import Panel from '../lib/ui/Panel.svelte';
  import Avatar from '../lib/ui/Avatar.svelte';
  import ToolRail from '../lib/ui/ToolRail.svelte';
  import LayersPanel from '../lib/ui/LayersPanel.svelte';
  import Inspector from '../lib/ui/Inspector.svelte';
  import ObjectsPanel from '../lib/ui/ObjectsPanel.svelte';
  import HoverCard from '../lib/ui/HoverCard.svelte';
  import ContextMenu from '../lib/ui/ContextMenu.svelte';
  import ObjectDialog from '../lib/ui/ObjectDialog.svelte';
  import UnderlayPanel from '../lib/ui/UnderlayPanel.svelte';
  import { signedImageUrl } from '../lib/supabase/storage';
  import type { Underlay } from '../lib/supabase/settings';

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
  let dockTab = $state<'plan' | 'project'>('plan');
  let showHelp = $state(false);
  let plan = $state<Plan | null>(null);
  let underlay = $state<Underlay | null>(null);
  let underlayUrl = $state('');

  $effect(() => {
    const path = underlay?.path;
    if (!path) {
      underlayUrl = '';
      return;
    }
    let cancelled = false;
    void signedImageUrl(path).then((u) => {
      if (!cancelled) underlayUrl = u;
    });
    return () => {
      cancelled = true;
    };
  });

  const store = new DocumentStore(supabaseRepo);
  const viewport = new Viewport();
  const ui = new CanvasUi();

  const isOwner = $derived(me?.access === 'owner');
  const canEdit = $derived(me?.access === 'owner' || me?.access === 'edit');
  const current = $derived(scenarios.find((s) => s.id === scenarioId) ?? null);
  const kinds = ['view', 'edit'] as const;

  onMount(() => {
    void load();
    const down = (e: KeyboardEvent) =>
      handleKeyDown(e, {
        store,
        ui,
        viewport,
        canEdit,
        selectTool: () => plan!.selectTool(),
        objectsAt: (p) => plan?.objectsAt(p) ?? [],
        fit: () => plan?.fit(),
      });
    const up = (e: KeyboardEvent) => handleKeyUp(e, ui);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  });

  $effect(() => {
    if (scenarioId && me && store.scenarioId !== scenarioId) void store.load(projectId, scenarioId);
  });

  async function load() {
    error = '';
    tokens = readTokens(projectId);
    try {
      session = await ensureSession();
      me = await myMembership(projectId);
      if (!me) {
        error = "You're not on this plan. Open the link its owner sent you.";
        return;
      }
      project = await getProject(projectId);
      projectNameDraft = project.name;
      underlay = ((project.settings as Record<string, unknown>)?.underlay as Underlay | undefined) ?? null;
      scenarios = await listScenarios(projectId);
      members = await listMembers(projectId);
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
    members = await listMembers(projectId);
  }

  async function saveProjectName() {
    if (!project || projectNameDraft.trim() === project.name || !projectNameDraft.trim()) return;
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
    if (!confirm('Remove this person from the plan?')) return;
    await removeMember(projectId, userId);
    members = await listMembers(projectId);
  }
</script>

{#if error}
  <div class="page">
    <TitleBlock revision="—">
      {#snippet title()}Rec Room Planner{/snippet}
    </TitleBlock>
    <div class="page__body">
      <section class="card">
        <div class="card__body">
          <span class="label">No access</span>
          <p class="error" data-test="error">{error}</p>
          <div><a class="btn" href="#/">Back to your plans</a></div>
        </div>
      </section>
    </div>
    <StatusStrip live="offline" />
  </div>
{:else if project && me}
  <div class="shell">
    <TitleBlock scenario={current?.name ?? ''} revision={`r${project.version}`}>
      {#snippet title()}
        {#if isOwner}
          <input class="input input--title" data-test="project-name" bind:value={projectNameDraft} onblur={saveProjectName} aria-label="Project name" />
        {:else}
          <span data-test="project-name">{project?.name}</span>
        {/if}
      {/snippet}
      {#snippet people()}
        <span class="avatars">
          {#each members as m (m.user_id)}
            <Avatar name={m.display_name || '?'} color={m.color} title={`${m.display_name || 'unnamed'} · ${m.access}`} />
          {/each}
        </span>
        {#if me?.display_name}<span class="mono" data-test="my-name" style={`color:${me.color}`}>{me.display_name}</span>{/if}
      {/snippet}
      {#snippet actions()}
        <span class={`chip chip--${me?.access}`} data-test="my-access">{me?.access}</span>
        <button class="btn btn--quiet btn--sm" title="Undo (Ctrl+Z)" disabled={!canEdit || store.undoStack.length === 0} onclick={() => store.undo()}>↶</button>
        <button class="btn btn--quiet btn--sm" title="Redo (Ctrl+Shift+Z)" disabled={!canEdit || store.redoStack.length === 0} onclick={() => store.redo()}>↷</button>
        <button class="btn btn--quiet btn--sm" title="Shortcuts (?)" onclick={() => (showHelp = !showHelp)}>?</button>
        {#if canEdit && current}<button class="btn btn--sm" data-test="fork" onclick={fork}>Fork</button>{/if}
      {/snippet}
    </TitleBlock>

    <div>
      {#if isOwner && session && isAnonymous(session) && !googleDismissed}
        <div class="banner" data-test="google-banner">
          <span>This plan is tied to this browser only. Link a Google account so you can't lose it.</span>
          <button class="btn btn--sm btn--primary" onclick={linkGoogle}>Link Google</button>
          <button class="btn btn--sm btn--quiet" onclick={() => (googleDismissed = true)}>Later</button>
        </div>
      {/if}
      {#if store.error}
        <div class="banner" data-test="store-error"><span class="error">{store.error}</span><button class="btn btn--sm btn--quiet" onclick={() => (store.error = '')}>Dismiss</button></div>
      {/if}
    </div>

    <div class="shell__main">
      <ToolRail {ui} {canEdit} />

      <div class="paper paper--canvas">
        {#if scenarioId && !store.loading && store.scenarioId === scenarioId}
          <Plan bind:this={plan} {store} {viewport} {ui} {canEdit} {underlay} {underlayUrl} />
        {:else}
          <div class="paper__note"><strong>{current?.name ?? project.name}</strong>loading plan…</div>
        {/if}
        {#if !me.display_name}
          <div class="paper__overlay">
            <section class="card modal" data-test="name-dialog">
              <div class="card__body">
                <span class="label">Before you draw</span>
                <h2>What should we call you?</h2>
                <p class="note">Your name sits on your cursor, your comments, and the title block.</p>
                <input class="input" data-test="display-name" bind:value={nameDraft} placeholder="Your name" onkeydown={(e) => e.key === 'Enter' && nameDraft.trim() && saveName()} />
                <div><button class="btn btn--primary" data-test="save-name" disabled={!nameDraft.trim()} onclick={saveName}>Save name</button></div>
              </div>
            </section>
          </div>
        {/if}
        {#if showHelp}
          <div class="paper__overlay" role="presentation" onpointerdown={() => (showHelp = false)}>
            <div class="card modal" role="dialog" aria-label="Shortcuts" tabindex="-1" onpointerdown={(e) => e.stopPropagation()}>
              <div class="card__body">
                <span class="label">Shortcuts</span>
                <table class="tbl">
                  <tbody>{#each SHORTCUTS as [k, v] (k)}<tr><td class="mono">{k}</td><td>{v}</td></tr>{/each}</tbody>
                </table>
              </div>
            </div>
          </div>
        {/if}
      </div>

      <aside class="dock">
        <div class="dock__tabs" role="tablist">
          <button role="tab" class:active={dockTab === 'plan'} aria-selected={dockTab === 'plan'} data-test="tab-plan" onclick={() => (dockTab = 'plan')}>Plan</button>
          <button role="tab" class:active={dockTab === 'project'} aria-selected={dockTab === 'project'} data-test="tab-project" onclick={() => (dockTab = 'project')}>Project</button>
        </div>

        {#if dockTab === 'plan'}
          <Inspector {store} {canEdit} />
          <LayersPanel {store} {canEdit} />
          <ObjectsPanel {store} {viewport} {canEdit} />
          <UnderlayPanel {projectId} {underlay} {canEdit} onchange={(u) => (underlay = u)} />
        {:else}
          <Panel title="Scenarios" testId="scenarios-panel">
            <ul class="list">
              {#each scenarios.filter((s) => !s.archived) as s (s.id)}
                <li class="list__item" aria-current={s.id === scenarioId}>
                  <a href={`#/p/${projectId}/s/${s.id}`} data-test="scenario-link">{s.name}</a>
                  {#if s.is_primary}
                    <span class="star" title="Primary scenario (exports use this one)">★ primary</span>
                  {:else if canEdit}
                    <button class="btn btn--quiet btn--sm" onclick={() => promote(s.id)}>Make primary</button>
                  {/if}
                </li>
              {/each}
            </ul>
          </Panel>

          {#if isOwner}
            <Panel title="Share links" testId="share-panel">
              {#each kinds as kind (kind)}
                <div class="field">
                  <span class="label">{kind === 'view' ? 'View only' : 'Can edit'}</span>
                  <div class="linkbox">
                    {#if tokens?.[kind]}
                      <code data-test={`${kind}-link`} data-url={joinUrl(tokens[kind]!)}>{joinUrl(tokens[kind]!)}</code>
                      <button class="btn btn--sm" onclick={() => copy(kind)}>{copied === kind ? 'Copied' : 'Copy'}</button>
                    {:else}
                      <code class="muted">Not on this browser. Rotate to get a new link.</code>
                      <span></span>
                    {/if}
                    <button class="btn btn--sm btn--quiet" data-test={`rotate-${kind}`} onclick={() => rotate(kind)} title="Old link stops working">Rotate</button>
                  </div>
                </div>
              {/each}
            </Panel>

            <Panel title="People" testId="members-panel">
              <table class="tbl">
                <thead><tr><th>Name</th><th>Access</th><th>Last seen</th><th></th></tr></thead>
                <tbody>
                  {#each members as m (m.user_id)}
                    <tr data-test="member-row">
                      <td><span class="row"><Avatar name={m.display_name || '?'} color={m.color} /> {m.display_name || '(unnamed)'}</span></td>
                      <td>
                        {#if m.access === 'owner'}
                          <span class="chip chip--owner">owner</span>
                        {:else}
                          <select class="select" value={m.access} onchange={(e) => changeAccess(m.user_id, (e.currentTarget as HTMLSelectElement).value as 'view' | 'edit')}>
                            <option value="view">view</option>
                            <option value="edit">edit</option>
                          </select>
                        {/if}
                      </td>
                      <td class="mono">{new Date(m.last_seen_at).toLocaleDateString(undefined, { month: 'short', day: '2-digit' })}</td>
                      <td>{#if m.access !== 'owner'}<button class="btn btn--quiet btn--sm btn--danger" onclick={() => remove(m.user_id)}>Remove</button>{/if}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </Panel>
          {/if}
        {/if}
      </aside>
    </div>

    <StatusStrip live="online" access={me.access} {ui} {viewport} {store} />
    <HoverCard {store} {ui} />
    <ContextMenu {store} {ui} {canEdit} />
    <ObjectDialog {store} {ui} />
  </div>
{:else}
  <div class="page">
    <TitleBlock>
      {#snippet title()}Loading…{/snippet}
    </TitleBlock>
    <div class="page__body"><p class="note">Opening the plan…</p></div>
    <StatusStrip live="connecting" />
  </div>
{/if}

<style>
  .paper--canvas { background-image: none; }
  .dock__tabs { display: flex; border-bottom: 1px solid var(--rule); }
  .dock__tabs button {
    flex: 1; background: none; border: 0; padding: 8px; cursor: pointer; font: 600 11px/1 var(--font-ui);
    letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-3); border-bottom: 2px solid transparent;
  }
  .dock__tabs button.active { color: var(--blueprint); border-bottom-color: var(--blueprint); }
</style>
