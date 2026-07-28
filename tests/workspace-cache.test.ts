import { describe, expect, it, vi } from 'vitest';
import {
  MAX_WORKSPACE_CACHE_BYTES,
  createWorkspaceCacheWriter,
  parseWorkspaceCache,
  serializeWorkspaceCache,
  type WorkspaceCacheState,
} from '../src/workspace-cache';

const STATE: WorkspaceCacheState = {
  documentText: 'flowchart TD\n  Local --> Restore',
  selectedDiagramId: 'diagram-1',
  themePreferences: { workspace: 'dark', overrides: { curveStyle: 'bezier' } },
  layoutPreferences: { listCollapsed: false, listFraction: .2, editorFraction: .4 },
  viewports: { 'diagram-1': { mode: 'manual', scale: 1.4, offsetX: -12, offsetY: 8 } },
};

describe('workspace cache', () => {
  it('round-trips the complete V2 workspace state', () => {
    expect(parseWorkspaceCache(serializeWorkspaceCache(STATE))).toEqual(STATE);
  });

  it('migrates the V1 text-only cache without losing its document', () => {
    expect(parseWorkspaceCache(JSON.stringify({ version: 1, text: STATE.documentText }))).toEqual({
      documentText: STATE.documentText,
      selectedDiagramId: null,
      themePreferences: null,
      layoutPreferences: null,
      viewports: {},
    });
  });

  it('rejects malformed, future-version, and oversized cache payloads', () => {
    expect(parseWorkspaceCache('{bad json')).toBeNull();
    expect(parseWorkspaceCache(JSON.stringify({ version: 3, documentText: 'future' }))).toBeNull();
    expect(serializeWorkspaceCache({ ...STATE, documentText: 'x'.repeat(MAX_WORKSPACE_CACHE_BYTES) })).toBeNull();
  });

  it('coalesces writes after 250ms without deleting the prior cache on failure', () => {
    vi.useFakeTimers();
    const setItem = vi.fn();
    const status = vi.fn();
    const writer = createWorkspaceCacheWriter({ storage: { setItem }, key: 'workspace', onStatus: status });
    writer.schedule(STATE);
    writer.schedule({ ...STATE, documentText: 'latest' });
    vi.advanceTimersByTime(249);
    expect(setItem).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(setItem).toHaveBeenLastCalledWith('workspace', expect.stringContaining('latest'));

    setItem.mockImplementationOnce(() => { throw new DOMException('quota', 'QuotaExceededError'); });
    writer.schedule(STATE);
    vi.advanceTimersByTime(250);
    expect(status).toHaveBeenLastCalledWith('unavailable');
    writer.dispose();
    vi.useRealTimers();
  });
});
