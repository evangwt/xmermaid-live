// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { resolveConfig } from 'vite';

describe('Vite development configuration', () => {
  it('does not prebundle the WASM-backed xmermaid runtime', async () => {
    const config = await resolveConfig({}, 'serve', 'development');

    expect(config.optimizeDeps.exclude).toContain('@evangwt/xmermaid');
  });
});
