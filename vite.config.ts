import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  // inline the sprites as data URLs so the one-file build works offline
  build: { assetsInlineLimit: 256 * 1024 },
  server: { port: 5190 },
  // some tests farm for weeks of game time; give them room on a busy machine
  test: { environment: 'node', testTimeout: 30_000 },
});
