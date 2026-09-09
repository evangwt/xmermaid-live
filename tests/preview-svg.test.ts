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

  it('replaces a degenerate renderer viewBox with the measured content bounds', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 33554520 33554440');

    normalizePreviewSvg(svg, {
      label: 'Diagram 1: C4 container',
      bounds: { x: 0, y: 0, width: 940, height: 520 },
    });

    expect(svg.getAttribute('viewBox')).toBe('-4 -4 948 528');
    expect(svg.getAttribute('width')).toBe('948');
    expect(svg.getAttribute('height')).toBe('528');
    expect(svg.getAttribute('aria-label')).toBe('Diagram 1: C4 container');
  });

  it('excludes implausibly positioned elements when rebuilding a degenerate viewBox', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 33554520 33554440');
    const content = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.appendChild(content);
    // jsdom has no getBBox; stub the bounds the browser would report.
    (svg as unknown as { getBBox: () => DOMRect }).getBBox = () => ({
      x: 0, y: 0, width: 33_554_520, height: 33_554_440,
    } as DOMRect);
    (content as unknown as { getBBox: () => DOMRect }).getBBox = () => ({
      x: 20, y: 30, width: 900, height: 460,
    } as DOMRect);

    normalizePreviewSvg(svg, { label: 'Diagram 1: C4 container' });

    expect(svg.getAttribute('viewBox')).toBe('16 26 908 468');
    expect(svg.getAttribute('width')).toBe('908');
    expect(svg.getAttribute('height')).toBe('468');
  });

  it('keeps a degenerate viewBox untouched when content bounds are not measurable', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 33554520 33554440');

    // jsdom exposes no getBBox, so measureBounds fails and the input must pass through.
    normalizePreviewSvg(svg, { label: 'Diagram 1: C4 container' });

    expect(svg.getAttribute('viewBox')).toBe('0 0 33554520 33554440');
    expect(svg.getAttribute('aria-label')).toBe('Diagram 1: C4 container');
  });

  it('keeps a large but plausible viewBox that fits its content', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 40000 9000');

    normalizePreviewSvg(svg, {
      label: 'Diagram 2: Flowchart',
      bounds: { x: 10, y: 10, width: 39900, height: 8900 },
    });

    expect(svg.getAttribute('viewBox')).toBe('0 0 40000 9000');
  });

  it('measures only root-level children so descendant geometry cannot poison bounds', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 33554520 33554440');
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const descendant = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    group.appendChild(descendant);
    svg.appendChild(group);
    // jsdom has no getBBox; stub the bounds the browser would report. The
    // descendant reports absurd geometry, but only root-level children share
    // the root coordinate space and may contribute to the measurement.
    (svg as unknown as { getBBox: () => DOMRect }).getBBox = () => ({
      x: 0, y: 0, width: 33_554_520, height: 33_554_440,
    } as DOMRect);
    (group as unknown as { getBBox: () => DOMRect }).getBBox = () => ({
      x: 20, y: 30, width: 900, height: 460,
    } as DOMRect);
    (descendant as unknown as { getBBox: () => DOMRect }).getBBox = () => ({
      x: 12_000_000, y: 0, width: 10, height: 10,
    } as DOMRect);

    normalizePreviewSvg(svg, { label: 'Diagram 1: C4 container' });

    expect(svg.getAttribute('viewBox')).toBe('16 26 908 468');
  });

  it('drops text elements positioned at implausible coordinates', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 920 560');
    const stray = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    stray.setAttribute('x', '1.7976931348623157e+308');
    stray.setAttribute('y', '1.7976931348623157e+308');
    stray.textContent = 'Edge cluster';
    const kept = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    kept.setAttribute('x', '10');
    kept.setAttribute('y', '20');
    kept.textContent = 'Web app';
    svg.append(stray, kept);

    normalizePreviewSvg(svg, {
      label: 'Diagram 1: C4 container',
      bounds: { x: 12, y: 12, width: 880, height: 530 },
    });

    expect(svg.querySelectorAll('text')).toHaveLength(1);
    expect(svg.querySelector('text')?.textContent).toBe('Web app');
    expect(svg.getAttribute('viewBox')).toBe('0 0 920 560');
  });

  it('ignores implausible explicit bounds instead of rebuilding the viewBox from garbage', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 920 560');

    normalizePreviewSvg(svg, {
      label: 'Diagram 1: C4 container',
      bounds: { x: 0, y: 0, width: 5_000_000, height: 5_000_000 },
    });

    expect(svg.getAttribute('viewBox')).toBe('0 0 920 560');
  });

  it('expands a non-degenerate viewBox from plausible content when raw bounds are implausible', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 95000 3000');
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.appendChild(group);
    (svg as unknown as { getBBox: () => DOMRect }).getBBox = () => ({
      x: 0, y: 0, width: 2_000_000, height: 100,
    } as DOMRect);
    (group as unknown as { getBBox: () => DOMRect }).getBBox = () => ({
      x: 0, y: 0, width: 97_000, height: 2500,
    } as DOMRect);

    normalizePreviewSvg(svg, { label: 'Diagram 2: Flowchart' });

    expect(svg.getAttribute('viewBox')).toBe('-4 -4 97008 3008');
  });
});
