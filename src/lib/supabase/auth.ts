import type { Session } from '@supabase/supabase-js';
import { supabase } from './client';

export async function ensureSession(): Promise<Session> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return session;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.session) throw error ?? new Error('anonymous sign-in failed');
  return data.session;
}

export function isAnonymous(session: Session): boolean {
  return session.user.is_anonymous === true;
}

export async function linkGoogle(): Promise<void> {
  const { error } = await supabase.auth.linkIdentity({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}${window.location.pathname}${window.location.hash}` },
  });
  if (error) throw error;
}
