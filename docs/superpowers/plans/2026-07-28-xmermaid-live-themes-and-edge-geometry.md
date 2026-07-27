# xmermaid-live Themes And Edge Geometry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a dark-first xmermaid-live workbench with a paired light theme and complete diagram-style controls, backed by theme-aware xmermaid arrow geometry that keeps every supported arrow attached to its edge.

**Architecture:** `/Volumes/Data/Code/xmermaid` remains the owner of render themes, layout geometry, arrow placement, SVG output, and the packed SDK. `/Volumes/Data/Code/xmermaid-live` consumes only the packed SDK, owns workspace theme state and persistence, and includes the effective render theme in preview request identity so stale renders and exports cannot cross theme changes.

**Tech Stack:** Rust 2021, wasm-bindgen/WASM, TypeScript, Vanilla DOM/CSS, Vite 8, Vitest, Playwright 1.61, npm tarball dependencies.

## Global Constraints

- Do not add a frontend framework, icon library, npm dependency, or Rust crate.
- Keep xmermaid's partial Mermaid support claim unchanged.
- Preserve `DEFAULT_THEME`, `waypoints`, `label_position`, old geometry payload reading, strict security defaults, WASM asset loading, and the `xmermaid/editor` export.
- First-visit workspace theme is dark; light is explicit and both use neutral surfaces plus teal, coral, and amber semantic accents without large gradients or decorative blobs.
- Workspace theme changes the base diagram preset; explicit diagram overrides survive theme switches; reset clears every override.
- Theme preferences are local-only and versioned; share hashes remain document/selection-only.
- `edgeGap` expresses marker-to-node clearance and never creates a path-to-marker gap.
- xmermaid-live must consume the new behavior from a vendor tarball, never from `/Volumes/Data/Code/xmermaid/src`.
- Preserve all current uncommitted changes in both repositories and do not stage or commit implementation work; use scoped `git diff` and `git diff --check` checkpoints because implementation authorization does not include closing/committing.
- Do not add generated `dist/`, `pkg/`, `target/`, `.playwright-cli/`, `test-results/`, or `public/xmermaid_wasm_bg.wasm` to Git.

---

## File Structure

### `/Volumes/Data/Code/xmermaid`

- Modify `src/types/theme.ts`: public light/dark diagram presets.
- Modify `src/types/layout.ts`: accept geometry protocol versions 1 and 2.
- Modify `src/renderer/edge.ts`: theme-aware marker placement and fallback path geometry.
- Modify `src/renderer/svg.ts`: recompute explicit path endpoints from the active marker style.
- Modify `src/index.ts`: export `LIGHT_THEME` and the geometry helper.
- Modify `crates/xmermaid-layout/src/flowchart.rs`: emit theme-independent geometry v2.
- Modify `crates/xmermaid-layout/tests/roundtrip_test.rs`: Rust geometry v2 contract tests.
- Modify `tests/theme.test.ts`, `tests/edge.test.ts`, `tests/renderer.test.ts`, `tests/svg-geometry-regression.test.ts`: render contracts.
- Modify `scripts/consumer-smoke.cjs`: packed export and rendered geometry smoke.
- Modify `README.md` and `.codestable/architecture/ARCHITECTURE.md`: current public and architecture truth.

### `/Volumes/Data/Code/xmermaid-live`

- Create `src/theme.ts`: theme preferences, validation, persistence payload, and effective theme merge.
- Create `tests/theme.test.ts`: pure theme-state tests.
- Modify `src/preview-runtime.ts` and `tests/preview-runtime.test.ts`: source + theme request identity.
- Modify `src/render-source.ts` and `tests/render-source.test.ts`: pass the effective theme into xmermaid.
- Modify `src/app.ts` and `tests/app.test.ts`: theme switch, style dialog, controls, reset, persistence callback, and export freshness.
- Modify `src/main.ts`: load and save preferences at the application boundary.
- Modify `src/styles.css`: dark/light workbench tokens, drawer, controls, and responsive layout.
- Modify `e2e/workspace.spec.ts`: real WASM theme, persistence, accessibility, export, and pixel continuity checks.
- Modify `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `vendor/xmermaid-provenance.json`: consume the new tarball.
- Create `vendor/xmermaid-0.1.0-theme-edge-geometry.tgz`: deliberate packed dependency artifact.

---

### Task 1: Publish Paired xmermaid Diagram Themes

**Files:**
- Modify: `/Volumes/Data/Code/xmermaid/src/types/theme.ts`
- Modify: `/Volumes/Data/Code/xmermaid/src/index.ts`
- Test: `/Volumes/Data/Code/xmermaid/tests/theme.test.ts`

**Interfaces:**
- Produces: `LIGHT_THEME: RenderTheme`, revised `DARK_THEME: RenderTheme`, unchanged `DEFAULT_THEME: RenderTheme`.
- Consumers: xmermaid-live `src/theme.ts`, packed consumer smoke, all per-render `RenderOptions.theme` calls.

- [ ] **Step 1: Write failing preset and export tests**

```ts
import { DARK_THEME, DEFAULT_THEME, LIGHT_THEME, createTheme } from '../src/types/theme';

it('publishes paired xmermaid light and dark presets without changing the compatibility default', () => {
  expect(LIGHT_THEME).toMatchObject({
    name: 'xmermaid-light',
    colors: { background: '#f7f9fb', nodeFill: '#ffffff', arrowFill: '#0f9f8f' },
    edgeGap: 2,
  });
  expect(DARK_THEME).toMatchObject({
    name: 'xmermaid-dark',
    colors: { background: '#0b1117', nodeFill: '#15212b', arrowFill: '#2dd4bf' },
    edgeGap: 2,
  });
  expect(DEFAULT_THEME.name).toBe('default');
  expect(createTheme()).toEqual(DEFAULT_THEME);
});
```

- [ ] **Step 2: Run the focused test and verify the red state**

Run: `cd /Volumes/Data/Code/xmermaid && npm test -- tests/theme.test.ts`

Expected: FAIL because `LIGHT_THEME` is not exported and the current dark palette/default gap do not match the contract.

- [ ] **Step 3: Add the two complete presets while preserving the compatibility preset**

```ts
export const LIGHT_THEME: RenderTheme = {
  ...DEFAULT_THEME,
  name: 'xmermaid-light',
  colors: {
    background: '#f7f9fb',
    nodeFill: '#ffffff',
    nodeStroke: '#0f766e',
    nodeText: '#17212b',
    edgeStroke: '#52606d',
    edgeLabel: '#334155',
    arrowFill: '#0f9f8f',
    subgraphFill: '#edf7f5',
    subgraphStroke: '#94a3b8',
  },
  edgeGap: 2,
};

