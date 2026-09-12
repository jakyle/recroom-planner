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
