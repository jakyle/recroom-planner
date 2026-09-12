<script lang="ts">
  import { onMount } from 'svelte';
  import { supabase, envOk } from '../lib/supabase/client';
  import { ensureSession } from '../lib/supabase/auth';
  import { listMyProjects } from '../lib/supabase/projects';
  import { projectChannel, subscribeOnce } from '../lib/supabase/realtime';

  type Check = { name: string; status: 'pending' | 'ok' | 'fail' | 'manual'; detail: string };
  let checks = $state<Check[]>([
    { name: 'Env vars present', status: 'pending', detail: '' },
    { name: 'Anonymous sign-in', status: 'pending', detail: 'config.toml auth.enable_anonymous_sign_ins' },
    { name: 'Schema + bucket + realtime policy', status: 'pending', detail: 'supabase db push' },
    { name: 'Realtime private channel join', status: 'pending', detail: 'needs a project you belong to' },
    { name: 'Google provider', status: 'manual', detail: 'Configure the OAuth client in the dashboard; verified by clicking Link Google' },
  ]);

  function set(i: number, status: Check['status'], detail?: string) {
    checks[i] = { ...checks[i], status, detail: detail ?? checks[i].detail };
  }

  onMount(async () => {
    set(0, envOk ? 'ok' : 'fail');
    if (!envOk) return;
    try {
      await ensureSession();
      set(1, 'ok');
    } catch (e) {
      set(1, 'fail', String((e as Error).message));
      return;
    }
    try {
      const { data, error } = await supabase.rpc('setup_check');
      if (error) throw error;
      const d = data as Record<string, unknown>;
      const ok = d.pgcrypto === true && Number(d.tables) >= 20 && d.bucket_refs === true && d.realtime_policy === true;
      set(2, ok ? 'ok' : 'fail', JSON.stringify(d));
    } catch (e) {
      set(2, 'fail', String((e as Error).message));
    }
    try {
      const mine = await listMyProjects();
      if (mine.length === 0) {
        set(3, 'manual', 'create or join a project first');
        return;
      }
      const ch = await projectChannel(mine[0].id);
      const { status, error: joinError } = await subscribeOnce(ch);
      await supabase.removeChannel(ch);
      set(3, status === 'SUBSCRIBED' ? 'ok' : 'fail', joinError ?? status);
    } catch (e) {
      set(3, 'fail', String((e as Error).message));
    }
  });
</script>

<h1>Setup check</h1>
<table>
  <tbody>
    {#each checks as c (c.name)}
      <tr data-test="check" data-status={c.status}>
        <td>{c.name}</td>
        <td><strong>{c.status.toUpperCase()}</strong></td>
        <td>{c.detail}</td>
      </tr>
    {/each}
  </tbody>
</table>
<p><a href="#/">Home</a></p>
