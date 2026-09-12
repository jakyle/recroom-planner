import { supabase } from './client';
import type { Database } from './database.types';

export type MemberRow = Database['public']['Tables']['project_members']['Row'];
export type Access = Database['public']['Enums']['access_level'];

export async function claimShareLink(token: string): Promise<{ project_id: string; access: Access }> {
  const { data, error } = await supabase.rpc('claim_share_link', { p_token: token });
  if (error) throw error;
  return data as unknown as { project_id: string; access: Access };
}

export async function rotateShareLink(projectId: string, kind: 'view' | 'edit'): Promise<string> {
  const { data, error } = await supabase.rpc('rotate_share_link', { p_project: projectId, p_kind: kind });
  if (error) throw error;
  return data as string;
}

export async function listMembers(projectId: string): Promise<MemberRow[]> {
  const { data, error } = await supabase.from('project_members').select('*').eq('project_id', projectId).order('joined_at');
  if (error) throw error;
  return data ?? [];
}

export async function myMembership(projectId: string): Promise<MemberRow | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('project_members')
    .select('*')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function setMemberAccess(projectId: string, userId: string, access: 'view' | 'edit'): Promise<void> {
  const { error } = await supabase.from('project_members').update({ access }).eq('project_id', projectId).eq('user_id', userId);
  if (error) throw error;
}

export async function removeMember(projectId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('project_members').delete().eq('project_id', projectId).eq('user_id', userId);
  if (error) throw error;
}

export async function setDisplayName(projectId: string, name: string, color?: string): Promise<void> {
  const { error } = await supabase.rpc('set_display_name', { p_project: projectId, p_name: name, p_color: color });
  if (error) throw error;
}

export async function touchLastSeen(projectId: string): Promise<void> {
  await supabase.rpc('touch_last_seen', { p_project: projectId });
}
