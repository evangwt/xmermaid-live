# xmermaid Live

[English](README.md) | [Chinese](README.zh-CN.md)

[![GitHub Pages](https://img.shields.io/github/actions/workflow/status/evangwt/xmermaid-live/deploy-pages.yml?branch=main&label=GitHub%20Pages&logo=github)](https://github.com/evangwt/xmermaid-live/actions/workflows/deploy-pages.yml)
[![Live demo](https://img.shields.io/badge/try-live%20editor-0b7a53?logo=githubpages)](https://evangwt.github.io/xmermaid-live/)
[![xmermaid npm](https://img.shields.io/npm/v/%40evangwt%2Fxmermaid?label=%40evangwt%2Fxmermaid&logo=npm)](https://www.npmjs.com/package/@evangwt/xmermaid)
[![License: MIT](https://img.shields.io/badge/license-MIT-0b7a53.svg)](LICENSE)

**Paste your AI chat log, get every diagram.** The workbench for the [@evangwt/xmermaid](https://www.npmjs.com/package/@evangwt/xmermaid) Rust/WASM renderer — no account, no server, no upload.

![The xmermaid Live workbench extracting two flowcharts from one Markdown document](https://raw.githubusercontent.com/evangwt/xmermaid-live/main/docs/assets/hero-workbench.png)

<p>
  <a href="https://evangwt.github.io/xmermaid-live/"><strong>Open the live editor</strong></a>
  &nbsp;|&nbsp;
  <a href="https://github.com/evangwt/xmermaid"><strong>Explore the renderer</strong></a>
</p>

## Why xmermaid Live?

- **Every diagram, not just one** — fenced, unclosed, or bare in prose; extracted in one pass (1,000 diagrams in under 1.5s on the verification environment)
- **AI-syntax friendly** — the same sanitization as the renderer: HTML labels, Markdown strings, cosmetic `classDef` all render
- **Honest, per diagram** — real support status, copyable diagnostics, reproduction source
- **Private by architecture** — a static site; the workspace stays in your browser
- **Portable output** — SVG/PNG export, share links via URL hash (up to 50,000 characters)

> **Privacy:** client-side only. Diagram source is cached in local storage and optionally encoded in the URL hash — never uploaded to this project or any server. Clear the site's browser data to remove the cache.

## The renderer behind it

A thin static shell over [`@evangwt/xmermaid`](https://github.com/evangwt/xmermaid): a Rust/WASM renderer whose machine-readable matrix covers the Mermaid 11.16.0 catalog (30 documented families). User Journey, Gantt, and Pie are fully supported; the rest render documented subsets.

Full contract: [renderer README](https://github.com/evangwt/xmermaid#what-renders-today).

## The workbench

- **Three panes, your layout** — draggable separators, keyboard fine-tuning, layout saved locally
- **Local preview controls** — zoom 25%–400%, fit, fullscreen; zoom/pan never enter share links
- **Compact screens** — bottom navigation on mobile; share/export in More
- **Honest visual editing** — AST-backed pipeline validates through parse and render before touching your source; class-styled sources stay read-only

## Develop

- Node.js 22+; Chrome/Chromium, Firefox, and WebKit for verification

```bash
npm install
npx playwright install chromium firefox webkit
npm run dev
```

Builds pin an exact `@evangwt/xmermaid` version — from `registry.npmjs.org` for released builds, or the gitignored `vendor/evangwt-xmermaid-<version>.tgz` while a version is ahead of its `npm publish`.

## Verify

```bash
npm run verify
```

Unit tests, type checking, production build, real WASM, and browser checks. All scenarios run in Chrome/Chromium; the core editing workflow and deployment smoke also run in Firefox and WebKit.

The capacity contract covers synchronous extraction and list update for 1,000 Mermaid diagrams in under 1.5 seconds on the verification environment. This is not an incremental parser — larger documents can still block the main thread.

### Diagram matrix

```bash
npm run serve:test &
npm run test:diagrams -- --browser=chromium --runs=2
```

Renders one complex example per diagram family (`scripts/diagram-matrix/examples.mjs`) and screenshots the preview; reports land in `output/diagram-matrix/<browser>/`. Also runs in CI (`.github/workflows/diagram-matrix.yml`).

`scripts/diagram-matrix/REPORT.md` documents the support boundary and known upstream defects.

## Deploy

**GitHub Pages** — <https://evangwt.github.io/xmermaid-live/>. `.github/workflows/deploy-pages.yml` deploys every push to `main`. Before the first deploy, set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**.

**Any static host:**

```bash
npm run build
```

`dist/` uses relative URLs — deploy it at a domain root or under a path like `/xmermaid-live/`. No server API, Node process, or Rust toolchain needed after the build.

Share links are capped at a 50,000-character URL hash; longer documents stay editable and exportable but never enter the address bar.

**Search and AI discovery** — the homepage ships Chinese/English metadata, truthful SoftwareApplication structured data, a sitemap, crawler rules, and `llms.txt`.

## License

MIT. See [LICENSE](LICENSE).
