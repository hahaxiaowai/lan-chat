<script setup lang="ts">
import { ArrowRight, LoaderCircle, Wifi } from 'lucide-vue-next'
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
import type { DiscoveredRoom } from '@/types'

defineProps<{
  rooms: DiscoveredRoom[]
  pendingRoomId: string | null
}>()

defineEmits<{
  directJoin: [roomId: string]
}>()

const { t } = useI18n()
</script>

<template>
  <section class="mt-6">
    <Card class="overflow-hidden">
      <CardHeader class="gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div class="space-y-2">
          <Badge variant="secondary" class="w-fit gap-1.5">
            <Wifi class="size-3.5" />
            {{ t('discovery.badge') }}
          </Badge>
          <CardTitle class="text-base sm:text-lg">{{ t('discovery.title') }}</CardTitle>
          <CardDescription>{{ t('discovery.description') }}</CardDescription>
        </div>
        <Badge variant="outline" class="px-4 py-1.5">{{ t('common.roomCount', { count: rooms.length }) }}</Badge>
      </CardHeader>

      <CardContent class="grid gap-3">
        <article
          v-for="room in rooms"
          :key="room.roomId"
          class="flex flex-col gap-4 rounded-[28px] border border-border/70 bg-background/80 p-5 lg:flex-row lg:items-center lg:justify-between"
        >
          <div class="space-y-2">
            <Badge variant="outline" class="w-fit">{{ t('discovery.joinable') }}</Badge>
            <p class="text-base font-medium text-foreground">{{ room.roomLabel }}</p>
            <p class="text-sm leading-6 text-muted-foreground">
              <span class="font-medium text-foreground">{{ room.hostNickname }}</span>
              {{ t('discovery.hosting') }}
            </p>
          </div>

          <Button :disabled="pendingRoomId === room.roomId" class="min-w-36" @click="$emit('directJoin', room.roomId)">
            <LoaderCircle v-if="pendingRoomId === room.roomId" class="size-4 animate-spin" />
            <ArrowRight v-else class="size-4" />
            {{ pendingRoomId === room.roomId ? t('discovery.joining') : t('discovery.directJoin') }}
          </Button>
        </article>
      </CardContent>
    </Card>
  </section>
</template>
