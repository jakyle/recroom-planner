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
  private opening = false;
  private retries = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private viewTimer: ReturnType<typeof setTimeout> | null = null;
  private hiddenAt = 0;
  private dragging = false;
  private lastSelection = '';
  private previewOwner = new Map<string, string[]>();
  /** Cursor/selection messages that arrived before the sender's presence did; applied at the next sync. */
  private early = new Map<string, { cursor?: Pt | null; selection?: string[] }>();

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
    window.addEventListener('offline', this.onOffline);
    await this.open();
  }

  stop(): void {
    this.closed = true;
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('offline', this.onOffline);
    this.clearRetry();
    if (this.viewTimer) clearTimeout(this.viewTimer);
    this.outbox.stop();
    this.budget.persist();
    const ch = this.channel;
    this.channel = null;
    if (ch) void supabase.removeChannel(ch);
  }

  private async open(): Promise<void> {
    if (this.closed || this.opening) return;
    this.opening = true;
    const old = this.channel;
    this.channel = null;
    this.early.clear();
    const removal = old ? supabase.removeChannel(old).catch(() => undefined) : null;
    this.status = this.everSubscribed ? 'offline' : 'connecting';
    let ch: RealtimeChannel;
    try {
      ch = await projectChannel(this.projectId, this.me.user_id);
      if (old && ch === old) {
        await removal;
        ch = await projectChannel(this.projectId, this.me.user_id);
      }
    } catch {
      this.opening = false;
      this.status = 'offline';
      this.scheduleRetry();
      return;
    }
    this.opening = false;
    if (this.closed) return;
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

  private clearRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private scheduleRetry(): void {
    if (this.closed || this.retryTimer) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
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
    this.clearRetry();
    this.retries = 0;
    if (this.status !== 'online') void this.open();
  };

  /** The browser lost its network: drop the socket now instead of waiting for the heartbeat to notice (R15.5). */
  private onOffline = (): void => {
    if (this.closed) return;
    this.status = 'offline';
    this.peers.clear();
    this.ui.remotePreview.clear();
    this.previewOwner.clear();
    this.outbox.stop();
    this.dragging = false;
    supabase.realtime.disconnect();
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
    const state = (this.channel?.presenceState() ?? {}) as Record<string, PresenceMeta[]>;
    const seen = new Set<string>();
    for (const metas of Object.values(state)) {
      const meta = metas[metas.length - 1];
      if (!meta || meta.user_id === this.me.user_id) continue;
      seen.add(meta.user_id);
      const prev = this.peers.get(meta.user_id);
      const early = this.early.get(meta.user_id);
      this.early.delete(meta.user_id);
      this.peers.set(meta.user_id, {
        userId: meta.user_id,
        name: meta.name,
        color: meta.color,
        scenarioId: meta.scenario_id,
        viewport: meta.viewport ?? null,
        cursor: prev?.cursor ?? early?.cursor ?? null,
        selection: prev?.selection ?? early?.selection ?? [],
      });
    }
    for (const id of [...this.peers.keys()]) {
      if (seen.has(id)) continue;
      this.peers.delete(id);
      this.clearPreviewOf(id);
    }
    this.count(1);
  }

  private setPeerCursor(userId: string, cursor: Pt | null): void {
    const p = this.peers.get(userId);
    if (p) this.peers.set(userId, { ...p, cursor });
    else this.early.set(userId, { ...(this.early.get(userId) ?? {}), cursor });
  }

  private clearPreviewOf(userId: string): void {
    for (const id of this.previewOwner.get(userId) ?? []) this.ui.remotePreview.delete(id);
    this.previewOwner.delete(userId);
  }

  private onCursor(msg: CursorMsg): void {
    this.count(1);
    if (msg.s !== this.store.scenarioId) return;
    this.setPeerCursor(msg.u, msg.c);
  }

  private onDrag(msg: DragMsg): void {
    this.count(1);
    if (msg.s !== this.store.scenarioId) return;
    if (msg.c !== undefined) this.setPeerCursor(msg.u, msg.c);
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
    else this.early.set(msg.u, { ...(this.early.get(msg.u) ?? {}), selection: msg.ids });
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
