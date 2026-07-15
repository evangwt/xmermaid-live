// @vitest-environment node

import { readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const copiedPath = new URL('../public/xmermaid_wasm_bg.wasm', import.meta.url);
const packagePath = new URL('../node_modules/xmermaid/dist/xmermaid_wasm_bg.wasm', import.meta.url);

afterEach(async () => {
  await rm(copiedPath, { force: true });
});

describe('copy-xmermaid-wasm', () => {
  it('copies the exact installed WASM bytes into public assets', async () => {
    const result = spawnSync(process.execPath, ['scripts/copy-xmermaid-wasm.mjs'], {
      cwd: new URL('..', import.meta.url),
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    expect(await readFile(copiedPath)).toEqual(await readFile(packagePath));
  });
});
