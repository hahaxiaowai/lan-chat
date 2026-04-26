<script setup lang="ts">
import { ArrowRight, DoorOpen, LoaderCircle } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'

const joinAnswerBundleText = defineModel<string>('joinAnswerBundleText', { required: true })

defineProps<{
  autoJoining: boolean
  directJoinPendingRoomLabel: string
  hostNickname?: string
  roomLabel: string
}>()

defineEmits<{
  leaveRoom: []
}>()
</script>

<template>
  <main class="mt-6">
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
              你正在加入 {{ roomLabel }}。把下方应答发给 {{ hostNickname ?? '房主' }}，导入后会自动进入。
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
              <Button class="sm:w-auto" @click="$emit('leaveRoom')">返回重新开始</Button>
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
          <Button class="mt-6" @click="$emit('leaveRoom')">
            <DoorOpen class="size-4" />
            返回首页
          </Button>
        </div>
      </CardContent>
    </Card>
  </main>
</template>

