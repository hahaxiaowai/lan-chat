<script setup lang="ts">
import { cn } from '@/lib/utils'

defineProps<{
  class?: string
}>()
</script>

<template>
  <header :class="cn('flex flex-col gap-2 p-6', $props.class)">
    <slot />
  </header>
</template>
