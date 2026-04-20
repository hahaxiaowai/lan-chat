<script setup lang="ts">
import { computed } from 'vue'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const alertVariants = cva('rounded-[24px] border px-5 py-4 text-sm shadow-sm', {
  variants: {
    variant: {
      default: 'border-border bg-card/80 text-card-foreground',
      soft: 'border-primary/10 bg-primary/8 text-foreground',
      destructive: 'border-destructive/20 bg-destructive/10 text-foreground',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
})

type AlertVariant = 'default' | 'soft' | 'destructive'

interface Props {
  variant?: AlertVariant
  class?: string
}

const props = defineProps<Props>()
const classes = computed(() => cn(alertVariants({ variant: props.variant }), props.class))
</script>

<template>
  <section :class="classes">
    <slot />
  </section>
</template>
