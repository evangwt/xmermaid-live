import { describe, expect, it } from 'vitest';
import {
  MESSAGES,
  SUPPORTED_LOCALES,
  createTranslator,
  parseLocale,
  resolveLocale,
  serializeLocale,
} from '../src/i18n';

const EXPECTED_LOCALES = [
  'zh-CN',
  'zh-TW',
  'en',
  'ja',
  'ko',
  'es',
  'fr',
  'de',
  'it',
  'pt-BR',
  'ru',
  'ar',
];

describe('i18n locale resolution', () => {
  it('uses a valid saved locale before all browser language preferences', () => {
    expect(resolveLocale('en', 'zh-CN')).toBe('en');
    expect(resolveLocale('zh-CN', 'en-US')).toBe('zh-CN');
  });

  it('exposes every approved locale and accepts them as persisted choices', () => {
    expect(SUPPORTED_LOCALES).toEqual(EXPECTED_LOCALES);
    expect(parseLocale('zh-TW')).toBe('zh-TW');
    expect(parseLocale('ar')).toBe('ar');
    expect(serializeLocale('ar' as never)).toBe('ar');
  });

  it('resolves browser preferences in order, including Chinese script and regional variants', () => {
    expect(resolveLocale(null, ['fr-CA', 'ja-JP'] as never, 'en-US')).toBe('fr');
    expect(resolveLocale(null, ['zh-Hant-HK'] as never, 'en-US')).toBe('zh-TW');
    expect(resolveLocale(null, ['zh-Hans-SG'] as never, 'en-US')).toBe('zh-CN');
    expect(resolveLocale(null, ['pt-PT'] as never, 'en-US')).toBe('pt-BR');
    expect(resolveLocale(null, ['xx-XX', 'ko-KR'] as never, 'en-US')).toBe('ko');
    expect(resolveLocale(null, ['fr-FR-u-nu-latn'] as never, 'en-US')).toBe('fr');
  });

  it('falls back to English when neither saved nor browser values match', () => {
    expect(resolveLocale('not-a-locale', ['xx-XX'] as never, 'yy')).toBe('en');
    expect(resolveLocale(null, [] as never, undefined)).toBe('en');
  });

  it('rejects invalid storage values and serializes only supported locales', () => {
    expect(parseLocale('not-a-locale')).toBeNull();
    expect(parseLocale('')).toBeNull();
    expect(parseLocale(null)).toBeNull();
    expect(serializeLocale('zh-CN')).toBe('zh-CN');
  });

  it('keeps every dictionary complete and formats variables without changing source values', () => {
    for (const locale of EXPECTED_LOCALES) {
      expect(Object.keys(MESSAGES[locale as keyof typeof MESSAGES]).sort()).toEqual(Object.keys(MESSAGES.en).sort());
    }
    expect(createTranslator('en').text('list.diagram', { index: 2 })).toBe('Diagram 2');
    expect(createTranslator('zh-CN').text('status.exported', { format: 'SVG' })).toBe('SVG 已下载。');
    expect(createTranslator('en').text('status.exportFailed', { message: 'Network denied' }))
      .toBe('Export failed: Network denied');
  });

  it('uses natural translations for critical controls and status labels', () => {
    expect(createTranslator('zh-TW' as never).text('style.fontSize')).toBe('字號');
    expect(createTranslator('ja' as never).text('editor.diagram')).toBe('現在の図');
    expect(createTranslator('es' as never).text('support.partial')).toBe('Compatibilidad parcial');
    expect(createTranslator('ru' as never).text('style.done')).toBe('Готово');
    expect(createTranslator('ja' as never).text('style.done')).toBe('完了');
    expect(createTranslator('es' as never).text('style.done')).toBe('Listo');
    expect(createTranslator('fr' as never).text('style.done')).toBe('Terminé');
    expect(createTranslator('de' as never).text('style.done')).toBe('Fertig');
    expect(createTranslator('it' as never).text('style.done')).toBe('Fatto');
    expect(createTranslator('pt-BR' as never).text('style.done')).toBe('Concluído');
    expect(createTranslator('ar' as never).text('style.done')).toBe('تم');
  });
});
