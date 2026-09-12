<script lang="ts">
  import { onMount } from 'svelte';
  import { supabase, envOk } from '../lib/supabase/client';
  import { ensureSession } from '../lib/supabase/auth';
  import { listMyProjects } from '../lib/supabase/projects';
  import { projectChannel, subscribeOnce } from '../lib/supabase/realtime';
  import TitleBlock from '../lib/ui/TitleBlock.svelte';
  import StatusStrip from '../lib/ui/StatusStrip.svelte';

  type Check = { name: string; status: 'pending' | 'ok' | 'fail' | 'manual'; detail: string };
  let checks = $state<Check[]>([
    { name: 'Build has Supabase URL and key', status: 'pending', detail: '' },
    { name: 'Anonymous sign-in', status: 'pending', detail: 'config.toml → auth.enable_anonymous_sign_ins' },
    { name: 'Schema, storage bucket, realtime policy', status: 'pending', detail: 'npx supabase db push' },
    { name: 'Realtime private channel', status: 'pending', detail: 'needs a plan you belong to' },
    { name: 'Google sign-in provider', status: 'manual', detail: 'Set up the OAuth client in the Supabase dashboard, then use Link Google on a plan' },
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
      set(2, ok ? 'ok' : 'fail', `${d.tables} tables · bucket ${d.bucket_refs ? 'present' : 'missing'} · realtime policy ${d.realtime_policy ? 'present' : 'missing'}`);
    } catch (e) {
      set(2, 'fail', String((e as Error).message));
    }
    try {
      const mine = await listMyProjects();
      if (mine.length === 0) {
        set(3, 'manual', 'Create or join a plan first, then reload this page');
        return;
      }
      let status = '';
      let joinError: string | null = null;
      for (let attempt = 0; attempt < 2 && status !== 'SUBSCRIBED'; attempt++) {
        const ch = await projectChannel(mine[0].id);
        ({ status, error: joinError } = await subscribeOnce(ch, 15_000));
        await supabase.removeChannel(ch);
      }
      set(3, status === 'SUBSCRIBED' ? 'ok' : 'fail', status === 'SUBSCRIBED' ? `joined project:${mine[0].id.slice(0, 8)}…` : (joinError ?? status));
    } catch (e) {
      set(3, 'fail', String((e as Error).message));
    }
  });
</script>

<div class="page">
  <TitleBlock revision="setup">
    {#snippet title()}Setup check{/snippet}
    {#snippet actions()}<a class="btn btn--quiet btn--sm" href="#/">Back to plans</a>{/snippet}
  </TitleBlock>
  <div class="page__body">
    <div class="hero">
      <h1>Is the backend wired up?</h1>
      <p class="note">Each line calls the live service. Fix anything stamped FAIL before handing out links.</p>
    </div>
    <section class="card">
      <table class="tbl" style="margin: 6px 0">
        <tbody>
          {#each checks as c (c.name)}
            <tr data-test="check" data-status={c.status}>
              <td style="padding-left:16px"><span class={`stamp stamp--${c.status}`}>{c.status}</span></td>
              <td>{c.name}</td>
              <td class="mono" style="padding-right:16px">{c.detail}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  </div>
  <StatusStrip live={checks[3].status === 'ok' ? 'online' : 'connecting'} />
</div>
