import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LAYOUT_PREFERENCES,
  adjustWorkspaceDivider,
  parseLayoutPreferences,
  resolveWorkspaceLayout,
  serializeLayoutPreferences,
  toggleListCollapsed,
} from '../src/layout-preferences';

describe('layout preferences', () => {
  it('falls back to the stable defaults for malformed, future, and out-of-range payloads', () => {
    expect(parseLayoutPreferences(null)).toEqual(DEFAULT_LAYOUT_PREFERENCES);
    expect(parseLayoutPreferences('{')).toEqual(DEFAULT_LAYOUT_PREFERENCES);
    expect(parseLayoutPreferences('{"version":2,"listCollapsed":false,"listFraction":.2,"editorFraction":.4}'))
      .toEqual(DEFAULT_LAYOUT_PREFERENCES);
    expect(parseLayoutPreferences('{"version":1,"listCollapsed":false,"listFraction":.9,"editorFraction":.9}'))
      .toEqual(DEFAULT_LAYOUT_PREFERENCES);
  });

  it('round-trips a valid preference and preserves a collapsed list', () => {
    const value = { version: 1 as const, listCollapsed: true, listFraction: .2, editorFraction: .42 };
    expect(parseLayoutPreferences(serializeLayoutPreferences(value))).toEqual(value);
    expect(resolveWorkspaceLayout(value, 1200)).toMatchObject({ listWidth: 0 });
  });

  it('keeps editor and preview widths above their minimums when a divider is moved too far', () => {
    const moved = adjustWorkspaceDivider(DEFAULT_LAYOUT_PREFERENCES, 'editor', 4_000, 1200);
    const layout = resolveWorkspaceLayout(moved, 1200);
    expect(layout.editorWidth).toBeGreaterThanOrEqual(320);
    expect(layout.previewWidth).toBeGreaterThanOrEqual(360);
  });

  it('uses a keyboard-sized delta without changing the unrelated divider', () => {
    const moved = adjustWorkspaceDivider(DEFAULT_LAYOUT_PREFERENCES, 'list', 16, 1440);
    expect(moved.listFraction).toBeGreaterThan(DEFAULT_LAYOUT_PREFERENCES.listFraction);
    expect(moved.editorFraction).toBe(DEFAULT_LAYOUT_PREFERENCES.editorFraction);
  });

  it('toggles only list collapse and retains the remembered restored width', () => {
    const collapsed = toggleListCollapsed(DEFAULT_LAYOUT_PREFERENCES);
    expect(collapsed).toEqual({ ...DEFAULT_LAYOUT_PREFERENCES, listCollapsed: true });
    expect(toggleListCollapsed(collapsed)).toEqual(DEFAULT_LAYOUT_PREFERENCES);
  });
});