export const DARK_THEME: RenderTheme = {
  ...DEFAULT_THEME,
  name: 'xmermaid-dark',
  colors: {
    background: '#0b1117',
    nodeFill: '#15212b',
    nodeStroke: '#2dd4bf',
    nodeText: '#e6edf3',
    edgeStroke: '#9fb0bf',
    edgeLabel: '#d5dee7',
    arrowFill: '#2dd4bf',
    subgraphFill: '#111c24',
    subgraphStroke: '#3c4b57',
  },
  edgeGap: 2,
};
```

Add `LIGHT_THEME` to the theme export list in `src/index.ts`; leave the `DEFAULT_THEME` object byte-for-byte compatible except for formatting required by the edit.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `cd /Volumes/Data/Code/xmermaid && npm test -- tests/theme.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Record the scoped checkpoint without committing**

Run: `git -C /Volumes/Data/Code/xmermaid diff --check -- src/types/theme.ts src/index.ts tests/theme.test.ts`

Expected: no output.

---

### Task 2: Define Theme-Aware Arrow Placement

**Files:**
- Modify: `/Volumes/Data/Code/xmermaid/src/renderer/edge.ts`
- Modify: `/Volumes/Data/Code/xmermaid/src/index.ts`
- Test: `/Volumes/Data/Code/xmermaid/tests/edge.test.ts`

**Interfaces:**
- Produces: `ArrowPlacement`, `computeArrowPlacement(boundary, angle, size, gap, style, strokeWidth?)`.
- Produces: `EdgePathResult.arrowAnchor` while retaining `arrowTip`, `arrowAngle`, `path`, and `pathEnd`.
- Consumes: existing `Point`, `ArrowStyle`, `CurveStyle`, bounds, and node-shape types.

- [ ] **Step 1: Replace gap-based expectations with marker-specific failing tests**

```ts
describe('computeArrowPlacement', () => {
  const boundary = { x: 100, y: 50 };

  it('joins a filled arrow at its base instead of edgeGap + arrowSize', () => {
    const placement = computeArrowPlacement(boundary, 0, 10, 2, 'filled', 1.5);
    expect(placement.arrowTip).toEqual({ x: 98, y: 50 });
    expect(placement.arrowAnchor).toEqual(placement.arrowTip);
    expect(placement.pathEnd.x).toBeCloseTo(90.09, 2);
  });

  it('runs an open-arrow shaft to the tip', () => {
    const placement = computeArrowPlacement(boundary, 0, 10, 2, 'open', 1.5);
    expect(placement.pathEnd).toEqual(placement.arrowTip);
  });

  it('joins a circle at its rear circumference', () => {
    const placement = computeArrowPlacement(boundary, 0, 10, 2, 'circle', 1.5);
    expect(placement.arrowAnchor).toEqual({ x: 93, y: 50 });
    expect(placement.pathEnd.x).toBeCloseTo(88.75, 2);
  });
});
```

Update the bezier, step, and straight tests so they assert `distance(pathEnd, marker attachment) <= strokeWidth / 2` instead of `pathEnd = arrowTip - gap - arrowSize`.

- [ ] **Step 2: Run the focused test and verify the red state**

Run: `cd /Volumes/Data/Code/xmermaid && npm test -- tests/edge.test.ts`

Expected: FAIL because `computeArrowPlacement` and `arrowAnchor` do not exist and old path shortening leaves a positive gap.

- [ ] **Step 3: Implement marker-specific placement and use it in all fallback curves**

```ts
export interface ArrowPlacement {
  arrowTip: Point;
  arrowAnchor: Point;
  pathEnd: Point;
}

export function computeArrowPlacement(
  boundary: Point,
  angle: number,
  size: number,
  gap: number,
  style: ArrowStyle,
  strokeWidth = 1.5,
): ArrowPlacement {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const moveBack = (point: Point, distance: number): Point => ({
    x: point.x - dx * distance,
    y: point.y - dy * distance,
  });
  const arrowTip = moveBack(boundary, gap);
  const overlap = strokeWidth / 2;

  if (style === 'open') return { arrowTip, arrowAnchor: arrowTip, pathEnd: arrowTip };
  if (style === 'circle') {
    const radius = size / 2;
    const arrowAnchor = moveBack(arrowTip, radius);
    return { arrowTip, arrowAnchor, pathEnd: moveBack(arrowAnchor, radius - overlap) };
  }
  if (style === 'cross') {
    const arrowAnchor = moveBack(arrowTip, size / 2);
    return { arrowTip, arrowAnchor, pathEnd: arrowAnchor };
  }

  const axialLength = Math.cos(Math.PI / 6) * size;
  return {
    arrowTip,
    arrowAnchor: arrowTip,
    pathEnd: moveBack(arrowTip, axialLength - overlap),
  };
}
```

Add `arrowAnchor?: Point` to `EdgePathResult`. Extend `computeBezierPath`, `computeStepPath`, `computeStraightPath`, and `computeEdgePath` with trailing compatible arguments `arrowStyle: ArrowStyle | null = 'filled'` and `strokeWidth = 1.5`. For `null`, end at the target boundary; otherwise derive `arrowTip`, `arrowAnchor`, and `pathEnd` from `computeArrowPlacement`. Export the helper from `src/index.ts`.

- [ ] **Step 4: Run geometry tests and typecheck**

Run: `cd /Volumes/Data/Code/xmermaid && npm test -- tests/edge.test.ts && npm run typecheck`

Expected: PASS for filled, open, circle, cross, bezier, step, and straight geometry.

- [ ] **Step 5: Record the scoped checkpoint without committing**

Run: `git -C /Volumes/Data/Code/xmermaid diff --check -- src/renderer/edge.ts src/index.ts tests/edge.test.ts`

Expected: no output.

---

### Task 3: Make Layout Geometry Theme-Independent And Render geometry v2

**Files:**
- Modify: `/Volumes/Data/Code/xmermaid/crates/xmermaid-layout/src/flowchart.rs`
- Modify: `/Volumes/Data/Code/xmermaid/crates/xmermaid-layout/tests/roundtrip_test.rs`
- Modify: `/Volumes/Data/Code/xmermaid/src/types/layout.ts`
- Modify: `/Volumes/Data/Code/xmermaid/src/renderer/svg.ts`
- Test: `/Volumes/Data/Code/xmermaid/tests/renderer.test.ts`
- Test: `/Volumes/Data/Code/xmermaid/tests/svg-geometry-regression.test.ts`

