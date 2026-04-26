<script setup lang="ts">
import { ArrowRight, DoorOpen, Sparkles, Wifi, X } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import type { PeerProfile } from '@/types'
import { cn } from '@/lib/utils'

const mobilePanelOpen = defineModel<boolean>('mobilePanelOpen', { required: true })
const inviteBundleText = defineModel<string>('inviteBundleText', { required: true })
const pendingAnswerImport = defineModel<string>('pendingAnswerImport', { required: true })

defineProps<{
  inviteExpiryLabel: string
  isHost: boolean
  localPeer: PeerProfile | null
  onlineCount: number
  peers: PeerProfile[]
  roomLabel: string
  statusText: string
}>()

defineEmits<{
  generateInvite: []
  importAnswer: []
  leaveRoom: []
}>()
</script>

<template>
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
            <Badge variant="outline">{{ onlineCount }} 在线</Badge>
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

          <Button @click="$emit('generateInvite')">
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

          <Button @click="$emit('importAnswer')">
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

      <Button :variant="isHost ? 'destructive' : 'outline'" class="w-full" @click="$emit('leaveRoom')">
        <DoorOpen class="size-4" />
        {{ isHost ? '关闭房间' : '离开房间' }}
      </Button>
    </div>
  </aside>
</template>

