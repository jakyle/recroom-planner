# P2 Realtime Implementation Plan

> **Execution:** inline, task-by-task (see executing-plans). Steps use `- [ ]` checkboxes for tracking. Do NOT dispatch subagents to implement — this project executes plans inline.

**Goal:** Two browsers on the same scenario see each other's named cursors, selections and in-flight drags live; every commit reaches peers via a `committed` broadcast with `postgres_changes` as the backstop; rows resolve last-writer-wins; reconnects refetch; failed writes retry then toast; undo warns when it lands over a peer's newer change; online avatars, jump-to-viewport and an activity feed round it out (SPEC §15, R15.1–R15.14; budget rules R2.8).

**Architecture:** One private Realtime channel per project (`project:<id>`, created only via `projectChannel()`) carries three things: broadcast (ephemeral cursors/drags/selections + `committed`/`deleted` notices), presence (`{user_id, name, color, scenario_id, viewport}`), and `postgres_changes` on the scenario tables (RLS-filtered by the server, scope-filtered client-side). A `CollabSession` (`src/lib/realtime/collab.svelte.ts`) owns the channel lifecycle and a reactive `peers` map; a pure `Outbox` coalesces and throttles outgoing ephemeral messages (cursor 15 Hz, drag 20 Hz with the cursor folded into drag ticks so a moving user never exceeds 20 msg/s, silent when idle); a pure `MessageBudget` projects the month's message count. The store gains `applyRemote`/`removeRemote` (LWW, never touch the undo stack), `refresh()` (refetch + diff), retry-with-backoff + notices, and the undo-over-newer toast. Peer drags render through a second preview map (`ui.remotePreview`) merged under the local preview.

**Stack:** existing (Svelte 5 runes, supabase-js 2.116 realtime, vitest, playwright). No new runtime deps. Design tokens from `src/app.css` only (`--warn` is the orange).

---

## File map

| Path | Responsibility |
|---|---|
| `supabase/migrations/0008_realtime_publication.sql` | add scenario tables to the `supabase_realtime` publication (postgres_changes backstop, R15.7) |
| `src/lib/realtime/outbox.ts` | pure: coalescing throttle for ephemeral sends (R15.4) |
| `src/lib/realtime/budget.ts` | pure: monthly message counter + 50 % indicator math (R15.4, R2.8) |
| `src/lib/realtime/protocol.ts` | message + presence types, event names, backstop table list |
| `src/lib/realtime/collab.svelte.ts` | `CollabSession`: channel lifecycle, presence → `peers`, broadcast in/out, postgres_changes, reconnect + visibility refetch, budget |
| `src/lib/supabase/realtime.ts` | `projectChannel(projectId, presenceKey?)` |
| `src/lib/supabase/activity.ts` | `listActivity(projectId, scenarioId)` (last 200) |
| `src/lib/model/types.ts` | `Op` create/update variants gain `version?: number` |
| `src/lib/model/store.svelte.ts` | `applyRemote`, `removeRemote`, `refresh`, retry + notices, undo toast, `onWritten` hook, in-flight/deferred bookkeeping |
| `src/lib/canvas/ui.svelte.ts` | `remotePreview`, `cursorInside` |
| `src/lib/canvas/scene.ts` | `mergedBox(o, preview, remote?)` |
| `src/lib/canvas/viewport.svelte.ts` | `centerOn(cx, cy, scale)`, `center()` |
| `src/lib/canvas/Plan.svelte` | peers prop; peer cursors, peer selections, remote previews, unsynced dot, pointer enter/leave |
| `src/lib/ui/Avatar.svelte` | `online`, `onclick` |
| `src/lib/ui/Toast.svelte` | renders `store.notices` |
| `src/lib/ui/ActivityPanel.svelte` | activity feed, click-to-zoom (R15.14) |
| `src/lib/ui/StatusStrip.svelte` | `offlineLabel` prop |
| `src/routes/Project.svelte` | wires session ↔ store/ui/viewport; online avatars + jump; budget chip; activity panel; toast |
| `src/app.css` | `.chip--warn`, `.avatar--online`, `.toast*` |
| `tests/realtime/outbox.test.ts`, `tests/realtime/budget.test.ts`, `tests/store.test.ts` | unit |
| `e2e/realtime.spec.ts` | two-context live test |
| `README.md`, `CHECKLIST.md`, `HANDOFF.md`, `.claude/napkin.md` | runbook rows, states, cursor, lessons |

---

### Task 1: Realtime publication migration (R15.7)

**Files:**
- Create: `supabase/migrations/0008_realtime_publication.sql`

- [x] **Step 1: Write the migration**

```sql
-- postgres_changes backstop (R15.7): stream the scenario tables through the supabase_realtime publication.
-- RLS on each table still decides which rows a subscriber sees (R2.5); deletes carry only the primary key.
do $$
declare t text;
begin
  foreach t in array array['objects', 'object_groups', 'walls', 'openings', 'layers', 'slabs', 'scenario_wall_states'] loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
```

- [x] **Step 2: Push to dev, then prod, relink dev**

Run (PowerShell, from the repo root; passwords come from the secrets file, never typed):

```powershell
npx supabase db push --yes
$prodPw = (Get-Content C:/Users/jjack/dev/recroom-planner.secrets.local.txt | Select-String 'recroom \(prod\)').Line -replace '.*: ',''
npx supabase link --project-ref rgtegkswqrafdhfifnvt -p $prodPw
npx supabase db push --yes
$devPw = (Get-Content C:/Users/jjack/dev/recroom-planner.secrets.local.txt | Select-String 'recroom-dev').Line -replace '.*: ',''
npx supabase link --project-ref twpeiaygomaobvshqfvp -p $devPw
npm run db:types
```

Expected: both pushes list `0008_realtime_publication.sql` applied; `git diff --stat src/lib/supabase/database.types.ts` is empty (no schema change).

- [x] **Step 3: Commit**

```bash
git add supabase/migrations/0008_realtime_publication.sql && git commit -m "feat(db): scenario tables in the realtime publication (R15.7)"
```

---

### Task 2: Outbox — coalescing throttle (R15.4)

**Files:**
- Create: `src/lib/realtime/outbox.ts`
- Test: `tests/realtime/outbox.test.ts`

- [x] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Outbox } from '../../src/lib/realtime/outbox';

describe('Outbox', () => {
  let sent: Array<[string, Record<string, unknown>]>;
  let box: Outbox;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    sent = [];
    box = new Outbox((e, p) => sent.push([e, p]));
  });
  afterEach(() => vi.useRealTimers());

  it('cursor-only traffic is capped at 15 Hz and keeps the latest value', () => {
    for (let i = 0; i < 100; i++) {
      box.queue('cursor', { c: [i, i] });
      vi.advanceTimersByTime(10);
    }
    vi.advanceTimersByTime(100);
    expect(sent.length).toBeLessThanOrEqual(16);
    expect(sent.length).toBeGreaterThanOrEqual(14);
    expect(sent.at(-1)![1]).toEqual({ c: [99, 99] });
    expect(box.idle).toBe(true);
  });

  it('drags are capped at 20 Hz and carry the cursor instead of a separate message', () => {
    for (let i = 0; i < 200; i++) {
      box.queue('cursor', { c: [i, 0] });
      box.queue('drag', { p: { a: { x: i } } });
      vi.advanceTimersByTime(5);
    }
    vi.advanceTimersByTime(100);
    expect(sent.length).toBeLessThanOrEqual(21);
    expect(sent.every(([e]) => e === 'drag')).toBe(true);
    expect(sent.at(-1)![1]).toEqual({ p: { a: { x: 199 } }, c: [199, 0] });
  });

  it('sends nothing while idle', () => {
    box.queue('cursor', { c: [1, 1] });
    vi.advanceTimersByTime(200);
    const n = sent.length;
    vi.advanceTimersByTime(5000);
    expect(sent.length).toBe(n);
    expect(box.idle).toBe(true);
  });

  it('coalesces other events to the latest value per event', () => {
    box.queue('select', { ids: ['a'] });
    box.queue('select', { ids: ['a', 'b'] });
    vi.advanceTimersByTime(100);
    expect(sent).toEqual([['select', { ids: ['a', 'b'] }]]);
  });

  it('flush sends immediately and stop drops pending', () => {
    box.queue('cursor', { c: [2, 2] });
    box.flush();
    expect(sent.length).toBe(1);
    box.queue('cursor', { c: [3, 3] });
    box.stop();
    vi.advanceTimersByTime(1000);
    expect(sent.length).toBe(1);
  });
});
```

- [x] **Step 2: Run, verify it fails**

Run: `npx vitest run tests/realtime/outbox.test.ts`
Expected: FAIL — cannot resolve `../../src/lib/realtime/outbox`

- [x] **Step 3: Implement**

```ts
export type Send = (event: string, payload: Record<string, unknown>) => void;

