import { defineConfig } from 'vitest/config'

// Relative asset paths work for file:// in Electron and any GitHub Pages sub-path.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
