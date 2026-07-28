export interface WorkspaceLayoutPreferences {
  version: 1;
  listCollapsed: boolean;
  listFraction: number;
  editorFraction: number;
}

export interface WorkspaceLayout {
  listWidth: number;
  editorWidth: number;
  previewWidth: number;
}

export type WorkspaceDivider = 'list' | 'editor';

const LIST_MIN_WIDTH = 168;
const EDITOR_MIN_WIDTH = 320;
const PREVIEW_MIN_WIDTH = 360;
const DIVIDER_WIDTH = 8;

export const DEFAULT_LAYOUT_PREFERENCES: WorkspaceLayoutPreferences = {
  version: 1,
  listCollapsed: false,
  listFraction: .18,
  editorFraction: .38,
};

export function parseLayoutPreferences(raw: string | null): WorkspaceLayoutPreferences {
  if (!raw) return DEFAULT_LAYOUT_PREFERENCES;

  try {
    const parsed: unknown = JSON.parse(raw);
    return isLayoutPreferences(parsed) ? parsed : DEFAULT_LAYOUT_PREFERENCES;
  } catch {
    return DEFAULT_LAYOUT_PREFERENCES;
  }
}

export function serializeLayoutPreferences(value: WorkspaceLayoutPreferences): string {
  return JSON.stringify(value);
}

export function resolveWorkspaceLayout(
  value: WorkspaceLayoutPreferences,
  availableWidth: number,
): WorkspaceLayout {
  const dividerCount = value.listCollapsed ? 1 : 2;
  const width = Math.max(0, availableWidth - dividerCount * DIVIDER_WIDTH);

  if (value.listCollapsed) {
    const editorWidth = clampWidth(
      width * value.editorFraction,
      EDITOR_MIN_WIDTH,
      width - PREVIEW_MIN_WIDTH,
    );
    return {
      listWidth: 0,
      editorWidth,
      previewWidth: Math.max(PREVIEW_MIN_WIDTH, width - editorWidth),
    };
  }

  const listWidth = clampWidth(
    width * value.listFraction,
    LIST_MIN_WIDTH,
    width - EDITOR_MIN_WIDTH - PREVIEW_MIN_WIDTH,
  );
  const remainingWidth = Math.max(0, width - listWidth);
  const editorWidth = clampWidth(
    width * value.editorFraction,
    EDITOR_MIN_WIDTH,
    remainingWidth - PREVIEW_MIN_WIDTH,
  );

  return {
    listWidth,
    editorWidth,
    previewWidth: Math.max(PREVIEW_MIN_WIDTH, remainingWidth - editorWidth),
  };
}

export function adjustWorkspaceDivider(
  value: WorkspaceLayoutPreferences,
  divider: WorkspaceDivider,
  deltaPx: number,
  availableWidth: number,
): WorkspaceLayoutPreferences {
  const layout = resolveWorkspaceLayout(value, availableWidth);
  const usableWidth = Math.max(1, availableWidth - (value.listCollapsed ? 1 : 2) * DIVIDER_WIDTH);

  if (divider === 'list') {
    const nextListWidth = clampWidth(
      layout.listWidth + deltaPx,
      LIST_MIN_WIDTH,
      usableWidth - layout.editorWidth - PREVIEW_MIN_WIDTH,
    );
    return { ...value, listFraction: nextListWidth / usableWidth };
  }

  const nextEditorWidth = clampWidth(
    layout.editorWidth + deltaPx,
    EDITOR_MIN_WIDTH,
    usableWidth - layout.listWidth - PREVIEW_MIN_WIDTH,
  );
  return { ...value, editorFraction: nextEditorWidth / usableWidth };
}

export function toggleListCollapsed(value: WorkspaceLayoutPreferences): WorkspaceLayoutPreferences {
  return { ...value, listCollapsed: !value.listCollapsed };
}

function isLayoutPreferences(value: unknown): value is WorkspaceLayoutPreferences {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return candidate.version === 1
    && typeof candidate.listCollapsed === 'boolean'
    && isFraction(candidate.listFraction)
    && isFraction(candidate.editorFraction)
    && Number(candidate.listFraction) + Number(candidate.editorFraction) < .9;
}

function isFraction(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= .12 && value <= .72;
}

function clampWidth(value: number, minimum: number, maximum: number): number {
  if (maximum <= minimum) return minimum;
  return Math.min(Math.max(value, minimum), maximum);
}
