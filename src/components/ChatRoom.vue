<script setup lang="ts">
import { ref } from 'vue'
import ChatMessages from '@/components/ChatMessages.vue'
import MessageComposer from '@/components/MessageComposer.vue'
import RoomSidebar from '@/components/RoomSidebar.vue'
import type { ChatMessage, PeerProfile } from '@/types'

const mobilePanelOpen = defineModel<boolean>('mobilePanelOpen', { required: true })
const inviteBundleText = defineModel<string>('inviteBundleText', { required: true })
const pendingAnswerImport = defineModel<string>('pendingAnswerImport', { required: true })
const messageDraft = defineModel<string>('messageDraft', { required: true })

defineProps<{
  copiedMessageId: string | null
  copyFeedbackText: string
  hasOlderMessages: boolean
  inviteExpiryLabel: string
  isHost: boolean
  localPeer: PeerProfile | null
  onlineCount: number
  peers: PeerProfile[]
  roomLabel: string
  statusText: string
  visibleMessages: ChatMessage[]
}>()

defineEmits<{
  copyMessage: [message: ChatMessage]
  generateInvite: []
  importAnswer: []
  leaveRoom: []
  loadOlderMessages: []
  sendImage: [file: File]
  sendMessage: []
}>()

interface ChatMessagesExpose {
  scrollToBottom: () => void
}

const messageListRef = ref<ChatMessagesExpose | null>(null)

function scrollToBottom() {
  // Forward the exposed method from ChatMessages so App.vue does not need to know the inner layout.
  messageListRef.value?.scrollToBottom()
}

defineExpose({
  scrollToBottom,
})
</script>

<template>
  <main class="relative mt-6 grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
    <RoomSidebar
      v-model:mobile-panel-open="mobilePanelOpen"
      v-model:invite-bundle-text="inviteBundleText"
      v-model:pending-answer-import="pendingAnswerImport"
      :invite-expiry-label="inviteExpiryLabel"
      :is-host="isHost"
      :local-peer="localPeer"
      :online-count="onlineCount"
      :peers="peers"
      :room-label="roomLabel"
      :status-text="statusText"
      @generate-invite="$emit('generateInvite')"
      @import-answer="$emit('importAnswer')"
      @leave-room="$emit('leaveRoom')"
    />

    <section class="grid gap-4">
      <ChatMessages
        ref="messageListRef"
        :copied-message-id="copiedMessageId"
        :copy-feedback-text="copyFeedbackText"
        :has-older-messages="hasOlderMessages"
        :local-peer="localPeer"
        :online-count="onlineCount"
        :room-label="roomLabel"
        :status-text="statusText"
        :visible-messages="visibleMessages"
        @copy-message="$emit('copyMessage', $event)"
        @load-older-messages="$emit('loadOlderMessages')"
        @open-mobile-panel="mobilePanelOpen = true"
      />

      <MessageComposer
        v-model:message-draft="messageDraft"
        @send-image="$emit('sendImage', $event)"
        @send-message="$emit('sendMessage')"
      />
    </section>
  </main>
</template>
