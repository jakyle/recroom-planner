<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    title,
    scenario = '',
    revision = '',
    people,
    actions,
  }: {
    title: Snippet;
    scenario?: string;
    revision?: string;
    people?: Snippet;
    actions?: Snippet;
  } = $props();

  const today = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
</script>

<header class="tb" aria-label="Title block">
  <div class="tb__cell tb__cell--home"><a href="#/" title="All plans">⌂</a></div>
  <div class="tb__cell">
    <span class="label">Project</span>
    <div class="tb__value">{@render title()}</div>
  </div>
  <div class="tb__cell tb__cell--scenario">
    <span class="label">Scenario</span>
    <div class="tb__value">{scenario || '—'}</div>
  </div>
  <div class="tb__cell tb__cell--rev">
    <span class="label">Rev · Date</span>
    <div class="tb__value tb__value--mono">{revision || 'r0'} · {today}</div>
  </div>
  <div class="tb__cell tb__cell--people">
    <span class="label">Drawn by</span>
    <div class="tb__people">{#if people}{@render people()}{:else}<span class="muted">—</span>{/if}</div>
  </div>
  <div class="tb__cell tb__actions">{#if actions}{@render actions()}{/if}</div>
</header>
