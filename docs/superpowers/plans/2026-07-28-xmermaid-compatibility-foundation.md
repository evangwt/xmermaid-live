# xmermaid Compatibility Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Mermaid 11.16.0 diagram family discoverable, diagnosable and testable through xmermaid alone, while preserving existing bare Flowchart and Markdown document workflows.

**Architecture:** The xmermaid package owns one versioned diagram catalog and support manifest. Its editor and xmermaid-live consume the exported type and support report rather than trying to infer capability from source text independently. This plan establishes the foundation only: planned families stay explicitly unrenderable until their own renderer epics, but never disappear from the document list.

**Tech Stack:** Rust 2021 + WASM, TypeScript, Vitest, Vite, Playwright, packed local `xmermaid` tarball.

## Global Constraints

- xmermaid is the only renderer; do not add Mermaid.js or a compatibility fallback.
- Mermaid compatibility target is exactly 11.16.0 and the catalog contains the 30 documented diagram families.
- Existing fenced `mermaid` / `xmermaid` blocks and a whole-input bare Flowchart remain supported.
- A diagram is only `supported` when it has typed parsing, layout, SVG, dark/light export and three-browser E2E evidence; this plan creates `planned` contracts, not false support.
- Preserve unrelated dirty files. Commits are scoped and never include user-owned work.
- Run tests before implementation, then run the owning repository’s typecheck/test/build or release verification before each commit.

---

## File map

| File | Responsibility |
| --- | --- |
| `/Volumes/Data/Code/xmermaid/src/diagram-catalog.ts` | Mermaid 11.16.0 version, 30 family IDs and detection patterns. |
| `/Volumes/Data/Code/xmermaid/tests/fixtures/mermaid-11.16.ts` | One versioned minimal valid fixture, common fixture and diagnostic fixture per family, each with its official source URL. |
| `/Volumes/Data/Code/xmermaid/src/support.ts` | Immutable support manifest and source-to-capability report derived from the catalog. |
| `/Volumes/Data/Code/xmermaid/src/index.ts` | Public export of the catalog, detector and support types. |
| `/Volumes/Data/Code/xmermaid/src/editor/index.ts` | Generic Mermaid block extraction and typed `DiagramBlock` metadata. |
| `/Volumes/Data/Code/xmermaid/tests/diagram-catalog.test.ts` | Catalog completeness and header recognition regression corpus. |
| `/Volumes/Data/Code/xmermaid/tests/support-matrix.test.ts` | Support-manifest and planned-family diagnostic tests. |
| `/Volumes/Data/Code/xmermaid/tests/live-editor.test.ts` | Fenced and raw multi-family editor extraction tests. |
| `src/document-model.ts` | Preserve selected generic diagram blocks across full-document edits. |
| `src/app.ts` | Render type/capability metadata, planned recovery state and copy-repro action. |
| `src/styles.css` | Capability badge and recovery-action visual states without changing panel hierarchy. |
| `tests/document-model.test.ts` | Generic type selection and replacement coverage. |
| `tests/app.test.ts` | DOM status, no-disappearance, recovery and clipboard-path tests. |
| `e2e/workspace.spec.ts` | Chromium/Firefox/WebKit visible-list and planned-diagram recovery path. |
| `package.json`, `vendor/xmermaid-*.tgz` | Consume the packed xmermaid release artifact after its verification passes. |

### Task 1: Create the Mermaid 11.16.0 catalog and public support vocabulary

**Files:**
- Create: `/Volumes/Data/Code/xmermaid/src/diagram-catalog.ts`
- Modify: `/Volumes/Data/Code/xmermaid/src/support.ts`
- Modify: `/Volumes/Data/Code/xmermaid/src/index.ts`
- Create: `/Volumes/Data/Code/xmermaid/tests/diagram-catalog.test.ts`
- Modify: `/Volumes/Data/Code/xmermaid/tests/support-matrix.test.ts`

**Interfaces:**
- Produces `MERMAID_COMPATIBILITY_VERSION`, `DIAGRAM_CATALOG`, `DiagramType`, `detectDiagramType(source)` and `DiagramSupportStatus`.
- Consumed by xmermaid’s editor, renderer gate, live app and every later family-renderer epic.

- [ ] **Step 1: Write failing catalog tests before production code**

