<script setup lang="ts">
import { cn } from '@/lib/utils'

defineProps<{
  class?: string
}>()
</script>

<template>
  <section :class="cn('rounded-[28px] border border-white/60 bg-card/90 text-card-foreground shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl', $props.class)">
    <slot />
  </section>
</template>