/**
 * Coalesces ephemeral messages per event and flushes them on a throttle (R15.4): cursor-only traffic at
 * `cursorHz`, anything involving a drag at `dragHz`. While a drag is pending the cursor rides inside the
 * `drag` message, so a moving user never exceeds `dragHz` messages per second. No timer runs while idle.
 */
export class Outbox {
  private pending = new Map<string, Record<string, unknown>>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastFlush = -1e12;
  private lastCursor = -1e12;
  readonly cursorMs: number;
  readonly dragMs: number;
  sent = 0;

  constructor(private send: Send, cursorHz = 15, dragHz = 20) {
    this.cursorMs = 1000 / cursorHz;
    this.dragMs = 1000 / dragHz;
  }

  get idle(): boolean {
    return this.pending.size === 0 && this.timer === null;
  }

  queue(event: string, payload: Record<string, unknown>): void {
    this.pending.set(event, payload);
    this.schedule();
  }

  flush(): void {
    this.clearTimer();
    this.tick(true);
  }

  stop(): void {
    this.clearTimer();
    this.pending.clear();
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    this.clearTimer();
    const now = Date.now();
    const cursorOnly = this.pending.size === 1 && this.pending.has('cursor');
    const delay = cursorOnly ? this.cursorMs - (now - this.lastCursor) : this.dragMs - (now - this.lastFlush);
    this.timer = setTimeout(() => this.tick(false), Math.max(0, Math.ceil(delay)));
  }

  private tick(force: boolean): void {
    this.timer = null;
    const now = Date.now();
    const drag = this.pending.get('drag');
    const cursor = this.pending.get('cursor');
    if (drag) {
      this.pending.delete('drag');
      this.pending.delete('cursor');
      this.emit('drag', cursor && 'c' in cursor ? { ...drag, c: cursor.c } : drag);
      this.lastCursor = now;
    } else if (cursor && (force || now - this.lastCursor >= this.cursorMs - 1)) {
      this.pending.delete('cursor');
      this.emit('cursor', cursor);
      this.lastCursor = now;
    }
    for (const [event, payload] of [...this.pending]) {
      if (event === 'cursor') continue;
      this.pending.delete(event);
      this.emit(event, payload);
    }
    this.lastFlush = now;
    if (this.pending.size > 0) this.schedule();
  }

  private emit(event: string, payload: Record<string, unknown>): void {
    this.sent += 1;
    this.send(event, payload);
  }
}
```

- [x] **Step 4: Run, verify it passes**

Run: `npx vitest run tests/realtime/outbox.test.ts`
Expected: 5 passed

- [x] **Step 5: Commit**

```bash
git add src/lib/realtime/outbox.ts tests/realtime/outbox.test.ts && git commit -m "feat(realtime): coalescing outbox with 15/20 Hz throttles (R15.4)"
```

---

### Task 3: Message budget (R15.4, R2.8)

**Files:**
- Create: `src/lib/realtime/budget.ts`
- Test: `tests/realtime/budget.test.ts`

- [x] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { MessageBudget, monthFraction, monthKey, FREE_TIER_MESSAGES_PER_MONTH } from '../../src/lib/realtime/budget';

function mem(): Pick<Storage, 'getItem' | 'setItem'> {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

describe('MessageBudget', () => {
  const day10 = new Date(Date.UTC(2026, 8, 10, 12));

  it('month helpers', () => {
    expect(monthKey(day10)).toBe('2026-09');
    expect(monthFraction(new Date(Date.UTC(2026, 8, 16)))).toBeCloseTo(0.5, 5);
  });

  it('projects the month from the count so far', () => {
    const b = new MessageBudget('rr.rt.P', mem(), new Date(Date.UTC(2026, 8, 1)));
    const noon15 = new Date(Date.UTC(2026, 8, 16));
    b.add(1000, noon15);
    expect(b.estimate(noon15)).toBe(2000);
    expect(b.fraction(noon15)).toBeCloseTo(2000 / FREE_TIER_MESSAGES_PER_MONTH, 9);
    expect(b.warn(noon15)).toBe(false);
    b.add(600_000, noon15);
    expect(b.warn(noon15)).toBe(true);
  });

  it('persists and rolls over at month end', () => {
    const s = mem();
    const a = new MessageBudget('rr.rt.P', s, day10);
    a.add(50, day10);
    a.persist();
    const b = new MessageBudget('rr.rt.P', s, day10);
    expect(b.count).toBe(50);
    b.add(1, new Date(Date.UTC(2026, 9, 1)));
    expect(b.count).toBe(1);
  });
});
```

- [x] **Step 2: Run, verify it fails**

Run: `npx vitest run tests/realtime/budget.test.ts`
Expected: FAIL — module not found

- [x] **Step 3: Implement**

```ts
export const FREE_TIER_MESSAGES_PER_MONTH = 2_000_000;
export const WARN_FRACTION = 0.5;

export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Fraction of the UTC month elapsed at `d`, never zero. */
export function monthFraction(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  return Math.max(1e-6, (d.getTime() - start) / (end - start));
}

/**
 * Local counter of realtime messages this client sent or received for one project, projected linearly over
 * the month against the free-tier budget (R15.4, R2.8). Persisted so reloads don't reset the estimate.
 */
export class MessageBudget {
  count = 0;
  private month: string;
  private dirty = 0;

  constructor(private key: string, private storage: Pick<Storage, 'getItem' | 'setItem'> | null = null, now = new Date()) {
    this.month = monthKey(now);
    try {
      const raw = storage?.getItem(key);
      if (raw) {
        const saved = JSON.parse(raw) as { month: string; count: number };
        if (saved.month === this.month && Number.isFinite(saved.count)) this.count = saved.count;
      }
    } catch {
      /* ignore */
    }
  }

  add(n = 1, now = new Date()): number {
    const m = monthKey(now);
    if (m !== this.month) {
      this.month = m;
      this.count = 0;
    }
    this.count += n;
    this.dirty += n;
    if (this.dirty >= 25) this.persist();
    return this.count;
  }

  persist(): void {
    this.dirty = 0;
    try {
      this.storage?.setItem(this.key, JSON.stringify({ month: this.month, count: this.count }));
    } catch {
      /* ignore */
    }
  }

  estimate(now = new Date()): number {
    return Math.round(this.count / monthFraction(now));
  }

  fraction(now = new Date()): number {
    return this.estimate(now) / FREE_TIER_MESSAGES_PER_MONTH;
  }

  warn(now = new Date()): boolean {
    return this.fraction(now) >= WARN_FRACTION;
  }
}
```

- [x] **Step 4: Run, verify it passes** — `npx vitest run tests/realtime/budget.test.ts` → 3 passed

- [x] **Step 5: Commit**

```bash
git add src/lib/realtime/budget.ts tests/realtime/budget.test.ts && git commit -m "feat(realtime): monthly message budget counter (R15.4, R2.8)"
```

---

### Task 4: Store — remote apply, refresh, retry, notices, undo toast (R15.6–R15.11)

**Files:**
- Modify: `src/lib/model/types.ts` (Op variants)
- Modify: `src/lib/model/store.svelte.ts`
- Test: `tests/store.test.ts`

- [x] **Step 1: Types.** In `src/lib/model/types.ts` replace the `Op` type:

```ts
export type Op =
  | { type: 'create'; table: TableName; row: Row; version?: number }
  | { type: 'update'; table: TableName; id: string; before: Row; after: Row; version?: number }
  | { type: 'delete'; table: TableName; id: string; row: Row };
```

- [x] **Step 2: Write the failing tests** (append inside the `describe('DocumentStore')` block; also change the existing "flags unsynced rows when a write fails" test to set `store.retryDelays = [0, 0, 0]` first and assert `store.notices[0].text` contains `boom` and `store.notices[0].action?.label` is `Retry` instead of `store.error`):