```ts
import { describe, expect, it } from 'vitest';
import {
  DIAGRAM_CATALOG,
  MERMAID_COMPATIBILITY_VERSION,
  detectDiagramType,
} from '../src/diagram-catalog';

describe('Mermaid 11.16.0 diagram catalog', () => {
  it('contains the complete documented compatibility baseline', () => {
    expect(MERMAID_COMPATIBILITY_VERSION).toBe('11.16.0');
    expect(DIAGRAM_CATALOG.map(([id]) => id)).toEqual([
      'flowchart', 'swimlanes', 'sequence', 'class', 'state', 'er',
      'user-journey', 'gantt', 'pie', 'quadrant', 'requirement', 'gitgraph',
      'c4', 'mindmap', 'timeline', 'zenuml', 'sankey', 'xychart', 'block',
      'packet', 'kanban', 'architecture', 'radar', 'event-modeling', 'treemap',
      'venn', 'ishikawa', 'wardley', 'cynefin', 'treeview',
    ]);
  });

  it.each([
    ['sequenceDiagram\nAlice->>Bob: ping', 'sequence'],
    ['classDiagram\nAnimal <|-- Duck', 'class'],
    ['stateDiagram-v2\n[*] --> Ready', 'state'],
    ['erDiagram\nUSER ||--o{ ORDER : places', 'er'],
    ['architecture-beta\nservice api(server)', 'architecture'],
    ['treemap-beta\nroot', 'treemap'],
  ])('detects %s as %s', (source, type) => {
    expect(detectDiagramType(source)).toBe(type);
  });
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
cd /Volumes/Data/Code/xmermaid
npx vitest run tests/diagram-catalog.test.ts
```

Expected: FAIL because `src/diagram-catalog.ts` does not exist.

- [ ] **Step 3: Implement the catalog as the only type detector**

```ts
// src/diagram-catalog.ts
export const MERMAID_COMPATIBILITY_VERSION = '11.16.0' as const;

export const DIAGRAM_CATALOG = [
  ['flowchart', /^(?:graph|flowchart)\b/i], ['swimlanes', /^swimlanes\b/i],
  ['sequence', /^sequenceDiagram\b/i], ['class', /^classDiagram\b/i],
  ['state', /^stateDiagram(?:-v2)?\b/i], ['er', /^erDiagram\b/i],
  ['user-journey', /^journey\b/i], ['gantt', /^gantt\b/i], ['pie', /^pie\b/i],
  ['quadrant', /^quadrantChart\b/i], ['requirement', /^requirementDiagram\b/i],
  ['gitgraph', /^gitGraph\b/i], ['c4', /^C4(?:Context|Container|Component|Dynamic|Deployment)\b/i],
  ['mindmap', /^mindmap\b/i], ['timeline', /^timeline\b/i], ['zenuml', /^zenuml\b/i],
  ['sankey', /^sankey-beta\b/i], ['xychart', /^xychart(?:-beta)?\b/i],
  ['block', /^block-beta\b/i], ['packet', /^packet-beta\b/i], ['kanban', /^kanban\b/i],
  ['architecture', /^architecture-beta\b/i], ['radar', /^radar-beta\b/i],
  ['event-modeling', /^eventModeling\b/i], ['treemap', /^treemap-beta\b/i],
  ['venn', /^venn-beta\b/i], ['ishikawa', /^ishikawa-beta\b/i],
  ['wardley', /^wardley\b/i], ['cynefin', /^cynefin\b/i], ['treeview', /^tree\b/i],
] as const satisfies readonly (readonly [string, RegExp])[];

export type DiagramType = typeof DIAGRAM_CATALOG[number][0];
export type DetectedDiagramType = DiagramType | 'unknown';

export function detectDiagramType(source: string): DetectedDiagramType {
  const firstLine = source.trimStart().split(/\r?\n/, 1)[0]?.trim() ?? '';
  return DIAGRAM_CATALOG.find(([, pattern]) => pattern.test(firstLine))?.[0] ?? 'unknown';
}
```

In `src/support.ts`, retain syntax-level `unsupported` states but introduce a distinct diagram-level status:

```ts
export type DiagramSupportStatus = 'supported' | 'partial' | 'planned';
export interface DiagramSupportEntry {
  diagramType: DetectedDiagramType;
  status: DiagramSupportStatus;
  supportedSyntax: SyntaxCapability[];
  unsupportedSyntax: SyntaxCapability[];
}
```

