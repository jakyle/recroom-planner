<script lang="ts">
  let { hash }: { hash: string } = $props();
</script>

<h1>Not found</h1>
<p>No page at <code>{hash}</code>. <a href="#/">Home</a></p>
