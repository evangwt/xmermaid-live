// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveConfig } from 'vite';
import { XMERMAID_VERSION } from '../src/product';
import config, { replaceProductIdentityTokens, xmermaidVersion } from '../vite.config';

const xmermaidPackagePath = resolve(process.cwd(), 'node_modules/@evangwt/xmermaid/package.json');

describe('Vite development configuration', () => {
  it('does not prebundle the WASM-backed xmermaid runtime', async () => {
    const config = await resolveConfig({}, 'serve', 'development');

    expect(config.optimizeDeps.exclude).toContain('@evangwt/xmermaid');
  });

  it('injects the installed xmermaid version into application and HTML metadata', async () => {
    const installed = JSON.parse(await readFile(xmermaidPackagePath, 'utf8')) as { version: string };
    const resolved = await resolveConfig(config, 'build', 'production');

    expect(xmermaidVersion).toBe(installed.version);
    expect(XMERMAID_VERSION).toBe(installed.version);
    expect(resolved.define?.__XMERMAID_VERSION__).toBe(JSON.stringify(installed.version));
    expect(resolved.plugins.map(plugin => plugin.name)).toContain('xmermaid-live-product-identity');
    expect(replaceProductIdentityTokens('<meta content="__XMERMAID_VERSION__">')).toBe(
      `<meta content="${installed.version}">`,
    );
  });
});
