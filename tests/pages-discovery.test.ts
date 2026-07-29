import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const canonicalUrl = 'https://evangwt.github.io/xmermaid-live/';
const indexPath = resolve(process.cwd(), 'index.html');
const robotsPath = resolve(process.cwd(), 'public/robots.txt');
const sitemapPath = resolve(process.cwd(), 'public/sitemap.xml');
const llmsPath = resolve(process.cwd(), 'public/llms.txt');
const workflowPath = resolve(process.cwd(), '.github/workflows/deploy-pages.yml');
const readmePath = resolve(process.cwd(), 'README.md');

describe('GitHub Pages discovery resources', () => {
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
    expect(sitemap).toContain('<lastmod>2026-07-30</lastmod>');
    expect(llms).toContain(`# xmermaid live\n\nHomepage: ${canonicalUrl}`);
    expect(llms).toContain('中文');
    expect(llms).toContain('English');
    expect(llms).toContain('不上传用户文档');
    expect(llms).toContain('does not upload user documents');
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
  expect(workflow).toContain('actions/checkout@v4');
  expect(workflow).toContain('actions/setup-node@v4');
  expect(workflow).toContain('node-version: 26');
  expect(workflow).toContain('npm ci');
  expect(workflow).toContain('npm run build');
  expect(workflow).toContain('actions/configure-pages@v5');
  expect(workflow).toContain('actions/upload-pages-artifact@v3');
  expect(workflow).toContain('path: ./dist');
  expect(workflow).toContain('actions/deploy-pages@v4');
  expect(workflow).toContain('name: github-pages');
  expect(readme).toContain(canonicalUrl);
  expect(readme).toContain('Settings → Pages');
  expect(readme).toContain('GitHub Actions');
  expect(readme).toContain('does not upload user documents');
});
