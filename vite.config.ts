import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const xmermaidPackage = JSON.parse(
  readFileSync(new URL('./node_modules/@evangwt/xmermaid/package.json', import.meta.url), 'utf8'),
) as { version: string };

export const xmermaidVersion = xmermaidPackage.version;

export function replaceProductIdentityTokens(html: string): string {
  return html.replaceAll('__XMERMAID_VERSION__', xmermaidVersion);
}

export default defineConfig({
  base: './',
  define: {
    __XMERMAID_VERSION__: JSON.stringify(xmermaidVersion),
  },
  plugins: [
    {
      name: 'xmermaid-live-product-identity',
      transformIndexHtml(html) {
        return replaceProductIdentityTokens(html);
      },
    },
  ],
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
