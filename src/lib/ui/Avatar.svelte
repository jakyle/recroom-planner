<script lang="ts">
  let { name, color, title = name }: { name: string; color: string; title?: string } = $props();
  const initial = $derived((name.trim()[0] ?? '?').toUpperCase());
</script>

<span class="avatar" style={`background:${color}`} {title} aria-label={title}>{initial}</span>
