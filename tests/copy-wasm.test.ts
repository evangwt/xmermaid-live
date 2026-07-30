// @vitest-environment node

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const copiedPath = new URL('../public/xmermaid_wasm_bg.wasm', import.meta.url);
const packagePath = new URL('../node_modules/@evangwt/xmermaid/dist/xmermaid_wasm_bg.wasm', import.meta.url);
const projectPackagePath = new URL('../package.json', import.meta.url);
const lockfilePath = new URL('../package-lock.json', import.meta.url);
const packageSpec = 'file:vendor/evangwt-xmermaid-0.1.7.tgz';
const packageIntegrity = 'sha512-9KVgnEo5R+i+SW02kH8u7BiKiaDYENltC6AYPww5kS/6erTJ20H+VFy/du6d/Gb7lsEcPMtDQxdpWV+mE4COwg==';

describe('copy-xmermaid-wasm', () => {
  it('uses the scoped SDK package artifact selected for this build', async () => {
    const projectPackage = JSON.parse(await readFile(projectPackagePath, 'utf8')) as {
      dependencies: Record<string, string>;
    };

    expect(projectPackage.dependencies['@evangwt/xmermaid']).toBe(packageSpec);
  });

  it('locks the vendored package artifact with its measured integrity', async () => {
    const projectPackage = JSON.parse(await readFile(projectPackagePath, 'utf8')) as {
      dependencies: { '@evangwt/xmermaid': string };
    };
    const packageLock = JSON.parse(await readFile(lockfilePath, 'utf8')) as {
      packages: Record<string, {
        version?: string;
        resolved?: string;
        integrity?: string;
      }>;
    };
    const installedPackage = JSON.parse(await readFile(
      new URL('../node_modules/@evangwt/xmermaid/package.json', import.meta.url),
      'utf8',
    )) as { name?: string; version?: string };
    const wasm = await readFile(packagePath);

    expect(projectPackage.dependencies['@evangwt/xmermaid']).toBe(packageSpec);
    expect(packageLock.packages['node_modules/@evangwt/xmermaid']).toMatchObject({
      version: '0.1.7',
      resolved: packageSpec,
      integrity: packageIntegrity,
    });
    expect(installedPackage).toMatchObject({ name: '@evangwt/xmermaid', version: '0.1.7' });
    expect(wasm.byteLength).toBeGreaterThan(0);
  });

  it('copies into an isolated output directory without touching the live public asset', async () => {
    const publicAssetBefore = await readOptionalFile(copiedPath);
    const outputDirectory = await mkdtemp(join(tmpdir(), 'xmermaid-live-wasm-'));

    try {
      const result = spawnSync(process.execPath, ['scripts/copy-xmermaid-wasm.mjs', '--output-dir', outputDirectory], {
        cwd: new URL('..', import.meta.url),
        encoding: 'utf8',
      });

      expect(result.status, result.stderr).toBe(0);
      expect(await readFile(join(outputDirectory, 'xmermaid_wasm_bg.wasm'))).toEqual(await readFile(packagePath));
      expect(await readOptionalFile(copiedPath)).toEqual(publicAssetBefore);
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  });
});

async function readOptionalFile(path: URL): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