```ts
  it('applyRemote is last-writer-wins by version and never records undo', () => {
    expect(store.applyRemote('objects', { id: 'O1', scenario_id: 'S', x: 40, version: 2 })).toBe(false);
    expect(store.objects.get('O1')?.x).toBe(0);
    expect(store.applyRemote('objects', { id: 'O1', scenario_id: 'S', x: 40, version: 4 })).toBe(true);
    expect(store.objects.get('O1')?.x).toBe(40);
    expect(store.applyRemote('objects', { id: 'O9', scenario_id: 'OTHER', x: 1, version: 1 })).toBe(false);
    expect(store.objects.has('O9')).toBe(false);
    expect(store.undoStack.length).toBe(0);
    store.removeRemote('objects', 'O1');
    expect(store.objects.has('O1')).toBe(false);
  });

  it('refresh diffs the refetched scenario in but keeps unsynced rows', async () => {
    const mine = store.newObject({ id: 'MINE', name: 'Mine', w: 10, d: 10, h: 10 });
    store.objects.set('MINE', mine);
    store.unsynced.add('MINE');
    repo.load = async () => ({
      layers: [{ id: 'L1', project_id: 'P', key: 'walls', name: 'Walls', color: '#000', sort: 0, builtin: true, locked: false, version: 1 }, { id: 'L2', project_id: 'P', key: 'furnishing', name: 'Furnishing', color: '#777', sort: 8, builtin: true, locked: false, version: 1 }],
      walls: [], openings: [], groups: [], wallStates: [], slab: null,
      objects: [{ id: 'O1', scenario_id: 'S', layer_id: 'L2', name: 'Sofa moved', x: 99, y: 0, z: 0, w: 84, d: 38, h: 34, rot: 0, mount: 'floor', wall_id: null, group_id: null, z_order: 1, tags: [], image_path: null, halo: null, locked: false, props: {}, version: 7 }, { id: 'NEW', scenario_id: 'S', layer_id: 'L2', name: 'New', x: 1, y: 1, z: 0, w: 1, d: 1, h: 1, rot: 0, mount: 'floor', wall_id: null, group_id: null, z_order: 2, tags: [], image_path: null, halo: null, locked: false, props: {}, version: 1 }],
    });
    await store.refresh();
    expect(store.objects.get('O1')?.x).toBe(99);
    expect(store.objects.has('NEW')).toBe(true);
    expect(store.objects.has('MINE')).toBe(true);
  });

  it('retries a failing write with backoff, then toasts with Retry and keeps the row unsynced', async () => {
    store.retryDelays = [0, 0, 0];
    let attempts = 0;
    repo.update = async (table, id, patch) => {
      attempts += 1;
      if (attempts < 5) throw new Error('flaky');
      return { id, ...patch, version: 50 };
    };
    await store.updateObjects(['O1'], () => ({ x: 7 }));
    expect(attempts).toBe(4);
    expect(store.unsynced.has('O1')).toBe(true);
    expect(store.notices.at(-1)?.action?.label).toBe('Retry');
    store.notices.at(-1)!.action!.run();
    await new Promise((r) => setTimeout(r, 0));
    expect(store.unsynced.has('O1')).toBe(false);
    expect(store.objects.get('O1')?.version).toBe(50);
  });

  it('undo over a peer’s newer change toasts with their name', async () => {
    store.userId = 'me';
    store.nameOf = (id) => (id === 'peer' ? 'Bob' : 'someone');
    repo.update = async (table, id, patch) => ({ id, ...patch, version: 4, updated_by: 'me' });
    await store.updateObjects(['O1'], () => ({ x: 120 }), 'move');
    store.applyRemote('objects', { id: 'O1', scenario_id: 'S', x: 200, version: 5, updated_by: 'peer' });
    await store.undo();
    expect(store.objects.get('O1')?.x).toBe(0);
    expect(store.notices.at(-1)?.text).toBe("Undid over Bob's newer change");
  });

  it('undo over my own later change is silent', async () => {
    store.userId = 'me';
    let v = 3;
    repo.update = async (table, id, patch) => ({ id, ...patch, version: ++v, updated_by: 'me' });
    await store.updateObjects(['O1'], () => ({ x: 120 }), 'move');
    await store.updateObjects(['O1'], () => ({ name: 'Couch' }), 'rename');
    await store.undo();
    await store.undo();
    expect(store.notices.length).toBe(0);
  });

  it('applies a deferred remote row once the in-flight write lands', async () => {
    let release: (v: unknown) => void = () => {};
    repo.update = async (table, id, patch) => {
      await new Promise((r) => (release = r));
      return { id, ...patch, version: 4 };
    };
    const p = store.updateObjects(['O1'], () => ({ x: 10 }), 'move');
    await new Promise((r) => setTimeout(r, 0));
    expect(store.applyRemote('objects', { id: 'O1', scenario_id: 'S', name: 'Peer', version: 9 })).toBe(false);
    release(null);
    await p;
    expect(store.objects.get('O1')?.name).toBe('Peer');
    expect(store.objects.get('O1')?.version).toBe(9);
  });
```

- [x] **Step 3: Run, verify they fail** — `npx vitest run tests/store.test.ts` → FAIL (applyRemote/refresh/notices not defined)

- [x] **Step 4: Implement in `store.svelte.ts`.** Add after the class fields:

```ts
export type Notice = { id: number; text: string; action?: { label: string; run: () => void } };

  notices = $state<Notice[]>([]);
  /** Bumped after every successful own write and every applied remote row; panels refetch on it. */
  revision = $state(0);
  userId: string | null = null;
  nameOf: (userId: string | null | undefined) => string = () => 'someone';
  /** Called after each successful write (stored row) or delete (null) so the session can broadcast `committed`/`deleted` (R15.7). */
  onWritten: ((op: Op, stored: Row | null) => void) | null = null;
  retryDelays = [500, 1500, 3500];
  private inflight = new Map<string, number>();
  private deferred = new Map<string, { table: TableName; row: Row; deleted: boolean }>();
  private failed: Op[] = [];
  private noticeSeq = 0;
```

Replace `write()` and `commit()`:

```ts
  private opId(op: Op): string {
    if (op.table === 'scenario_wall_states') {
      const r = op.type === 'update' ? op.after : op.row;
      return `${r.scenario_id}:${r.wall_id}`;
    }
    return op.type === 'create' ? (op.row.id as string) : op.id;
  }

  private async write(op: Op): Promise<Row | null> {
    if (op.table === 'scenario_wall_states') {
      if (op.type === 'delete') await this.repo.removeWallState(this.scenarioId, op.row.wall_id as string);
      else await this.repo.insert('scenario_wall_states', op.type === 'create' ? op.row : op.after);
      return null;
    }
    if (op.type === 'create') return this.repo.insert(op.table, op.row);
    if (op.type === 'update') return this.repo.update(op.table, op.id, op.after);
    await this.repo.remove(op.table, op.id);
    return null;
  }

  private async writeWithRetry(op: Op): Promise<Row | null> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.write(op);
      } catch (e) {
        if (attempt >= this.retryDelays.length) throw e;
        await new Promise((r) => setTimeout(r, this.retryDelays[attempt]));
      }
    }
  }

  /** Fold the stored row back in: the whole row once no other write for it is in flight, else only the version fields. */
  private absorb(op: Op, stored: Row | null, last: boolean): void {
    if (!stored || op.type === 'delete') return;
    op.version = stored.version as number;
    const patch = last ? stored : { version: stored.version, updated_at: stored.updated_at, updated_by: stored.updated_by };
    if (op.table === 'slabs') {
      this.slab = { ...(this.slab ?? {}), ...patch } as SlabRow;
      return;
    }
    if (op.table === 'scenario_wall_states') return;
    const id = op.type === 'create' ? (op.row.id as string) : op.id;
    const map = this.table(op.table);
    const cur = map.get(id);
    if (cur) map.set(id, { ...cur, ...patch });
  }

  notify(text: string, action?: Notice['action']): number {
    const id = ++this.noticeSeq;
    this.notices = [...this.notices, { id, text, action }];
    return id;
  }

  dismiss(id: number): void {
    this.notices = this.notices.filter((n) => n.id !== id);
  }

  /** Apply locally, record for undo, then persist with retries (R7.10, R15.6, R15.10). */
  async commit(batch: Batch, record = true): Promise<void> {
    if (batch.ops.length === 0) return;
    for (const op of batch.ops) this.applyLocal(op);
    if (record) {
      this.undoStack = [...this.undoStack, batch];
      this.redoStack = [];
    }
    this.pendingWrites += batch.ops.length;
    for (const op of batch.ops) {
      const id = this.opId(op);
      this.inflight.set(id, (this.inflight.get(id) ?? 0) + 1);
      let stored: Row | null = null;
      let ok = false;
      try {
        stored = await this.writeWithRetry(op);
        ok = true;
        this.unsynced.delete(id);
      } catch (e) {
        this.unsynced.add(id);
        this.failed.push(op);
        this.notify(`Save failed: ${String((e as Error).message ?? e)}`, { label: 'Retry', run: () => void this.retryFailed() });
      } finally {
        this.pendingWrites -= 1;
        const n = (this.inflight.get(id) ?? 1) - 1;
        const last = n <= 0;
        if (last) this.inflight.delete(id);
        else this.inflight.set(id, n);
        if (ok) {
          this.absorb(op, stored, last);
          this.revision += 1;
          this.onWritten?.(op, stored);
        }
        if (last) this.applyDeferred(id);
      }
    }
  }

  async retryFailed(): Promise<void> {
    const ops = this.failed;
    this.failed = [];
    this.notices = this.notices.filter((n) => n.action?.label !== 'Retry');
    await this.commit({ label: 'retry', ops }, false);
  }
```

