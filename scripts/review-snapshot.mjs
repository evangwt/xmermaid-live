import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repository = resolve(readOption('--cwd') ?? process.cwd());

try {
  const head = gitText(['rev-parse', 'HEAD']);
  const trackedDiff = gitBytes([
    '-c', 'core.abbrev=40',
    '-c', 'diff.noprefix=false',
    'diff', '--binary', '--full-index', '--no-color', '--no-ext-diff', '--no-renames',
    '--src-prefix=a/', '--dst-prefix=b/', 'HEAD', '--',
  ]);
  const trackedDiffSha256 = sha256(trackedDiff);
  const untrackedFiles = gitText(['ls-files', '--others', '--exclude-standard', '-z'])
    .split('\0')
    .filter(Boolean)
    .sort();
  const untrackedFileSha256 = Object.fromEntries(untrackedFiles.map(path => [
    path,
    sha256(readFileSync(resolve(repository, path))),
  ]));
  const manifest = {
    schemaVersion: 1,
    head,
    trackedDiffSha256,
    untrackedFiles,
    untrackedFileSha256,
  };
  const snapshot = {
    ...manifest,
    snapshotSha256: sha256(Buffer.from(JSON.stringify(manifest))),
  };
  process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

function readOption(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (!value) throw new Error(`${name} requires a value.`);
  return value;
}

function gitBytes(args) {
  return execFileSync('git', args, { cwd: repository });
}

function gitText(args) {
  return gitBytes(args).toString('utf8').trim();
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
