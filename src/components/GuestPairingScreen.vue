<script setup lang="ts">
import { ArrowRight, DoorOpen, LoaderCircle } from 'lucide-vue-next'
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

const { t } = useI18n()
</script>

<template>
  <main class="mt-6">
    <Card class="overflow-hidden">
      <CardHeader class="gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div class="space-y-2">
          <Badge :variant="autoJoining ? 'default' : 'secondary'" class="w-fit gap-1.5">
            <LoaderCircle v-if="autoJoining" class="size-3.5 animate-spin" />
            <ArrowRight v-else class="size-3.5" />
            {{ autoJoining ? t('pairing.autoBadge') : t('pairing.manualBadge') }}
          </Badge>
          <CardTitle class="text-base sm:text-lg">{{ autoJoining ? t('pairing.autoTitle') : t('pairing.manualTitle') }}</CardTitle>
          <CardDescription>
            <template v-if="autoJoining">
              {{ t('pairing.autoDescription', { roomLabel: directJoinPendingRoomLabel || roomLabel }) }}
            </template>
            <template v-else>
              {{ t('pairing.manualDescription', { roomLabel, hostNickname: hostNickname ?? t('common.host') }) }}
            </template>
          </CardDescription>
        </div>

        <Badge variant="outline" class="px-4 py-1.5">{{ roomLabel }}</Badge>
      </CardHeader>

      <CardContent>
        <Card v-if="!autoJoining" class="border-border/70 bg-background/70">
          <CardHeader>
            <CardTitle class="text-base sm:text-lg">{{ t('pairing.answerTitle') }}</CardTitle>
            <CardDescription>{{ t('pairing.answerDescription') }}</CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <Textarea v-model="joinAnswerBundleText" :rows="10" readonly class="min-h-64" />
            <div class="flex flex-col gap-3 sm:flex-row">
              <Button class="sm:w-auto" @click="$emit('leaveRoom')">{{ t('pairing.restart') }}</Button>
            </div>
          </CardContent>
        </Card>

        <div v-else class="mx-auto max-w-xl rounded-[30px] border border-border/70 bg-background/70 p-8 text-center">
          <div class="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <LoaderCircle class="size-6 animate-spin" />
          </div>
          <h3 class="mt-5 text-lg font-semibold text-foreground">{{ t('pairing.waitingTitle') }}</h3>
          <p class="mt-3 text-sm leading-7 text-muted-foreground">
            {{ t('pairing.waitingDescription') }}
          </p>
          <Button class="mt-6" @click="$emit('leaveRoom')">
            <DoorOpen class="size-4" />
            {{ t('common.goHome') }}
          </Button>
        </div>
      </CardContent>
    </Card>
  </main>
</template>
