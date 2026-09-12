import { supabase } from './client';
import type { Database } from './database.types';

export type ScenarioRow = Database['public']['Tables']['scenarios']['Row'];

export async function listScenarios(projectId: string): Promise<ScenarioRow[]> {
  const { data, error } = await supabase.from('scenarios').select('*').eq('project_id', projectId).order('created_at');
  if (error) throw error;
  return data ?? [];
}

export async function forkScenario(scenarioId: string, name: string): Promise<string> {
  const { data, error } = await supabase.rpc('fork_scenario', { p_scenario: scenarioId, p_name: name });
  if (error) throw error;
  return data as string;
}

export async function promoteScenario(scenarioId: string): Promise<void> {
  const { error } = await supabase.rpc('promote_scenario', { p_scenario: scenarioId });
  if (error) throw error;
}

export async function renameScenario(scenarioId: string, name: string): Promise<void> {
  const { error, count } = await supabase.from('scenarios').update({ name }, { count: 'exact' }).eq('id', scenarioId);
  if (error) throw error;
  if (!count) throw new Error('rename rejected');
}
