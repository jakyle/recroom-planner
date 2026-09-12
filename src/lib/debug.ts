import { supabase } from './supabase/client';
import { renameProject } from './supabase/projects';
import { renameScenario } from './supabase/scenarios';
import { rotateShareLink } from './supabase/members';

export function installDebugHooks(): void {
  if (!import.meta.env.DEV) return;
  (window as unknown as { __rr: unknown }).__rr = { supabase, renameProject, renameScenario, rotateShareLink };
}
