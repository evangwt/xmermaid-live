// @vitest-environment node

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const scriptPath = fileURLToPath(new URL('../scripts/review-snapshot.mjs', import.meta.url));
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

describe('review-snapshot', () => {
  it('hashes the base commit, tracked diff, paths, and untracked file bytes deterministically', async () => {
    const repository = await createRepository();
    await writeFile(join(repository, 'tracked.txt'), 'changed\n');
    await mkdir(join(repository, 'notes'));
    await writeFile(join(repository, 'notes/new.txt'), 'first\n');

    const first = runSnapshot(repository);
    const repeated = runSnapshot(repository);
    runGit(repository, ['config', 'diff.noprefix', 'true']);
    runGit(repository, ['config', 'core.abbrev', '12']);
    const withDifferentGitConfig = runSnapshot(repository);
    await writeFile(join(repository, 'notes/new.txt'), 'second\n');
    const changed = runSnapshot(repository);

    expect(first).toEqual(repeated);
    expect(withDifferentGitConfig).toEqual(first);
    expect(first.head).toMatch(/^[0-9a-f]{40}$/);
    expect(first.trackedDiffSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(first.snapshotSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(first.untrackedFiles).toEqual(['notes/new.txt']);
    expect(changed.snapshotSha256).not.toBe(first.snapshotSha256);
  });
});

interface ReviewSnapshot {
  head: string;
  trackedDiffSha256: string;
  snapshotSha256: string;
  untrackedFiles: string[];
}

async function createRepository(): Promise<string> {
  const repository = await mkdtemp(join(tmpdir(), 'xmermaid-live-review-'));
  temporaryDirectories.push(repository);
  runGit(repository, ['init']);
  runGit(repository, ['config', 'user.email', 'test@example.com']);
  runGit(repository, ['config', 'user.name', 'Test']);
  await writeFile(join(repository, 'tracked.txt'), 'original\n');
  runGit(repository, ['add', 'tracked.txt']);
  runGit(repository, ['commit', '-m', 'base']);
  return repository;
}

function runSnapshot(repository: string): ReviewSnapshot {
  const result = spawnSync(process.execPath, [scriptPath, '--cwd', repository], { encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as ReviewSnapshot;
}

function runGit(repository: string, args: string[]): void {
  const result = spawnSync('git', args, { cwd: repository, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
}
