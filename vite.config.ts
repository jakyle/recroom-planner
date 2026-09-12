import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  base: '/recroom-planner/',
  plugins: [svelte()],
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