**Interfaces:**
- Produces: Rust `geometry_version = 2` where `path_end` carries only a theme-independent target-boundary fallback.
- Consumes: `computeArrowPlacement` from Task 2.
- Preserves: reading complete geometry v1 and waypoint-only payloads.

- [ ] **Step 1: Add failing Rust and SVG contract tests**

```rust
#[test]
fn geometry_v2_does_not_bake_default_arrow_size_into_layout() {
    let ast = parse("flowchart LR\n  A --> B").unwrap();
    let config = config_for_ast(&ast);
    let layout = compute_layout(&ast, &config);
    let edge = layout.edges.first().expect("expected one edge");
    assert_eq!(edge.geometry_version, 2);
    assert_eq!(edge.path_end, edge.target_boundary);
    assert!(edge.final_tangent_angle.is_some());
}
```

```ts
function layoutWithGeometry(version: 1 | 2): LayoutResult {
  const layout = createTestLayout();
  layout.edges[0] = {
    ...layout.edges[0],
    source_boundary: { x: 20, y: 30 },
    target_boundary: { x: 120, y: 30 },
    path_end: version === 1 ? { x: 102, y: 30 } : { x: 120, y: 30 },
    final_tangent_angle: 0,
    label_anchor: { x: 58, y: 42 },
    geometry_version: version,
  };
  return layout;
}

function renderedPathEnd(svg: SVGSVGElement): string {
  const values = svg.querySelector('g.edge path')?.getAttribute('d')?.match(/-?\d+(?:\.\d+)?/g);
  if (!values || values.length < 2) throw new Error('Expected edge path coordinates.');
  return values.slice(-2).join(',');
}

function renderedArrowFront(svg: SVGSVGElement): string {
  const values = svg.querySelector('g.edge polygon')?.getAttribute('points')?.match(/-?\d+(?:\.\d+)?/g);
  if (!values || values.length < 4) throw new Error('Expected filled arrow coordinates.');
  return values.slice(2, 4).join(',');
}

it('recomputes explicit geometry for the active arrow size and style', () => {
  const small = new SVGRenderer({ arrowStyle: 'filled', arrowSize: 8 }).render(layoutWithGeometry(2));
  const large = new SVGRenderer({ arrowStyle: 'filled', arrowSize: 20 }).render(layoutWithGeometry(2));
  expect(renderedPathEnd(small)).not.toEqual(renderedPathEnd(large));
  expect(renderedArrowFront(small)).toEqual(renderedArrowFront(large));
});

it('recomputes legacy geometry v1 instead of trusting its baked path_end', () => {
  const svg = new SVGRenderer({ arrowStyle: 'filled', arrowSize: 20 }).render(layoutWithGeometry(1));
  expect(renderedPathEnd(svg)).not.toBe('102,30');
  expect(renderedArrowFront(svg)).toBe('112,30');
});
```

- [ ] **Step 2: Run focused Rust and TypeScript tests and verify the red state**

Run: `cd /Volumes/Data/Code/xmermaid && cargo test -p xmermaid-layout geometry_v2_does_not_bake_default_arrow_size_into_layout --test roundtrip_test && npm test -- tests/renderer.test.ts tests/svg-geometry-regression.test.ts`

Expected: Rust FAILS with version `1`/shortened `path_end`; TypeScript FAILS because explicit geometry still trusts the baked endpoint.

- [ ] **Step 3: Emit geometry v2 without theme constants**

In `flowchart.rs`, remove `DEFAULT_EDGE_GAP`, `DEFAULT_ARROW_SIZE`, and the arrow-style dependency from `compute_edge_geometry`. Set the protocol constant to `2` and assign `path_end = target_boundary`:

```rust
const GEOMETRY_VERSION: u8 = 2;

let source_boundary = from_node
    .map(|node| boundary_point(first, source_approach, node.bounds, node.shape));
let target_boundary = to_node
    .map(|node| boundary_point(last, target_approach, node.bounds, node.shape));
let angle = Some((last.y - target_approach.y).atan2(last.x - target_approach.x));
let path_end = target_boundary;
```

Change the TypeScript field to `geometry_version?: 1 | 2`.

- [ ] **Step 4: Recompute SVG explicit geometry from the active theme**

```ts
const arrowStyle = edge.style === 'line' || edge.style === 'invisible'
  ? null
  : this.theme.arrowStyle;
const placement = arrowStyle
  ? computeArrowPlacement(
      edge.target_boundary,
      edge.final_tangent_angle,
      this.theme.arrowSize,
      this.theme.edgeGap,
      arrowStyle,
      this.edgeStrokeWidth(edge),
    )
  : {
      arrowTip: edge.target_boundary,
      arrowAnchor: edge.target_boundary,
      pathEnd: edge.target_boundary,
    };
```

Accept versions 1 and 2 when boundary/tangent fields are complete, pass `placement.pathEnd` into `buildExplicitPath`, return `arrowAnchor`, and make circle/cross rendering use `edgeResult.arrowAnchor ?? edgeResult.arrowTip`. Pass `arrowStyle` or `null` into the waypoint fallback. Keep label-anchor precedence unchanged.

- [ ] **Step 5: Run Rust, renderer, regression, and type checks**

Run: `cd /Volumes/Data/Code/xmermaid && cargo test -p xmermaid-layout && npm test -- tests/edge.test.ts tests/renderer.test.ts tests/svg-geometry-regression.test.ts && npm run typecheck`

Expected: PASS; geometry v1 and v2 render, theme size changes move only the marker attachment, and waypoint fallback remains operational.

- [ ] **Step 6: Record the scoped checkpoint without committing**

Run: `git -C /Volumes/Data/Code/xmermaid diff --check -- crates/xmermaid-layout/src/flowchart.rs crates/xmermaid-layout/tests/roundtrip_test.rs src/types/layout.ts src/renderer/svg.ts tests/renderer.test.ts tests/svg-geometry-regression.test.ts`

Expected: no output.

---

### Task 4: Prove And Pack The xmermaid Contract

