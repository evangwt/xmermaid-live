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

export function normalizePreviewSvg(svg: SVGSVGElement, options: NormalizePreviewSvgOptions): void {
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', options.label);

  const viewBox = readViewBox(svg);
  const bounds = options.bounds ?? measureBounds(svg);
  if (!viewBox || !hasBounds(bounds) || !overflows(viewBox, bounds)) return;

  const left = Math.min(viewBox.x, bounds.x) - VIEWBOX_PADDING;
  const top = Math.min(viewBox.y, bounds.y) - VIEWBOX_PADDING;
  const right = Math.max(viewBox.x + viewBox.width, bounds.x + bounds.width) + VIEWBOX_PADDING;
  const bottom = Math.max(viewBox.y + viewBox.height, bounds.y + bounds.height) + VIEWBOX_PADDING;
  const width = right - left;
  const height = bottom - top;
  svg.setAttribute('viewBox', `${left} ${top} ${width} ${height}`);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
}

function readViewBox(svg: SVGSVGElement): SvgBounds | null {
  const values = svg.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (!values || values.length !== 4 || !values.every(Number.isFinite)) return null;
  const [x, y, width, height] = values;
  return width! > 0 && height! > 0 ? { x: x!, y: y!, width: width!, height: height! } : null;
}

function measureBounds(svg: SVGSVGElement): SvgBounds | null {
  try {
    return svg.getBBox();
  } catch {
    return null;
  }
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
