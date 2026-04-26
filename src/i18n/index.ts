import { computed } from 'vue'
import { createI18n } from 'vue-i18n'
import { messages } from './messages'

export type AppLocale = keyof typeof messages

const LOCALE_STORAGE_KEY = 'lan-chat:locale'
const DEFAULT_LOCALE: AppLocale = 'zh-CN'

export const languageOptions: Array<{
  id: AppLocale
  labelKey: string
}> = [
  { id: 'zh-CN', labelKey: 'languages.zhCN' },
  { id: 'en-US', labelKey: 'languages.enUS' },
]

function isAppLocale(value: string | null): value is AppLocale {
  return Boolean(value && value in messages)
}

function getInitialLocale(): AppLocale {
  if (typeof window === 'undefined') {
    return DEFAULT_LOCALE
  }

  const storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY)
  return isAppLocale(storedLocale) ? storedLocale : DEFAULT_LOCALE
}

export const i18n = createI18n({
  legacy: false,
  locale: getInitialLocale(),
  fallbackLocale: DEFAULT_LOCALE,
  messages,
})

export const currentLocale = computed(() => i18n.global.locale.value as AppLocale)

export function setLocale(locale: AppLocale) {
  i18n.global.locale.value = locale
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  document.documentElement.lang = locale
}

export function initializeLocale() {
  document.documentElement.lang = currentLocale.value
}

export function t(key: string, named?: Record<string, unknown>) {
  return named ? i18n.global.t(key, named) : i18n.global.t(key)
}
