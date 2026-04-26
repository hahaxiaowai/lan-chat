<script setup lang="ts">
import { ref } from 'vue'
import { ArrowRight, ImagePlus } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'

const messageDraft = defineModel<string>('messageDraft', { required: true })

const emit = defineEmits<{
  sendImage: [file: File]
  sendMessage: []
}>()

const fileInputRef = ref<HTMLInputElement | null>(null)

function openFilePicker() {
  fileInputRef.value?.click()
}

function handleFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (!file) {
    return
  }

  emit('sendImage', file)
  input.value = ''
}

function handleComposerPaste(event: ClipboardEvent) {
  // Desktop screenshots arrive as clipboard image items; send the first one and leave text paste untouched.
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
  emit('sendImage', file)
}

function handleComposerKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    emit('sendMessage')
  }
}
</script>

<template>
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
          <Button @click="$emit('sendMessage')">
            <ArrowRight class="size-4" />
            发送
          </Button>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
