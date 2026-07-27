import { DARK_THEME, LIGHT_THEME } from 'xmermaid';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THEME_PREFERENCES,
  parseThemePreferences,
  resolveDiagramTheme,
  serializeThemePreferences,
  themeSignature,
} from '../src/theme';

describe('theme preferences', () => {
  it('defaults to dark and preserves only explicit overrides across workspace switches', () => {
    const dark = resolveDiagramTheme(DEFAULT_THEME_PREFERENCES);
    const lightCustom = resolveDiagramTheme({
      version: 1,
      workspace: 'light',
      overrides: { arrowSize: 16, colors: { arrowFill: '#ff3366' } },
    });

    expect(dark.name).toBe('xmermaid-dark');
    expect(lightCustom.name).toBe('xmermaid-light-custom');
    expect(lightCustom.arrowSize).toBe(16);
    expect(lightCustom.colors.arrowFill).toBe('#ff3366');
    expect(lightCustom.colors.background).toBe(LIGHT_THEME.colors.background);
    expect(lightCustom.colors.nodeStroke).toBe(LIGHT_THEME.colors.nodeStroke);
  });

  it('rejects invalid or future preference payloads', () => {
    expect(parseThemePreferences(null)).toEqual(DEFAULT_THEME_PREFERENCES);
    expect(parseThemePreferences('{')).toEqual(DEFAULT_THEME_PREFERENCES);
    expect(parseThemePreferences('{"version":2,"workspace":"light","overrides":{}}'))
      .toEqual(DEFAULT_THEME_PREFERENCES);
    expect(parseThemePreferences('{"version":1,"workspace":"neon","overrides":{}}'))
      .toEqual(DEFAULT_THEME_PREFERENCES);
  });

  it('keeps valid overrides and discards unknown or out-of-range values', () => {
    const parsed = parseThemePreferences(JSON.stringify({
      version: 1,
      workspace: 'light',
      overrides: {
        arrowStyle: 'open',
        curveStyle: 'step',
        edgeGap: 3,
        arrowSize: 99,
        fontFamily: 'Comic Sans MS',
        unknown: true,
        colors: {
          arrowFill: '#12aBcD',
          nodeFill: 'red',
          other: '#000000',
        },
      },
    }));

    expect(parsed).toEqual({
      version: 1,
      workspace: 'light',
      overrides: {
        arrowStyle: 'open',
        curveStyle: 'step',
        edgeGap: 3,
        colors: { arrowFill: '#12aBcD' },
      },
    });
  });

  it('serializes validated version-one preferences and round-trips them', () => {
    const preferences = {
      version: 1 as const,
      workspace: 'dark' as const,
      overrides: {
        nodeBorderRadius: 12,
        fontSize: 17,
        colors: { edgeStroke: '#abcdef' },
      },
    };

    expect(parseThemePreferences(serializeThemePreferences(preferences))).toEqual(preferences);
  });

  it('changes the render signature when effective theme values change', () => {
    const dark = resolveDiagramTheme(DEFAULT_THEME_PREFERENCES);
    const custom = resolveDiagramTheme({
      version: 1,
      workspace: 'dark',
      overrides: { arrowSize: DARK_THEME.arrowSize + 1 },
    });

    expect(themeSignature(custom)).not.toBe(themeSignature(dark));
  });
});