**Files:**
- Modify: `/Volumes/Data/Code/xmermaid/scripts/consumer-smoke.cjs`
- Modify: `/Volumes/Data/Code/xmermaid/README.md`
- Modify: `/Volumes/Data/Code/xmermaid/.codestable/architecture/ARCHITECTURE.md`
- Create: `/Volumes/Data/Code/xmermaid-live/vendor/xmermaid-0.1.0-theme-edge-geometry.tgz`
- Modify: `/Volumes/Data/Code/xmermaid-live/package.json`
- Modify: `/Volumes/Data/Code/xmermaid-live/package-lock.json`
- Modify: `/Volumes/Data/Code/xmermaid-live/pnpm-lock.yaml`
- Modify: `/Volumes/Data/Code/xmermaid-live/vendor/xmermaid-provenance.json`

**Interfaces:**
- Produces: packed SDK containing `LIGHT_THEME`, revised `DARK_THEME`, geometry v2 WASM, and theme-aware SVG rendering.
- Consumers: every remaining xmermaid-live task.

- [ ] **Step 1: Extend packed-consumer assertions before rebuilding**

Add a consumer import and browser assertion equivalent to:

```js
import { DARK_THEME, LIGHT_THEME, XMermaid } from 'xmermaid';

if (LIGHT_THEME.name !== 'xmermaid-light' || DARK_THEME.name !== 'xmermaid-dark') {
  throw new Error('Packed theme presets are missing.');
}
const result = await renderer.renderToSVGElement('flowchart LR\n  A --> B', {
  theme: { ...DARK_THEME, arrowSize: 18 },
});
const path = result.svg.querySelector('.edge path');
const arrow = result.svg.querySelector('.edge polygon');
if (!path || !arrow) throw new Error('Packed render did not produce connected edge geometry.');
```

- [ ] **Step 2: Update current-truth documentation**

README must list `LIGHT_THEME`, `DARK_THEME`, `DEFAULT_THEME`, per-render theme overrides, and the marker-aware meaning of `edgeGap`. Architecture lines describing geometry v1 must become geometry v2: layout owns route/boundary/tangent; renderer owns marker footprint and reads v1/v2 payloads.

- [ ] **Step 3: Run the complete xmermaid verification matrix**

Run: `cd /Volumes/Data/Code/xmermaid && npm run verify:release`

Expected: every required matrix entry passes: build, consumer pack install, docs sync, JS tests, typecheck, Rust workspace, and diff whitespace.

- [ ] **Step 4: Create the deliberate vendor artifact**

Run:

```bash
cd /Volumes/Data/Code/xmermaid
XMERMAID_PACK_DIR=$(mktemp -d)
npm pack --pack-destination "$XMERMAID_PACK_DIR"
cp "$XMERMAID_PACK_DIR/xmermaid-0.1.0.tgz" /Volumes/Data/Code/xmermaid-live/vendor/xmermaid-0.1.0-theme-edge-geometry.tgz
```

Expected: npm reports `xmermaid-0.1.0.tgz`; the copied live vendor artifact exists and includes `dist/xmermaid_wasm_bg.wasm` plus public declarations.

- [ ] **Step 5: Install the packed artifact before compiling live theme code**

Run:

```bash
cd /Volumes/Data/Code/xmermaid-live
npm install --save-exact ./vendor/xmermaid-0.1.0-theme-edge-geometry.tgz
pnpm install --lockfile-only
```

Expected: `package.json`, `package-lock.json`, and `pnpm-lock.yaml` all reference `file:vendor/xmermaid-0.1.0-theme-edge-geometry.tgz`; `node_modules/xmermaid/dist/types/theme.d.ts` exports `LIGHT_THEME`.

- [ ] **Step 6: Replace provenance with measured values**

Run these read-only measurements and retain their exact output:

```bash
git -C /Volumes/Data/Code/xmermaid rev-parse HEAD
git -C /Volumes/Data/Code/xmermaid diff --binary --full-index HEAD | shasum -a 256
shasum -a 256 /Volumes/Data/Code/xmermaid-live/vendor/xmermaid-0.1.0-theme-edge-geometry.tgz
XMERMAID_EXTRACT_DIR=$(mktemp -d)
tar -xzf /Volumes/Data/Code/xmermaid-live/vendor/xmermaid-0.1.0-theme-edge-geometry.tgz -C "$XMERMAID_EXTRACT_DIR"
shasum -a 256 "$XMERMAID_EXTRACT_DIR/package/dist/xmermaid_wasm_bg.wasm"
```

Use `apply_patch` to set `sourceBaseCommit`, `sourceBuildInputDiffSha256`, `packageFile`, `packageSha256`, and `wasmSha256` in `vendor/xmermaid-provenance.json` to those outputs. Re-run the two `shasum` commands and compare them to the JSON before continuing.

- [ ] **Step 7: Record repository checkpoints without committing generated outputs**

Run:

```bash
git -C /Volumes/Data/Code/xmermaid diff --check -- README.md .codestable/architecture/ARCHITECTURE.md scripts/consumer-smoke.cjs
git -C /Volumes/Data/Code/xmermaid status --short
git -C /Volumes/Data/Code/xmermaid-live diff --check -- package.json package-lock.json pnpm-lock.yaml vendor/xmermaid-provenance.json
```

Expected: no whitespace errors; `dist/`, `pkg/`, `target/`, and `.playwright-cli/` remain ignored/untracked local artifacts and are not staged.

---

### Task 5: Add Pure Theme State And Versioned Persistence

**Files:**
- Create: `/Volumes/Data/Code/xmermaid-live/src/theme.ts`
- Create: `/Volumes/Data/Code/xmermaid-live/tests/theme.test.ts`

**Interfaces:**
- Produces: `WorkspaceTheme`, `DiagramStyleOverrides`, `ThemePreferences`, `DEFAULT_THEME_PREFERENCES`, `resolveDiagramTheme`, `parseThemePreferences`, `serializeThemePreferences`, `themeSignature`.
- Consumes: packed `DARK_THEME`, `LIGHT_THEME`, `RenderTheme`, and `ThemeColors`.

- [ ] **Step 1: Write the failing pure-state tests**