Generate one `planned` entry per non-Flowchart catalog item. Include `mermaidVersion: MERMAID_COMPATIBILITY_VERSION` in `SupportMatrix`, and export the catalog detector from `src/index.ts`.

- [ ] **Step 4: Update the renderer gate and matrix tests**

Update `src/xmermaid.ts` so `planned` family diagnostics remain `unsupported_diagram_type` errors before WASM rendering. Add these assertions to `tests/support-matrix.test.ts`:

```ts
expect(getSupportMatrix().mermaidVersion).toBe('11.16.0');
expect(analyzeSupport('sequenceDiagram\nA->>B: Hi')).toMatchObject({
  diagramType: 'sequence', status: 'planned',
  unsupportedFeatures: [{ id: 'diagram.sequence', severity: 'error' }],
});
expect(analyzeSupport('architecture-beta\nservice api(server)')).toMatchObject({
  diagramType: 'architecture', status: 'planned',
});
```

- [ ] **Step 5: Run xmermaid’s focused validation**

Run:

```bash
cd /Volumes/Data/Code/xmermaid
npx vitest run tests/diagram-catalog.test.ts tests/support-matrix.test.ts tests/xmermaid.test.ts
npm run typecheck
```

Expected: PASS; 30 catalog entries are present, recognized headers produce stable IDs, and planned families are rejected before WASM.

- [ ] **Step 6: Commit the scoped foundation**

```bash
cd /Volumes/Data/Code/xmermaid
git add src/diagram-catalog.ts src/support.ts src/index.ts src/xmermaid.ts tests/diagram-catalog.test.ts tests/support-matrix.test.ts tests/xmermaid.test.ts
git commit -m "feat(support): add Mermaid compatibility catalog"
```

### Task 2: Preserve all detected diagrams in the xmermaid editor model

**Files:**
- Modify: `/Volumes/Data/Code/xmermaid/src/editor/index.ts:1-180, 800-850`
- Modify: `/Volumes/Data/Code/xmermaid/tests/live-editor.test.ts`

**Interfaces:**
- Consumes `detectDiagramType` and `DetectedDiagramType` from Task 1.
- Produces `DiagramBlock.diagramType: DetectedDiagramType` for xmermaid-live without source re-parsing.

- [ ] **Step 1: Add failing extraction tests**

```ts
it('keeps fenced planned diagrams in source order', () => {
  const document = extractDiagrams([
    '```mermaid', 'sequenceDiagram', '  A->>B: Hello', '```', '',
    '```xmermaid', 'classDiagram', '  Animal <|-- Duck', '```',
  ].join('\n'));

  expect(document.diagrams.map(item => item.diagramType)).toEqual(['sequence', 'class']);
  expect(document.diagrams.map(item => item.origin)).toEqual(['markdown-fence', 'markdown-fence']);
});

it('keeps a whole-input bare sequence diagram', () => {
  const document = extractDiagrams('sequenceDiagram\n  A->>B: Hello');
  expect(document.diagrams).toHaveLength(1);
  expect(document.diagrams[0]).toMatchObject({ origin: 'raw-mermaid-block', diagramType: 'sequence' });
});
```

- [ ] **Step 2: Run the editor tests and verify they fail**

Run:

```bash
cd /Volumes/Data/Code/xmermaid
npx vitest run tests/live-editor.test.ts
```

Expected: FAIL because `extractDiagrams` only recognizes a raw Flowchart and `DiagramBlock.diagramType` is restricted to `flowchart | unsupported | unknown`.

- [ ] **Step 3: Implement generic extraction without changing replacement ranges**

```ts
// src/editor/index.ts
import { detectDiagramType, type DetectedDiagramType } from '../diagram-catalog';

export interface DiagramBlock {
  id: string;
  index: number;
  title: string | null;
  source: string;
  origin: DiagramOrigin;
  language: 'mermaid' | 'xmermaid' | null;
  range: SourceRange;
  diagramType: DetectedDiagramType;
}

function isMermaidStart(source: string): boolean {
  return detectDiagramType(source) !== 'unknown';
}

function createDiagramBlock(input: CreateDiagramBlockInput): DiagramBlock {
  const start = sourcePosition(input.lineStarts, input.startOffset);
  const end = sourcePosition(input.lineStarts, input.endOffset);
  return {
    id: `diagram-${input.index + 1}`,
    index: input.index,
    title: null,
    source: input.source,
    origin: input.origin,
    language: input.language,
    range: {
      startOffset: input.startOffset,
      endOffset: input.endOffset,
      startLine: start.line,
      startColumn: start.column,
      endLine: end.line,
      endColumn: end.column,
    },
    diagramType: detectDiagramType(input.source),
  };
}
```