Replace `undo()`:

```ts
  async undo(): Promise<void> {
    const batch = this.undoStack.at(-1);
    if (!batch) return;
    this.undoStack = this.undoStack.slice(0, -1);
    const over = new Set<string>();
    for (const op of batch.ops) {
      if (op.type === 'delete' || op.version === undefined) continue;
      const id = op.type === 'create' ? (op.row.id as string) : op.id;
      const cur = op.table === 'slabs' ? (this.slab as Row | null) : op.table === 'scenario_wall_states' ? null : this.table(op.table).get(id);
      if (cur && cur.version !== op.version && cur.updated_by && cur.updated_by !== this.userId) over.add(this.nameOf(cur.updated_by as string));
    }
    const inverse: Batch = { label: `undo ${batch.label}`, ops: [...batch.ops].reverse().map(DocumentStore.inverse) };
    this.redoStack = [...this.redoStack, batch];
    if (over.size) this.notify(`Undid over ${[...over].join(', ')}'s newer change`);
    await this.commit(inverse, false);
  }
```

Add the remote/refresh methods after `applyLocal`:

```ts
  private inScope(table: TableName, row: Row): boolean {
    switch (table) {
      case 'layers':
        return row.project_id === this.projectId;
      case 'walls':
        return row.scenario_id === this.scenarioId || (row.scope === 'shell' && row.project_id === this.projectId);
      case 'openings':
        return this.walls.has(row.wall_id as string);
      default:
        return row.scenario_id === this.scenarioId;
    }
  }

  private rowKey(table: TableName, row: Row): string {
    return table === 'scenario_wall_states' ? `${row.scenario_id}:${row.wall_id}` : (row.id as string);
  }

  /** Apply a peer's row when it is newer than ours (LWW per row, R15.7, R15.9). Never touches the undo stack. */
  applyRemote(table: TableName, row: Row): boolean {
    if (!this.inScope(table, row)) return false;
    const id = this.rowKey(table, row);
    if (this.inflight.has(id)) {
      this.deferred.set(id, { table, row, deleted: false });
      return false;
    }
    if (table === 'scenario_wall_states') {
      this.demoWalls.add(row.wall_id as string);
      this.revision += 1;
      return true;
    }
    if (table === 'slabs') {
      if (((this.slab?.version as number | undefined) ?? 0) >= ((row.version as number) ?? 0)) return false;
      this.slab = { ...(this.slab ?? {}), ...row } as SlabRow;
      this.revision += 1;
      return true;
    }
    const map = this.table(table);
    const cur = map.get(id);
    if (cur && ((cur.version as number) ?? 0) >= ((row.version as number) ?? 0)) return false;
    map.set(id, cur ? { ...cur, ...row } : row);
    if (table === 'layers' && !this.layerUi.has(id)) this.layerUi.set(id, { visible: true, opacity: 1 });
    this.revision += 1;
    return true;
  }

  /** Drop a row a peer deleted (postgres DELETE payloads carry only the key). */
  removeRemote(table: TableName, id: string, row: Row = {}): boolean {
    const key = table === 'scenario_wall_states' ? this.rowKey(table, row) : id;
    if (this.inflight.has(key)) {
      this.deferred.set(key, { table, row: { ...row, id }, deleted: true });
      return false;
    }
    if (table === 'scenario_wall_states') {
      if (row.scenario_id !== this.scenarioId) return false;
      this.demoWalls.delete(row.wall_id as string);
    } else if (table === 'slabs') {
      if (!this.slab || this.slab.id !== id) return false;
      this.slab = null;
    } else {
      const map = this.table(table);
      if (!map.has(id)) return false;
      map.delete(id);
      this.selection.delete(id);
    }
    this.revision += 1;
    return true;
  }

  private applyDeferred(id: string): void {
    const d = this.deferred.get(id);
    if (!d) return;
    this.deferred.delete(id);
    if (d.deleted) this.removeRemote(d.table, d.row.id as string, d.row);
    else this.applyRemote(d.table, d.row);
  }

  /** Refetch the scenario and diff it into the store, keeping rows with unsaved or in-flight local changes (R15.8). */
  async refresh(): Promise<void> {
    if (!this.projectId || !this.scenarioId) return;
    const data = await this.repo.load(this.projectId, this.scenarioId);
    const keep = (id: string) => this.unsynced.has(id) || this.inflight.has(id);
    const sync = (map: SvelteMap<string, Row>, rows: Row[]) => {
      const ids = new Set(rows.map((r) => r.id as string));
      for (const id of [...map.keys()]) {
        if (ids.has(id) || keep(id)) continue;
        map.delete(id);
        this.selection.delete(id);
      }
      for (const r of rows) {
        const id = r.id as string;
        if (keep(id)) continue;
        const cur = map.get(id);
        if (!cur || ((cur.version as number) ?? 0) < ((r.version as number) ?? 0)) map.set(id, cur ? { ...cur, ...r } : r);
      }
    };
    sync(this.table('layers'), data.layers);
    sync(this.table('walls'), data.walls);
    sync(this.table('openings'), data.openings);
    sync(this.table('object_groups'), data.groups);
    sync(this.table('objects'), data.objects);
    const demo = new Set(data.wallStates.map((s) => s.wall_id as string));
    for (const id of [...this.demoWalls]) if (!demo.has(id)) this.demoWalls.delete(id);
    for (const id of demo) this.demoWalls.add(id);
    const slab = data.slab as SlabRow | null;
    if (!slab) this.slab = null;
    else if (!this.slab || (this.slab.version ?? 0) < (slab.version ?? 0)) this.slab = slab;
    for (const id of this.layers.keys()) if (!this.layerUi.has(id)) this.layerUi.set(id, { visible: true, opacity: 1 });
    this.revision += 1;
  }
```

Also delete the old `this.error = 'Save failed…'` line (the toast replaces it; `error` stays for load failures).

- [x] **Step 5: Run, verify it passes** — `npx vitest run tests/store.test.ts` → all passed (existing + 6 new). Then `npm run check` → 0 errors.

- [x] **Step 6: Commit**

```bash
git add src/lib/model && git add tests/store.test.ts && git commit -m "feat(store): remote apply (LWW), refresh diff, retry with backoff + notices, undo-over-newer toast (R15.7-R15.11)"
```

---

### Task 5: Protocol, channel factory, CollabSession (R15.1–R15.5, R15.7, R15.8, R15.13)

**Files:**
- Create: `src/lib/realtime/protocol.ts`, `src/lib/realtime/collab.svelte.ts`
- Modify: `src/lib/supabase/realtime.ts`

- [x] **Step 1: `protocol.ts`**

```ts
import type { Pt } from '../geom/transform';
import type { ObjectRow, Row, TableName } from '../model/types';

export type ViewportMeta = { scale: number; cx: number; cy: number };
export type PresenceMeta = { user_id: string; name: string; color: string; scenario_id: string; viewport: ViewportMeta | null };

export type CursorMsg = { u: string; s: string; c: Pt | null };
export type DragMsg = { u: string; s: string; c?: Pt | null; p: Record<string, Partial<ObjectRow>> };
export type SelectMsg = { u: string; s: string; ids: string[] };
export type CommittedMsg = { u: string; table: TableName; id: string; version: number; row: Row };
export type DeletedMsg = { u: string; table: TableName; id: string; row: Row };

export const EVENTS = { cursor: 'cursor', drag: 'drag', select: 'select', committed: 'committed', deleted: 'deleted' } as const;

/** Tables streamed through postgres_changes as the authoritative backstop (R15.7); must match migration 0008. */
export const PG_TABLES: TableName[] = ['objects', 'object_groups', 'walls', 'openings', 'layers', 'slabs', 'scenario_wall_states'];
```

- [x] **Step 2: `realtime.ts`** — replace `projectChannel`:

```ts
/** Create the project's private channel with the current session applied to the socket (R2.6). */
export async function projectChannel(projectId: string, presenceKey?: string): Promise<RealtimeChannel> {
  const session = await ensureSession();
  await supabase.realtime.setAuth(session.access_token);
  const config: { private: boolean; presence?: { key: string } } = { private: true };
  if (presenceKey) config.presence = { key: presenceKey };
  return supabase.channel(projectTopic(projectId), { config });
}
```

- [x] **Step 3: `collab.svelte.ts`**

```ts
import { SvelteMap } from 'svelte/reactivity';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '../supabase/client';
import { projectChannel } from '../supabase/realtime';
import type { DocumentStore } from '../model/store.svelte';
import type { CanvasUi } from '../canvas/ui.svelte';
import type { Pt } from '../geom/transform';
import type { ObjectRow, Op, Row, TableName } from '../model/types';
import { Outbox } from './outbox';
import { MessageBudget } from './budget';
import { EVENTS, PG_TABLES, type CommittedMsg, type CursorMsg, type DeletedMsg, type DragMsg, type PresenceMeta, type SelectMsg, type ViewportMeta } from './protocol';

