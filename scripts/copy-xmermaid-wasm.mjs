import { copyFile, mkdir } from 'node:fs/promises';

const source = new URL('../node_modules/xmermaid/dist/xmermaid_wasm_bg.wasm', import.meta.url);
const publicDirectory = new URL('../public/', import.meta.url);
const destination = new URL('xmermaid_wasm_bg.wasm', publicDirectory);

await mkdir(publicDirectory, { recursive: true });
await copyFile(source, destination);
