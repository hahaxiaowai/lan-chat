<script setup lang="ts">
import { ArrowRight, Sparkles, Users, Wifi } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
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

const { t } = useI18n()
</script>

<template>
  <main class="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
    <Card class="overflow-hidden">
      <CardHeader>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="space-y-2">
            <Badge class="w-fit gap-1.5">
              <Sparkles class="size-3.5" />
              {{ t('entry.hostBadge') }}
            </Badge>
            <CardTitle class="text-base sm:text-lg">{{ t('entry.hostTitle') }}</CardTitle>
          </div>
        </div>
      </CardHeader>

      <CardContent class="space-y-5">
        <div class="grid gap-2">
          <Label>{{ t('entry.nickname') }}</Label>
          <Input v-model="hostNickname" maxlength="24" :placeholder="t('entry.hostPlaceholder')" />
        </div>

        <Button class="w-full sm:w-auto" @click="$emit('createRoom')">
          <Wifi class="size-4" />
          {{ t('entry.createRoom') }}
        </Button>
      </CardContent>
    </Card>

    <Card class="overflow-hidden">
      <CardHeader>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="space-y-2">
            <Badge variant="secondary" class="w-fit gap-1.5">
              <Users class="size-3.5" />
              {{ t('entry.guestBadge') }}
            </Badge>
            <CardTitle class="text-base sm:text-lg">{{ t('entry.guestTitle') }}</CardTitle>
          </div>
        </div>
      </CardHeader>

      <CardContent class="space-y-5">
        <div class="grid gap-2">
          <Label>{{ t('entry.nickname') }}</Label>
          <Input v-model="guestNickname" maxlength="24" :placeholder="t('entry.guestPlaceholder')" />
        </div>

        <div class="grid gap-2">
          <Label>{{ t('entry.inviteLabel') }}</Label>
          <Textarea
            v-model="pendingInviteImport"
            :rows="6"
            :placeholder="t('entry.invitePlaceholder')"
            class="min-h-40"
          />
        </div>

        <Button class="w-full sm:w-auto" @click="$emit('prepareJoin')">
          <ArrowRight class="size-4" />
          {{ t('entry.createAnswer') }}
        </Button>
      </CardContent>
    </Card>
  </main>
</template>
