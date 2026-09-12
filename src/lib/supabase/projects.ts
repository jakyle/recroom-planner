import { supabase } from './client';
import type { Database } from './database.types';

export type ProjectRow = Database['public']['Tables']['projects']['Row'];
export type CreatedProject = { project_id: string; view_token: string; edit_token: string };

export async function createProject(name: string, template: 'empty' | 'pool_room' = 'empty'): Promise<CreatedProject> {
  const { data, error } = await supabase.rpc('create_project', { p_name: name, p_template: template });
  if (error) throw error;
  return data as unknown as CreatedProject;
}

export async function listMyProjects(): Promise<Array<{ id: string; name: string; access: string }>> {
  const { data, error } = await supabase
    .from('project_members')
    .select('access, projects(id, name)')
    .order('joined_at', { ascending: false });
  if (error) throw error;
  return (data ?? [])
    .filter((r) => r.projects)
    .map((r) => ({ id: r.projects!.id, name: r.projects!.name, access: r.access }));
}

export async function getProject(id: string): Promise<ProjectRow> {
  const { data, error } = await supabase.from('projects').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function renameProject(id: string, name: string): Promise<void> {
  const { error, count } = await supabase.from('projects').update({ name }, { count: 'exact' }).eq('id', id);
  if (error) throw error;
  if (!count) throw new Error('rename rejected (not owner)');
}
