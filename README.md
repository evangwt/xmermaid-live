# xmermaid Live

[English](README.md) | [Chinese](README.zh-CN.md)

[![GitHub Pages](https://img.shields.io/github/actions/workflow/status/evangwt/xmermaid-live/deploy-pages.yml?branch=main&label=GitHub%20Pages&logo=github)](https://github.com/evangwt/xmermaid-live/actions/workflows/deploy-pages.yml)
[![Live demo](https://img.shields.io/badge/try-live%20editor-0b7a53?logo=githubpages)](https://evangwt.github.io/xmermaid-live/)
[![xmermaid npm](https://img.shields.io/npm/v/%40evangwt%2Fxmermaid?label=%40evangwt%2Fxmermaid&logo=npm)](https://www.npmjs.com/package/@evangwt/xmermaid)
[![License: MIT](https://img.shields.io/badge/license-MIT-0b7a53.svg)](LICENSE)

**A private, browser-native Mermaid workbench powered by [@evangwt/xmermaid](https://www.npmjs.com/package/@evangwt/xmermaid).** Paste Markdown, extract multiple diagrams, edit their source, inspect compatibility diagnostics, preview native SVG, and export or share the result - with no server-side document upload.

<p>
  <a href="https://evangwt.github.io/xmermaid-live/"><strong>Open the live editor</strong></a>
  &nbsp;|&nbsp;
  <a href="https://github.com/evangwt/xmermaid"><strong>Explore the renderer</strong></a>
</p>

## Why xmermaid Live

| Capability | Details |
| --- | --- |
| Browser-first | Runs as a static site with no backend or document upload. |
| Multi-diagram workflow | Extract, select, edit, and preview Mermaid or xmermaid fences from one document. |
| Honest support feedback | Shows the renderer's production support boundary and copyable diagnostics. |
| Portable output | Share safe URL-hash links or export SVG without uploading user content. |

> **Privacy:** xmermaid Live is a client-side application. Diagram source stays in the browser: the workspace is cached in local storage and can optionally be encoded in the URL hash. It is never uploaded to this project or a server. Clear the site's browser data to remove the local cache.

## Requirements

- Node.js 22 or newer
- Chrome/Chromium, Firefox, and WebKit for end-to-end verification

## Develop

```bash
npm install
npx playwright install chromium firefox webkit
npm run dev
```

Paste Markdown containing one or more fenced `mermaid` / `xmermaid` blocks. A document that consists only of one recognized raw Mermaid diagram is also supported. xmermaid discovers the Mermaid 11.16.0 catalog (30 documented families) through its own support contract. The current partial native renderers are `flowchart`, `swimlanes`, `sequence`, `class`, `state`, `er`, `user-journey`, `gantt`, `pie`, `quadrant`, `requirement`, `gitgraph`, `c4`, `mindmap`, `timeline`, `zenuml`, `sankey`, `xychart`, `block`, `packet`, `kanban`, `architecture`, `radar`, `event-modeling`, `treemap`, `venn`, `ishikawa`, `wardley`, `cynefin`, and `treeview`; unsupported syntax remains explicit through diagnostics and a copyable reproduction source.

When the complete-document editor changes the diagram list, selection is mapped through unchanged leading/trailing diagrams and otherwise follows a source only when that source is unique on both sides. Ambiguous duplicate or complex-reorder regions keep the same relative ordinal as a best-effort fallback.

## Workbench controls

On desktop, drag either separator to resize the diagram list, editor, and preview; use keyboard arrows on a focused separator for precise movement, `Shift` for larger steps, and double-click to restore defaults. The list can be collapsed without losing the current diagram.

Preview controls change only the local view: zoom ranges from 25% to 400%, Fit preview restores a fitted view, and fullscreen falls back to an in-app maximized preview when the browser blocks fullscreen. Pane layout is saved locally; preview zoom and pan reset on refresh and are never placed in share links.

On compact layouts, the diagram, editor, and preview panels move to the bottom navigation. Share and export live in More, and diagram styles open in a full-height sheet that returns to the previous panel when closed.

## Verify

```bash
npm run verify
```

The verification suite includes unit tests, type checking, a production build, real WASM, and browser checks. All scenarios run in Chrome/Chromium; the core editing workflow and root/subpath deployment smoke also run in Firefox and WebKit.

The automated browser capacity contract covers synchronous extraction and list update for 1,000 Mermaid diagrams in under 1.5 seconds on the verification environment. This is not an incremental parser: larger documents can still block the browser main thread while extraction and WASM rendering run.

## Static deployment

### GitHub Pages

The public site is <https://evangwt.github.io/xmermaid-live/>. The repository workflow `.github/workflows/deploy-pages.yml` builds and deploys every push to `main`; it can also be run manually from the Actions tab.

Before the first deployment, open **Settings → Pages** in GitHub and set **Build and deployment → Source** to **GitHub Actions**.

### Search and AI discovery

The static homepage provides Chinese and English metadata, truthful SoftwareApplication structured data, a sitemap, crawler rules, and `llms.txt`. These documents describe the browser-only Mermaid editor, its runtime support boundary, and the fact that it does not upload user documents.

```bash
npm run build
```

Deploy the generated `dist/` directory to any static host. Assets use relative URLs, so the same output works at a domain root or beneath a path such as `/xmermaid-live/`. No server API, Node process, or Rust toolchain is required after the build.

User documents remain in browser memory, local storage, and optional URL hash state. The application does not upload document text. Clear the site's browser data to remove the local cache.

Share links are limited to an encoded URL hash of 50,000 characters. Longer documents remain editable and exportable, but the app refuses to put them in the address bar because browser and host URL limits vary.

## xmermaid dependency

Builds install the exact `@evangwt/xmermaid@0.1.9` release from `registry.npmjs.org`. The npm release carries signed provenance linked to the public [xmermaid repository](https://github.com/evangwt/xmermaid), so this repository does not commit duplicate package archives.

## License

MIT. See [LICENSE](LICENSE) for the full text.
