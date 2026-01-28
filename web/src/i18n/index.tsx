import en from './en.json'
import pt from './pt.json'

const dictionaries = { en, pt }

export type Locale = keyof typeof dictionaries

const fallback: Locale = 'en'

export function t(key: keyof typeof en, locale: Locale = fallback): string {
  const dict = dictionaries[locale] ?? dictionaries[fallback]
  return (dict as Record<string, string>)[key as string] ?? (dictionaries[fallback] as Record<string, string>)[key as string] ?? key
}
