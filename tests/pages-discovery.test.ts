import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { getSupportMatrix } from '@evangwt/xmermaid';
import { describe, expect, it } from 'vitest';

const canonicalUrl = 'https://evangwt.github.io/xmermaid-live/';
const indexPath = resolve(process.cwd(), 'index.html');
const robotsPath = resolve(process.cwd(), 'public/robots.txt');
const sitemapPath = resolve(process.cwd(), 'public/sitemap.xml');
const llmsPath = resolve(process.cwd(), 'public/llms.txt');
const workflowPath = resolve(process.cwd(), '.github/workflows/deploy-pages.yml');
const readmePath = resolve(process.cwd(), 'README.md');
const chineseReadmePath = resolve(process.cwd(), 'README.zh-CN.md');
const xmermaidPackagePath = resolve(process.cwd(), 'node_modules/@evangwt/xmermaid/package.json');
const rendererRepository = 'https://github.com/evangwt/xmermaid';
const liveRepository = 'https://github.com/evangwt/xmermaid-live';
const deliveryFiles = [
  'LICENSE',
  'README.zh-CN.md',
];

describe('GitHub Pages discovery resources', () => {
  it('keeps local artifacts private and installs xmermaid from the official registry', async () => {
    const [gitignore, npmrc, projectPackage, packageLock] = await Promise.all([
      readFile(resolve(process.cwd(), '.gitignore'), 'utf8'),
      readFile(resolve(process.cwd(), '.npmrc'), 'utf8'),
      readFile(resolve(process.cwd(), 'package.json'), 'utf8'),
      readFile(resolve(process.cwd(), 'package-lock.json'), 'utf8'),
    ]);
    const packageSpec = (JSON.parse(projectPackage) as { dependencies: Record<string, string> })
      .dependencies['@evangwt/xmermaid'];
    const lockedPackages = (JSON.parse(packageLock) as {
      packages: Record<string, { resolved?: string }>;
    }).packages;

    expect(gitignore).toMatch(/^\.superpowers\/$/m);
    expect(gitignore).toMatch(/^docs\/superpowers\/$/m);
    expect(gitignore).toMatch(/^vendor\/\*\.tgz$/m);
    expect(npmrc).toBe('registry=https://registry.npmjs.org/\nreplace-registry-host=always\n');
    expect(packageSpec).toBe('0.1.9');
    expect(lockedPackages[''].resolved).toBeUndefined();
    expect(lockedPackages['node_modules/@evangwt/xmermaid'].resolved)
      .toBe('https://registry.npmjs.org/@evangwt/xmermaid/-/xmermaid-0.1.9.tgz');
    expect(packageLock).not.toContain('registry.npmmirror.com');
    expect(packageLock).not.toContain('file:vendor');
  });

  it('exposes bilingual canonical metadata and truthful SoftwareApplication JSON-LD', async () => {
    const html = await readFile(indexPath, 'utf8');
    const jsonLd = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/)?.[1];

    expect(html).toContain('<title>xmermaid live — Mermaid 图表在线编辑器 / Mermaid Diagram Editor</title>');
    expect(html).toContain('在浏览器中提取、编辑、预览和导出 Mermaid 图表');
    expect(html).toContain('Extract, edit, preview, and export Mermaid diagrams in your browser');
    expect(html).toContain(`<link rel="canonical" href="${canonicalUrl}" />`);
    expect(html).toContain(`<meta property="og:url" content="${canonicalUrl}" />`);
    expect(html).toContain('<meta name="twitter:card" content="summary" />');
    expect(html).toContain('<noscript>');
    expect(html).toContain('浏览器内 Mermaid 图表工作台');
    expect(html).toContain('Browser-based Mermaid diagram workspace');
    expect(jsonLd).toBeDefined();
    expect(JSON.parse(jsonLd!)).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'xmermaid live',
      url: canonicalUrl,
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Web Browser',
      inLanguage: ['zh-CN', 'en'],
    });
  });

  it('provides crawler and AI-discovery resources that agree on the canonical URL', async () => {
    const [robots, sitemap, llms] = await Promise.all([
      readFile(robotsPath, 'utf8'),
      readFile(sitemapPath, 'utf8'),
      readFile(llmsPath, 'utf8'),
    ]);

    expect(robots).toBe(`User-agent: *\nAllow: /\nSitemap: ${canonicalUrl}sitemap.xml\n`);
    expect(sitemap).toContain(`<loc>${canonicalUrl}</loc>`);
    expect(sitemap).toContain('<lastmod>2026-08-04</lastmod>');
    expect(llms).toContain(`# xmermaid live\n\nHomepage: ${canonicalUrl}`);
    expect(llms).toContain('中文');
    expect(llms).toContain('English');
    expect(llms).toContain('不上传用户文档');
    expect(llms).toContain('does not upload user documents');
  });

  it('states the renderer and source relationships consistently', async () => {
    const installed = JSON.parse(await readFile(xmermaidPackagePath, 'utf8')) as { version: string };
    const [html, llms] = await Promise.all([readFile(indexPath, 'utf8'), readFile(llmsPath, 'utf8')]);
    const jsonLd = JSON.parse(
      html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/)?.[1] ?? '{}',
    );

    expect(html).toContain('__XMERMAID_VERSION__');
    expect(jsonLd.softwareRequirements).toEqual(
      expect.objectContaining({ name: '@evangwt/xmermaid' }),
    );
    expect(jsonLd.sameAs).toEqual(expect.arrayContaining([rendererRepository, liveRepository]));
    expect(llms).toContain(`xmermaid version: ${installed.version}`);
    expect(llms).toContain(`Renderer source: ${rendererRepository}`);
    expect(llms).toContain(`Live source: ${liveRepository}`);
  });

  it('keeps static partial-renderer claims aligned with the runtime support matrix', async () => {
    const [html, llms, readme, chineseReadme] = await Promise.all([
      readFile(indexPath, 'utf8'),
      readFile(llmsPath, 'utf8'),
      readFile(readmePath, 'utf8'),
      readFile(chineseReadmePath, 'utf8'),
    ]);
    const partialDiagrams = getSupportMatrix().entries
      .filter(entry => entry.status === 'partial')
      .map(entry => entry.diagramType);
    const plannedDiagrams = getSupportMatrix().entries
      .filter(entry => entry.status === 'planned')
      .map(entry => entry.diagramType);
    const claims = [
      html.match(/Current partial native renderers:[^<]+/)?.[0] ?? '',
      llms.match(/^Current partial native renderers:.+$/m)?.[0] ?? '',
      readme.match(/The current partial native renderers are[^\n]+/)?.[0] ?? '',
      chineseReadme.match(/当前部分原生渲染支持的标识为[^\n]+/)?.[0] ?? '',
    ].map(claim => claim.toLowerCase());

    for (const claim of claims) {
      expect(claim).not.toBe('');
      for (const diagramType of partialDiagrams) {
        expect(claim, `partial-renderer claim is missing ${diagramType}`).toContain(diagramType);
      }
      for (const diagramType of plannedDiagrams) {
        expect(claim, `partial-renderer claim incorrectly includes planned ${diagramType}`)
          .not.toContain(diagramType);
      }
    }
  });

  it('keeps every delivery input tracked by Git', () => {
    const tracked = spawnSync('git', ['ls-files', '--error-unmatch', '--', ...deliveryFiles], {
      encoding: 'utf8',
    });

    expect(tracked.status, tracked.stderr).toBe(0);
    expect(tracked.stdout.trim().split(/\r?\n/).sort()).toEqual([...deliveryFiles].sort());

    const trackedPackageArchives = spawnSync('git', ['ls-files', '--', 'vendor/*.tgz'], {
      encoding: 'utf8',
    });
    expect(trackedPackageArchives.status, trackedPackageArchives.stderr).toBe(0);
    expect(trackedPackageArchives.stdout.trim()).toBe('');
  });
});