Do not loosen `FENCE_PATTERN`: only `mermaid` and `xmermaid` fences are diagram blocks. Keep the existing “raw only when no fenced diagrams exist” behavior so prose containing a diagram-looking line is not extracted.

- [ ] **Step 4: Run editor regression and packed-consumer tests**

Run:

```bash
cd /Volumes/Data/Code/xmermaid
npx vitest run tests/live-editor.test.ts tests/consumer-smoke.test.ts
npm run build
npm run smoke:consumer
```

Expected: PASS; Flowchart visual editing remains Flowchart-only, while selection and source replacement work for every detected family.

- [ ] **Step 5: Commit the editor contract**

```bash
cd /Volumes/Data/Code/xmermaid
git add src/editor/index.ts tests/live-editor.test.ts
git commit -m "feat(editor): preserve generic Mermaid diagram blocks"
```

### Task 3: Consume the support contract in xmermaid-live instead of hiding planned diagrams

**Files:**
- Modify: `src/document-model.ts`
- Modify: `src/app.ts:400-500, 860-940`
- Modify: `src/styles.css`
- Modify: `tests/document-model.test.ts`
- Modify: `tests/app.test.ts`

**Interfaces:**
- Consumes `DiagramBlock.diagramType`, `analyzeSupport(source)` and `SupportReport` from the packed xmermaid artifact.
- Produces `data-diagram-status`, `data-diagram-type`, and a `data-copy-repro` recovery action for planned/partial selections.

- [ ] **Step 1: Write failing application tests**

```ts
it('lists a planned sequence diagram and exposes its xmermaid recovery state', () => {
  mounted = mountApp(root(), {
    initialText: '```mermaid\nsequenceDiagram\n  A->>B: Hello\n```',
    renderer,
  });

  const item = document.querySelector<HTMLButtonElement>('[data-diagram-item]')!;
  expect(item.dataset.diagramType).toBe('sequence');
  expect(item.dataset.diagramStatus).toBe('planned');
  expect(item.textContent).toContain('计划支持');
  expect(document.querySelector('[data-empty-list]')).toBeNull();
});

it('copies the selected source as a minimal reproduction', async () => {
  const copyText = vi.fn().mockResolvedValue(undefined);
  mounted = mountApp(root(), {
    initialText: 'sequenceDiagram\n  A->>B: Hello', renderer, copyText,
  });
  document.querySelector<HTMLButtonElement>('[data-copy-repro]')!.click();
  await Promise.resolve();
  expect(copyText).toHaveBeenCalledWith('sequenceDiagram\n  A->>B: Hello');
});
```

- [ ] **Step 2: Run the app tests and verify they fail**

Run:

```bash
npm test -- tests/document-model.test.ts tests/app.test.ts
```

Expected: FAIL because the live dependency does not yet expose generic blocks and the app has no support badge/recovery action.

- [ ] **Step 3: Add capability-aware list and recovery rendering**

```ts
import { analyzeSupport } from 'xmermaid';

function supportLabel(status: 'supported' | 'partial' | 'planned'): string {
  return { supported: '已支持', partial: '部分支持', planned: '计划支持' }[status];
}

const support = analyzeSupport(diagram.source);
button.dataset.diagramType = support.diagramType;
button.dataset.diagramStatus = support.status;
meta.textContent = `${diagram.diagramType} · ${supportLabel(support.status)} · 第 ${diagram.range.startLine} 行`;
```

Extend `MountAppOptions` with `copyText?: (text: string) => Promise<void>` and default it to `navigator.clipboard.writeText`. When the selected report is `planned` or `partial`, render a source-local recovery block containing the report message, its first unsupported feature ID, running package version and a button with `data-copy-repro`. Keep the last successful SVG behavior in `PreviewRuntime`; never invent an SVG for a planned family.

- [ ] **Step 4: Make the recovery UI accessible and visually subordinate**

