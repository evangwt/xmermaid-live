import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  test: {
    css: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    restoreMocks: true,
  },
});