it('builds and deploys the canonical artifact with official Pages actions and documents the setup', async () => {
  const [workflow, readme] = await Promise.all([
    readFile(workflowPath, 'utf8'),
    readFile(readmePath, 'utf8'),
  ]);

  expect(workflow).toContain('name: Deploy GitHub Pages');
  expect(workflow).toContain('workflow_dispatch:');
  expect(workflow).toMatch(/push:\n\s+branches: \[main\]/);
  expect(workflow).toContain('contents: read');
  expect(workflow).toContain('pages: write');
  expect(workflow).toContain('id-token: write');
  expect(workflow).toContain('actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6');
  expect(workflow).toContain('actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6');
  expect(workflow).toContain('runs-on: ubuntu-24.04');
  expect(workflow).toContain('node-version: 24.19.0');
  expect(workflow).toContain('npm install --global npm@11.17.0');
  expect(workflow).toContain('npm ci');
  expect(workflow).toContain('npm audit --audit-level=high --registry=https://registry.npmjs.org');
  expect(workflow).toContain('npx playwright install --with-deps');
  expect(workflow).toContain('npm run verify');
  expect(workflow).toContain('actions/configure-pages@983d7736d9b0ae728b81ab479565c72886d7745b # v5');
  expect(workflow).toContain('actions/upload-pages-artifact@56afc609e74202658d3ffba0e8f6dda462b719fa # v3');
  expect(workflow).toContain('path: ./dist');
  expect(workflow).toContain('actions/deploy-pages@d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e # v4');
  expect(workflow).not.toMatch(/uses:\s+[^\s]+@v\d+/);
  expect(workflow).not.toMatch(/xmermaid-source|vendor\/|verify:provenance|rustup|cargo|wasm-pack/);
  expect(workflow).toContain('name: github-pages');
  expect(readme).toContain(canonicalUrl);
  expect(readme).toContain('Settings → Pages');
  expect(readme).toContain('GitHub Actions');
  expect(readme).toContain('does not upload user documents');
});
