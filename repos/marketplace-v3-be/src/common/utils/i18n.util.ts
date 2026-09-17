import { TranslationMap } from '../../database/entities/category.entity';

export const SUPPORTED_LANGUAGES = ['en', 'fr', 'ar', 'sw', 'pt'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE = 'en';
export const FALLBACK_LANGUAGE = 'en';

const LANGUAGE_CODE_PATTERN = /^[a-z]{2,8}(?:-[a-z0-9]{2,8})?$/;

export function normalizeLanguageCode(
  value?: string | null,
  fallback = DEFAULT_LANGUAGE,
): string {
  const normalized = (value || fallback)
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
    .split(',')[0]
    .trim();

  return LANGUAGE_CODE_PATTERN.test(normalized) ? normalized : fallback;
}

export function isValidLanguageCode(value: string): boolean {
  return LANGUAGE_CODE_PATTERN.test(value.trim().toLowerCase().replace(/_/g, '-'));
}

export function normalizeLanguage(value?: string | null): SupportedLanguage {
  const lang = normalizeLanguageCode(value).slice(0, 2);
  return SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage)
    ? (lang as SupportedLanguage)
    : DEFAULT_LANGUAGE;
}

export function toTranslationMap(
  value: string | TranslationMap,
  sourceLanguage = DEFAULT_LANGUAGE,
): TranslationMap {
  const source = normalizeLanguageCode(sourceLanguage);

  if (typeof value === 'string') {
    return { [source]: value.trim() };
  }

  const normalized: TranslationMap = {};
  for (const [lang, text] of Object.entries(value)) {
    const key = normalizeLanguageCode(lang);
    const trimmed = text.trim();
    if (trimmed) normalized[key] = trimmed;
  }

  if (!normalized[source] && !normalized[FALLBACK_LANGUAGE]) {
    throw new Error(`${source} or English translation is required`);
  }

  return normalized;
}

export function mergeTranslationInput(
  existing: TranslationMap | null | undefined,
  value: string | TranslationMap,
  sourceLanguage = DEFAULT_LANGUAGE,
): TranslationMap {
  const source = normalizeLanguageCode(sourceLanguage);
  const next = toTranslationMap(value, source);

  if (typeof value === 'string') {
    return {
      ...(existing ?? {}),
      [source]: next[source],
    };
  }

  return {
    ...(existing ?? {}),
    ...next,
  };
}

export function resolveTranslation(
  value: TranslationMap | null | undefined,
  language?: string | null,
  sourceLanguage?: string | null,
): string | null {
  if (!value) return null;
  const lang = normalizeLanguageCode(language);
  const source = normalizeLanguageCode(sourceLanguage);
  return (
    value[lang] ||
    value[FALLBACK_LANGUAGE] ||
    value[source] ||
    Object.values(value)[0] ||
    null
  );
}

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
}

export function languageFromHeader(header?: string | string[]): SupportedLanguage {
  const raw = Array.isArray(header) ? header[0] : header;
  return normalizeLanguage(raw?.split(',')[0]?.trim());
}

export function languageCodeFromHeader(header?: string | string[]): string {
  const raw = Array.isArray(header) ? header[0] : header;
  const first = raw?.split(',')[0]?.trim();
  return normalizeLanguageCode(first);
}