export type Peer = { userId: string; name: string; color: string; scenarioId: string; viewport: ViewportMeta | null; cursor: Pt | null; selection: string[] };
export type LiveStatus = 'connecting' | 'online' | 'offline';

const HIDDEN_REFETCH_MS = 30_000;
const RETRY_MAX_MS = 30_000;
const VIEWPORT_PRESENCE_MS = 2000;

/**
 * One project's realtime session (SPEC §15): presence → `peers`, ephemeral broadcast in/out through the
 * throttled outbox, `committed`/`deleted` notices plus postgres_changes into the store, reconnect and
 * long-hidden refetch, and the local message budget. Every channel comes from `projectChannel()`.
 */
export class CollabSession {
  status = $state<LiveStatus>('connecting');
  peers = new SvelteMap<string, Peer>();
  budgetFraction = $state(0);

  private channel: RealtimeChannel | null = null;
  private outbox: Outbox;
  private budget: MessageBudget;
  private me: PresenceMeta;
  private everSubscribed = false;
  private closed = false;
  private retries = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private viewTimer: ReturnType<typeof setTimeout> | null = null;
  private hiddenAt = 0;
  private dragging = false;
  private lastSelection = '';
  private previewOwner = new Map<string, string[]>();

  constructor(
    private projectId: string,
    private store: DocumentStore,
    private ui: CanvasUi,
    me: { user_id: string; name: string; color: string },
  ) {
    this.me = { ...me, scenario_id: store.scenarioId, viewport: null };
    this.budget = new MessageBudget(`rr.rtbudget.${projectId}`, typeof localStorage === 'undefined' ? null : localStorage);
    this.budgetFraction = this.budget.fraction();
    this.outbox = new Outbox((event, payload) => {
      void this.channel?.send({ type: 'broadcast', event, payload });
      this.count(1);
    });
  }

  async start(): Promise<void> {
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('online', this.onOnline);
    await this.open();
  }

  stop(): void {
    this.closed = true;
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('online', this.onOnline);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.viewTimer) clearTimeout(this.viewTimer);
    this.outbox.stop();
    this.budget.persist();
    const ch = this.channel;
    this.channel = null;
    if (ch) void supabase.removeChannel(ch);
  }

  private async open(): Promise<void> {
    if (this.closed) return;
    const old = this.channel;
    this.channel = null;
    if (old) void supabase.removeChannel(old);
    this.status = this.everSubscribed ? 'offline' : 'connecting';
    let ch: RealtimeChannel;
    try {
      ch = await projectChannel(this.projectId, this.me.user_id);
    } catch {
      this.status = 'offline';
      this.scheduleRetry();
      return;
    }
    ch.on('broadcast', { event: EVENTS.cursor }, ({ payload }) => this.onCursor(payload as CursorMsg))
      .on('broadcast', { event: EVENTS.drag }, ({ payload }) => this.onDrag(payload as DragMsg))
      .on('broadcast', { event: EVENTS.select }, ({ payload }) => this.onSelect(payload as SelectMsg))
      .on('broadcast', { event: EVENTS.committed }, ({ payload }) => this.onCommitted(payload as CommittedMsg))
      .on('broadcast', { event: EVENTS.deleted }, ({ payload }) => this.onDeleted(payload as DeletedMsg))
      .on('presence', { event: 'sync' }, () => this.syncPresence());
    for (const table of PG_TABLES) ch.on('postgres_changes', { event: '*', schema: 'public', table }, (p) => this.onPgChange(table, p));
    this.channel = ch;
    ch.subscribe((status) => {
      if (this.channel !== ch) return;
      if (status === 'SUBSCRIBED') {
        const rejoin = this.everSubscribed;
        this.everSubscribed = true;
        this.retries = 0;
        this.status = 'online';
        void this.track();
        if (rejoin) void this.store.refresh();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        this.status = 'offline';
        this.peers.clear();
        this.ui.remotePreview.clear();
        this.previewOwner.clear();
        this.scheduleRetry();
      }
    });
  }

  private scheduleRetry(): void {
    if (this.closed || this.retryTimer) return;
    const delay = Math.min(RETRY_MAX_MS, 1000 * 2 ** this.retries);
    this.retries += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.status !== 'online') void this.open();
    }, delay);
  }

  private onVisibility = (): void => {
    if (document.visibilityState === 'hidden') {
      this.hiddenAt = Date.now();
      this.sendCursor(null);
      this.outbox.flush();
      return;
    }
    const away = this.hiddenAt ? Date.now() - this.hiddenAt : 0;
    this.hiddenAt = 0;
    if (away > HIDDEN_REFETCH_MS) void this.store.refresh();
    if (this.status !== 'online') void this.open();
  };

  private onOnline = (): void => {
    if (this.status !== 'online') void this.open();
  };

  private count(n: number): void {
    this.budget.add(n);
    this.budgetFraction = this.budget.fraction();
  }

  get budgetEstimate(): number {
    return this.budget.estimate();
  }

  private async track(): Promise<void> {
    if (this.status !== 'online' || !this.channel) return;
    await this.channel.track(this.me);
    this.count(1);
  }

  setIdentity(name: string, color: string): void {
    this.me = { ...this.me, name, color };
    void this.track();
  }

  setScenario(scenarioId: string): void {
    if (this.me.scenario_id === scenarioId) return;
    this.me = { ...this.me, scenario_id: scenarioId };
    this.ui.remotePreview.clear();
    this.previewOwner.clear();
    this.lastSelection = '';
    void this.track();
  }

  setViewport(v: ViewportMeta): void {
    this.me = { ...this.me, viewport: v };
    if (this.viewTimer) return;
    this.viewTimer = setTimeout(() => {
      this.viewTimer = null;
      void this.track();
    }, VIEWPORT_PRESENCE_MS);
  }

  sendCursor(c: Pt | null): void {
    if (this.status !== 'online') return;
    this.outbox.queue('cursor', { u: this.me.user_id, s: this.me.scenario_id, c });
  }

  sendPreview(p: Record<string, Partial<ObjectRow>>): void {
    if (this.status !== 'online') return;
    const active = Object.keys(p).length > 0;
    if (!active && !this.dragging) return;
    this.dragging = active;
    this.outbox.queue('drag', { u: this.me.user_id, s: this.me.scenario_id, p });
    if (!active) this.outbox.flush();
  }

  sendSelection(ids: string[]): void {
    if (this.status !== 'online') return;
    const key = ids.join(',');
    if (key === this.lastSelection) return;
    this.lastSelection = key;
    this.outbox.queue('select', { u: this.me.user_id, s: this.me.scenario_id, ids });
  }

  /** Store hook: after a successful write, tell peers right away (R15.7). */
  announce(op: Op, stored: Row | null): void {
    if (this.status !== 'online' || !this.channel) return;
    if (op.type === 'delete') {
      const msg: DeletedMsg = { u: this.me.user_id, table: op.table, id: op.id, row: op.row };
      void this.channel.send({ type: 'broadcast', event: EVENTS.deleted, payload: msg });
    } else if (stored) {
      const msg: CommittedMsg = { u: this.me.user_id, table: op.table, id: stored.id as string, version: stored.version as number, row: stored };
      void this.channel.send({ type: 'broadcast', event: EVENTS.committed, payload: msg });
    } else return;
    this.count(1);
  }

  private syncPresence(): void {
    const state = this.channel?.presenceState<PresenceMeta>() ?? {};
    const seen = new Set<string>();
    for (const metas of Object.values(state)) {
      const meta = metas[metas.length - 1];
      if (!meta || meta.user_id === this.me.user_id) continue;
      seen.add(meta.user_id);
      const prev = this.peers.get(meta.user_id);
      this.peers.set(meta.user_id, {
        userId: meta.user_id,
        name: meta.name,
        color: meta.color,
        scenarioId: meta.scenario_id,
        viewport: meta.viewport ?? null,
        cursor: prev?.cursor ?? null,
        selection: prev?.selection ?? [],
      });
    }
    for (const id of [...this.peers.keys()]) {
      if (seen.has(id)) continue;
      this.peers.delete(id);
      this.clearPreviewOf(id);
    }
    this.count(1);
  }

  private clearPreviewOf(userId: string): void {
    for (const id of this.previewOwner.get(userId) ?? []) this.ui.remotePreview.delete(id);
    this.previewOwner.delete(userId);
  }

  private onCursor(msg: CursorMsg): void {
    this.count(1);
    if (msg.s !== this.store.scenarioId) return;
    const p = this.peers.get(msg.u);
    if (p) this.peers.set(msg.u, { ...p, cursor: msg.c });
  }

  private onDrag(msg: DragMsg): void {
    this.count(1);
    if (msg.s !== this.store.scenarioId) return;
    const p = this.peers.get(msg.u);
    if (p && msg.c !== undefined) this.peers.set(msg.u, { ...p, cursor: msg.c });
    this.clearPreviewOf(msg.u);
    const ids = Object.keys(msg.p);
    for (const id of ids) this.ui.remotePreview.set(id, msg.p[id]);
    if (ids.length) this.previewOwner.set(msg.u, ids);
  }

  private onSelect(msg: SelectMsg): void {
    this.count(1);
    if (msg.s !== this.store.scenarioId) return;
    const p = this.peers.get(msg.u);
    if (p) this.peers.set(msg.u, { ...p, selection: msg.ids });
  }

  private onCommitted(msg: CommittedMsg): void {
    this.count(1);
    if (msg.u === this.me.user_id) return;
    this.store.applyRemote(msg.table, msg.row);
  }

  private onDeleted(msg: DeletedMsg): void {
    this.count(1);
    if (msg.u === this.me.user_id) return;
    this.store.removeRemote(msg.table, msg.id, msg.row);
  }

  private onPgChange(table: TableName, payload: RealtimePostgresChangesPayload<Row>): void {
    this.count(1);
    if (payload.eventType === 'DELETE') {
      const old = payload.old as Row;
      this.store.removeRemote(table, old.id as string, old);
    } else {
      this.store.applyRemote(table, payload.new as Row);
    }
  }
}
```

- [x] **Step 4: `npm run check`** → 0 errors (fix any typing of `presenceState<PresenceMeta>()` by casting `as Record<string, PresenceMeta[]>` if needed).

- [x] **Step 5: Commit**

```bash
git add src/lib/realtime src/lib/supabase/realtime.ts && git commit -m "feat(realtime): CollabSession — presence, throttled broadcast, committed/deleted, postgres_changes backstop, reconnect refetch (R15.1-R15.8, R15.13)"
```

---

### Task 6: Canvas — remote previews, peer cursors and selections, unsynced dot (R15.1, R15.3, R15.10, R15.13)

**Files:**
- Modify: `src/lib/canvas/ui.svelte.ts`, `src/lib/canvas/scene.ts`, `src/lib/canvas/viewport.svelte.ts`, `src/lib/canvas/Plan.svelte`

- [x] **Step 1: `ui.svelte.ts`** — add fields:

```ts
  /** Peers' in-flight drags (R15.1); merged under the local preview, never cleared by the select tool. */
  remotePreview = new SvelteMap<string, Partial<ObjectRow>>();
  cursorInside = $state(false);
