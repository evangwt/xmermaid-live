# xmermaid-live

Pure frontend workspace for extracting and previewing multiple Mermaid flowcharts with xmermaid.

## Requirements

- Node.js 22 or newer
- A sibling checkout of `../xmermaid` with a current successful `npm run build`
- Chrome or Chromium for end-to-end verification

## Develop

```bash
npm install
npm run dev
```

Paste Markdown containing one or more fenced `mermaid` / `xmermaid` blocks. A document that consists only of one raw `graph` or `flowchart` block is also supported. xmermaid currently implements partial flowchart support and reports unsupported Mermaid types or syntax explicitly.

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

```bash
npm run build
```

Deploy the generated `dist/` directory to any static host. Assets use relative URLs, so the same output works at a domain root or beneath a path such as `/xmermaid-live/`. No server API, Node process, or Rust toolchain is required after the build.

User documents remain in browser memory and URL hash state. The application does not upload document text.
