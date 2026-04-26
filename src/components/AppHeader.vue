<script setup lang="ts">
import {
  ChevronDown,
  Info,
  MessageSquareText,
  MonitorSmartphone,
  Palette,
  ShieldCheck,
  Sparkles,
  Wifi,
} from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import type { ThemeName } from '@/composables/useTheme'

interface ThemeOption {
  id: ThemeName
  label: string
  description: string
  previewColor: string
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
  statusText: string
}>()

const emit = defineEmits<{
  themeChange: [theme: ThemeName]
}>()

function handleThemeChange(event: Event) {
  emit('themeChange', (event.target as HTMLSelectElement).value as ThemeName)
}
</script>

<template>
  <header class="relative overflow-hidden rounded-[28px] border border-white/60 bg-white/72 px-5 py-5 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:px-6 lg:px-7">
    <div class="absolute inset-0 bg-gradient-to-br from-primary/10 via-white/35 to-accent/20" />
    <div class="relative grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(460px,520px)] xl:items-start">
      <div class="space-y-3">
        <div class="flex flex-wrap items-center gap-3">
          <Badge class="gap-1.5 rounded-full px-3 py-1.5">
            <Sparkles class="size-3.5" />
            LAN Chat
          </Badge>
          <h1 class="text-lg font-semibold tracking-tight text-slate-950 sm:text-xl">局域网聊天</h1>
        </div>

        <p class="max-w-2xl text-sm leading-6 text-muted-foreground">
          打开页面即可发文字和图片，适合局域网内临时沟通。
        </p>

        <div class="flex flex-wrap gap-2">
          <Badge variant="outline" class="gap-1.5 px-3 py-1.5">
            <Wifi class="size-3.5" />
            {{ phase === 'room' ? roomLabel : '等待配对' }}
          </Badge>
          <Badge variant="outline" class="gap-1.5 px-3 py-1.5">
            <ShieldCheck class="size-3.5" />
            {{ secureContext ? '安全上下文' : '非安全上下文' }}
          </Badge>
          <Badge variant="outline" class="gap-1.5 px-3 py-1.5">
            <MessageSquareText class="size-3.5" />
            纯文本配对
          </Badge>
          <Badge variant="outline" class="gap-1.5 px-3 py-1.5">
            <MonitorSmartphone class="size-3.5" />
            {{ signalState === 'online' ? '信令节点在线' : signalState === 'connecting' ? '连接信令节点中' : '信令节点离线' }}
          </Badge>
        </div>
      </div>

      <div class="grid gap-3">
        <div class="rounded-[22px] border border-border/70 bg-background/70 p-3.5 backdrop-blur">
          <div class="grid gap-3 sm:grid-cols-[92px_minmax(0,1fr)] sm:items-center">
            <div class="flex items-center gap-2 text-sm font-medium text-foreground">
              <Palette class="size-4 text-primary" />
              主题
            </div>

            <div class="relative">
              <span
                class="pointer-events-none absolute left-3 top-1/2 z-10 size-3.5 -translate-y-1/2 rounded-full border border-black/5"
                :style="{ backgroundColor: selectedThemeOption.previewColor }"
              />
              <select
                :value="selectedTheme"
                class="h-10 w-full appearance-none rounded-2xl border border-input bg-background/80 py-2 pl-9 pr-10 text-sm font-medium text-foreground shadow-sm outline-none transition-colors focus:border-primary focus:ring-4 focus:ring-ring/15"
                aria-label="选择主题"
                @change="handleThemeChange"
              >
                <option
                  v-for="theme in themeOptions"
                  :key="theme.id"
                  :value="theme.id"
                >
                  {{ theme.label }}
                </option>
              </select>
              <ChevronDown class="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>
        </div>

        <div class="rounded-[22px] border border-primary/10 bg-white/80 p-3.5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2 text-sm font-medium text-foreground">
              <Info class="size-4 text-primary" />
              当前模式
            </div>
            <p class="text-xs leading-5 text-muted-foreground">局域网发现，浏览器间传输</p>
          </div>
          <div class="mt-3 grid gap-2 sm:grid-cols-3">
            <div class="rounded-[18px] border border-border/70 bg-background/80 p-3">
              <p class="text-xs font-medium text-muted-foreground">状态</p>
              <p class="mt-1 text-sm font-medium text-foreground">{{ statusText }}</p>
            </div>
            <div class="rounded-[18px] border border-border/70 bg-background/80 p-3">
              <p class="text-xs font-medium text-muted-foreground">消息</p>
              <p class="mt-1 text-sm font-medium text-foreground">文本 + 图片</p>
            </div>
            <div class="rounded-[18px] border border-border/70 bg-background/80 p-3">
              <p class="text-xs font-medium text-muted-foreground">拓扑</p>
              <p class="mt-1 text-sm font-medium text-foreground">房主转发</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>