```ts
it('defaults to dark and preserves only explicit overrides across workspace switches', () => {
  const dark = resolveDiagramTheme({ workspace: 'dark', overrides: {} });
  const lightCustom = resolveDiagramTheme({
    workspace: 'light',
    overrides: { arrowSize: 16, colors: { arrowFill: '#ff3366' } },
  });
  expect(dark.name).toBe('xmermaid-dark');
  expect(lightCustom.arrowSize).toBe(16);
  expect(lightCustom.colors.arrowFill).toBe('#ff3366');
  expect(lightCustom.colors.background).toBe(LIGHT_THEME.colors.background);
});

it('rejects invalid or future preference payloads', () => {
  expect(parseThemePreferences(null)).toEqual(DEFAULT_THEME_PREFERENCES);
  expect(parseThemePreferences('{"version":2,"workspace":"light"}'))
    .toEqual(DEFAULT_THEME_PREFERENCES);
  expect(parseThemePreferences('{"version":1,"workspace":"neon","overrides":{}}'))
    .toEqual(DEFAULT_THEME_PREFERENCES);
});
```

- [ ] **Step 2: Run the focused test and verify the red state**

Run: `cd /Volumes/Data/Code/xmermaid-live && npm test -- tests/theme.test.ts`

Expected: FAIL because `src/theme.ts` does not exist.

- [ ] **Step 3: Implement validated deep merging and signatures**

```ts
export type WorkspaceTheme = 'dark' | 'light';
export type DiagramStyleOverrides = Partial<Omit<RenderTheme, 'name' | 'colors'>> & {
  colors?: Partial<ThemeColors>;
};
export interface ThemePreferences {
  version: 1;
  workspace: WorkspaceTheme;
  overrides: DiagramStyleOverrides;
}
export const DEFAULT_THEME_PREFERENCES: ThemePreferences = {
  version: 1,
  workspace: 'dark',
  overrides: {},
};

export function resolveDiagramTheme(preferences: ThemePreferences): RenderTheme {
  const base = preferences.workspace === 'dark' ? DARK_THEME : LIGHT_THEME;
  return {
    ...base,
    ...preferences.overrides,
    name: Object.keys(preferences.overrides).length === 0
      ? base.name
      : `${base.name}-custom`,
    colors: { ...base.colors, ...preferences.overrides.colors },
  };
}

export function themeSignature(theme: RenderTheme): string {
  return JSON.stringify(theme);
}
```

Implement `parseThemePreferences` with explicit allowlists for workspace, arrow style, curve style, color strings, finite numeric ranges (`edgeGap 0..24`, `arrowSize 4..32`, `nodeBorderRadius 0..24`, `fontSize 10..24`), and known font-family values. `serializeThemePreferences` returns JSON for version 1 only.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `cd /Volumes/Data/Code/xmermaid-live && npm test -- tests/theme.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Record the scoped checkpoint without committing**

Run: `git -C /Volumes/Data/Code/xmermaid-live diff --check -- src/theme.ts tests/theme.test.ts`

Expected: no output.

---

### Task 6: Include Theme Identity In Preview And Export Freshness

**Files:**
- Modify: `/Volumes/Data/Code/xmermaid-live/src/preview-runtime.ts`
- Modify: `/Volumes/Data/Code/xmermaid-live/tests/preview-runtime.test.ts`
- Modify: `/Volumes/Data/Code/xmermaid-live/src/render-source.ts`
- Modify: `/Volumes/Data/Code/xmermaid-live/tests/render-source.test.ts`

**Interfaces:**
- Changes: `PreviewRenderer = (source: string, theme: RenderTheme) => Promise<PreviewRenderResult>`.
- Changes: `PreviewRuntime.request(source: string | null, theme: RenderTheme): void`.
- Adds: `PreviewSnapshot.themeSignature: string | null`.
- Consumes: `themeSignature` from Task 5.

- [ ] **Step 1: Write failing stale-theme and renderer-forwarding tests**

```ts
it('ignores a slow result from the previous theme', async () => {
  const dark = deferred<PreviewRenderResult>();
  const light = deferred<PreviewRenderResult>();
  const runtime = new PreviewRuntime((_source, theme) =>
    theme.name === 'xmermaid-dark' ? dark.promise : light.promise, () => undefined, 10);

  runtime.request('flowchart LR\nA-->B', DARK_THEME);
  await vi.advanceTimersByTimeAsync(10);
  runtime.request('flowchart LR\nA-->B', LIGHT_THEME);
  await vi.advanceTimersByTimeAsync(10);
  light.resolve(renderResult('light'));
  dark.resolve(renderResult('dark'));
  await Promise.resolve();

  expect(runtime.snapshot.svg?.dataset.label).toBe('light');
  expect(runtime.snapshot.themeSignature).toBe(themeSignature(LIGHT_THEME));
});
```

In `tests/render-source.test.ts`, spy on `renderToSVGElement` and assert its second argument contains the exact theme plus the existing explicit WASM URL/fetch.

- [ ] **Step 2: Run focused tests and verify the red state**

Run: `cd /Volumes/Data/Code/xmermaid-live && npm test -- tests/preview-runtime.test.ts tests/render-source.test.ts`

Expected: FAIL because renderer/request signatures carry source only.

- [ ] **Step 3: Thread the complete theme through preview snapshots**

```ts
export type PreviewRenderer = (
  source: string,
  theme: RenderTheme,
) => Promise<PreviewRenderResult>;

request(source: string | null, theme: RenderTheme): void {
  const requestId = ++this.requestId;
  const signature = themeSignature(theme);
  if (this.timer) clearTimeout(this.timer);
  if (!source) {
    this.lastSuccessfulSvg = null;
    this.publish({ ...IDLE, themeSignature: signature });
    return;
  }
  this.publish({
    status: 'rendering',
    source,
    themeSignature: signature,
    svg: this.lastSuccessfulSvg,
    diagnostics: [],
    message: null,
    exportable: false,
  });
  this.timer = setTimeout(
    () => void this.run(requestId, source, theme, signature),
    this.delayMs,
  );
}
```

Every `idle`, `rendering`, `ready`, and `error` snapshot must set `themeSignature`. `createRenderSource()` must call:

```ts
return (source, theme) => renderer.renderToSVGElement(source, {
  theme,
  wasm: {
    wasmUrl: new URL('xmermaid_wasm_bg.wasm', window.location.href),
    fetch: window.fetch.bind(window),
  },
});
```

- [ ] **Step 4: Run focused tests, all preview tests, and typecheck**

Run: `cd /Volumes/Data/Code/xmermaid-live && npm test -- tests/theme.test.ts tests/preview-runtime.test.ts tests/render-source.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Record the scoped checkpoint without committing**

Run: `git -C /Volumes/Data/Code/xmermaid-live diff --check -- src/preview-runtime.ts tests/preview-runtime.test.ts src/render-source.ts tests/render-source.test.ts`

Expected: no output.

---

### Task 7: Build Theme Switching And The Complete Style Dialog

