import { copyFile, mkdir } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const source = new URL('../node_modules/@evangwt/xmermaid/dist/xmermaid_wasm_bg.wasm', import.meta.url);
const publicDirectory = new URL('../public/', import.meta.url);
const outputDirectory = parseOutputDirectory(process.argv.slice(2));
const destinationDirectory = outputDirectory
  ? pathToFileURL(`${resolve(outputDirectory)}${sep}`)
  : publicDirectory;
const destination = new URL('xmermaid_wasm_bg.wasm', destinationDirectory);

await mkdir(destinationDirectory, { recursive: true });
await copyFile(source, destination);

function parseOutputDirectory(args) {
  const outputFlag = args.indexOf('--output-dir');
  if (outputFlag === -1) return null;

  const outputDirectory = args[outputFlag + 1];
  if (!outputDirectory || outputDirectory.startsWith('-')) {
    throw new Error('Expected a directory after --output-dir.');
  }

  return outputDirectory;
}
