# Aurora Canvas Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the card-heavy workbench with a premium, dark-first, canvas-led diagram creation surface while preserving every existing editor workflow.

**Architecture:** Keep `src/app.ts` state and xmermaid rendering contracts intact. Consolidate the duplicated visual layers in `src/styles.css` into one semantic Aurora token system, then use the existing DOM regions to establish an unobstructed canvas hierarchy: navigation rail, source workspace, and luminous preview plane. Browser tests prove geometry, accessibility and no regression in pan/zoom, style inspection, local cache, export or mobile navigation.

**Tech Stack:** Vanilla TypeScript, CSS, Vite, Vitest, Playwright; existing xmermaid WASM only.

## Global Constraints

- xmermaid remains the sole parser, layout engine and SVG renderer.
- Add no runtime dependency, external font request, framework or image asset.
- Preserve dark/light themes, editable custom diagram styles, pane resizing, minimap, canvas pan/zoom, fullscreen, export, local cache and mobile panel navigation.
- Dark theme is deep graphite with restrained violet atmosphere; brightness, glow and blur must establish hierarchy, never decoration.
- Light theme is warm paper/graphite, not a simple color inversion.
- Canvas must remain the visually dominant surface on desktop; the style inspector only consumes space while explicitly open.
- Keyboard focus, touch targets, reduced-motion handling and existing ARIA labels are invariant.
- Preserve unrelated dirty files: `README.md`, `docs/superpowers/specs/2026-07-15-xmermaid-live-design.md`, `package.json`, `scripts/review-snapshot.mjs`, and `tests/review-snapshot.test.ts`.
- Do not commit generated `dist/`, copied WASM, `.playwright-cli/`, screenshots or test result artifacts.

---

### Task 1: Lock the Aurora workspace hierarchy

**Files:**

- Modify: `tests/app.test.ts`
- Modify: `e2e/workspace.spec.ts`
- Modify: `src/app.ts`

**Interfaces:**

- Consumes: the existing `.app-shell`, `.topbar`, `.workspace`, `[data-panel]`, `[data-preview-canvas]`, and `[data-style-desktop-host]` DOM contracts.
- Produces: stable `data-studio-layout="aurora"` and `data-preview-priority="primary"` attributes that CSS and browser tests can consume without changing rendering state.

- [x] **Step 1: Write failing DOM assertions**

Add this test to `tests/app.test.ts`:

```ts
it('marks the canvas-led studio hierarchy without changing accessible controls', () => {
  mounted = mountApp(root(), { initialText: DOCUMENT, renderer });
  const shell = document.querySelector<HTMLElement>('.app-shell')!;
  expect(shell.dataset.studioLayout).toBe('aurora');
  expect(document.querySelector<HTMLElement>('[data-preview-canvas]')?.dataset.previewPriority).toBe('primary');
  expect(document.querySelector('[data-preview-fit]')?.getAttribute('aria-label')).toBe('适配预览');
});
```

- [x] **Step 2: Verify red**

Run: `npm test -- tests/app.test.ts`

Expected: the new assertion fails because neither dataset exists.

- [x] **Step 3: Add semantic presentation hooks**

In the `SHELL` template in `src/app.ts`, change the root element to:

```html
<div class="app-shell" data-studio-layout="aurora" data-mobile-panel="edit" data-workspace-theme="dark">
```

and change the canvas opening tag to:

```html
<div class="preview-canvas" data-preview-canvas data-preview-priority="primary" aria-label="图表画布">
```

- [x] **Step 4: Verify green**

Run: `npm test -- tests/app.test.ts && npm run typecheck`

Expected: all app tests and TypeScript pass.

### Task 2: Consolidate the Aurora visual system

**Files:**

- Modify: `src/styles.css`

**Interfaces:**

- Consumes: Task 1 dataset hooks and the existing custom properties consumed by `app.ts`.
- Produces: one final set of semantic surface, text, border, accent and motion tokens; no duplicated base selector override block remains.

- [x] **Step 1: Preserve the failing visual baseline**

Run: `npm run build && npx playwright test e2e/workspace.spec.ts --project=chromium -g "keeps workbench geometry"`

