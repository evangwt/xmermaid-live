export interface SvgBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NormalizePreviewSvgOptions {
  label: string;
  bounds?: SvgBounds | null;
}

const VIEWBOX_PADDING = 4;
// Renderers can emit runaway layout bounds (observed: a C4 label positioned at
// Number.MAX_VALUE, producing a 33-megapixel canvas). Past this limit a viewBox
// is treated as degenerate and rebuilt from measured content, and individual
// elements beyond it are treated as layout outliers rather than content. The
// limits sit far above any legitimate diagram seen in the matrix (largest
// ~3k px) yet far below the observed garbage (~33M px).
const DEGENERATE_VIEWBOX_LIMIT = 100_000;
const PLAUSIBLE_COORDINATE_LIMIT = 1_000_000;

export function normalizePreviewSvg(svg: SVGSVGElement, options: NormalizePreviewSvgOptions): void {
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', options.label);
  sanitizeImplausibleText(svg);

  const viewBox = readViewBox(svg);
  if (viewBox && isDegenerate(viewBox)) {
    const content = usableBounds(options.bounds) ?? measureBounds(svg);
    if (hasBounds(content)) {
      writeViewBox(svg, {
        x: content.x - VIEWBOX_PADDING,
        y: content.y - VIEWBOX_PADDING,
        width: content.width + VIEWBOX_PADDING * 2,
        height: content.height + VIEWBOX_PADDING * 2,
      });
    }
    return;
  }

  const bounds = usableBounds(options.bounds) ?? measureBounds(svg);
  if (!viewBox || !hasBounds(bounds) || !overflows(viewBox, bounds)) return;

  writeViewBox(svg, {
    x: Math.min(viewBox.x, bounds.x) - VIEWBOX_PADDING,
    y: Math.min(viewBox.y, bounds.y) - VIEWBOX_PADDING,
    width: Math.max(viewBox.x + viewBox.width, bounds.x + bounds.width)
      - Math.min(viewBox.x, bounds.x)
      + VIEWBOX_PADDING * 2,
    height: Math.max(viewBox.y + viewBox.height, bounds.y + bounds.height)
      - Math.min(viewBox.y, bounds.y)
      + VIEWBOX_PADDING * 2,
  });
}

// A stray label laid out at an astronomical coordinate stays invisible in every
// view but would keep polluting exports and the accessibility tree.
function sanitizeImplausibleText(svg: SVGSVGElement): void {
  for (const text of Array.from(svg.querySelectorAll('text'))) {
    if (isImplausibleCoordinate(text.getAttribute('x')) || isImplausibleCoordinate(text.getAttribute('y'))) {
      text.remove();
    }
  }
}

function isImplausibleCoordinate(raw: string | null): boolean {
  if (raw === null) return false;
  const value = Number(raw.trim().split(/[\s,]+/)[0]);
  return !Number.isFinite(value) || Math.abs(value) > PLAUSIBLE_COORDINATE_LIMIT;
}

function usableBounds(bounds: SvgBounds | null | undefined): SvgBounds | null {
  return bounds && isPlausibleBounds(bounds) ? bounds : null;
}

function writeViewBox(svg: SVGSVGElement, box: SvgBounds): void {
  svg.setAttribute('viewBox', `${box.x} ${box.y} ${box.width} ${box.height}`);
  svg.setAttribute('width', String(box.width));
  svg.setAttribute('height', String(box.height));
}

function isDegenerate(viewBox: SvgBounds): boolean {
  return viewBox.width > DEGENERATE_VIEWBOX_LIMIT || viewBox.height > DEGENERATE_VIEWBOX_LIMIT;
}

function readViewBox(svg: SVGSVGElement): SvgBounds | null {
  const values = svg.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (!values || values.length !== 4 || !values.every(Number.isFinite)) return null;
  const [x, y, width, height] = values;
  return width! > 0 && height! > 0 ? { x: x!, y: y!, width: width!, height: height! } : null;
}

function measureBounds(svg: SVGSVGElement): SvgBounds | null {
  try {
    const bbox = svg.getBBox();
    if (isPlausibleBounds(bbox)) return bbox;
  } catch {
    return null;
  }
  return measurePlausibleContent(svg);
}

// The whole-svg getBBox unions every descendant, so a single element laid out
// at an astronomical coordinate poisons it. Re-measure and keep only plausible
// geometry. Only root-level children are measured: getBBox reports an element's
// own user space, so deeper descendants would mix coordinate systems if the
// renderer ever positions content through ancestor transforms.
function measurePlausibleContent(svg: SVGSVGElement): SvgBounds | null {
  let bounds: SvgBounds | null = null;
  for (const element of Array.from(svg.children)) {
    let box: SvgBounds;
    try {
      box = (element as SVGGraphicsElement).getBBox();
    } catch {
      continue;
    }
    if (!isPlausibleBounds(box)) continue;
    bounds = unionBounds(bounds, box);
  }
  return bounds;
}

function unionBounds(bounds: SvgBounds | null, addend: SvgBounds): SvgBounds {
  if (!hasBounds(bounds)) return addend;
  const x = Math.min(bounds.x, addend.x);
  const y = Math.min(bounds.y, addend.y);
  return {
    x,
    y,
    width: Math.max(bounds.x + bounds.width, addend.x + addend.width) - x,
    height: Math.max(bounds.y + bounds.height, addend.y + addend.height) - y,
  };
}

function isPlausibleBounds(bounds: SvgBounds): boolean {
  return Number.isFinite(bounds.x)
    && Number.isFinite(bounds.y)
    && Number.isFinite(bounds.width)
    && Number.isFinite(bounds.height)
    && Math.abs(bounds.x) <= PLAUSIBLE_COORDINATE_LIMIT
    && Math.abs(bounds.y) <= PLAUSIBLE_COORDINATE_LIMIT
    && bounds.width <= PLAUSIBLE_COORDINATE_LIMIT
    && bounds.height <= PLAUSIBLE_COORDINATE_LIMIT;
}

function hasBounds(bounds: SvgBounds | null): bounds is SvgBounds {
  return Boolean(
    bounds
    && [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
    && bounds.width > 0
    && bounds.height > 0,
  );
}

function overflows(viewBox: SvgBounds, bounds: SvgBounds): boolean {
  return bounds.x < viewBox.x
    || bounds.y < viewBox.y
    || bounds.x + bounds.width > viewBox.x + viewBox.width
    || bounds.y + bounds.height > viewBox.y + viewBox.height;
}
