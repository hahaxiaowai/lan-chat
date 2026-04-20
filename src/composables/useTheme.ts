import { ref } from 'vue'

export type ThemeName = 'sunset' | 'ocean' | 'violet'

interface ThemeOption {
  id: ThemeName
  label: string
  description: string
  previewColor: string
}

const THEME_STORAGE_KEY = 'lan-chat:theme'

export const themeOptions: ThemeOption[] = [
  {
    id: 'sunset',
    label: '日落橙',
    description: '暖色主调，适合默认展示。',
    previewColor: '#ef6a42',
  },
  {
    id: 'ocean',
    label: '海湾蓝',
    description: '更冷静清爽的蓝绿色界面。',
    previewColor: '#0f9fb2',
  },
  {
    id: 'violet',
    label: '极光紫',
    description: '偏霓虹感的紫粉配色。',
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
