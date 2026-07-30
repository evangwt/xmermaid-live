import { decodeShareState } from '@evangwt/xmermaid/editor';
import './styles.css';
import { mountApp } from './app';
import { createWorkspaceDocumentForDiagram } from './document-model';
import { parseLayoutPreferences, serializeLayoutPreferences } from './layout-preferences';
import { SAMPLE_DOCUMENT } from './sample';
import { parseThemePreferences, serializeThemePreferences } from './theme';
import { createWorkspaceCacheWriter, parseWorkspaceCache } from './workspace-cache';

const LAYOUT_STORAGE_KEY = 'xmermaid-live.layout.v1';
const THEME_STORAGE_KEY = 'xmermaid-live.theme.v1';
const WORKSPACE_STORAGE_KEY = 'xmermaid-live.workspace.v2';
const LEGACY_DOCUMENT_STORAGE_KEY = 'xmermaid-live.document.v1';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Missing #app root.');

const restored = decodeShareState(window.location.hash);
const cachedWorkspace = parseWorkspaceCache(safeRead(WORKSPACE_STORAGE_KEY))
  ?? parseWorkspaceCache(safeRead(LEGACY_DOCUMENT_STORAGE_KEY));
const initialText = restored?.documentText ?? cachedWorkspace?.documentText ?? SAMPLE_DOCUMENT;
const initialState = createWorkspaceDocumentForDiagram(initialText, restored?.selectedDiagramId ?? cachedWorkspace?.selectedDiagramId ?? null);
const savedLayoutPreferences = safeRead(LAYOUT_STORAGE_KEY);
const savedThemePreferences = safeRead(THEME_STORAGE_KEY);
const initialLayoutPreferences = savedLayoutPreferences
  ? parseLayoutPreferences(savedLayoutPreferences)
  : cachedWorkspace?.layoutPreferences
    ? parseLayoutPreferences(JSON.stringify(cachedWorkspace.layoutPreferences))
    : parseLayoutPreferences(null);
const initialThemePreferences = savedThemePreferences
  ? parseThemePreferences(savedThemePreferences)
  : cachedWorkspace?.themePreferences
    ? parseThemePreferences(JSON.stringify(cachedWorkspace.themePreferences))
    : parseThemePreferences(null);
const workspaceCacheWriter = createWorkspaceCacheWriter({
  storage: safeStorage(),
  key: WORKSPACE_STORAGE_KEY,
});
mountApp(root, {
  initialText,
  initialSelectedIndex: initialState.selectedIndex ?? 0,
  initialViewports: cachedWorkspace?.viewports,
  initialLayoutPreferences,
  persistLayoutPreferences: preferences => {
    safeWrite(LAYOUT_STORAGE_KEY, serializeLayoutPreferences(preferences));
  },
  initialThemePreferences,
  persistThemePreferences: preferences => {
    safeWrite(THEME_STORAGE_KEY, serializeThemePreferences(preferences));
  },
  persistDocumentText: () => {},
  persistWorkspaceState: state => workspaceCacheWriter.schedule(state),
});

function safeStorage(): Pick<Storage, 'setItem'> {
  try {
    return window.localStorage;
  } catch {
    return { setItem: () => { throw new Error('Storage unavailable'); } };
  }
}

function safeRead(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage is an optional preference cache; rendering continues without it.
  }
}
