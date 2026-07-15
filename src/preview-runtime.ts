import { XMermaidError, type XMermaidDiagnostic } from 'xmermaid';

export interface PreviewRenderResult {
  svg: SVGSVGElement;
  diagnostics: XMermaidDiagnostic[];
}

export type PreviewRenderer = (source: string) => Promise<PreviewRenderResult>;

export interface PreviewSnapshot {
  status: 'idle' | 'rendering' | 'ready' | 'error';
  source: string | null;
  svg: SVGSVGElement | null;
  diagnostics: XMermaidDiagnostic[];
  message: string | null;
  exportable: boolean;
}

const IDLE: PreviewSnapshot = {
  status: 'idle',
  source: null,
  svg: null,
  diagnostics: [],
  message: null,
  exportable: false,
};

export class PreviewRuntime {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private requestId = 0;
  private lastSuccessfulSvg: SVGSVGElement | null = null;
  private current: PreviewSnapshot = IDLE;

  constructor(
    private readonly renderer: PreviewRenderer,
    private readonly onChange: (snapshot: PreviewSnapshot) => void,
    private readonly delayMs = 160,
  ) {}

  get snapshot(): PreviewSnapshot {
    return this.current;
  }

  request(source: string | null): void {
    const requestId = ++this.requestId;
    if (this.timer) clearTimeout(this.timer);

    if (!source) {
      this.lastSuccessfulSvg = null;
      this.publish(IDLE);
      return;
    }

    this.publish({
      status: 'rendering',
      source,
      svg: this.lastSuccessfulSvg,
      diagnostics: [],
      message: null,
      exportable: false,
    });
    this.timer = setTimeout(() => void this.run(requestId, source), this.delayMs);
  }

  dispose(): void {
    ++this.requestId;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async run(requestId: number, source: string): Promise<void> {
    try {
      const result = await this.renderer(source);
      if (requestId !== this.requestId) return;

      this.lastSuccessfulSvg = result.svg;
      this.publish({
        status: 'ready',
        source,
        svg: result.svg,
        diagnostics: result.diagnostics,
        message: null,
        exportable: true,
      });
    } catch (error) {
      if (requestId !== this.requestId) return;

      this.publish({
        status: 'error',
        source,
        svg: this.lastSuccessfulSvg,
        diagnostics: normalizeDiagnostics(error),
        message: error instanceof Error ? error.message : String(error),
        exportable: false,
      });
    }
  }

  private publish(snapshot: PreviewSnapshot): void {
    this.current = snapshot;
    this.onChange(snapshot);
  }
}

function normalizeDiagnostics(error: unknown): XMermaidDiagnostic[] {
  if (error instanceof XMermaidError && error.diagnostics.length > 0) {
    return error.diagnostics;
  }

  return [{
    code: 'render_error',
    message: error instanceof Error ? error.message : String(error),
    severity: 'error',
    range: null,
  }];
}
