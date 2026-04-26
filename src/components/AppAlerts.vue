<script setup lang="ts">
import { CircleAlert } from 'lucide-vue-next'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

defineProps<{
  recoveryHint: string | null
  activeError: string | null
}>()

defineEmits<{
  dismissRecoveryHint: []
}>()
</script>

<template>
  <div class="mt-6 grid gap-4">
    <Alert v-if="recoveryHint" variant="soft" class="border-primary/15 bg-white/80">
      <AlertTitle>恢复提示</AlertTitle>
      <AlertDescription class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span>{{ recoveryHint }}</span>
        <Button variant="outline" size="sm" @click="$emit('dismissRecoveryHint')">知道了</Button>
      </AlertDescription>
    </Alert>

    <Alert v-if="activeError" variant="destructive">
      <AlertTitle class="flex items-center gap-2">
        <CircleAlert class="size-4" />
        当前操作失败
      </AlertTitle>
      <AlertDescription>{{ activeError }}</AlertDescription>
    </Alert>
  </div>
</template>
