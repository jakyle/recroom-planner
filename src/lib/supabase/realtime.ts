import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './client';
import { ensureSession } from './auth';

export function projectTopic(projectId: string): string {
  return `project:${projectId}`;
}

/** Create the project's private channel with the current session applied to the socket (R2.6). */
export async function projectChannel(projectId: string): Promise<RealtimeChannel> {
  const session = await ensureSession();
  await supabase.realtime.setAuth(session.access_token);
  return supabase.channel(projectTopic(projectId), { config: { private: true } });
}

export type JoinStatus = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED';

/** Subscribe and resolve with the first terminal status. */
export function subscribeOnce(channel: RealtimeChannel, timeoutMs = 8000): Promise<{ status: JoinStatus; error: string | null }> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve({ status: 'TIMED_OUT', error: 'timeout' }), timeoutMs);
    channel.subscribe((status, err) => {
      if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        clearTimeout(t);
        resolve({ status, error: err ? String(err.message ?? err) : null });
      }
    });
  });
}
