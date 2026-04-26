<script setup lang="ts">
import { ArrowRight, Sparkles, Users, Wifi } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

const hostNickname = defineModel<string>('hostNickname', { required: true })
const guestNickname = defineModel<string>('guestNickname', { required: true })
const pendingInviteImport = defineModel<string>('pendingInviteImport', { required: true })

defineEmits<{
  createRoom: []
  prepareJoin: []
}>()
</script>

<template>
  <main class="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
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

        <Button class="w-full sm:w-auto" @click="$emit('createRoom')">
          <Wifi class="size-4" />
          创建房间
        </Button>
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

        <Button class="w-full sm:w-auto" @click="$emit('prepareJoin')">
          <ArrowRight class="size-4" />
          生成应答
        </Button>
      </CardContent>
    </Card>
  </main>
</template>
