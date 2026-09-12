<script lang="ts">
  import type { DocumentStore } from '../model/store.svelte';
  import type { Viewport } from '../canvas/viewport.svelte';
  import type { MemberRow } from '../supabase/members';
  import { listActivity, type ActivityRow } from '../supabase/activity';
  import { aabb, footprint, type AABB } from '../geom/transform';
  import { wallOutline } from '../geom/walls';
  import Panel from './Panel.svelte';
  import Avatar from './Avatar.svelte';

  let {
    store,
    viewport,
    projectId,
    scenarioId,
    members,
  }: { store: DocumentStore; viewport: Viewport; projectId: string; scenarioId: string; members: MemberRow[] } = $props();

  let rows = $state<ActivityRow[]>([]);
  let error = $state('');
  let timer: ReturnType<typeof setTimeout> | null = null;
  let first = true;

  const byId = $derived(new Map(members.map((m) => [m.user_id, m] as const)));

  async function fetchRows() {
    if (!scenarioId) return;
    try {
      rows = await listActivity(projectId, scenarioId);
      error = '';
    } catch (e) {
      error = String((e as Error).message ?? e);
    }
  }

  $effect(() => {
    void store.revision;
    void scenarioId;
    if (timer) clearTimeout(timer);
    const delay = first ? 0 : 700;
    first = false;
    timer = setTimeout(() => {
      timer = null;
      void fetchRows();
    }, delay);
    return () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
  });

  function who(r: ActivityRow): { name: string; color: string } {
    const m = r.user_id ? byId.get(r.user_id) : undefined;
    return { name: m?.display_name || 'someone', color: m?.color ?? 'var(--ink-3)' };
  }

  function verb(op: string): string {
    return op === 'insert' ? 'added' : op === 'delete' ? 'removed' : 'changed';
  }

  function label(r: ActivityRow): string {
    const name = (r.summary as { name?: string } | null)?.name;
    return name || r.table_name.replace(/s$/, '');
  }

  function when(at: string): string {
    const ms = Date.now() - new Date(at).getTime();
    if (ms < 60_000) return 'just now';
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
    return new Date(at).toLocaleDateString(undefined, { month: 'short', day: '2-digit' });
  }

  function target(r: ActivityRow): AABB | null {
    if (r.table_name === 'objects') {
      const o = store.objects.get(r.row_id);
      return o ? aabb(footprint({ x: o.x, y: o.y, w: o.w, d: o.d, rot: o.rot })) : null;
    }
    if (r.table_name === 'walls') {
      const w = store.walls.get(r.row_id);
      return w ? aabb(wallOutline(w)) : null;
    }
    if (r.table_name === 'openings') {
      const o = store.openings.get(r.row_id);
      const w = o ? store.walls.get(o.wall_id) : null;
      return w ? aabb(wallOutline(w)) : null;
    }
    return null;
  }

  function zoom(r: ActivityRow) {
    const box = target(r);
    if (!box) return;
    if (r.table_name === 'objects') store.select([r.row_id]);
    viewport.fitTo({ minX: box.minX - 60, minY: box.minY - 60, maxX: box.maxX + 60, maxY: box.maxY + 60 });
  }
</script>

<Panel title={`Activity · ${rows.length}`} testId="activity-panel">
  {#if error}<p class="error">{error}</p>{/if}
  {#if rows.length === 0}
    <p class="note">No changes yet.</p>
  {:else}
    <ul class="list acts">
      {#each rows as r (r.id)}
        {@const w = who(r)}
        {@const box = target(r)}
        <li class="list__item">
          <button class="act" data-test="activity-row" data-row={r.row_id} data-op={r.op} disabled={!box} onclick={() => zoom(r)} title={box ? 'Zoom to it' : 'No longer on the plan'}>
            <Avatar name={w.name} color={w.color} />
            <span class="act__text"><strong>{w.name}</strong> {verb(r.op)} {label(r)}</span>
            <span class="mono muted">{when(r.at)}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</Panel>

<style>
  .acts { max-height: 260px; overflow: auto; }
  .act { flex: 1; display: flex; align-items: center; gap: 8px; background: none; border: 0; padding: 2px 0; cursor: pointer; color: var(--ink); font: inherit; text-align: left; min-width: 0; }
  .act:disabled { cursor: default; opacity: 0.6; }
  .act__text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