**Files:**
- Modify: `/Volumes/Data/Code/xmermaid-live/src/app.ts`
- Modify: `/Volumes/Data/Code/xmermaid-live/src/main.ts`
- Modify: `/Volumes/Data/Code/xmermaid-live/tests/app.test.ts`

**Interfaces:**
- Adds to `AppOptions`: `initialThemePreferences?: ThemePreferences`, `persistThemePreferences?: (preferences: ThemePreferences) => void`.
- Consumes: `resolveDiagramTheme`, `themeSignature`, and validated preferences from Task 5.
- Preserves: current editor/list/mobile/share/export event paths.

- [ ] **Step 1: Write failing DOM and export-freshness tests**

```ts
it('starts dark, switches paired themes, preserves overrides, and resets them', async () => {
  const persist = vi.fn();
  const renderedThemes: RenderTheme[] = [];
  const themeRenderer: PreviewRenderer = async (source, theme) => {
    renderedThemes.push(theme);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.dataset.source = source;
    return { svg, diagnostics: [] };
  };
  mounted = mountApp(root(), {
    initialText: DOCUMENT,
    renderer: themeRenderer,
    persistThemePreferences: persist,
  });
  const shell = document.querySelector<HTMLElement>('.app-shell')!;
  expect(shell.dataset.theme).toBe('dark');

  document.querySelector<HTMLButtonElement>('[data-theme="light"]')!.click();
  expect(shell.dataset.theme).toBe('light');

  document.querySelector<HTMLButtonElement>('[data-style-open]')!.click();
  const arrowSize = document.querySelector<HTMLInputElement>('[data-style-number="arrowSize"]')!;
  arrowSize.value = '18';
  arrowSize.dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector<HTMLButtonElement>('[data-theme="dark"]')!.click();
  await vi.runAllTimersAsync();
  expect(renderedThemes.at(-1)?.arrowSize).toBe(18);

  document.querySelector<HTMLButtonElement>('[data-style-reset]')!.click();
  await vi.runAllTimersAsync();
  expect(renderedThemes.at(-1)?.arrowSize).toBe(DARK_THEME.arrowSize);
  expect(persist).toHaveBeenCalled();
});

it('disables export until source and effective theme match the latest snapshot', async () => {
  const first = deferred<PreviewRenderResult>();
  const second = deferred<PreviewRenderResult>();
  const previewResult = (label: string): PreviewRenderResult => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.dataset.source = label;
    return { svg, diagnostics: [] };
  };
  const themeRenderer = vi.fn()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  mounted = mountApp(root(), { initialText: DOCUMENT, renderer: themeRenderer, renderDelayMs: 0 });
  await vi.advanceTimersByTimeAsync(0);
  first.resolve(previewResult('dark'));
  await Promise.resolve();
  expect(document.querySelector<HTMLButtonElement>('[data-export-svg]')?.disabled).toBe(false);

  document.querySelector<HTMLButtonElement>('[data-style-open]')!.click();
  const arrowSize = document.querySelector<HTMLInputElement>('[data-style-number="arrowSize"]')!;
  arrowSize.value = '18';
  arrowSize.dispatchEvent(new Event('input', { bubbles: true }));
  expect(document.querySelector<HTMLButtonElement>('[data-export-svg]')?.disabled).toBe(true);
  await vi.advanceTimersByTimeAsync(0);
  second.resolve(previewResult('custom'));
  await Promise.resolve();
  expect(document.querySelector<HTMLButtonElement>('[data-export-svg]')?.disabled).toBe(false);
});
```

Add an Escape/close test proving focus returns to `[data-style-open]` and an accessibility test for every color, select, range, and close control name.

- [ ] **Step 2: Run the focused app tests and verify the red state**

Run: `cd /Volumes/Data/Code/xmermaid-live && npm test -- tests/app.test.ts`

Expected: FAIL because theme controls, dialog, and theme-aware export matching do not exist.

- [ ] **Step 3: Add the toolbar and native dialog structure**

Add to `SHELL`:

```html
<div class="theme-switch" role="group" aria-label="工作台主题">
  <button type="button" data-theme="dark" aria-pressed="true">深色</button>
  <button type="button" data-theme="light" aria-pressed="false">浅色</button>
</div>
<button type="button" data-style-open aria-haspopup="dialog">图表样式</button>
<details class="export-menu">
  <summary>导出</summary>
  <button type="button" data-export-svg disabled>SVG</button>
  <button type="button" data-export-png disabled>PNG</button>
</details>
<dialog class="style-drawer" data-style-dialog aria-labelledby="style-title">
  <header><h2 id="style-title">图表样式</h2><button type="button" data-style-close aria-label="关闭图表样式">关闭</button></header>
  <fieldset><legend>颜色</legend>
    <label>画布 <input type="color" data-style-color="background"></label>
    <label>节点 <input type="color" data-style-color="nodeFill"></label>
    <label>节点描边 <input type="color" data-style-color="nodeStroke"></label>
    <label>节点文字 <input type="color" data-style-color="nodeText"></label>
    <label>连线 <input type="color" data-style-color="edgeStroke"></label>
    <label>连线标签 <input type="color" data-style-color="edgeLabel"></label>
    <label>箭头颜色 <input type="color" data-style-color="arrowFill"></label>
    <label>子图 <input type="color" data-style-color="subgraphFill"></label>
    <label>子图描边 <input type="color" data-style-color="subgraphStroke"></label>
  </fieldset>
  <fieldset><legend>几何</legend>
    <label>曲线 <select data-style-select="curveStyle"><option value="bezier">贝塞尔</option><option value="step">折线</option><option value="straight">直线</option></select></label>
    <label>箭头 <select data-style-select="arrowStyle"><option value="filled">实心</option><option value="triangle">三角</option><option value="open">开放</option><option value="circle">圆形</option><option value="cross">交叉</option></select></label>
    <label>节点留白 <input type="range" min="0" max="24" data-style-number="edgeGap"></label>
    <label>箭头大小 <input type="range" min="4" max="32" data-style-number="arrowSize"></label>
    <label>节点圆角 <input type="range" min="0" max="24" data-style-number="nodeBorderRadius"></label>
  </fieldset>
  <fieldset><legend>文字</legend>
    <label>字体 <select data-style-select="fontFamily"><option value="Inter, ui-sans-serif, system-ui, sans-serif">界面字体</option><option value="ui-monospace, SFMono-Regular, Consolas, monospace">等宽字体</option></select></label>
    <label>字号 <input type="range" min="10" max="24" data-style-number="fontSize"></label>
  </fieldset>
  <button type="button" data-style-reset>重置图表样式</button>
</dialog>
```

