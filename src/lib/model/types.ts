import type { Database } from '../supabase/database.types';

type T = Database['public']['Tables'];
export type LayerRow = T['layers']['Row'];
export type WallRow = T['walls']['Row'];
export type OpeningRow = T['openings']['Row'];
export type ObjectRow = T['objects']['Row'];
export type GroupRow = T['object_groups']['Row'];
export type WallStateRow = T['scenario_wall_states']['Row'];
export type SlabRow = T['slabs']['Row'];
export type Mount = Database['public']['Enums']['mount_kind'];

export type TableName = 'objects' | 'object_groups' | 'walls' | 'openings' | 'scenario_wall_states' | 'layers' | 'slabs';
export type Row = Record<string, unknown>;

export type Op =
  | { type: 'create'; table: TableName; row: Row }
  | { type: 'update'; table: TableName; id: string; before: Row; after: Row }
  | { type: 'delete'; table: TableName; id: string; row: Row };

export type Batch = { ops: Op[]; label: string };

export type AnnotationKind = 'text' | 'dimension' | 'walkway';

export type ObjectProps = {
  kind?: AnnotationKind;
  text?: string;
  points?: [number, number][];
  closed?: boolean;
  size_locked?: boolean;
  preset_key?: string;
  cost?: number;
  product_url?: string;
  vendor?: string;
  sku?: string;
  notes?: string;
  load_va?: number;
  voltage?: 120 | 240;
  ports?: unknown[];
  anchor_points?: [number, number][];
  flipped?: boolean;
};

export function propsOf(o: ObjectRow): ObjectProps {
  return (o.props ?? {}) as ObjectProps;
}

export const MOUNTS: Mount[] = ['floor', 'floor_anchored', 'wall', 'ceiling', 'recessed'];

/** Default z (inches above finished floor) by mount (R8.1). */
export function defaultZ(mount: Mount, h: number, ceiling = 112): number {
  switch (mount) {
    case 'ceiling':
      return Math.max(0, ceiling - h);
    case 'wall':
      return 42;
    case 'recessed':
      return 16;
    default:
      return 0;
  }
}

export type Json = Database['public']['Tables']['objects']['Row']['props'];

/** Merge into an object's props JSON with the DB's Json typing. */
export function mergeProps(o: ObjectRow, patch: Partial<ObjectProps>): Json {
  return { ...propsOf(o), ...patch } as unknown as Json;
}
