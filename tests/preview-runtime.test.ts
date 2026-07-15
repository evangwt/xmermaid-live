import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { XMermaidError, type RenderResult, type XMermaidDiagnostic } from 'xmermaid';
import {
  PreviewRuntime,
  type PreviewRenderer,
  type PreviewRenderResult,
} from '../src/preview-runtime';

function svg(label: string): SVGSVGElement {
  const element = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  element.dataset.label = label;
  return element;
}

function renderResult(
  label: string,
  diagnostics: XMermaidDiagnostic[] = [],
): PreviewRenderResult {
  const result: RenderResult = {
    diagramType: 'flowchart',
    diagnostics,
    dimensions: { width: 200, height: 120 },
    svg: svg(label),
  };
  return result;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('PreviewRuntime', () => {
  it('accepts renderer results containing only preview fields', async () => {
    const renderer: PreviewRenderer = async source => ({
      svg: svg(source),
      diagnostics: [],
    });
    const runtime = new PreviewRuntime(renderer, () => undefined, 10);

    runtime.request('narrow result');
    await vi.runAllTimersAsync();

    expect(runtime.snapshot.status).toBe('ready');
    expect(runtime.snapshot.svg?.dataset.label).toBe('narrow result');
  });

  it('debounces input and renders only the latest source', async () => {
    const renderedSources: string[] = [];
    const runtime = new PreviewRuntime(async source => {
      renderedSources.push(source);
      return renderResult(source);
    }, () => undefined, 40);

    runtime.request('flowchart TD\nA-->B');
    runtime.request('flowchart LR\nA-->C');
    await vi.runAllTimersAsync();

    expect(renderedSources).toEqual(['flowchart LR\nA-->C']);
    expect(runtime.snapshot).toMatchObject({
      status: 'ready',
      source: 'flowchart LR\nA-->C',
      exportable: true,
    });
    expect(runtime.snapshot.svg?.dataset.label).toBe('flowchart LR\nA-->C');
  });

  it('ignores a slow stale rejection after a newer request succeeds', async () => {
    const first = deferred<PreviewRenderResult>();
    const second = deferred<PreviewRenderResult>();
    const runtime = new PreviewRuntime(source => {
      if (source === 'first') return first.promise;
      return second.promise;
    }, () => undefined, 10);

    runtime.request('first');
    await vi.advanceTimersByTimeAsync(10);
    runtime.request('second');
    await vi.advanceTimersByTimeAsync(10);

    second.resolve(renderResult('second'));
    await Promise.resolve();
    first.reject(new XMermaidError('RENDER_ERROR', 'stale failure'));
    await Promise.resolve();

    expect(runtime.snapshot).toMatchObject({
      status: 'ready',
      source: 'second',
      diagnostics: [],
      message: null,
      exportable: true,
    });
    expect(runtime.snapshot.svg?.dataset.label).toBe('second');
  });

  it('ignores a slow stale result after a newer request succeeds', async () => {
    const first = deferred<PreviewRenderResult>();
    const second = deferred<PreviewRenderResult>();
    const runtime = new PreviewRuntime(source => {
      if (source === 'first') return first.promise;
      return second.promise;
    }, () => undefined, 10);

    runtime.request('first');
    await vi.advanceTimersByTimeAsync(10);
    runtime.request('second');
    await vi.advanceTimersByTimeAsync(10);

    second.resolve(renderResult('second'));
    await Promise.resolve();
    first.resolve(renderResult('first'));
    await Promise.resolve();

    expect(runtime.snapshot).toMatchObject({
      status: 'ready',
      source: 'second',
      exportable: true,
    });
    expect(runtime.snapshot.svg?.dataset.label).toBe('second');
  });

  it('keeps the last good SVG and failure diagnostics but disables export', async () => {
    const parseDiagnostic: XMermaidDiagnostic = {
      code: 'parse_error',
      message: 'bad source',
      severity: 'error',
      range: null,
    };
    const runtime = new PreviewRuntime(async source => {
      if (source === 'valid') return renderResult('valid');
      throw new XMermaidError('PARSE_ERROR', 'bad source', undefined, [parseDiagnostic]);
    }, () => undefined, 10);

    runtime.request('valid');
    await vi.runAllTimersAsync();
    expect(runtime.snapshot.exportable).toBe(true);

    runtime.request('invalid');
    await vi.runAllTimersAsync();

    expect(runtime.snapshot).toMatchObject({
      status: 'error',
      source: 'invalid',
      diagnostics: [parseDiagnostic],
      message: 'bad source',
      exportable: false,
    });
    expect(runtime.snapshot.svg?.dataset.label).toBe('valid');
  });

  it('returns to idle and clears the last SVG when the source is removed', async () => {
    const runtime = new PreviewRuntime(async source => {
      if (source === 'invalid') throw new Error('invalid source');
      return renderResult(source);
    }, () => undefined, 10);

    runtime.request('valid');
    await vi.runAllTimersAsync();
    runtime.request(null);

    expect(runtime.snapshot).toEqual({
      status: 'idle',
      source: null,
      svg: null,
      diagnostics: [],
      message: null,
      exportable: false,
    });

    runtime.request('invalid');
    await vi.runAllTimersAsync();
    expect(runtime.snapshot.svg).toBeNull();
  });

  it('dispose cancels a pending debounced render', async () => {
    const renderer = vi.fn(async (source: string) => renderResult(source));
    const runtime = new PreviewRuntime(renderer, () => undefined, 10);

    runtime.request('pending');
    runtime.dispose();
    await vi.runAllTimersAsync();

    expect(renderer).not.toHaveBeenCalled();
    expect(runtime.snapshot).toMatchObject({
      status: 'rendering',
      source: 'pending',
      exportable: false,
    });
  });

  it('dispose prevents an in-flight result from being published', async () => {
    const inFlight = deferred<PreviewRenderResult>();
    const runtime = new PreviewRuntime(() => inFlight.promise, () => undefined, 10);

    runtime.request('in flight');
    await vi.advanceTimersByTimeAsync(10);
    runtime.dispose();
    inFlight.resolve(renderResult('completed'));
    await Promise.resolve();

    expect(runtime.snapshot).toMatchObject({
      status: 'rendering',
      source: 'in flight',
      exportable: false,
    });
    expect(runtime.snapshot.svg).toBeNull();
  });
});