The actual dialog markup must enumerate every `RenderTheme` color key and numeric/style property; do not generate undocumented controls from arbitrary object keys.

- [ ] **Step 4: Implement one state update path**

Maintain `preferences` and `effectiveTheme` in `mountApp`. All theme/style handlers call one function:

```ts
function applyThemePreferences(next: ThemePreferences): void {
  preferences = next;
  effectiveTheme = resolveDiagramTheme(preferences);
  shell.dataset.theme = preferences.workspace;
  renderThemeControls();
  options.persistThemePreferences?.(preferences);
  runtime.request(selectedDiagram(state)?.source ?? null, effectiveTheme);
}
```

Style updates merge one validated override, reset clears `overrides`, and theme switch only changes `workspace`. `renderPreview` enables export only when source and `themeSignature(effectiveTheme)` match the snapshot. Open with `dialog.showModal()`, close through `dialog.close()`, handle `close` to return focus to the opener, and keep the mobile panel/editor selection unchanged.

At the `main.ts` boundary, use guarded local storage:

```ts
const storageKey = 'xmermaid-live.theme.v1';
const initialThemePreferences = parseThemePreferences(safeRead(storageKey));
mountApp(root, {
  initialText,
  initialSelectedIndex: initialState.selectedIndex ?? 0,
  initialThemePreferences,
  persistThemePreferences: value => safeWrite(storageKey, serializeThemePreferences(value)),
});
```

- [ ] **Step 5: Run app, preview, and theme tests**

Run: `cd /Volumes/Data/Code/xmermaid-live && npm test -- tests/theme.test.ts tests/preview-runtime.test.ts tests/render-source.test.ts tests/app.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Record the scoped checkpoint without committing**

Run: `git -C /Volumes/Data/Code/xmermaid-live diff --check -- src/app.ts src/main.ts tests/app.test.ts`

Expected: no output.

---

### Task 8: Apply The Dark-First Responsive Visual System

**Files:**
- Modify: `/Volumes/Data/Code/xmermaid-live/src/styles.css`
- Test: `/Volumes/Data/Code/xmermaid-live/tests/app.test.ts`

**Interfaces:**
- Consumes: `.app-shell[data-theme="dark" | "light"]`, `.style-drawer`, `.theme-switch`, and existing workspace selectors.
- Produces: shared semantic CSS variables and stable desktop/mobile dimensions.

- [ ] **Step 1: Add failing computed-style assertions**

```ts
it('applies distinct semantic workbench themes without changing panel geometry', () => {
  mounted = mountApp(root(), { initialText: DOCUMENT, renderer });
  const shell = document.querySelector<HTMLElement>('.app-shell')!;
  expect(getComputedStyle(shell).getPropertyValue('--surface-canvas').trim()).toBe('#0b1117');
  document.querySelector<HTMLButtonElement>('[data-theme="light"]')!.click();
  expect(getComputedStyle(shell).getPropertyValue('--surface-canvas').trim()).toBe('#f4f7f8');
  expect(getComputedStyle(document.querySelector('.workspace')!).gridTemplateColumns).toContain('208px');
});
```

- [ ] **Step 2: Run the style-aware app test and verify the red state**

Run: `cd /Volumes/Data/Code/xmermaid-live && npm test -- tests/app.test.ts`

Expected: FAIL because semantic tokens and the new geometry are absent.

- [ ] **Step 3: Replace hard-coded colors with scoped semantic tokens**

```css
.app-shell[data-theme="dark"] {
  color-scheme: dark;
  --surface-canvas: #0b1117;
  --surface-panel: #111820;
  --surface-raised: #18212b;
  --surface-editor: #0e151c;
  --border: #293642;
  --text: #e6edf3;
  --text-muted: #8fa0af;
  --accent: #2dd4bf;
  --accent-strong: #14b8a6;
  --danger: #fb7185;
  --warning: #f5b942;
}

.app-shell[data-theme="light"] {
  color-scheme: light;
  --surface-canvas: #f4f7f8;
  --surface-panel: #ffffff;
  --surface-raised: #edf2f4;
  --surface-editor: #fbfcfd;
  --border: #d5dde2;
  --text: #17212b;
  --text-muted: #61717f;
  --accent: #0f9f8f;
  --accent-strong: #0f766e;
  --danger: #e11d48;
  --warning: #b7791f;
}
```

Use a 56px topbar, `208px minmax(360px, .9fr) minmax(420px, 1.25fr)` workspace columns, borders rather than floating section cards, radii no greater than 8px, a 16px dot grid, and zero gradient/orb decoration. Keep all fixed controls from resizing on label/state changes.

- [ ] **Step 4: Style the dialog and responsive state**

Desktop dialog is fixed to the right below the toolbar, width `min(380px, calc(100vw - 24px))`, full remaining height, and no centered card treatment. At `max-width: 980px`, keep the existing single-panel workspace, make the dialog `inset: 0`, `width: 100vw`, `height: 100dvh`, and preserve 44px minimum touch targets. Use `@media (prefers-reduced-motion: reduce)` for dialog transitions.

- [ ] **Step 5: Run unit tests, typecheck, and production build**

Run: `cd /Volumes/Data/Code/xmermaid-live && npm test -- tests/app.test.ts tests/theme.test.ts && npm run typecheck && npm run build`

Expected: PASS and one CSS asset in `dist/assets`.

- [ ] **Step 6: Record the scoped checkpoint without committing**

Run: `git -C /Volumes/Data/Code/xmermaid-live diff --check -- src/styles.css tests/app.test.ts`

Expected: no output.

---

### Task 9: Install The Packed SDK And Prove The Full Browser Contract

**Files:**
- Modify: `/Volumes/Data/Code/xmermaid-live/e2e/workspace.spec.ts`

**Interfaces:**
- Consumes: installed packed xmermaid artifact from Task 4 and all live UI/state work.
- Produces: deployable, privacy-preserving production build with screenshot and pixel evidence.

- [ ] **Step 1: Add failing real-browser theme and continuity tests**

```ts
test('switches paired themes, preserves custom style, and restores it locally', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('[data-preview] svg')).toHaveCSS('background-color', 'rgb(11, 17, 23)');
  await page.getByRole('button', { name: '图表样式' }).click();
  await page.getByRole('slider', { name: '箭头大小' }).fill('18');
  await page.getByRole('button', { name: '关闭图表样式' }).click();
  await page.getByRole('button', { name: '浅色' }).click();
  await page.reload();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: '图表样式' }).click();
  await expect(page.getByRole('slider', { name: '箭头大小' })).toHaveValue('18');
});

