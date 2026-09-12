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