Expected: current geometry passes while screenshot review shows the card-heavy baseline.

- [x] **Step 2: Replace duplicate base and late override blocks with one token system**

Use these dark tokens:

```css
--surface-canvas: #08090f;
--surface-panel: rgba(17, 18, 27, .78);
--surface-raised: #1a1b27;
--surface-editor: #10111a;
--border: rgba(255,255,255,.075);
--text: #f3f2f8;
--text-muted: #989aa9;
--accent: #9381ff;
--accent-strong: #c5bdff;
--accent-soft: rgba(124, 92, 255, .16);
```

Set `app-shell` to a 64px header, a low-opacity violet radial atmosphere behind only the canvas region, no outer card chrome on the topbar, flat vertical seams for list/editor, and a single elevated preview plane. Use 8px and 16px radii only; shadows are reserved for the minimap, export menu and open inspector.

- [x] **Step 3: Apply hierarchy rules**

Implement these invariant selectors:

```css
.app-shell[data-studio-layout="aurora"] .workspace { padding: 0 18px 18px; }
.app-shell[data-studio-layout="aurora"] .diagram-panel,
.app-shell[data-studio-layout="aurora"] .editor-panel { border-radius: 0; box-shadow: none; }
.app-shell[data-studio-layout="aurora"] .preview-panel { border-radius: 20px; }
.app-shell[data-studio-layout="aurora"] [data-preview-priority="primary"] { min-height: 0; }
```

Keep mobile selectors inside the existing `max-width: 1024px` block and keep the existing reduced-motion rule.

- [x] **Step 4: Verify CSS does not break behavior**

Run: `npm test -- tests/app.test.ts && npm run typecheck && npm run build`

Expected: all commands pass.

### Task 3: Prove desktop and mobile visual behavior

**Files:**

- Modify: `e2e/workspace.spec.ts`

**Interfaces:**

- Consumes: Aurora dataset hooks, existing geometry helper and existing responsive workflow fixtures.
- Produces: browser-level evidence that canvas is dominant on desktop and all three mobile panels remain reachable.

- [x] **Step 1: Add a desktop hierarchy test**

Add a Chromium test that evaluates the visible client rectangles at 1440×900 and asserts the preview canvas is wider than the editor content while the inspector is closed:

```ts
test('gives the Aurora canvas visual priority without hiding source editing', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  const sizes = await page.locator('.app-shell').evaluate(shell => {
    const width = (selector: string) => shell.querySelector<HTMLElement>(selector)!.getBoundingClientRect().width;
    return { editor: width('.editor-panel'), preview: width('[data-preview-canvas]') };
  });
  expect(sizes.preview).toBeGreaterThan(sizes.editor);
});
```

- [x] **Step 2: Verify the existing hierarchy baseline**

Run: `npm run build && npx playwright test e2e/workspace.spec.ts --project=chromium -g "Aurora canvas"`

Expected: it fails against the old equal-pane visual geometry.

- [x] **Step 3: Adjust desktop workspace proportions in CSS**

Use `--list-width: 204px`, constrain editor to `minmax(320px, .78fr)`, and make preview the remaining flexible pane. Preserve divider calculations and collapsed-list layout behavior.

- [x] **Step 4: Verify cross-browser and mobile invariants**

Run: `npm run verify`

Expected: Vitest, production build, Chromium, Firefox and WebKit tests pass; no unexpected external request or console error appears.

- [x] **Step 5: Capture review evidence and commit only owned work**

Run: `git diff --check`, capture 1440×900 and 390×844 local screenshots under ignored `.playwright-cli/`, stage only `src/app.ts`, `src/styles.css`, `tests/app.test.ts`, `e2e/workspace.spec.ts`, and this plan, then create a scoped commit.

## Plan Self-Review

- Coverage: Task 1 gives stable semantic hooks, Task 2 removes the duplicated visual system and defines the dark/light material contract, and Task 3 proves the desktop hierarchy plus existing mobile/interaction behavior in real browsers.
- Placeholder scan: no task depends on an unnamed component, dependency, or later implementation.
- Type consistency: no public TypeScript API changes; new dataset values are literal presentation hooks read only by CSS/tests.
