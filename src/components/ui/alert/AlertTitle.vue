<script setup lang="ts">
import { cn } from '@/lib/utils'

defineProps<{
  class?: string
}>()
</script>

<template>
  <h3 :class="cn('mb-1 font-medium tracking-tight text-foreground', $props.class)">
    <slot />
  </h3>
</template>
