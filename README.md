# xmermaid-live

Pure frontend workspace for extracting and previewing multiple Mermaid diagram families with xmermaid.

## Requirements

- Node.js 22 or newer
- A sibling checkout of `../xmermaid` with a current successful `npm run build`
- Chrome or Chromium for end-to-end verification

## Develop

```bash
npm install
npm run dev
```

Paste Markdown containing one or more fenced `mermaid` / `xmermaid` blocks. A document that consists only of one recognized raw Mermaid diagram is also supported. xmermaid discovers the Mermaid 11.16.0 catalog (30 documented families) through its own support contract; Flowchart, Sequence, Class, State, ER, User Journey, Gantt, Pie, Mindmap, Timeline, Requirement, GitGraph, C4, ZenUML, and XY Chart currently have partial native rendering. Planned families remain selectable with diagnostics and a copyable reproduction source.

## Workbench controls

On desktop, drag either separator to resize the diagram list, editor, and preview; use keyboard arrows on a focused separator for precise movement, `Shift` for larger steps, and double-click to restore defaults. The list can be collapsed without losing the current diagram.

Preview controls change only the local view: zoom ranges from 25% to 400%, `适配预览` restores a fitted view, and fullscreen falls back to an in-app maximized preview when the browser blocks fullscreen. Pane layout is saved locally; preview zoom and pan reset on refresh and are never placed in share links.

On compact layouts, 图表、编辑、预览 move to the bottom navigation. 分享 and 导出 are in 更多, and 图表样式 opens a full-height sheet that returns to the prior panel on 完成.

## Verify

```bash
npm run verify
```

The verification suite includes unit tests, type checking, a production build, real Chrome, and the real xmermaid WASM asset.

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

User documents remain in browser memory and URL hash state. The application does not upload document text.