```

- [x] **Step 2: `scene.ts`** — `mergedBox` takes an optional remote map (local wins):

```ts
export function mergedBox(o: ObjectRow, preview: Map<string, Partial<ObjectRow>>, remote?: Map<string, Partial<ObjectRow>>) {
  const p = preview.get(o.id) ?? remote?.get(o.id);
  return { x: p?.x ?? o.x, y: p?.y ?? o.y, w: p?.w ?? o.w, d: p?.d ?? o.d, rot: p?.rot ?? o.rot };
}
```

- [x] **Step 3: `viewport.svelte.ts`** — add:

```ts
  /** World point under the middle of the canvas. */
  center(): Pt {
    return this.toWorld(this.width / 2, this.height / 2);
  }

  /** Jump so `cx,cy` sits mid-canvas at `scale` (R15.13 jump-to-viewport). */
  centerOn(cx: number, cy: number, scale = this.scale): void {
    this.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
    this.tx = this.width / 2 - cx * this.scale;
    this.ty = this.height / 2 + cy * this.scale;
    this.persist();
  }
```

- [x] **Step 4: `Plan.svelte`** — element checklist (each is a concrete edit):

- [x] prop `peers: Peer[] = []` (import `type Peer` from `../realtime/collab.svelte`); `const livePeers = $derived(peers.filter((p) => p.scenarioId === store.scenarioId))`.
- [x] object `<g data-test="object">` uses `{@const b = mergedBox(o, ui.preview, ui.remotePreview)}`; halos and selection outlines keep `mergedBox(o, ui.preview)`.
- [x] inside the object `<g>`, after the rect branch: `{#if store.unsynced.has(o.id)}<circle data-test="unsynced-dot" cx={b.w} cy={b.d} r={4 / scale} fill="var(--warn)" stroke="var(--surface)" stroke-width={1 / scale} />{/if}` (R15.10 orange dot).
- [x] after the local selection block, peer selections: for each `livePeers` × `p.selection` ids whose object exists and layer visible → `<polygon data-test="peer-selection" data-user={p.userId} points={polyPoints(footprint(mergedBox(o, ui.preview, ui.remotePreview)))} fill="none" stroke={p.color} stroke-width="1.2" stroke-dasharray="4 2" vector-effect="non-scaling-stroke" />` plus one name tag per peer at the first selected object's box top-left: `<text transform={`translate(${b.minX} ${b.maxY + 4 / scale}) scale(1,-1)`} font-size={fontPx * 0.8} fill={p.color} font-family="var(--font-ui)">{p.name}</text>`.
- [x] peer cursors, last in the world group so they draw on top: `{#each livePeers as p (p.userId)}{#if p.cursor}<g data-test="peer-cursor" data-user={p.userId} transform={`translate(${p.cursor[0]} ${p.cursor[1]}) scale(${1 / scale} ${-1 / scale})`} style="pointer-events:none"><path d="M0 0 L0 16 L4.5 12 L7.5 19 L10 18 L7 11 L12 11 Z" fill={p.color} stroke="var(--surface)" stroke-width="1" /><rect x="12" y="12" rx="3" width={p.name.length * 6.6 + 10} height="16" fill={p.color} /><text x="17" y="24" font-size="11" fill="#fff" font-family="var(--font-ui)">{p.name}</text></g>{/if}{/each}` (the group transform flips y back so the arrow and text are in screen orientation, sized in pixels).
- [x] `<svg … onpointerenter={() => (ui.cursorInside = true)} onpointerleave={() => (ui.cursorInside = false)}>`.

- [x] **Step 5: `npm run check`** → 0 errors; `npx playwright test e2e/canvas.spec.ts` still green.

- [x] **Step 6: Commit**

```bash
git add src/lib/canvas && git commit -m "feat(canvas): peer cursors, peer selections, remote drag previews, unsynced dot, centerOn (R15.1, R15.3, R15.10, R15.13)"
```

---

### Task 7: UI — Avatar online, Toast, StatusStrip label, ActivityPanel (R15.5, R15.10, R15.13, R15.14)

**Files:**
- Modify: `src/lib/ui/Avatar.svelte`, `src/lib/ui/StatusStrip.svelte`, `src/app.css`
- Create: `src/lib/ui/Toast.svelte`, `src/lib/ui/ActivityPanel.svelte`, `src/lib/supabase/activity.ts`

- [x] **Step 1: `Avatar.svelte`** — props `online: boolean | null = null`, `onclick: (() => void) | null = null`. Renders `<button>` when `onclick` else `<span>`; both carry `class="avatar" class:avatar--online={online === true} class:avatar--away={online === false} data-test="avatar" data-online={online === null ? undefined : String(online)} style={`background:${color}`} {title}`. CSS in `app.css`: `.avatar--online { box-shadow: 0 0 0 2px var(--ok); } .avatar--away { opacity: 0.45; } button.avatar { cursor: pointer; padding: 0; }`.

- [x] **Step 2: `StatusStrip.svelte`** — prop `offlineLabel = 'offline'`; the live text becomes `{live === 'offline' ? offlineLabel : live}`; `data-test="status-live"` on that span.

- [x] **Step 3: `Toast.svelte`** — props `{ store: DocumentStore }`; `<div class="toasts">{#each store.notices as n (n.id)}<div class="toast" data-test="toast" role="status"><span>{n.text}</span>{#if n.action}<button class="btn btn--sm btn--primary" data-test="toast-action" onclick={n.action.run}>{n.action.label}</button>{/if}<button class="btn btn--sm btn--quiet" aria-label="Dismiss" onclick={() => store.dismiss(n.id)}>×</button></div>{/each}</div>`. Notices without an action auto-dismiss after 6 s (`$effect` over `store.notices` scheduling `store.dismiss`). CSS in `app.css`: `.toasts { position: fixed; right: 16px; bottom: 44px; display: grid; gap: 8px; z-index: 40; } .toast { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: var(--surface); color: var(--ink); border: 1px solid var(--rule); border-left: 3px solid var(--warn); border-radius: var(--radius); box-shadow: var(--shadow); font-size: 13px; }`. Also `.chip--warn { color: var(--warn); border-color: var(--warn); }`.

- [x] **Step 4: `activity.ts`**

```ts
import { supabase } from './client';
import type { Database } from './database.types';

export type ActivityRow = Database['public']['Tables']['activity']['Row'];

/** Last 200 commits for a scenario, newest first; opening rows have no scenario and ride along (R15.14). */
export async function listActivity(projectId: string, scenarioId: string, limit = 200): Promise<ActivityRow[]> {
  const { data, error } = await supabase
    .from('activity')
    .select('*')
    .eq('project_id', projectId)
    .or(`scenario_id.eq.${scenarioId},scenario_id.is.null`)
    .order('at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
```

- [x] **Step 5: `ActivityPanel.svelte`** — props `{ store, viewport, projectId, scenarioId, members }`. Fetches on mount and whenever `store.revision` changes (debounced 700 ms, cancel on unmount). Row = `<button class="act" data-test="activity-row" data-row={r.row_id} disabled={!target(r)} onclick={() => zoom(r)}>` with `<Avatar name color>` (from `members` by `user_id`, fallback name "someone", color `var(--ink-3)`), text `{name} {verb} {summary.name || table_name}`, and `<span class="mono muted">{when(r.at)}</span>`. `verb`: insert→"added", update→"changed", delete→"removed". `when`: `<60 s` "just now", `<60 min` "Nm", `<24 h` "Nh", else `toLocaleDateString(undefined,{month:'short',day:'2-digit'})`. `target(r)`: objects → `store.objects.get(row_id)` box via `aabb(footprint(...))`; walls → `aabb(wallOutline(w))`; openings → the wall's outline box; else null. `zoom`: `store.select([id])` for objects, then `viewport.fitTo(box padded 60)`. Panel title `Activity · {rows.length}`, `testId="activity-panel"`, list `max-height: 260px; overflow: auto`. Empty state: `<p class="note">No changes yet.</p>`.

- [x] **Step 6: `npm run check`** → 0 errors. Commit:

```bash
git add src/lib/ui src/lib/supabase/activity.ts src/app.css && git commit -m "feat(ui): online avatars, toast notices, offline-collaboration label, activity feed (R15.5, R15.10, R15.13, R15.14)"
```

---

### Task 8: Project route wiring (all of §15 end-to-end)

**Files:**
- Modify: `src/routes/Project.svelte`

- [x] **Step 1: session lifecycle.** `let session = $state<CollabSession | null>(null)`. In `load()` after `members = await listMembers(projectId)`: set `store.userId = me.user_id`, `store.nameOf = (id) => members.find((m) => m.user_id === id)?.display_name || 'someone'`, `store.onWritten = (op, stored) => session?.announce(op, stored)`, then `session = new CollabSession(projectId, store, ui, { user_id: me.user_id, name: me.display_name || 'Anonymous', color: me.color }); void session.start();`. In the `onMount` cleanup call `session?.stop()`. `saveName()` additionally calls `session?.setIdentity(me.display_name, me.color)` after `me` reloads.

- [x] **Step 2: effects** (after the existing scenario-load effect):

```ts
  $effect(() => {
    if (session && store.scenarioId) session.setScenario(store.scenarioId);
  });
  $effect(() => {
    const c = ui.cursor;
    const inside = ui.cursorInside;
    session?.sendCursor(inside ? c : null);
  });
  $effect(() => {
    const p = Object.fromEntries(ui.preview);
    session?.sendPreview(p);
  });
  $effect(() => {
    const ids = [...store.selection];
    session?.sendSelection(ids);
  });
  $effect(() => {
    const scale = viewport.scale;
    void viewport.tx;
    void viewport.ty;
    if (viewport.width === 0) return;
    const [cx, cy] = viewport.center();
    session?.setViewport({ scale, cx, cy });
  });
```

- [x] **Step 3: title block people** — `{#each members as m}` → `<Avatar name color online={session ? m.user_id === me.user_id || session.peers.has(m.user_id) : null} title={`${name} · ${m.access}${online ? ' · online' : ''}`} onclick={() => jumpTo(m.user_id)} />` where `jumpTo(userId)` reads `session?.peers.get(userId)?.viewport` and calls `viewport.centerOn(v.cx, v.cy, v.scale)` (once, not follow). Actions snippet gains `{#if session && session.budgetFraction >= 0.5}<span class="chip chip--warn" data-test="rt-budget" title={`≈${session.budgetEstimate.toLocaleString()} realtime messages/month projected from this browser (free tier 2M)`}>realtime {Math.round(session.budgetFraction * 100)}%</span>{/if}`.

- [x] **Step 4: canvas + dock + strip** — `<Plan … peers={session ? [...session.peers.values()] : []} />`; Project tab dock order: Scenarios, `<ActivityPanel {store} {viewport} {projectId} scenarioId={scenarioId ?? ''} {members} />`, Share links, People; `<StatusStrip live={session?.status ?? 'connecting'} offlineLabel="offline collaboration" …/>`; `<Toast {store} />` after `<ObjectDialog>`. Remove the `store-error` banner's dependency on save errors (it still shows load errors).

- [x] **Step 5: verify locally** — `npm run check` 0 errors; `npm test` green; `npx playwright test` (3 specs) green. Open two dev-server tabs on the same edit link and confirm: named cursor, live drag, avatar rings, activity rows.

- [x] **Step 6: Commit**

```bash
git add src/routes/Project.svelte && git commit -m "feat(project): wire realtime session — cursors, drags, selection, presence avatars + jump, budget chip, activity, toasts (SPEC §15)"
```

---

### Task 9: e2e `realtime.spec.ts` + runbook

**Files:**
- Create: `e2e/realtime.spec.ts`
- Modify: `README.md` (runbook rows P2)

- [x] **Step 1: Write the spec**

```ts
// Two browser contexts on one edit link (SPEC §15). Runs against the dev server or the live site (PW_BASE_URL).
import { test, expect, type Page } from '@playwright/test';

test.use({ testIdAttribute: 'data-test' });

async function toPage(page: Page, wx: number, wy: number): Promise<[number, number]> {
  return page.evaluate(
    ([x, y]) => {
      const svg = document.querySelector('[data-test=plan]') as SVGSVGElement;
      const g = svg.querySelector('g') as SVGGElement;
      const m = g.getAttribute('transform')!.match(/matrix\(([^)]+)\)/)![1].split(' ').map(Number);
      const r = svg.getBoundingClientRect();
      return [r.left + m[4] + x * m[0], r.top + m[5] + y * m[3]];
    },
    [wx, wy],
  );
}

async function drag(page: Page, from: [number, number], to: [number, number], steps = 8) {
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps);
  await page.mouse.up();
}

async function placeObject(page: Page, name: string, at: [number, number], size: [number, number]) {
  await page.keyboard.press('o');
  await expect(page.getByTestId('tool-object')).toHaveAttribute('aria-pressed', 'true');
  const a = await toPage(page, at[0], at[1]);
  const b = await toPage(page, at[0] + size[0], at[1] + size[1]);
  await drag(page, a, b);
  await expect(page.getByTestId('object-dialog')).toBeVisible();
  await page.getByTestId('dlg-name').fill(name);
  await page.getByTestId('dlg-create').click();
  await expect(page.getByTestId('object-dialog')).toHaveCount(0);
}

function objectByName(page: Page, name: string) {
  return page.locator('[data-test=object]').filter({ hasText: name });
}

async function online(page: Page) {
  await expect(page.getByTestId('status-live')).toHaveText('online', { timeout: 30_000 });
}

test('cursors, live drag, committed position, LWW, reconnect refetch, presence, activity', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const a = await ctxA.newPage();
  await a.goto('./');
  await a.getByTestId('project-name').fill('RT ' + Date.now());
  await a.getByTestId('template').selectOption('pool_room');
  await a.getByTestId('create').click();
  await a.getByTestId('display-name').fill('Ann');
  await a.getByTestId('save-name').click();
  await expect(a.getByTestId('my-name')).toHaveText('Ann');
  await a.waitForURL(/#\/p\/[^/]+\/s\/[^/]+$/);
  await expect(a.getByTestId('wall')).toHaveCount(11);
  await a.getByTestId('tab-project').click();
  const editLink = (await a.getByTestId('edit-link').getAttribute('data-url'))!;
  await a.getByTestId('tab-plan').click();
  await online(a);

  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  await b.goto(editLink);
  await b.getByTestId('display-name').fill('Bob');
  await b.getByTestId('save-name').click();
  await expect(b.getByTestId('my-name')).toHaveText('Bob');
  await expect(b.getByTestId('wall')).toHaveCount(11);
  await online(b);

  // Presence: both see two online avatars.
  await expect(a.locator('[data-test=avatar][data-online=true]')).toHaveCount(2, { timeout: 15_000 });
  await expect(b.locator('[data-test=avatar][data-online=true]')).toHaveCount(2, { timeout: 15_000 });

  // Cursor badge: Bob moves over the plan, Ann sees a cursor named Bob.
  const bp = await toPage(b, 100, 300);
  await b.mouse.move(bp[0], bp[1]);
  await b.mouse.move(bp[0] + 20, bp[1] + 10);
  await expect(a.getByTestId('peer-cursor')).toContainText('Bob', { timeout: 10_000 });

  // Ann adds a rack; Bob receives the committed row.
  await placeObject(a, 'Rack', [60, 300], [48, 48]);
  await expect(objectByName(b, 'Rack')).toHaveAttribute('data-x', '60', { timeout: 10_000 });

  // Ann's in-flight drag previews live in Bob's tab before pointer-up (R15.1), then commits (R15.7).
  const c1 = await toPage(a, 84, 324);
  const mid = await toPage(a, 84 + 36, 324);
  const end = await toPage(a, 84 + 60, 324);
  await a.mouse.move(c1[0], c1[1]);
  await a.mouse.down();
  for (let i = 1; i <= 6; i++) await a.mouse.move(c1[0] + ((mid[0] - c1[0]) * i) / 6, c1[1]);
  await expect(objectByName(b, 'Rack')).toHaveAttribute('data-x', '96', { timeout: 10_000 });
  await expect(objectByName(a, 'Rack')).toHaveAttribute('data-x', '96');
  for (let i = 1; i <= 4; i++) await a.mouse.move(mid[0] + ((end[0] - mid[0]) * i) / 4, c1[1]);
  await a.mouse.up();
  await expect(objectByName(b, 'Rack')).toHaveAttribute('data-x', '120', { timeout: 10_000 });
  await expect(a.getByTestId('status-unsynced')).toHaveCount(0);

  // Bob's selection shows in Ann's tab with his name.
  await objectByName(b, 'Rack').click();
  await expect(a.getByTestId('peer-selection')).toHaveCount(1, { timeout: 10_000 });

  // LWW: both set x at the same time; both converge on one of the two values.
  await objectByName(a, 'Rack').click();
  await Promise.all([
    (async () => {
      await a.getByTestId('insp-x').fill(`20'`);
      await a.getByTestId('insp-x').press('Enter');
    })(),
    (async () => {
      await b.getByTestId('insp-x').fill(`21'`);
      await b.getByTestId('insp-x').press('Enter');
    })(),
  ]);
  await expect.poll(async () => objectByName(a, 'Rack').getAttribute('data-x'), { timeout: 15_000 }).toMatch(/^(240|252)$/);
  await expect.poll(async () => {
    const [xa, xb] = await Promise.all([objectByName(a, 'Rack').getAttribute('data-x'), objectByName(b, 'Rack').getAttribute('data-x')]);
    return xa === xb ? xa : null;
  }, { timeout: 15_000 }).toMatch(/^(240|252)$/);

  // Reconnect refetch (R15.8): Bob goes offline, Ann moves the rack, Bob comes back and refetches.
  await ctxB.setOffline(true);
  await expect(b.getByTestId('status-live')).toHaveText('offline collaboration', { timeout: 40_000 });
  await a.keyboard.press('Escape');
  await objectByName(a, 'Rack').click();
  await a.getByTestId('insp-x').fill(`30'`);
  await a.getByTestId('insp-x').press('Enter');
  await expect(objectByName(a, 'Rack')).toHaveAttribute('data-x', '360');
  await ctxB.setOffline(false);
  await expect(objectByName(b, 'Rack')).toHaveAttribute('data-x', '360', { timeout: 60_000 });
  await online(b);

  // Activity feed lists the rack with Ann's name.
  await a.getByTestId('tab-project').click();
  await expect(a.getByTestId('activity-row').first()).toContainText('Rack', { timeout: 10_000 });
  await expect(a.getByTestId('activity-panel')).toContainText('Ann');

  // Closing Bob's tab drops his avatar.
  await b.close();
  await ctxB.close();
  await expect(a.locator('[data-test=avatar][data-online=true]')).toHaveCount(1, { timeout: 20_000 });
});
```

- [x] **Step 2: Run locally** — `npx playwright test e2e/realtime.spec.ts` → 1 passed. Fix product code (not the assertions) until it does.

- [x] **Step 3: README runbook rows** (append under the P1 rows):

```
P2 rows (two browser profiles on the edit link):

