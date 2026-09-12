<script lang="ts">
  import Panel from './Panel.svelte';
  import { formatLength, parseLength } from '../geom/units';
  import { downscaleImage, removeProjectImage, uploadProjectImage } from '../supabase/storage';
  import { setProjectSetting, type Underlay } from '../supabase/settings';

  let {
    projectId,
    underlay,
    canEdit,
    onchange,
  }: { projectId: string; underlay: Underlay | null; canEdit: boolean; onchange: (u: Underlay | null) => void } = $props();

  let busy = $state(false);
  let error = $state('');

  async function save(next: Underlay | null) {
    error = '';
    try {
      await setProjectSetting(projectId, 'underlay', next);
      onchange(next);
    } catch (e) {
      error = String((e as Error).message ?? e);
    }
  }

  async function onFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    busy = true;
    error = '';
    try {
      const { blob, ext, width, height } = await downscaleImage(file);
      if (blob.size > 5 * 1024 * 1024) throw new Error('Image is over 5 MB after downscaling.');
      const path = await uploadProjectImage(projectId, blob, ext);
      if (underlay?.path) await removeProjectImage(underlay.path).catch(() => undefined);
      await save({ path, x: 0, y: 0, width: 348, aspect: height / width, rotation: 0, opacity: 0.5, visible: true });
    } catch (err) {
      error = String((err as Error).message ?? err);
    } finally {
      busy = false;
    }
  }

  async function remove() {
    if (!underlay || !confirm('Remove the underlay image?')) return;
    await removeProjectImage(underlay.path).catch(() => undefined);
    await save(null);
  }

  function patch(p: Partial<Underlay>) {
    if (!underlay) return;
    void save({ ...underlay, ...p });
  }

  function setLen(key: 'x' | 'y' | 'width', raw: string) {
    const v = parseLength(raw);
    if (v === null || (key === 'width' && v < 12)) return;
    patch({ [key]: v });
  }
  const onEnter = (e: KeyboardEvent) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur();
</script>

<Panel title="Trace underlay" testId="underlay-panel">
  {#if !underlay}
    <p class="note">Put a photo or scan under the plan, scale it to the room, and trace over it.</p>
    <label class="btn btn--sm" class:disabled={!canEdit || busy}>
      {busy ? 'Uploading…' : 'Choose image…'}
      <input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={!canEdit || busy} onchange={onFile} />
    </label>
  {:else}
    <div class="row">
      <button class="btn btn--sm" data-test="underlay-visible" aria-pressed={underlay.visible} disabled={!canEdit} onclick={() => patch({ visible: !underlay!.visible })}>{underlay.visible ? 'Shown' : 'Hidden'}</button>
      <label class="row grow"><span class="label">Opacity</span><input type="range" min="0.1" max="1" step="0.05" value={underlay.opacity} disabled={!canEdit} oninput={(e) => patch({ opacity: Number((e.currentTarget as HTMLInputElement).value) })} /></label>
    </div>
    <div class="grid3">
      <label class="field"><span class="label">X</span><input class="input input--mono" value={formatLength(underlay.x)} disabled={!canEdit} onblur={(e) => setLen('x', (e.currentTarget as HTMLInputElement).value)} onkeydown={onEnter} /></label>
      <label class="field"><span class="label">Y</span><input class="input input--mono" value={formatLength(underlay.y)} disabled={!canEdit} onblur={(e) => setLen('y', (e.currentTarget as HTMLInputElement).value)} onkeydown={onEnter} /></label>
      <label class="field"><span class="label">Width</span><input class="input input--mono" data-test="underlay-width" value={formatLength(underlay.width)} disabled={!canEdit} onblur={(e) => setLen('width', (e.currentTarget as HTMLInputElement).value)} onkeydown={onEnter} /></label>
    </div>
    <div class="row">
      <label class="field grow"><span class="label">Rotation</span><input class="input input--mono" value={underlay.rotation} disabled={!canEdit} onblur={(e) => { const v = Number((e.currentTarget as HTMLInputElement).value); if (Number.isFinite(v)) patch({ rotation: v }); }} onkeydown={onEnter} /></label>
      <button class="btn btn--sm" disabled={!canEdit} onclick={() => patch({ x: 0, y: 0, width: underlay!.aspect > 1 ? 348 : 348, rotation: 0 })} title="Anchor to the room origin at the room width">Fit width to room</button>
    </div>
    <div class="row">
      <label class="btn btn--sm btn--quiet" class:disabled={!canEdit || busy}>Replace…<input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={!canEdit || busy} onchange={onFile} /></label>
      <button class="btn btn--sm btn--quiet btn--danger" disabled={!canEdit} onclick={remove}>Remove</button>
    </div>
  {/if}
  {#if error}<p class="error">{error}</p>{/if}
</Panel>

<style>
  .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; }
  .btn.disabled { opacity: 0.5; pointer-events: none; }
  input[type='range'] { accent-color: var(--blueprint); width: 100%; }
</style>
