const CACHE_VERSION = 2;
export const MAX_WORKSPACE_CACHE_BYTES = 2 * 1024 * 1024;
export const WORKSPACE_CACHE_WRITE_DELAY_MS = 250;

export interface WorkspaceViewport {
  mode: 'fit' | 'manual';
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface WorkspaceCacheState {
  documentText: string;
  selectedDiagramId: string | null;
  themePreferences: unknown | null;
  layoutPreferences: unknown | null;
  viewports: Record<string, WorkspaceViewport>;
}

type CacheWriteStatus = 'saved' | 'oversize' | 'unavailable';

interface WorkspaceCacheV2 extends WorkspaceCacheState {
  version: typeof CACHE_VERSION;
}

export interface WorkspaceCacheWriter {
  schedule(state: WorkspaceCacheState): void;
  dispose(): void;
}

export function parseWorkspaceCache(raw: string | null): WorkspaceCacheState | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isWorkspaceCacheV2(parsed)) return withoutVersion(parsed);
    return migrateWorkspaceCacheV1(parsed);
  } catch {
    return null;
  }
}

export function serializeWorkspaceCache(state: WorkspaceCacheState): string | null {
  if (!isWorkspaceCacheState(state)) return null;
  const serialized = JSON.stringify({ version: CACHE_VERSION, ...state } satisfies WorkspaceCacheV2);
  return utf8Length(serialized) <= MAX_WORKSPACE_CACHE_BYTES ? serialized : null;
}

export function createWorkspaceCacheWriter(options: {
  storage: Pick<Storage, 'setItem'>;
  key: string;
  onStatus?: (status: CacheWriteStatus) => void;
  delayMs?: number;
}): WorkspaceCacheWriter {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: WorkspaceCacheState | null = null;
  const delayMs = options.delayMs ?? WORKSPACE_CACHE_WRITE_DELAY_MS;

  const flush = () => {
    timer = null;
    const state = pending;
    pending = null;
    if (!state) return;
    const serialized = serializeWorkspaceCache(state);
    if (!serialized) {
      options.onStatus?.('oversize');
      return;
    }
    try {
      options.storage.setItem(options.key, serialized);
      options.onStatus?.('saved');
    } catch {
      options.onStatus?.('unavailable');
    }
  };

  return {
    schedule(state) {
      pending = state;
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, delayMs);
    },
    dispose() {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
    },
  };
}

function migrateWorkspaceCacheV1(value: unknown): WorkspaceCacheState | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== 1 || typeof candidate.text !== 'string') return null;
  return {
    documentText: candidate.text,
    selectedDiagramId: null,
    themePreferences: null,
    layoutPreferences: null,
    viewports: {},
  };
}

function isWorkspaceCacheV2(value: unknown): value is WorkspaceCacheV2 {
  return Boolean(value && typeof value === 'object'
    && (value as Record<string, unknown>).version === CACHE_VERSION
    && isWorkspaceCacheState(value));
}

function isWorkspaceCacheState(value: unknown): value is WorkspaceCacheState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.documentText === 'string'
    && (candidate.selectedDiagramId === null || typeof candidate.selectedDiagramId === 'string')
    && (candidate.themePreferences === null || isJsonValue(candidate.themePreferences))
    && (candidate.layoutPreferences === null || isJsonValue(candidate.layoutPreferences))
    && isViewports(candidate.viewports);
}

function isViewports(value: unknown): value is Record<string, WorkspaceViewport> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every(viewport => Boolean(viewport && typeof viewport === 'object'
    && ((viewport as Record<string, unknown>).mode === 'fit' || (viewport as Record<string, unknown>).mode === 'manual')
    && ['scale', 'offsetX', 'offsetY'].every(key => Number.isFinite((viewport as Record<string, unknown>)[key]))));
}

function isJsonValue(value: unknown): boolean {
  try {
    JSON.stringify(value);
    return true;
  } catch {
    return false;
  }
}

function withoutVersion(cache: WorkspaceCacheV2): WorkspaceCacheState {
  const { version: _, ...state } = cache;
  return state;
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
