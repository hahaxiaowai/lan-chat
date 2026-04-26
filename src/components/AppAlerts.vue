<script setup lang="ts">
import { CircleAlert } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

defineProps<{
  recoveryHint: string | null
  activeError: string | null
}>()

defineEmits<{
  dismissRecoveryHint: []
}>()

const { t } = useI18n()
</script>

<template>
  <div class="mt-6 grid gap-4">
    <Alert v-if="recoveryHint" variant="soft" class="border-primary/15 bg-white/80">
      <AlertTitle>{{ t('alerts.recoveryTitle') }}</AlertTitle>
      <AlertDescription class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span>{{ recoveryHint }}</span>
        <Button variant="outline" size="sm" @click="$emit('dismissRecoveryHint')">{{ t('alerts.dismiss') }}</Button>
      </AlertDescription>
    </Alert>

    <Alert v-if="activeError" variant="destructive">
      <AlertTitle class="flex items-center gap-2">
        <CircleAlert class="size-4" />
        {{ t('alerts.errorTitle') }}
      </AlertTitle>
      <AlertDescription>{{ activeError }}</AlertDescription>
    </Alert>
  </div>
</template>
