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
