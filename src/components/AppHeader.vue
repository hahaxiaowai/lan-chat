<script setup lang="ts">
import {
  ChevronDown,
  Home,
  Languages,
  MonitorSmartphone,
  Palette,
  ShieldCheck,
  Sparkles,
  Wifi,
} from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { AppLocale } from '@/i18n'
import type { ThemeName } from '@/composables/useTheme'

interface ThemeOption {
  id: ThemeName
  labelKey: string
  descriptionKey: string
  previewColor: string
}

interface LanguageOption {
  id: AppLocale
  labelKey: string
}

type RoomPhase = 'entry' | 'guest-pairing' | 'room'

defineProps<{
  phase: RoomPhase
  roomLabel: string
  secureContext: boolean
  signalState: string
  selectedTheme: ThemeName
  selectedThemeOption: ThemeOption
  themeOptions: ThemeOption[]
  selectedLocale: AppLocale
  languageOptions: LanguageOption[]
  statusText: string
}>()

const emit = defineEmits<{
  goHome: []
  themeChange: [theme: ThemeName]
  localeChange: [locale: AppLocale]
}>()

const { t } = useI18n()

function handleThemeChange(event: Event) {
  emit('themeChange', (event.target as HTMLSelectElement).value as ThemeName)
}

function handleLocaleChange(event: Event) {
  emit('localeChange', (event.target as HTMLSelectElement).value as AppLocale)
}
</script>

<template>
  <header class="relative overflow-hidden rounded-[24px] border border-white/60 bg-white/72 px-4 py-4 shadow-[0_18px_56px_rgba(15,23,42,0.07)] backdrop-blur-xl sm:px-5 lg:px-6">
    <div class="absolute inset-0 bg-gradient-to-br from-primary/10 via-white/35 to-accent/20" />
    <div class="relative flex items-center justify-between gap-2 sm:gap-3">
      <div class="flex min-w-0 shrink-0 items-center gap-2 sm:gap-2.5 md:flex-wrap">
        <Badge class="shrink-0 gap-1.5 rounded-full px-2.5 py-1">
          <Sparkles class="size-3.5" />
          {{ t('header.badge') }}
        </Badge>
        <h1 class="shrink-0 whitespace-nowrap text-base font-semibold tracking-tight text-slate-950 sm:text-lg">{{ t('common.appName') }}</h1>
        <Badge variant="outline" class="hidden gap-1.5 px-2.5 py-1 md:inline-flex">
          <Wifi class="size-3.5" />
          {{ phase === 'room' ? roomLabel : statusText }}
        </Badge>
        <Badge variant="outline" class="hidden gap-1.5 px-2.5 py-1 md:inline-flex">
          <ShieldCheck class="size-3.5" />
          {{ secureContext ? t('common.safe') : t('common.unsafe') }}
        </Badge>
        <Badge variant="outline" class="hidden gap-1.5 px-2.5 py-1 md:inline-flex">
          <MonitorSmartphone class="size-3.5" />
          {{ signalState === 'online' ? t('common.signalOnline') : signalState === 'connecting' ? t('common.signalConnecting') : t('common.signalOffline') }}
        </Badge>
      </div>

      <div class="flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-3">
        <Button
          variant="outline"
          size="icon"
          class="bg-background/80 shadow-sm"
          :aria-label="t('common.goHome')"
          :title="t('common.goHome')"
          @click="emit('goHome')"
        >
          <Home class="size-4" />
        </Button>

        <div class="relative w-28 shrink-0 sm:w-32">
          <Languages class="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-primary" />
          <select
            :value="selectedLocale"
            class="h-10 w-full appearance-none rounded-2xl border border-input bg-background/80 py-2 pl-9 pr-8 text-sm font-medium text-foreground shadow-sm outline-none transition-colors focus:border-primary focus:ring-4 focus:ring-ring/15"
            :aria-label="t('common.language')"
            @change="handleLocaleChange"
          >
            <option
              v-for="language in languageOptions"
              :key="language.id"
              :value="language.id"
            >
              {{ t(language.labelKey) }}
            </option>
          </select>
          <ChevronDown class="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        </div>

        <div class="relative min-w-0 flex-1 md:max-w-72 lg:w-56 lg:flex-none">
          <Palette class="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-primary" />
          <span
            class="pointer-events-none absolute left-9 top-1/2 z-10 size-3 -translate-y-1/2 rounded-full border border-black/5"
            :style="{ backgroundColor: selectedThemeOption.previewColor }"
          />
          <select
            :value="selectedTheme"
            class="h-10 w-full appearance-none rounded-2xl border border-input bg-background/80 py-2 pl-14 pr-10 text-sm font-medium text-foreground shadow-sm outline-none transition-colors focus:border-primary focus:ring-4 focus:ring-ring/15"
            :aria-label="t('common.theme')"
            @change="handleThemeChange"
          >
            <option
              v-for="theme in themeOptions"
              :key="theme.id"
              :value="theme.id"
            >
              {{ t(theme.labelKey) }}
            </option>
          </select>
          <ChevronDown class="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>
    </div>
  </header>
</template>