test('opens and closes diagram styles by keyboard and restores focus', async ({ page }) => {
  await page.goto('./');
  const opener = page.getByRole('button', { name: '图表样式' });
  await opener.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: '图表样式' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '图表样式' })).toBeHidden();
  await expect(opener).toBeFocused();
});

test('exports the currently rendered custom colors', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '图表样式' }).click();
  await page.getByLabel('箭头颜色').fill('#ff3366');
  await page.getByRole('button', { name: '关闭图表样式' }).click();
  await expect(page.locator('[data-preview-status]')).toHaveText('已更新');
  await page.getByText('导出', { exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'SVG', exact: true }).click();
  const markup = (await downloadBytes(await downloadPromise)).toString('utf8');
  expect(markup).toContain('#ff3366');
});
```

- [ ] **Step 2: Add SVG-coordinate and canvas-pixel continuity helpers**

The SVG helper must read the path endpoint, marker attachment, node boundary, and final tangent and assert no positive geometric gap. The pixel helper must serialize the actual SVG, draw it into an in-page canvas at 2x scale, sample a 3x3 neighborhood along the path-to-marker join at 0.5px intervals, and fail if any sample contains only the diagram background color.

```ts
async function expectFilledArrowContinuity(page: Page): Promise<void> {
  const result = await page.locator('[data-preview] svg').evaluate(async svg => {
    const path = svg.querySelector<SVGPathElement>('.edge path');
    const polygon = svg.querySelector<SVGPolygonElement>('.edge polygon');
    if (!path || !polygon) throw new Error('Expected a filled-arrow edge.');
    const pathEnd = path.getPointAtLength(path.getTotalLength());
    const coordinates = polygon.getAttribute('points')?.match(/-?\d+(?:\.\d+)?/g)?.map(Number);
    if (!coordinates || coordinates.length < 6) throw new Error('Expected triangle coordinates.');
    const arrowBase = {
      x: (coordinates[0]! + coordinates[4]!) / 2,
      y: (coordinates[1]! + coordinates[5]!) / 2,
    };
    const geometricGap = Math.hypot(pathEnd.x - arrowBase.x, pathEnd.y - arrowBase.y);

    const serialized = new XMLSerializer().serializeToString(svg);
    const url = URL.createObjectURL(new Blob([serialized], { type: 'image/svg+xml' }));
    const image = new Image();
    image.src = url;
    await image.decode();
    const viewBox = (svg as SVGSVGElement).viewBox.baseVal;
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewBox.width * scale);
    canvas.height = Math.ceil(viewBox.height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Expected a 2D canvas context.');
    context.scale(scale, scale);
    context.drawImage(image, 0, 0, viewBox.width, viewBox.height);
    URL.revokeObjectURL(url);

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixel = (x: number, y: number): number[] => {
      const px = Math.max(0, Math.min(canvas.width - 1, Math.round(x * scale)));
      const py = Math.max(0, Math.min(canvas.height - 1, Math.round(y * scale)));
      const offset = (py * canvas.width + px) * 4;
      return Array.from(pixels.data.slice(offset, offset + 4));
    };
    const background = pixel(1, 1);
    const isBackground = (sample: number[]): boolean =>
      sample.every((channel, index) => Math.abs(channel - background[index]!) <= 4);
    const distance = Math.max(geometricGap, 0.5);
    let backgroundOnlySamples = 0;
    for (let travelled = 0; travelled <= distance; travelled += 0.5) {
      const ratio = travelled / distance;
      const x = pathEnd.x + (arrowBase.x - pathEnd.x) * ratio;
      const y = pathEnd.y + (arrowBase.y - pathEnd.y) * ratio;
      const neighborhood: number[][] = [];
      for (const dx of [-0.5, 0, 0.5]) {
        for (const dy of [-0.5, 0, 0.5]) neighborhood.push(pixel(x + dx, y + dy));
      }
      if (neighborhood.every(isBackground)) backgroundOnlySamples += 1;
    }
    return { geometricGap, backgroundOnlySamples };
  });
  expect(result.geometricGap).toBeLessThanOrEqual(0.75);
  expect(result.backgroundOnlySamples).toBe(0);
}
```

Run the helper after default dark render, after light switch, and after setting `arrowSize=24`. Keep privacy monitoring active so canvas verification cannot hide external requests.

- [ ] **Step 3: Run targeted browser tests and capture review screenshots**

Run:

```bash
cd /Volumes/Data/Code/xmermaid-live
npm run build
npx playwright test e2e/workspace.spec.ts --project=chromium
```

Then start `npm run dev -- --host 127.0.0.1` on a free port and use the Playwright CLI to capture:

- `output/playwright/xmermaid-live-dark-desktop.png` at 1440x900.
- `output/playwright/xmermaid-live-light-desktop.png` at 1440x900.
- `output/playwright/xmermaid-live-dark-mobile.png` at 390x844.

Expected: no clipped text, overlapping controls, blank SVG, incoherent panel nesting, or disconnected arrows.

- [ ] **Step 4: Run both repositories' complete verification**

Run:

```bash
cd /Volumes/Data/Code/xmermaid && npm run verify:release
cd /Volumes/Data/Code/xmermaid-live && npm run verify
git -C /Volumes/Data/Code/xmermaid diff --check -- HEAD
git -C /Volumes/Data/Code/xmermaid-live diff --check -- HEAD
```

Expected: xmermaid release matrix passes; xmermaid-live typecheck, unit tests, production build, Chromium full suite, Firefox/WebKit tagged cross-browser suite, static root/subpath smoke, and whitespace checks pass.

- [ ] **Step 5: Perform the final dirty-tree and generated-artifact audit**

Run:

```bash
git -C /Volumes/Data/Code/xmermaid status --short
git -C /Volumes/Data/Code/xmermaid-live status --short
git -C /Volumes/Data/Code/xmermaid diff --name-only
git -C /Volumes/Data/Code/xmermaid-live diff --name-only
```

Expected: only scoped source/tests/docs plus the deliberate live vendor tarball/provenance are new task changes; existing user changes remain present; ignored build/browser artifacts are not staged or tracked; no implementation commit was created.
