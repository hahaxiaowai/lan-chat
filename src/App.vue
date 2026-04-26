<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import AppAlerts from '@/components/AppAlerts.vue'
import AppHeader from '@/components/AppHeader.vue'
import ChatRoom from '@/components/ChatRoom.vue'
import DiscoveredRooms from '@/components/DiscoveredRooms.vue'
import EntryScreen from '@/components/EntryScreen.vue'
import GuestPairingScreen from '@/components/GuestPairingScreen.vue'
import { useLanRoom } from '@/composables/useLanRoom'
import { useRoomDiscovery } from '@/composables/useRoomDiscovery'
import { useTheme } from '@/composables/useTheme'
import type { ThemeName } from '@/composables/useTheme'
import { currentLocale, languageOptions, setLocale, t, type AppLocale } from '@/i18n'
import { getSignalExpiryLabel } from '@/lib/signalCodec'
import type { ChatMessage, ImageMeta } from '@/types'
import { createPlayfulNickname } from '@/lib/utils'

interface ChatRoomExpose {
  scrollToBottom: () => void
}

// App keeps the room lifecycle in one place; child components only render regions and emit user intent.
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

const generatedHostNickname = ref(createPlayfulNickname('host'))
const generatedGuestNickname = ref(createPlayfulNickname('guest'))
const hostNickname = ref(generatedHostNickname.value)
const guestNickname = ref(generatedGuestNickname.value)
const messageDraft = ref('')
const operationError = ref('')
const mobilePanelOpen = ref(false)
const chatRoomRef = ref<ChatRoomExpose | null>(null)
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

// Keep async UI actions consistent: clear the old error, run the task, and surface any failure.
function handleThemeChange(theme: ThemeName) {
  setTheme(theme)
}

function handleLocaleChange(locale: AppLocale) {
  const shouldRefreshHostNickname = hostNickname.value === generatedHostNickname.value
  const shouldRefreshGuestNickname = guestNickname.value === generatedGuestNickname.value

  setLocale(locale)

  generatedHostNickname.value = createPlayfulNickname('host', locale)
  generatedGuestNickname.value = createPlayfulNickname('guest', locale)

  if (shouldRefreshHostNickname) {
    hostNickname.value = generatedHostNickname.value
  }

  if (shouldRefreshGuestNickname) {
    guestNickname.value = generatedGuestNickname.value
  }
}

async function runAction(task: () => Promise<void>) {
  operationError.value = ''

  try {
    await task()
  } catch (error) {
    operationError.value = error instanceof Error ? error.message : t('errors.operationFailed')
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
  // Direct join still starts from the discovered room payload so the signaling request has fresh room metadata.
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

async function handleSendImage(file: File) {
  await runAction(async () => {
    await sendImage(file)
    await nextTick()
    scrollToBottom()
  })
}

function scrollToBottom() {
  // The actual scroll container lives two components down, so ChatRoom exposes a tiny imperative bridge.
  chatRoomRef.value?.scrollToBottom()
}

function handleLoadOlderMessages() {
  // Loading history prepends older messages; skip the next auto-scroll so the reader keeps their place.
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
  // Clipboard API can be unavailable in non-secure contexts, so keep a small legacy fallback.
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
    throw new Error(t('errors.clipboardUnsupported'))
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

function blobToPng(blob: Blob) {
  return new Promise<Blob>((resolve, reject) => {
    const image = new Image()
    const url = URL.createObjectURL(blob)

    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight

      const context = canvas.getContext('2d')
      if (!context) {
        URL.revokeObjectURL(url)
        reject(new Error(t('errors.imageCopyProcessFailed')))
        return
      }

      context.drawImage(image, 0, 0)
      canvas.toBlob((pngBlob) => {
        URL.revokeObjectURL(url)

        if (!pngBlob) {
          reject(new Error(t('errors.imageCopyProcessFailed')))
          return
        }

        resolve(pngBlob)
      }, 'image/png')
    }

    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(t('errors.imageLoadFailed')))
    }

    image.src = url
  })
}

