<script setup lang="ts">
import { cn } from '@/lib/utils'

defineProps<{
  class?: string
}>()
</script>

<template>
  <footer :class="cn('flex items-center gap-3 px-6 pb-6', $props.class)">
    <slot />
  </footer>
</template>
