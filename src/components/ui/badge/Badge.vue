<script setup lang="ts">
import { computed } from 'vue'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-primary/10 bg-primary/10 text-primary',
        secondary: 'border-secondary bg-secondary text-secondary-foreground',
        outline: 'border-border bg-background/70 text-foreground',
        destructive: 'border-destructive/10 bg-destructive/10 text-destructive',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

type BadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive'

interface Props {
  variant?: BadgeVariant
  class?: string
}

const props = defineProps<Props>()
const classes = computed(() => cn(badgeVariants({ variant: props.variant }), props.class))
</script>

<template>
  <span :class="classes">
    <slot />
  </span>
</template>
