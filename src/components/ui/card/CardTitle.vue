<script setup lang="ts">
import { cn } from '@/lib/utils'

defineProps<{
  class?: string
}>()
</script>

<template>
  <h2 :class="cn('font-sans text-xl font-semibold tracking-tight text-foreground sm:text-2xl', $props.class)">
    <slot />
  </h2>
</template>
