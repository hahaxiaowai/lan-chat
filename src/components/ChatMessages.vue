<script setup lang="ts">
import { ref } from 'vue'
import { LoaderCircle, MessageSquareText, Users } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { ChatMessage, PeerProfile } from '@/types'
import { bytesToSize, cn, formatClockTime } from '@/lib/utils'

defineProps<{
  copiedMessageId: string | null
  copyFeedbackText: string
  hasOlderMessages: boolean
  localPeer: PeerProfile | null
  onlineCount: number
  roomLabel: string
  statusText: string
  visibleMessages: ChatMessage[]
}>()

defineEmits<{
  copyMessage: [message: ChatMessage]
  loadOlderMessages: []
  openMobilePanel: []
}>()

const messageListRef = ref<HTMLElement | null>(null)
const { t } = useI18n()

function scrollToBottom() {
  // Used by the parent after new outgoing or incoming messages are rendered.
  if (!messageListRef.value) {
    return
  }

  messageListRef.value.scrollTop = messageListRef.value.scrollHeight
}

defineExpose({
  scrollToBottom,
})
</script>

<template>
  <Card class="overflow-hidden">
    <CardHeader class="gap-4 md:flex-row md:items-start md:justify-between">
      <div class="space-y-2">
        <Badge variant="secondary" class="w-fit gap-1.5">
          <MessageSquareText class="size-3.5" />
          {{ t('room.badge') }}
        </Badge>
        <CardTitle class="text-base sm:text-lg">{{ roomLabel }}</CardTitle>
        <CardDescription>{{ statusText }}</CardDescription>
      </div>

      <div class="flex flex-wrap gap-2">
        <Badge variant="outline" class="gap-1.5 px-3 py-1.5">
          <Users class="size-3.5" />
          {{ t('common.online', { count: onlineCount }) }}
        </Badge>
        <Button variant="outline" class="lg:hidden" @click="$emit('openMobilePanel')">
          <Users class="size-4" />
          {{ t('room.panel') }}
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
            @click="$emit('loadOlderMessages')"
          >
            {{ t('room.loadOlder') }}
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
                {{ message.senderId === localPeer?.id ? t('common.me') : message.senderNickname }}
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
              :title="message.type === 'text' ? t('room.copyTextTitle') : t('room.copyImageTitle')"
              @click="$emit('copyMessage', message)"
              @keydown.enter.prevent="$emit('copyMessage', message)"
              @keydown.space.prevent="$emit('copyMessage', message)"
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
                {{ t('room.transferring') }}
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
</template>
