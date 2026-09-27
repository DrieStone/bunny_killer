import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  // inline the sprites as data URLs so the one-file build works offline
  build: { assetsInlineLimit: 256 * 1024 },
  server: { port: 5190 },
  test: { environment: 'node' },
});
