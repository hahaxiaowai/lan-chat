<script setup lang="ts">
import { cn } from '@/lib/utils'

defineProps<{
  class?: string
  modelValue?: string
  type?: string
  placeholder?: string
  maxlength?: number | string
  readonly?: boolean
}>()

defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <input
    :value="modelValue"
    :type="type ?? 'text'"
    :placeholder="placeholder"
    :maxlength="maxlength"
    :readonly="readonly"
    :class="
      cn(
        'flex h-12 w-full rounded-2xl border border-input bg-background/80 px-4 py-3 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:ring-4 focus-visible:ring-ring/15 focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50',
        $props.class,
      )
    "
    @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>
