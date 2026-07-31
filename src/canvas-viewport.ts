export type CanvasViewportMode = 'fit' | 'manual';

export interface CanvasSize {
  width: number;
  height: number;
}

export interface CanvasViewport {
  mode: CanvasViewportMode;
  scale: number;
  offsetX: number;
  offsetY: number;
}

export const MIN_CANVAS_SCALE = .25;
export const MAX_CANVAS_SCALE = 4;

const FIT_PADDING = 12;
const MIN_FIT_SCALE = .01;

export function formatCanvasZoom(value: CanvasViewport): string {
  return `${Math.round(value.scale * 100)}%`;
}

export function fitCanvasViewport(content: CanvasSize, container: CanvasSize): CanvasViewport {
  if (!hasSize(content) || !hasSize(container)) {
    return { mode: 'fit', scale: 1, offsetX: 0, offsetY: 0 };
  }

  const width = Math.max(0, container.width - FIT_PADDING * 2);
  const height = Math.max(0, container.height - FIT_PADDING * 2);
  const scale = clamp(Math.min(width / content.width, height / content.height), MIN_FIT_SCALE, MAX_CANVAS_SCALE);

  return {
    mode: 'fit',
    scale: round(scale),
    offsetX: round((container.width - content.width * scale) / 2),
    offsetY: round((container.height - content.height * scale) / 2),
  };
}

export function zoomCanvasViewport(
  value: CanvasViewport,
  content: CanvasSize,
  container: CanvasSize,
  nextScale: number,
): CanvasViewport {
  return zoomCanvasViewportAt(value, content, container, nextScale, {
    x: container.width / 2,
    y: container.height / 2,
  });
}

export function zoomCanvasViewportAt(
  value: CanvasViewport,
  content: CanvasSize,
  container: CanvasSize,
  nextScale: number,
  anchor: { x: number; y: number },
): CanvasViewport {
  const current = isViewport(value) ? value : fitCanvasViewport(content, container);
  const fit = fitCanvasViewport(content, container);
  const scale = clamp(nextScale, Math.min(MIN_CANVAS_SCALE, fit.scale), MAX_CANVAS_SCALE);

  if (!hasSize(content) || !hasSize(container)) {
    return { mode: 'manual', scale: round(scale), offsetX: 0, offsetY: 0 };
  }

  if (scale <= fit.scale) return fit;

  const anchorX = finiteOrZero(anchor.x);
  const anchorY = finiteOrZero(anchor.y);
  const contentX = (anchorX - current.offsetX) / current.scale;
  const contentY = (anchorY - current.offsetY) / current.scale;
  const offset = clampOffsets(content, container, {
    offsetX: anchorX - contentX * scale,
    offsetY: anchorY - contentY * scale,
    scale,
  });

  return { mode: 'manual', scale: round(scale), ...offset };
}

export function panCanvasViewport(
  value: CanvasViewport,
  content: CanvasSize,
  container: CanvasSize,
  deltaX: number,
  deltaY: number,
): CanvasViewport {
  const current = isViewport(value) ? value : fitCanvasViewport(content, container);
  const offset = clampOffsets(content, container, {
    offsetX: current.offsetX + finiteOrZero(deltaX),
    offsetY: current.offsetY + finiteOrZero(deltaY),
    scale: current.scale,
  });

  return { mode: 'manual', scale: current.scale, ...offset };
}

export function viewportTransform(value: CanvasViewport): string {
  return `translate(${value.offsetX}px, ${value.offsetY}px) scale(${value.scale})`;
}

export function viewportForDiagram(
  cache: ReadonlyMap<string, CanvasViewport>,
  diagramId: string | null,
  content: CanvasSize,
  container: CanvasSize,
): CanvasViewport {
  const cached = diagramId ? cache.get(diagramId) : undefined;
  return cached && isViewport(cached) ? cached : fitCanvasViewport(content, container);
}

function clampOffsets(
  content: CanvasSize,
  container: CanvasSize,
  value: Pick<CanvasViewport, 'offsetX' | 'offsetY' | 'scale'>,
): Pick<CanvasViewport, 'offsetX' | 'offsetY'> {
  if (!hasSize(content) || !hasSize(container)) return { offsetX: 0, offsetY: 0 };

  return {
    offsetX: round(clampOffset(value.offsetX, content.width * value.scale, container.width)),
    offsetY: round(clampOffset(value.offsetY, content.height * value.scale, container.height)),
  };
}

function clampOffset(offset: number, contentLength: number, containerLength: number): number {
  if (!Number.isFinite(offset) || !Number.isFinite(contentLength) || !Number.isFinite(containerLength)) return 0;
  if (contentLength <= containerLength) return (containerLength - contentLength) / 2;
  return clamp(offset, containerLength - contentLength, 0);
}

function hasSize(value: CanvasSize): boolean {
  return Number.isFinite(value.width) && Number.isFinite(value.height) && value.width > 0 && value.height > 0;
}

function isViewport(value: CanvasViewport): boolean {
  return (value.mode === 'fit' || value.mode === 'manual')
    && Number.isFinite(value.scale)
    && value.scale > 0
    && Number.isFinite(value.offsetX)
    && Number.isFinite(value.offsetY);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
