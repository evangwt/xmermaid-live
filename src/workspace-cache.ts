const CACHE_VERSION = 1;
export const MAX_WORKSPACE_CACHE_LENGTH = 500_000;

interface WorkspaceCache {
  version: number;
  text: string;
}

export function parseWorkspaceCache(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isWorkspaceCache(parsed)) return null;
    return parsed.text;
  } catch {
    return null;
  }
}

export function serializeWorkspaceCache(text: string): string | null {
  if (text.length > MAX_WORKSPACE_CACHE_LENGTH) return null;
  return JSON.stringify({ version: CACHE_VERSION, text });
}

function isWorkspaceCache(value: unknown): value is WorkspaceCache {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return candidate.version === CACHE_VERSION
    && typeof candidate.text === 'string'
    && candidate.text.length <= MAX_WORKSPACE_CACHE_LENGTH;
}
