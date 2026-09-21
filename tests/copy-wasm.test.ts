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

interface LockEntry {
  version?: string;
  resolved?: string;
  integrity?: string;
}

// The dependency is either the registry release (published state) or a
// vendored tgz of the same version (development state ahead of `npm publish`).
async function installedXmermaidVersion(): Promise<string> {
  const installed = JSON.parse(await readFile(
    new URL('../node_modules/@evangwt/xmermaid/package.json', import.meta.url),
    'utf8',
  )) as { version?: string };
  expect(installed.version).toBeTypeOf('string');
  return installed.version!;
}

function isVendorSpecFor(spec: string, version: string): boolean {
  return spec === `file:vendor/evangwt-xmermaid-${version}.tgz`;
}

describe('copy-xmermaid-wasm', () => {
  it('uses the scoped SDK package artifact selected for this build', async () => {
    const projectPackage = JSON.parse(await readFile(projectPackagePath, 'utf8')) as {
      dependencies: Record<string, string>;
    };
    const version = await installedXmermaidVersion();
    const spec = projectPackage.dependencies['@evangwt/xmermaid'];

    const matchesRegistry = spec === version;
    const matchesVendor = isVendorSpecFor(spec, version);
    expect(matchesRegistry || matchesVendor, `dependency spec ${spec} must match installed version ${version}`).toBe(true);
  });

  it('locks the package artifact consistently with the dependency spec', async () => {
    const projectPackage = JSON.parse(await readFile(projectPackagePath, 'utf8')) as {
      dependencies: { '@evangwt/xmermaid': string };
    };
    const packageLock = JSON.parse(await readFile(lockfilePath, 'utf8')) as {
      packages: Record<string, LockEntry>;
    };
    const version = await installedXmermaidVersion();
    const spec = projectPackage.dependencies['@evangwt/xmermaid'];
    const installedPackage = JSON.parse(await readFile(
      new URL('../node_modules/@evangwt/xmermaid/package.json', import.meta.url),
      'utf8',
    )) as { name?: string; version?: string };
    const wasm = await readFile(packagePath);

    expect(installedPackage).toMatchObject({ name: '@evangwt/xmermaid', version });
    expect(wasm.byteLength).toBeGreaterThan(0);
    const locked = packageLock.packages['node_modules/@evangwt/xmermaid'];
    expect(locked).toMatchObject({ version, integrity: expect.stringMatching(/^sha512-/) });
    if (spec === version) {
      expect(locked.resolved).toBe(`https://registry.npmjs.org/@evangwt/xmermaid/-/xmermaid-${version}.tgz`);
    } else {
      expect(isVendorSpecFor(spec, version)).toBe(true);
      expect(locked.resolved).toBe(spec);
    }
  });

  it('copies into an isolated output directory without touching the live public asset', { timeout: 30_000 }, async () => {
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
