<script setup lang="ts">
import {
  ArrowRight,
  ChevronDown,
  CircleAlert,
  DoorOpen,
  ImagePlus,
  Info,
  LoaderCircle,
  MessageSquareText,
  MonitorSmartphone,
  Palette,
  ShieldCheck,
  Sparkles,
  Users,
  Wifi,
  X,
} from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { useLanRoom } from '@/composables/useLanRoom'
import { useRoomDiscovery } from '@/composables/useRoomDiscovery'
import { useTheme } from '@/composables/useTheme'
import type { ThemeName } from '@/composables/useTheme'
import { getSignalExpiryLabel } from '@/lib/signalCodec'
import type { ChatMessage } from '@/types'
import { bytesToSize, cn, createPlayfulNickname, formatClockTime } from '@/lib/utils'

const {
  phase,
  isHost,
  localPeer,
  peers,
  roomId,
  roomLabel,
  inviteBundleText,
  inviteExpiry,
  joinAnswerBundleText,
  pendingInviteImport,
  pendingAnswerImport,
  statusText,
  errorText,
  recoveryHint,
  visibleMessages,
  hasOlderMessages,
  createInviteBundle,
  createRoom,
  generateInvite,
  importGuestAnswer,
  prepareJoin,
  sendText,
  sendImage,
  loadOlderMessages,
  leaveRoom,
  dismissRecoveryHint,
} = useLanRoom()

const hostNickname = ref(createPlayfulNickname('host'))
const guestNickname = ref(createPlayfulNickname('guest'))
const messageDraft = ref('')
const operationError = ref('')
const mobilePanelOpen = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)
const messageListRef = ref<HTMLElement | null>(null)
const suppressNextAutoScroll = ref(false)
const copiedMessageId = ref<string | null>(null)
const copyFeedbackText = ref('')

const secureContext = window.isSecureContext
let copyFeedbackTimer = 0

const {
  discoveredRooms,
  discoveryError,
  directJoinPendingRoomId,
  directJoinPendingRoomLabel,
  autoJoinMode,
  requestDirectJoin,
  signalState,
} = useRoomDiscovery({
  phase,
  isHost,
  roomId,
  roomLabel,
  localPeer,
  createInviteBundle,
  prepareJoinFromInvite: prepareJoin,
  importGuestAnswer,
})

const activeError = computed(() => operationError.value || discoveryError.value || errorText.value)
const hostProfile = computed(() => peers.value.find((peer) => peer.isHost) ?? null)
const onlinePeers = computed(() => peers.value.filter((peer) => peer.status === 'online'))
const autoJoining = computed(() => autoJoinMode.value && phase.value === 'guest-pairing')
const inviteExpiryLabel = computed(() => (inviteExpiry.value ? getSignalExpiryLabel(inviteExpiry.value) : ''))
const { selectedTheme, setTheme, themeOptions } = useTheme()
const selectedThemeOption = computed(() => themeOptions.find((theme) => theme.id === selectedTheme.value) ?? themeOptions[0])

function handleThemeChange(event: Event) {
  setTheme((event.target as HTMLSelectElement).value as ThemeName)
}

async function runAction(task: () => Promise<void>) {
  operationError.value = ''

  try {
    await task()
  } catch (error) {
    operationError.value = error instanceof Error ? error.message : '操作失败，请稍后重试。'
  }
}

async function handleCreateRoom() {
  await runAction(async () => {
    await createRoom(hostNickname.value)
    await nextTick()
    scrollToBottom()
  })
}

async function handlePrepareJoin() {
  await runAction(async () => {
    await prepareJoin(pendingInviteImport.value, guestNickname.value)
  })
}

async function handleDirectJoin(roomIdToJoin: string) {
  const room = discoveredRooms.value.find((candidate) => candidate.roomId === roomIdToJoin)

  if (!room) {
    return
  }

  await runAction(async () => {
    await requestDirectJoin(room, guestNickname.value)
  })
}

async function handleImportAnswer() {
  await runAction(async () => {
    await importGuestAnswer(pendingAnswerImport.value)
  })
}

async function handleGenerateInvite() {
  await runAction(async () => {
    await generateInvite()
  })
}

async function handleLeaveRoom() {
  await runAction(async () => {
    await leaveRoom()
    mobilePanelOpen.value = false
  })
}

