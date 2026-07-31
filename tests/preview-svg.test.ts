import { describe, expect, it } from 'vitest';
import { normalizePreviewSvg } from '../src/preview-svg';

describe('normalizePreviewSvg', () => {
  it('expands the viewBox to include renderer content outside its declared bounds', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 920 560');

    normalizePreviewSvg(svg, {
      label: 'Diagram 27: Ishikawa',
      bounds: { x: -90.90625, y: 0, width: 1_040.90625, height: 560 },
    });

    expect(svg.getAttribute('viewBox')).toBe('-94.90625 -4 1048.90625 568');
    expect(svg.getAttribute('width')).toBe('1048.90625');
    expect(svg.getAttribute('height')).toBe('568');
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Diagram 27: Ishikawa');
  });

  it('preserves a correctly bounded viewBox while still exposing a diagram name', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 920 560');

    normalizePreviewSvg(svg, {
      label: 'Diagram 1: Flowchart',
      bounds: { x: 12, y: 12, width: 880, height: 530 },
    });

    expect(svg.getAttribute('viewBox')).toBe('0 0 920 560');
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Diagram 1: Flowchart');
  });
});
