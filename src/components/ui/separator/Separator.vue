<script setup lang="ts">
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    class?: string
    orientation?: 'horizontal' | 'vertical'
  }>(),
  {
    orientation: 'horizontal',
  },
)
</script>

<template>
  <div
    :aria-orientation="props.orientation"
    :class="
      cn(
        'shrink-0 bg-border/70',
        props.orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        $props.class,
      )
    "
  />
</template>