async function handleSendMessage() {
  if (!messageDraft.value.trim()) {
    return
  }

  await runAction(async () => {
    await sendText(messageDraft.value)
    messageDraft.value = ''
    await nextTick()
    scrollToBottom()
  })
}

function openFilePicker() {
  fileInputRef.value?.click()
}

async function handleFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (!file) {
    return
  }

  await runAction(async () => {
    await sendImage(file)
    input.value = ''
    await nextTick()
    scrollToBottom()
  })
}

async function handleComposerPaste(event: ClipboardEvent) {
  const items = [...(event.clipboardData?.items ?? [])]
  const imageItem = items.find((item) => item.type.startsWith('image/'))

  if (!imageItem) {
    return
  }

  const file = imageItem.getAsFile()

  if (!file) {
    return
  }

  event.preventDefault()
  await runAction(async () => {
    await sendImage(file)
    await nextTick()
    scrollToBottom()
  })
}

function handleComposerKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    void handleSendMessage()
  }
}

function scrollToBottom() {
  if (!messageListRef.value) {
    return
  }

  messageListRef.value.scrollTop = messageListRef.value.scrollHeight
}

function handleLoadOlderMessages() {
  suppressNextAutoScroll.value = true
  loadOlderMessages()
}

function setCopyFeedback(messageId: string, text: string) {
  copiedMessageId.value = messageId
  copyFeedbackText.value = text

  if (copyFeedbackTimer) {
    window.clearTimeout(copyFeedbackTimer)
  }

  copyFeedbackTimer = window.setTimeout(() => {
    copiedMessageId.value = null
    copyFeedbackText.value = ''
    copyFeedbackTimer = 0
  }, 1600)
}

function copyWithExecCommand(text: string) {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  textarea.setSelectionRange(0, text.length)
  const copied = document.execCommand('copy')
  document.body.removeChild(textarea)

  if (!copied) {
    throw new Error('当前浏览器不支持复制到剪贴板。')
  }
}

async function copyPlainText(text: string) {
  if (!text) {
    return
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return
    }
  } catch {
    // Fall back to the legacy copy command for non-secure contexts.
  }

  copyWithExecCommand(text)
}

async function handleCopyMessage(message: ChatMessage) {
  operationError.value = ''

  try {
    if (message.type === 'text' && message.text) {
      await copyPlainText(message.text)
      setCopyFeedback(message.id, '文本已复制')
      return
    }

    const imageMeta = message.imageMeta

    if (imageMeta?.previewUrl && navigator.clipboard?.write && 'ClipboardItem' in window) {
      const response = await fetch(imageMeta.previewUrl)
      const blob = await response.blob()

      if (blob.type.startsWith('image/')) {
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
        setCopyFeedback(message.id, '图片已复制')
        return
      }
    }

    const fallbackText = imageMeta?.name ?? '消息已复制'
    await copyPlainText(fallbackText)
    setCopyFeedback(message.id, imageMeta ? '图片名称已复制' : '消息已复制')
  } catch (error) {
    operationError.value = error instanceof Error ? error.message : '复制失败，请稍后重试。'
  }
}

onBeforeUnmount(() => {
  if (copyFeedbackTimer) {
    window.clearTimeout(copyFeedbackTimer)
  }
})

watch(
  () => visibleMessages.value.length,
  async () => {
    if (phase.value !== 'room') {
      return
    }

    if (suppressNextAutoScroll.value) {
      suppressNextAutoScroll.value = false
      return
    }

    await nextTick()
    scrollToBottom()
  },
)
</script>

