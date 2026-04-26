import { ref } from 'vue'

export type ThemeName = 'sunset' | 'ocean' | 'violet'

interface ThemeOption {
  id: ThemeName
  labelKey: string
  descriptionKey: string
  previewColor: string
}

const THEME_STORAGE_KEY = 'lan-chat:theme'

export const themeOptions: ThemeOption[] = [
  {
    id: 'sunset',
    labelKey: 'themes.sunset.label',
    descriptionKey: 'themes.sunset.description',
    previewColor: '#ef6a42',
  },
  {
    id: 'ocean',
    labelKey: 'themes.ocean.label',
    descriptionKey: 'themes.ocean.description',
    previewColor: '#0f9fb2',
  },
  {
    id: 'violet',
    labelKey: 'themes.violet.label',
    descriptionKey: 'themes.violet.description',
    previewColor: '#7c5cff',
  },
]

const themeIds = themeOptions.map((theme) => theme.id)

function isThemeName(value: string | null): value is ThemeName {
  return Boolean(value && themeIds.includes(value as ThemeName))
}

function getStoredTheme(): ThemeName {
  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
  return isThemeName(storedTheme) ? storedTheme : 'sunset'
}

function applyTheme(theme: ThemeName) {
  document.documentElement.dataset.theme = theme
}

const selectedTheme = ref<ThemeName>('sunset')

export function initializeTheme() {
  const theme = getStoredTheme()
  selectedTheme.value = theme
  applyTheme(theme)
}

export function useTheme() {
  function setTheme(theme: ThemeName) {
    selectedTheme.value = theme
    applyTheme(theme)
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }

  return {
    themeOptions,
    selectedTheme,
    setTheme,
  }
}
