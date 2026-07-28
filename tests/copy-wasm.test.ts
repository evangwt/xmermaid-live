// @vitest-environment node

import { readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const copiedPath = new URL('../public/xmermaid_wasm_bg.wasm', import.meta.url);
const packagePath = new URL('../node_modules/xmermaid/dist/xmermaid_wasm_bg.wasm', import.meta.url);
const projectPackagePath = new URL('../package.json', import.meta.url);
const provenancePath = new URL('../vendor/xmermaid-provenance.json', import.meta.url);
const SOURCE_BUILD_INPUTS = [
  'Cargo.toml',
  'Cargo.lock',
  'package.json',
  'rollup.config.ts',
  'tsconfig.json',
  'README.md',
  'LICENSE',
  'scripts/build-wasm.cjs',
  'scripts/copy-wasm-dist.cjs',
  'src',
  'crates/xmermaid-layout/Cargo.toml',
  'crates/xmermaid-layout/src',
  'crates/xmermaid-parser/Cargo.toml',
  'crates/xmermaid-parser/src',
  'crates/xmermaid-wasm/Cargo.toml',
  'crates/xmermaid-wasm/src',
] as const;

async function removeCopiedAsset() {
  await rm(copiedPath, { force: true });
}

beforeEach(removeCopiedAsset);
afterEach(removeCopiedAsset);

describe('copy-xmermaid-wasm', () => {
  it('pins the vendored package to its upstream base commit and build-input diff', async () => {
    const provenance = JSON.parse(await readFile(provenancePath, 'utf8')) as {
      sourceBaseCommit: string;
      sourceBuildInputDiffSha256: string;
    };

    expect(provenance.sourceBaseCommit).toBe('990ea8cd8be219ab03ceb513d66bc8571654277b');
    expect(sourceBaseIsAncestor(provenance.sourceBaseCommit)).toBe(true);
    expect(provenance.sourceBuildInputDiffSha256).toBe(sourceBuildInputDiffSha256(provenance.sourceBaseCommit));
  });

  it('installs the vendored package whose bytes match recorded provenance', async () => {
    const projectPackage = JSON.parse(await readFile(projectPackagePath, 'utf8')) as {
      dependencies: { xmermaid: string };
    };
    const provenance = JSON.parse(await readFile(provenancePath, 'utf8')) as {
      packageFile: string;
      packageSha256: string;
      sourceBaseCommit: string;
      sourceBuildInputDiffSha256: string;
      wasmSha256: string;
    };
    const tarball = await readFile(new URL(`../${provenance.packageFile}`, import.meta.url));
    const wasm = await readFile(packagePath);

    expect(projectPackage.dependencies.xmermaid).toBe(`file:${provenance.packageFile}`);
    expect(provenance.sourceBaseCommit).toBe('990ea8cd8be219ab03ceb513d66bc8571654277b');
    expect(provenance.sourceBuildInputDiffSha256).toBe(sourceBuildInputDiffSha256(provenance.sourceBaseCommit));
    expect(sha256(tarball)).toBe(provenance.packageSha256);
    expect(sha256(wasm)).toBe(provenance.wasmSha256);
  });

  it('copies the exact installed WASM bytes into public assets', async () => {
    const result = spawnSync(process.execPath, ['scripts/copy-xmermaid-wasm.mjs'], {
      cwd: new URL('..', import.meta.url),
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    expect(await readFile(copiedPath)).toEqual(await readFile(packagePath));
  });
});

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function sourceBuildInputDiffSha256(sourceBaseCommit: string): string {
  const result = spawnSync('git', ['diff', '--no-ext-diff', '--binary', sourceBaseCommit, '--', ...SOURCE_BUILD_INPUTS], {
    cwd: new URL('../../xmermaid/', import.meta.url),
    encoding: 'buffer',
  });
  expect(result.status, result.stderr.toString()).toBe(0);
  return sha256(result.stdout);
}

function sourceBaseIsAncestor(sourceBaseCommit: string): boolean {
  const result = spawnSync('git', ['merge-base', '--is-ancestor', sourceBaseCommit, 'HEAD'], {
    cwd: new URL('../../xmermaid/', import.meta.url),
  });
  return result.status === 0;
}
