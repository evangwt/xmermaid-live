import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  optimizeDeps: {
    // wasm-bindgen exposes its imports dynamically; Vite's esbuild prebundle
    // removes those callable imports and prevents the runtime from starting.
    exclude: ['@evangwt/xmermaid'],
  },
  test: {
    css: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    restoreMocks: true,
  },
});