```css
.diagram-item[data-diagram-status="planned"] { border-color: color-mix(in srgb, var(--warning) 45%, var(--border)); }
.diagram-capability-badge { font: 650 10px/1 ui-monospace, SFMono-Regular, Consolas, monospace; }
.diagram-capability-badge[data-status="planned"] { color: var(--warning); }
.diagram-recovery { border-inline-start: 2px solid var(--warning); padding: 10px 12px; color: var(--text-muted); }
```

Use `role="status"` for non-blocking capability text and preserve the existing diagnostic `aria-live` region for errors. Do not use color as the only status signal.

- [ ] **Step 5: Run live focused verification**

Run:

```bash
npm test -- tests/document-model.test.ts tests/app.test.ts tests/preview-runtime.test.ts
npm run typecheck
```

Expected: PASS; raw/fenced Flowchart behavior remains unchanged, and sequence/class planned sources stay visible with an actionable recovery state.

- [ ] **Step 6: Commit the live integration**

```bash
git add src/document-model.ts src/app.ts src/styles.css tests/document-model.test.ts tests/app.test.ts
git commit -m "feat(workspace): show xmermaid capability states"
```

### Task 4: Package xmermaid and prove the end-to-end compatibility foundation

**Files:**
- Modify: `package.json`
- Replace: `vendor/xmermaid-0.1.0-theme-edge-geometry.tgz`
- Modify: `e2e/workspace.spec.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes the packed artifact produced by Tasks 1–2.
- Produces a reproducible live dependency and browser evidence that planned diagrams are never hidden.

- [ ] **Step 1: Add failing browser coverage**

```ts
test('keeps a planned Mermaid family visible and offers source recovery', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-document-input]').fill('```mermaid\nsequenceDiagram\n  A->>B: Hello\n```');
  await expect(page.locator('[data-diagram-item]')).toHaveCount(1);
  await expect(page.locator('[data-diagram-item]')).toContainText('计划支持');
  await expect(page.locator('[data-copy-repro]')).toBeVisible();
  await expect(page.locator('[data-empty-list]')).toHaveCount(0);
});
```

- [ ] **Step 2: Verify it fails against the currently packed dependency**

Run:

```bash
npm run build
npx playwright test e2e/workspace.spec.ts --grep "planned Mermaid family"
```

Expected: FAIL because the installed tarball only recognizes Flowchart-family documents.

- [ ] **Step 3: Build, pack and consume the verified xmermaid artifact**

Run:

```bash
cd /Volumes/Data/Code/xmermaid
npm run verify:release
npm pack
mv xmermaid-0.1.0.tgz /Volumes/Data/Code/xmermaid-live/vendor/xmermaid-0.1.0-theme-edge-geometry.tgz

cd /Volumes/Data/Code/xmermaid-live
npm install
```

Keep the existing local-file dependency path in `package.json`; only replace the tarball after `verify:release` exits successfully.

- [ ] **Step 4: Run the complete live verification matrix**

Run:

```bash
cd /Volumes/Data/Code/xmermaid-live
npm run verify
git diff --check
```

Expected: TypeScript, Vitest, production build, Chromium/Firefox/WebKit Playwright and whitespace checks all pass. The new browser test proves that an unrenderable family is visible and recoverable, not silently dropped.

- [ ] **Step 5: Document the daily feedback loop and commit**

Add a concise README section named `xmermaid compatibility loop` with this exact sequence:

```text
真实 Mermaid 输入 → fixtures/mermaid-11.16 → xmermaid 测试与打包 → xmermaid-live E2E → 稳定 tarball
```

Then commit only the integration files:

```bash
git add package.json package-lock.json vendor/xmermaid-0.1.0-theme-edge-geometry.tgz e2e/workspace.spec.ts README.md
git commit -m "test(workspace): verify planned diagram recovery"
```

## Plan self-review

- **Spec coverage:** This plan covers the compatibility foundation: fixed 11.16.0 catalog, support/diagnostic contract, generic scanning, no-disappearance recovery, packed-package handoff and browser evidence. It deliberately does not implement arrow geometry, cache V2, visual tokens or any family renderer; those are separately testable plans after this interface is established.
- **Placeholder scan:** No step delegates an undefined design decision. All diagram IDs, public interfaces, tests, commands and expected outcomes are named.
- **Type consistency:** `DiagramType` is catalog-derived; `DetectedDiagramType` adds `unknown`; diagram-level status uses `supported | partial | planned`, while feature-level capability statuses retain `unsupported` for specific syntax diagnostics.
