import { describe, expect, it } from 'vitest';
import {
  MAX_CANVAS_SCALE,
  MIN_CANVAS_SCALE,
  fitCanvasViewport,
  panCanvasViewport,
  viewportForDiagram,
  viewportTransform,
  zoomCanvasViewport,
  zoomCanvasViewportAt,
} from '../src/canvas-viewport';

const content = { width: 800, height: 400 };
const container = { width: 420, height: 300 };

describe('canvas viewport', () => {
  it('fits content inside the available canvas with centred offsets', () => {
    expect(fitCanvasViewport(content, container)).toEqual({
      mode: 'fit', scale: .495, offsetX: 12, offsetY: 51,
    });
  });

  it('clamps manual zoom to the supported range', () => {
    const fit = fitCanvasViewport(content, container);
    expect(zoomCanvasViewport(fit, content, container, 99).scale).toBe(MAX_CANVAS_SCALE);
    expect(zoomCanvasViewport(fit, content, container, .01).scale).toBe(MIN_CANVAS_SCALE);
  });

  it('keeps the content below a pointer stable while zooming there', () => {
    const fit = fitCanvasViewport(content, container);
    const pointer = { x: 210, y: 150 };
    const before = {
      x: (pointer.x - fit.offsetX) / fit.scale,
      y: (pointer.y - fit.offsetY) / fit.scale,
    };
    const zoomed = zoomCanvasViewportAt(fit, content, container, 1, pointer);

    expect((pointer.x - zoomed.offsetX) / zoomed.scale).toBeCloseTo(before.x, 2);
    expect((pointer.y - zoomed.offsetY) / zoomed.scale).toBeCloseTo(before.y, 2);
  });

  it('changes mode to manual and clamps pan so the content cannot disappear', () => {
    const zoomed = zoomCanvasViewport(fitCanvasViewport(content, container), content, container, 1);
    const moved = panCanvasViewport(zoomed, content, container, -9_000, 9_000);
    expect(moved.mode).toBe('manual');
    expect(moved.offsetX).toBeGreaterThanOrEqual(container.width - content.width);
    expect(moved.offsetY).toBeLessThanOrEqual(0);
  });

  it('formats CSS transforms without leaking fit-mode state', () => {
    expect(viewportTransform({ mode: 'manual', scale: 1.25, offsetX: -18, offsetY: 4 }))
      .toBe('translate(-18px, 4px) scale(1.25)');
  });

  it('restores a cached diagram viewport and fits a new diagram', () => {
    const cached = new Map([['diagram-2', { mode: 'manual' as const, scale: 2, offsetX: -10, offsetY: -20 }]]);
    expect(viewportForDiagram(cached, 'diagram-2', content, container).scale).toBe(2);
    expect(viewportForDiagram(cached, 'diagram-3', content, container).mode).toBe('fit');
  });
});
