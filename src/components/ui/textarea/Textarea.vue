<script setup lang="ts">
import { cn } from '@/lib/utils'

defineProps<{
  class?: string
  modelValue?: string
  rows?: number
  placeholder?: string
  readonly?: boolean
}>()

defineEmits<{
  'update:modelValue': [value: string]
  keydown: [event: KeyboardEvent]
  paste: [event: ClipboardEvent]
}>()
</script>

<template>
  <textarea
    :value="modelValue"
    :rows="rows ?? 4"
    :placeholder="placeholder"
    :readonly="readonly"
    :class="
      cn(
        'flex min-h-28 w-full rounded-[24px] border border-input bg-background/80 px-4 py-3 text-sm leading-6 shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:ring-4 focus-visible:ring-ring/15 focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50',
        $props.class,
      )
    "
    @input="$emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    @keydown="$emit('keydown', $event)"
    @paste="$emit('paste', $event)"
  />
</template>
