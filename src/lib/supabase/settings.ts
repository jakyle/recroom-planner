import { supabase } from './client';

export type Underlay = {
  path: string;
  x: number;
  y: number;
  width: number;
  aspect: number;
  rotation: number;
  opacity: number;
  visible: boolean;
};

export async function setProjectSetting(projectId: string, key: string, value: unknown | null): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc('set_project_setting', { p_project: projectId, p_key: key, p_value: value as never });
  if (error) throw error;
  return (data ?? {}) as Record<string, unknown>;
}
