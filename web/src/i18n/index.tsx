import en from './en.json'
import pt from './pt.json'

const dictionaries = { en, pt }

export type Locale = keyof typeof dictionaries

const fallback: Locale = 'en'

export function t(key: keyof typeof en, locale: Locale = fallback): string {
  const dict = dictionaries[locale] ?? dictionaries[fallback]
  return (dict as Record<string, string>)[key as string] ?? (dictionaries[fallback] as Record<string, string>)[key as string] ?? key
}

export function detectLocale(): Locale {
  try {
    const stored = (globalThis as any)?.localStorage?.getItem?.('tm_locale')
    if (stored === 'pt' || stored === 'en') return stored

    const nav = (globalThis as any)?.navigator
    const langs: string[] = Array.isArray(nav?.languages) ? nav.languages : [nav?.language].filter(Boolean)

    for (const l of langs) {
      const lower = String(l || '').toLowerCase()
      if (lower.startsWith('pt')) return 'pt'
      if (lower.startsWith('en')) return 'en'
    }
  } catch {
    // ignore
  }
  return fallback
}
