import { supabase } from './client';
import type { TableName, Row } from '../model/types';

/** The store's only write path (R2.12). Every write returns the stored row so `version` stays in sync. */
export interface Repo {
  insert(table: TableName, row: Row): Promise<Row>;
  update(table: TableName, id: string, patch: Row): Promise<Row>;
  remove(table: TableName, id: string): Promise<void>;
  removeWallState(scenarioId: string, wallId: string): Promise<void>;
  load(projectId: string, scenarioId: string): Promise<ScenarioData>;
}

export type ScenarioData = {
  layers: Row[];
  walls: Row[];
  openings: Row[];
  groups: Row[];
  objects: Row[];
  wallStates: Row[];
  slab: Row | null;
};

export const supabaseRepo: Repo = {
  async insert(table, row) {
    const { data, error } = await supabase.from(table).insert(row as never).select('*').single();
    if (error) throw error;
    return data as Row;
  },
  async update(table, id, patch) {
    const { data, error } = await supabase.from(table).update(patch as never).eq('id', id).select('*').single();
    if (error) throw error;
    return data as Row;
  },
  async remove(table, id) {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) throw error;
  },
  async removeWallState(scenarioId, wallId) {
    const { error } = await supabase.from('scenario_wall_states').delete().eq('scenario_id', scenarioId).eq('wall_id', wallId);
    if (error) throw error;
  },
  async load(projectId, scenarioId) {
    const [layers, shellWalls, scWalls, groups, objects, states, slab] = await Promise.all([
      supabase.from('layers').select('*').eq('project_id', projectId).order('sort'),
      supabase.from('walls').select('*').eq('project_id', projectId).eq('scope', 'shell'),
      supabase.from('walls').select('*').eq('scenario_id', scenarioId),
      supabase.from('object_groups').select('*').eq('scenario_id', scenarioId),
      supabase.from('objects').select('*').eq('scenario_id', scenarioId).order('z_order'),
      supabase.from('scenario_wall_states').select('*').eq('scenario_id', scenarioId),
      supabase.from('slabs').select('*').eq('scenario_id', scenarioId).maybeSingle(),
    ]);
    for (const r of [layers, shellWalls, scWalls, groups, objects, states, slab]) if (r.error) throw r.error;
    const walls = [...(shellWalls.data ?? []), ...(scWalls.data ?? [])];
    const wallIds = walls.map((w) => w.id);
    let openings: Row[] = [];
    if (wallIds.length) {
      const res = await supabase.from('openings').select('*').in('wall_id', wallIds);
      if (res.error) throw res.error;
      openings = (res.data ?? []) as Row[];
    }
    return {
      layers: (layers.data ?? []) as Row[],
      walls: walls as Row[],
      openings,
      groups: (groups.data ?? []) as Row[],
      objects: (objects.data ?? []) as Row[],
      wallStates: (states.data ?? []) as Row[],
      slab: (slab.data ?? null) as Row | null,
    };
  },
};