<template>
  <div class="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-4 pb-10 pt-5 sm:px-6 lg:px-8">
    <div
      v-if="phase === 'room' && mobilePanelOpen"
      class="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-sm lg:hidden"
      @click="mobilePanelOpen = false"
    />

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
              <div>
                <div class="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Palette class="size-4 text-primary" />
                  主题
                </div>
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

    <div class="mt-6 grid gap-4">
      <Alert v-if="recoveryHint" variant="soft" class="border-primary/15 bg-white/80">
        <AlertTitle>恢复提示</AlertTitle>
        <AlertDescription class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>{{ recoveryHint }}</span>
          <Button variant="outline" size="sm" @click="dismissRecoveryHint">知道了</Button>
        </AlertDescription>
      </Alert>

      <Alert v-if="activeError" variant="destructive">
        <AlertTitle class="flex items-center gap-2">
          <CircleAlert class="size-4" />
          当前操作失败
        </AlertTitle>
        <AlertDescription>{{ activeError }}</AlertDescription>
      </Alert>
    </div>

    <section v-if="phase === 'entry' && discoveredRooms.length" class="mt-6">
      <Card class="overflow-hidden">
        <CardHeader class="gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div class="space-y-2">
            <Badge variant="secondary" class="w-fit gap-1.5">
              <Wifi class="size-3.5" />
              自动发现
            </Badge>
            <CardTitle class="text-base sm:text-lg">在线房间</CardTitle>
            <CardDescription>同一节点下可直接加入的房间。</CardDescription>
          </div>
          <Badge variant="outline" class="px-4 py-1.5">{{ discoveredRooms.length }} 个房间</Badge>
        </CardHeader>

        <CardContent class="grid gap-3">
          <article
            v-for="room in discoveredRooms"
            :key="room.roomId"
            class="flex flex-col gap-4 rounded-[28px] border border-border/70 bg-background/80 p-5 lg:flex-row lg:items-center lg:justify-between"
          >
            <div class="space-y-2">
              <Badge variant="outline" class="w-fit">可直连</Badge>
              <p class="text-base font-medium text-foreground">{{ room.roomLabel }}</p>
              <p class="text-sm leading-6 text-muted-foreground">
                <span class="font-medium text-foreground">{{ room.hostNickname }}</span>
                正在主持。
              </p>
            </div>

            <Button :disabled="directJoinPendingRoomId === room.roomId" class="min-w-36" @click="handleDirectJoin(room.roomId)">
              <LoaderCircle v-if="directJoinPendingRoomId === room.roomId" class="size-4 animate-spin" />
              <ArrowRight v-else class="size-4" />
              {{ directJoinPendingRoomId === room.roomId ? '进入中…' : '直接进入' }}
            </Button>
          </article>
        </CardContent>
      </Card>
    </section>

    <main v-if="phase === 'entry'" class="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card class="overflow-hidden">
        <CardHeader>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="space-y-2">
              <Badge class="w-fit gap-1.5">
                <Sparkles class="size-3.5" />
                房主入口
              </Badge>
              <CardTitle class="text-base sm:text-lg">新建房间</CardTitle>
            </div>
          </div>
        </CardHeader>

        <CardContent class="space-y-5">
          <div class="grid gap-2">
            <Label>你的昵称</Label>
            <Input v-model="hostNickname" maxlength="24" placeholder="例如：客厅平板 / 会议屏" />
          </div>

          <Button class="w-full sm:w-auto" @click="handleCreateRoom">
            <Wifi class="size-4" />
            创建房间
          </Button>

          <Separator />

          <div class="grid gap-3 text-sm leading-6 text-muted-foreground sm:grid-cols-3">
            <div class="rounded-[24px] border border-border/70 bg-background/80 p-4">
              历史保存在房主浏览器。
            </div>
            <div class="rounded-[24px] border border-border/70 bg-background/80 p-4">
              同一节点下可看到房间。
            </div>
            <div class="rounded-[24px] border border-border/70 bg-background/80 p-4">
              支持图片和桌面截图。
            </div>
          </div>
        </CardContent>
      </Card>

      <Card class="overflow-hidden">
        <CardHeader>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="space-y-2">
              <Badge variant="secondary" class="w-fit gap-1.5">
                <Users class="size-3.5" />
                访客入口
              </Badge>
              <CardTitle class="text-base sm:text-lg">加入房间</CardTitle>
            </div>
          </div>
        </CardHeader>

        <CardContent class="space-y-5">
          <div class="grid gap-2">
            <Label>你的昵称</Label>
            <Input v-model="guestNickname" maxlength="24" placeholder="例如：手机 / 笔记本 / iPad" />
          </div>

          <div class="grid gap-2">
            <Label>房主的邀请码</Label>
            <Textarea
              v-model="pendingInviteImport"
              :rows="6"
              placeholder="粘贴 lanchat: 开头的邀请码文本。"
              class="min-h-40"
            />
          </div>

          <Button class="w-full sm:w-auto" @click="handlePrepareJoin">
            <ArrowRight class="size-4" />
            生成应答
          </Button>

          <div class="rounded-[24px] border border-border/70 bg-background/80 p-4 text-sm leading-6 text-muted-foreground">
            只保留文本配对，跨设备更稳定。
          </div>
        </CardContent>
      </Card>
    </main>

    <main v-else-if="phase === 'guest-pairing'" class="mt-6">
      <Card class="overflow-hidden">
        <CardHeader class="gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div class="space-y-2">
            <Badge :variant="autoJoining ? 'default' : 'secondary'" class="w-fit gap-1.5">
              <LoaderCircle v-if="autoJoining" class="size-3.5 animate-spin" />
              <ArrowRight v-else class="size-3.5" />
              {{ autoJoining ? '自动进入' : '手动配对' }}
            </Badge>
            <CardTitle class="text-base sm:text-lg">{{ autoJoining ? '正在进入房间' : '把应答发给房主' }}</CardTitle>
            <CardDescription>
              <template v-if="autoJoining">
                正在进入 {{ directJoinPendingRoomLabel || roomLabel }}，等待房主完成配对。
              </template>
              <template v-else>
                你正在加入 {{ roomLabel }}。把下方应答发给 {{ hostProfile?.nickname ?? '房主' }}，导入后会自动进入。
              </template>
            </CardDescription>
          </div>

          <Badge variant="outline" class="px-4 py-1.5">{{ roomLabel }}</Badge>
        </CardHeader>

        <CardContent>
          <Card v-if="!autoJoining" class="border-border/70 bg-background/70">
            <CardHeader>
              <CardTitle class="text-base sm:text-lg">加入应答</CardTitle>
              <CardDescription>复制给房主即可。</CardDescription>
            </CardHeader>
            <CardContent class="space-y-4">
              <Textarea v-model="joinAnswerBundleText" :rows="10" readonly class="min-h-64" />
              <div class="flex flex-col gap-3 sm:flex-row">
                <Button class="sm:w-auto" @click="handleLeaveRoom">返回重新开始</Button>
              </div>
            </CardContent>
          </Card>

          <div v-else class="mx-auto max-w-xl rounded-[30px] border border-border/70 bg-background/70 p-8 text-center">
            <div class="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <LoaderCircle class="size-6 animate-spin" />
            </div>
            <h3 class="mt-5 text-lg font-semibold text-foreground">等待房主</h3>
            <p class="mt-3 text-sm leading-7 text-muted-foreground">
              如果等待太久，可以返回首页改用手动加入。
            </p>
            <Button class="mt-6" @click="handleLeaveRoom">
              <DoorOpen class="size-4" />
              返回首页
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>

    <main v-else class="relative mt-6 grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
      <aside
        :class="
          cn(
            'fixed inset-y-0 right-0 z-50 w-full max-w-[390px] overflow-y-auto border-l border-white/60 bg-white/92 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.18)] backdrop-blur-xl transition-transform duration-300 lg:sticky lg:top-6 lg:z-auto lg:max-h-[calc(100vh-3rem)] lg:rounded-[30px] lg:border lg:p-5 lg:shadow-[0_24px_80px_rgba(15,23,42,0.08)]',
            mobilePanelOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0',
          )
        "
      >
        <div class="mb-4 flex items-center justify-between gap-3 lg:hidden">
          <Badge variant="outline">{{ isHost ? '房主模式' : '成员模式' }}</Badge>
          <Button variant="ghost" size="icon" aria-label="关闭房间面板" @click="mobilePanelOpen = false">
            <X class="size-4" />
          </Button>
        </div>

        <div class="grid gap-4">
          <Card class="border-primary/10 bg-white/80">
            <CardHeader class="pb-4">
              <div class="flex items-center justify-between gap-3">
                <div class="space-y-2">
                  <Badge class="w-fit gap-1.5">
                    <Wifi class="size-3.5" />
                    {{ isHost ? '房主模式' : '成员模式' }}
                  </Badge>
                  <CardTitle class="text-base sm:text-lg">{{ roomLabel }}</CardTitle>
                </div>
                <Badge variant="outline">{{ onlinePeers.length }} 在线</Badge>
              </div>
            </CardHeader>
            <CardContent class="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div class="rounded-[24px] border border-border/70 bg-background/80 p-4">
                <p class="text-xs font-medium text-muted-foreground">我的身份</p>
                <p class="mt-2 text-base font-semibold text-foreground">{{ localPeer?.nickname }}</p>
              </div>
              <div class="rounded-[24px] border border-border/70 bg-background/80 p-4">
                <p class="text-xs font-medium text-muted-foreground">当前状态</p>
                <p class="mt-2 text-base font-semibold text-foreground">{{ statusText }}</p>
              </div>
            </CardContent>
          </Card>

          <Card class="border-border/70 bg-white/80">
            <CardHeader class="pb-4">
              <CardTitle class="text-base sm:text-lg">成员状态</CardTitle>
              <CardDescription>显示当前在线成员。</CardDescription>
            </CardHeader>
            <CardContent class="grid gap-3">
              <article
                v-for="peer in peers"
                :key="peer.id"
                class="flex items-center justify-between gap-3 rounded-[22px] border border-border/70 bg-background/80 px-4 py-3"
              >
                <div class="min-w-0">
                  <p class="truncate font-medium text-foreground">{{ peer.nickname }}</p>
                  <p class="text-sm text-muted-foreground">{{ peer.isHost ? '房主' : '成员' }}</p>
                </div>
                <Badge
                  :variant="peer.status === 'online' ? 'default' : peer.status === 'connecting' ? 'secondary' : 'outline'"
                  class="capitalize"
                >
                  {{ peer.status }}
                </Badge>
              </article>
            </CardContent>
          </Card>

          <Card v-if="isHost" class="border-border/70 bg-white/80">
            <CardHeader class="pb-4">
              <div class="flex items-center justify-between gap-3">
                <div class="space-y-2">
                  <CardTitle class="text-base sm:text-lg">继续加人</CardTitle>
                  <CardDescription>生成邀请码或导入应答。</CardDescription>
                </div>
                <Badge variant="outline">{{ inviteExpiryLabel }}</Badge>
              </div>
            </CardHeader>

            <CardContent class="grid gap-4">
              <div class="grid gap-2">
                <Label>邀请码</Label>
                <Textarea v-model="inviteBundleText" :rows="5" readonly class="min-h-40" />
              </div>

              <Button @click="handleGenerateInvite">
                <Sparkles class="size-4" />
                生成邀请码
              </Button>

              <Separator />

              <div class="grid gap-2">
                <Label>访客应答</Label>
                <Textarea
                  v-model="pendingAnswerImport"
                  :rows="5"
                  class="min-h-40"
                  placeholder="粘贴访客返回的应答文本。"
                />
              </div>

              <Button @click="handleImportAnswer">
                <ArrowRight class="size-4" />
                导入应答
              </Button>
            </CardContent>
          </Card>

          <Card v-else class="border-border/70 bg-white/80">
            <CardHeader class="pb-4">
              <CardTitle class="text-base sm:text-lg">访客提示</CardTitle>
              <CardDescription>保留和当前会话直接相关的信息。</CardDescription>
            </CardHeader>
            <CardContent class="grid gap-3 text-sm leading-6 text-muted-foreground">
              <div class="rounded-[24px] border border-border/70 bg-background/80 p-4">
                消息会先到房主，再转发给其他成员。
              </div>
              <div class="rounded-[24px] border border-border/70 bg-background/80 p-4">
                房主刷新或离开后，房间会结束。
              </div>
              <div class="rounded-[24px] border border-border/70 bg-background/80 p-4">
                可以在消息区顶部继续加载历史。
              </div>
            </CardContent>
          </Card>

          <Button :variant="isHost ? 'destructive' : 'outline'" class="w-full" @click="handleLeaveRoom">
            <DoorOpen class="size-4" />
            {{ isHost ? '关闭房间' : '离开房间' }}
          </Button>
        </div>
      </aside>

      <section class="grid gap-4">
        <Card class="overflow-hidden">
          <CardHeader class="gap-4 md:flex-row md:items-start md:justify-between">
            <div class="space-y-2">
              <Badge variant="secondary" class="w-fit gap-1.5">
                <MessageSquareText class="size-3.5" />
                局域网聊天室
              </Badge>
              <CardTitle class="text-base sm:text-lg">{{ roomLabel }}</CardTitle>
              <CardDescription>{{ statusText }}</CardDescription>
            </div>

            <div class="flex flex-wrap gap-2">
              <Badge variant="outline" class="gap-1.5 px-3 py-1.5">
                <Users class="size-3.5" />
                {{ onlinePeers.length }} 在线
              </Badge>
              <Button variant="outline" class="lg:hidden" @click="mobilePanelOpen = true">
                <Users class="size-4" />
                房间面板
              </Button>
            </div>
          </CardHeader>

          <CardContent class="pt-0">
            <div
              ref="messageListRef"
              class="flex h-[min(64vh,760px)] flex-col gap-4 overflow-y-auto rounded-[30px] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.96))] p-4 sm:p-5"
            >
              <div class="sticky top-0 z-10 -mx-1 bg-transparent px-1">
                <Button
                  v-if="hasOlderMessages"
                  variant="outline"
                  class="mx-auto flex rounded-full bg-background/90 backdrop-blur"
                  @click="handleLoadOlderMessages"
                >
                  加载更早消息
                </Button>
              </div>

              <article
                v-for="message in visibleMessages"
                :key="message.id"
                :class="cn('flex w-full', message.senderId === localPeer?.id ? 'justify-end' : 'justify-start')"
              >
                <div class="max-w-[min(90%,42rem)] space-y-2">
                  <div
                    :class="
                      cn(
                        'flex items-center gap-2 text-xs text-muted-foreground',
                        message.senderId === localPeer?.id ? 'justify-end' : 'justify-start',
                      )
                    "
                  >
                    <span class="font-medium text-foreground">
                      {{ message.senderId === localPeer?.id ? '我' : message.senderNickname }}
                    </span>
                    <span>{{ formatClockTime(message.createdAt) }}</span>
                  </div>

                  <div
                    :class="
                      cn(
                        'rounded-[26px] border px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25',
                        message.senderId === localPeer?.id
                          ? 'rounded-br-md border-primary/10 bg-primary/8 text-foreground'
                          : 'rounded-bl-md border-border/70 bg-white text-foreground',
                      )
                    "
                    role="button"
                    tabindex="0"
                    :title="message.type === 'text' ? '点击复制文本消息' : '点击复制图片或图片名称'"
                    @click="void handleCopyMessage(message)"
                    @keydown.enter.prevent="void handleCopyMessage(message)"
                    @keydown.space.prevent="void handleCopyMessage(message)"
                  >
                    <p v-if="message.type === 'text'" class="whitespace-pre-wrap break-words text-sm leading-7">
                      {{ message.text }}
                    </p>

                    <figure v-else-if="message.imageMeta" class="grid gap-3">
                      <img
                        :src="message.imageMeta.previewUrl"
                        :alt="message.imageMeta.name"
                        class="max-h-[360px] w-full rounded-[20px] object-cover"
                      />
                      <figcaption class="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>{{ message.imageMeta.name }}</span>
                        <span>{{ bytesToSize(message.imageMeta.size) }}</span>
                      </figcaption>
                    </figure>

                    <div v-if="message.pending" class="mt-3 inline-flex items-center gap-2 text-xs text-muted-foreground">
                      <LoaderCircle class="size-3.5 animate-spin" />
                      传输中…
                    </div>

                    <div v-else-if="copiedMessageId === message.id" class="mt-3 text-xs text-primary">
                      {{ copyFeedbackText }}
                    </div>
                  </div>
                </div>
              </article>
            </div>
          </CardContent>
        </Card>

        <Card class="overflow-hidden">
          <CardHeader class="pb-4">
            <CardTitle class="text-base sm:text-lg">发送消息</CardTitle>
            <CardDescription>支持文本、粘贴图片和相册发送。</CardDescription>
          </CardHeader>

          <CardContent class="space-y-4">
            <input
              ref="fileInputRef"
              class="hidden"
              type="file"
              accept="image/*"
              capture="environment"
              @change="handleFileSelected"
            />

            <Textarea
              v-model="messageDraft"
              :rows="4"
              class="min-h-32 resize-none"
              placeholder="输入消息。Enter 发送，Shift + Enter 换行；桌面端可粘贴截图。"
              @keydown="handleComposerKeydown"
              @paste="handleComposerPaste"
            />

            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div class="flex flex-col gap-2 text-sm text-muted-foreground">
                <span>图片会分块传输，并由房主转发。</span>
              </div>

              <div class="flex flex-col gap-3 sm:flex-row">
                <Button variant="outline" @click="openFilePicker">
                  <ImagePlus class="size-4" />
                  发送图片
                </Button>
                <Button @click="handleSendMessage">
                  <ArrowRight class="size-4" />
                  发送
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  </div>
</template>