async function copyImageToClipboard(imageMeta: ImageMeta) {
  if (!imageMeta.previewUrl || !navigator.clipboard?.write || !('ClipboardItem' in window)) {
    throw new Error(t('errors.imageClipboardUnsupported'))
  }

  const response = await fetch(imageMeta.previewUrl)
  const blob = await response.blob()

  if (!blob.type.startsWith('image/')) {
    throw new Error(t('errors.invalidImageFormat'))
  }

  const clipboardItem = window.ClipboardItem
  const supports = typeof clipboardItem.supports === 'function' ? clipboardItem.supports(blob.type) : true

  if (supports) {
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
    return
  }

  const pngBlob = await blobToPng(blob)
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })])
}

async function handleCopyMessage(message: ChatMessage) {
  operationError.value = ''

  try {
    if (message.type === 'text' && message.text) {
      await copyPlainText(message.text)
      setCopyFeedback(message.id, t('errors.textCopied'))
      return
    }

    const imageMeta = message.imageMeta

    if (imageMeta) {
      await copyImageToClipboard(imageMeta)
      setCopyFeedback(message.id, t('errors.imageCopied'))
      return
    }

    throw new Error(t('errors.noCopyContent'))
  } catch (error) {
    operationError.value = error instanceof Error ? error.message : t('errors.copyFailed')
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

    <AppHeader
      :phase="phase"
      :room-label="roomLabel"
      :secure-context="secureContext"
      :signal-state="signalState"
      :selected-theme="selectedTheme"
      :selected-theme-option="selectedThemeOption"
      :theme-options="themeOptions"
      :selected-locale="currentLocale"
      :language-options="languageOptions"
      :status-text="statusText"
      @go-home="handleLeaveRoom"
      @theme-change="handleThemeChange"
      @locale-change="handleLocaleChange"
    />

    <AppAlerts
      :recovery-hint="recoveryHint"
      :active-error="activeError"
      @dismiss-recovery-hint="dismissRecoveryHint"
    />

    <DiscoveredRooms
      v-if="phase === 'entry' && discoveredRooms.length"
      :rooms="discoveredRooms"
      :pending-room-id="directJoinPendingRoomId"
      @direct-join="handleDirectJoin"
    />

    <EntryScreen
      v-if="phase === 'entry'"
      v-model:host-nickname="hostNickname"
      v-model:guest-nickname="guestNickname"
      v-model:pending-invite-import="pendingInviteImport"
      @create-room="handleCreateRoom"
      @prepare-join="handlePrepareJoin"
    />

    <GuestPairingScreen
      v-else-if="phase === 'guest-pairing'"
      v-model:join-answer-bundle-text="joinAnswerBundleText"
      :auto-joining="autoJoining"
      :direct-join-pending-room-label="directJoinPendingRoomLabel"
      :host-nickname="hostProfile?.nickname"
      :room-label="roomLabel"
      @leave-room="handleLeaveRoom"
    />

    <ChatRoom
      v-else
      ref="chatRoomRef"
      v-model:message-draft="messageDraft"
      v-model:mobile-panel-open="mobilePanelOpen"
      v-model:invite-bundle-text="inviteBundleText"
      v-model:pending-answer-import="pendingAnswerImport"
      :copied-message-id="copiedMessageId"
      :copy-feedback-text="copyFeedbackText"
      :has-older-messages="hasOlderMessages"
      :invite-expiry-label="inviteExpiryLabel"
      :is-host="isHost"
      :local-peer="localPeer"
      :online-count="onlinePeers.length"
      :peers="peers"
      :room-label="roomLabel"
      :status-text="statusText"
      :visible-messages="visibleMessages"
      @copy-message="handleCopyMessage"
      @generate-invite="handleGenerateInvite"
      @import-answer="handleImportAnswer"
      @leave-room="handleLeaveRoom"
      @load-older-messages="handleLoadOlderMessages"
      @send-image="handleSendImage"
      @send-message="handleSendMessage"
    />
  </div>
</template>
