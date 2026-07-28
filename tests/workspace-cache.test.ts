import { describe, expect, it } from 'vitest';
import { parseWorkspaceCache, serializeWorkspaceCache } from '../src/workspace-cache';

describe('workspace cache', () => {
  it('round-trips valid local workspace content', () => {
    const text = 'flowchart TD\n  Local --> Restore';
    expect(parseWorkspaceCache(serializeWorkspaceCache(text))).toBe(text);
  });

  it('ignores malformed and incompatible local content', () => {
    expect(parseWorkspaceCache('{bad json')).toBeNull();
    expect(parseWorkspaceCache(JSON.stringify({ version: 2, text: 'stale' }))).toBeNull();
    expect(parseWorkspaceCache(JSON.stringify({ version: 1, text: 42 }))).toBeNull();
  });
});