12. Both profiles show two online avatar rings; moving the mouse in B shows a cursor with B's name in A. (R15.1, R15.3, R15.13)
13. Drag an object in A: B shows it moving before the mouse is released, then at the committed spot. (R15.1, R15.2, R15.7)
14. Click an object in B: A shows B's colored outline and name. (R15.13)
15. Click B's avatar in A: A's view jumps to B's viewport once. (R15.13)
16. Set the same object's x in both profiles at the same time: both end on the later value. (R15.9)
17. Turn off B's network, move the object in A, turn B's network back on: B refetches and shows the new spot; the status strip read "offline collaboration" meanwhile. (R15.5, R15.8)
18. Edit in A, undo in A after B changed the same object: toast "Undid over B's newer change". (R15.11)
19. Project tab › Activity lists the last commits with names; clicking a row zooms to it. (R15.14)
20. With the network blocked during a drag: after retries a toast offers Retry and the object shows an orange dot until it saves. (R15.10)
```

- [x] **Step 4: Commit**

```bash
git add e2e/realtime.spec.ts README.md && git commit -m "test(e2e): two-context realtime spec; runbook P2 rows"
```

---

### Task 10: Deploy, live verification, bookkeeping

- [ ] **Step 1:** `npm run check` 0 errors; `npm test` green; `npx playwright test` (4 specs) green. Check `git diff --cached` for `eyJ` / `sb_` / `supabase.co` before every commit.
- [ ] **Step 2:** `git push origin main` → Deploy workflow green (`gh run watch`).
- [ ] **Step 3:** `$env:PW_BASE_URL='https://jakyle.github.io/recroom-planner/'; npx playwright test e2e/smoke.spec.ts e2e/canvas.spec.ts e2e/realtime.spec.ts` → green.
- [ ] **Step 4:** Manual check in two browser profiles (runbook rows 12–20); screenshot for the user.
- [ ] **Step 5:** `CHECKLIST.md` §15 lines → `[coded]` after Task 8, `[verified]` after Step 3/4 (R15.12 "no global undo" verified by inspection: only per-user stacks exist); R2.8 stays `[coded]` (storage cap UI is P4). `HANDOFF.md`: next action = P3 (SPEC §8, §9), done list, distilled realtime facts. Napkin: append what bit.
- [ ] **Step 6:** Commit + push.

```bash
git add CHECKLIST.md HANDOFF.md .claude/napkin.md && git commit -m "P2 exit: checklist states, handoff cursor to P3, napkin lessons" && git push origin main
```

---

## Self-review

- **Coverage:** R15.1 → T5 (drag/cursor/select out), T6 (render); R15.2 → existing commit-on-pointer-up + T4; R15.3 → T5 (presence meta, scenario filter), T6 (`livePeers`); R15.4 → T2, T3, T8 chip; R15.5 → T5 status + T7 strip label; R15.6 → existing + T4 version stamp; R15.7 → T1, T4 `applyRemote`, T5 announce/pg; R15.8 → T4 `refresh`, T5 rejoin/visibility; R15.9 → T4 version compare; R15.10 → T4 retry/notices, T6 dot, T7 toast; R15.11 → T4 undo toast; R15.12 → nothing global exists (verify by inspection); R15.13 → T6 selections, T7 avatar, T8 jump; R15.14 → T7 activity + T8 dock.
- **Types:** `Peer` defined in T5, imported by T6/T8; `mergedBox(o, preview, remote?)` T6 signature used in T6 only; `store.onWritten(op, stored)` T4 ↔ `session.announce(op, stored)` T5 ↔ wired in T8; `Notice` T4 ↔ `Toast` T7; `ViewportMeta` T5 ↔ `viewport.center()` T6 ↔ T8 effect.
- **Placeholders:** none; components are contracts with enumerated elements and test ids.
