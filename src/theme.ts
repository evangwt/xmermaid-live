import {
  DARK_THEME,
  LIGHT_THEME,
  type ArrowStyle,
  type CurveStyle,
  type RenderTheme,
  type ThemeColors,
} from '@evangwt/xmermaid';

export type WorkspaceTheme = 'dark' | 'light';

export type DiagramStyleOverrides = Partial<Omit<RenderTheme, 'name' | 'colors'>> & {
  colors?: Partial<ThemeColors>;
};

export interface ThemePreferences {
  version: 1;
  workspace: WorkspaceTheme;
  overrides: DiagramStyleOverrides;
}

export const DEFAULT_THEME_PREFERENCES: ThemePreferences = {
  version: 1,
  workspace: 'dark',
  overrides: {},
};

export const THEME_FONT_FAMILIES = [
  'sans-serif',
  'Inter, ui-sans-serif, system-ui, sans-serif',
  'ui-monospace, SFMono-Regular, Consolas, monospace',
] as const;

const ARROW_STYLES: readonly ArrowStyle[] = ['filled', 'triangle', 'open', 'circle', 'cross'];
const CURVE_STYLES: readonly CurveStyle[] = ['bezier', 'step', 'straight'];
const COLOR_KEYS: readonly (keyof ThemeColors)[] = [
  'background',
  'nodeFill',
  'nodeStroke',
  'nodeText',
  'edgeStroke',
  'edgeLabel',
  'arrowFill',
  'subgraphFill',
  'subgraphStroke',
];

export function resolveDiagramTheme(preferences: ThemePreferences): RenderTheme {
  const base = preferences.workspace === 'dark' ? DARK_THEME : LIGHT_THEME;
  const customized = Object.keys(preferences.overrides).length > 0;

  return {
    ...base,
    ...preferences.overrides,
    name: customized ? `${base.name}-custom` : base.name,
    colors: {
      ...base.colors,
      ...preferences.overrides.colors,
    },
  };
}

export function parseThemePreferences(serialized: string | null): ThemePreferences {
  if (!serialized) return defaultPreferences();

  try {
    const value: unknown = JSON.parse(serialized);
    if (!isRecord(value) || value.version !== 1 || !isWorkspaceTheme(value.workspace)) {
      return defaultPreferences();
    }

    return {
      version: 1,
      workspace: value.workspace,
      overrides: parseOverrides(value.overrides),
    };
  } catch {
    return defaultPreferences();
  }
}

export function serializeThemePreferences(preferences: ThemePreferences): string {
  if (preferences.version !== 1) return JSON.stringify(DEFAULT_THEME_PREFERENCES);
  return JSON.stringify(preferences);
}

export function themeSignature(theme: RenderTheme): string {
  return JSON.stringify(theme);
}

function parseOverrides(value: unknown): DiagramStyleOverrides {
  if (!isRecord(value)) return {};

  const overrides: DiagramStyleOverrides = {};
  if (isOneOf(value.arrowStyle, ARROW_STYLES)) overrides.arrowStyle = value.arrowStyle;
  if (isOneOf(value.curveStyle, CURVE_STYLES)) overrides.curveStyle = value.curveStyle;
  if (inRange(value.edgeGap, 0, 24)) overrides.edgeGap = value.edgeGap;
  if (inRange(value.arrowSize, 4, 32)) overrides.arrowSize = value.arrowSize;
  if (inRange(value.nodeBorderRadius, 0, 24)) overrides.nodeBorderRadius = value.nodeBorderRadius;
  if (inRange(value.fontSize, 10, 24)) overrides.fontSize = value.fontSize;
  if (isOneOf(value.fontFamily, THEME_FONT_FAMILIES)) overrides.fontFamily = value.fontFamily;

  if (isRecord(value.colors)) {
    const colors: Partial<ThemeColors> = {};
    for (const key of COLOR_KEYS) {
      const color = value.colors[key];
      if (typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color)) colors[key] = color;
    }
    if (Object.keys(colors).length > 0) overrides.colors = colors;
  }

  return overrides;
}

function defaultPreferences(): ThemePreferences {
  return { version: 1, workspace: 'dark', overrides: {} };
}

function isWorkspaceTheme(value: unknown): value is WorkspaceTheme {
  return value === 'dark' || value === 'light';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

function inRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}
