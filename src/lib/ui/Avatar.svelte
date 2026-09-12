<script lang="ts">
  let {
    name,
    color,
    title = name,
    online = null,
    onclick = null,
  }: { name: string; color: string; title?: string; online?: boolean | null; onclick?: (() => void) | null } = $props();
  const initial = $derived((name.trim()[0] ?? '?').toUpperCase());
  const dataOnline = $derived(online === null ? undefined : String(online));
</script>

{#if onclick}
  <button
    type="button"
    class="avatar"
    class:avatar--online={online === true}
    class:avatar--away={online === false}
    data-test="avatar"
    data-online={dataOnline}
    style={`background:${color}`}
    {title}
    aria-label={title}
    {onclick}
  >{initial}</button>
{:else}
  <span class="avatar" class:avatar--online={online === true} class:avatar--away={online === false} data-test="avatar" data-online={dataOnline} style={`background:${color}`} {title} aria-label={title}>{initial}</span>
{/if}
