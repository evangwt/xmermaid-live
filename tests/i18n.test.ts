import { describe, expect, it } from 'vitest';
import {
  MESSAGES,
  createTranslator,
  parseLocale,
  resolveLocale,
  serializeLocale,
} from '../src/i18n';

describe('i18n locale resolution', () => {
  it('uses a valid saved locale before the browser language', () => {
    expect(resolveLocale('en', 'zh-CN')).toBe('en');
    expect(resolveLocale('zh-CN', 'en-US')).toBe('zh-CN');
  });

  it('maps Chinese browser variants to zh-CN and all other values to English', () => {
    expect(resolveLocale(null, 'zh')).toBe('zh-CN');
    expect(resolveLocale(undefined, 'zh-Hans-CN')).toBe('zh-CN');
    expect(resolveLocale(null, 'en-GB')).toBe('en');
    expect(resolveLocale(null, undefined)).toBe('en');
  });

  it('rejects invalid storage values and serializes only supported locales', () => {
    expect(parseLocale('fr')).toBeNull();
    expect(parseLocale('')).toBeNull();
    expect(parseLocale(null)).toBeNull();
    expect(serializeLocale('zh-CN')).toBe('zh-CN');
  });

  it('keeps both dictionaries complete and formats variables without changing source values', () => {
    expect(Object.keys(MESSAGES.en).sort()).toEqual(Object.keys(MESSAGES['zh-CN']).sort());
    expect(createTranslator('en').text('list.diagram', { index: 2 })).toBe('Diagram 2');
    expect(createTranslator('zh-CN').text('status.exported', { format: 'SVG' })).toBe('SVG 已下载。');
    expect(createTranslator('en').text('status.exportFailed', { message: 'Network denied' }))
      .toBe('Export failed: Network denied');
  });
});
