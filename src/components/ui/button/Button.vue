<script setup lang="ts">
import { computed } from 'vue'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 shrink-0 outline-none focus-visible:ring-4 focus-visible:ring-ring/20',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:-translate-y-0.5 hover:brightness-105',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline: 'border border-border bg-background/80 text-foreground hover:bg-secondary/70',
        ghost: 'text-foreground hover:bg-secondary/80',
        destructive: 'bg-destructive text-destructive-foreground shadow-lg shadow-destructive/20 hover:-translate-y-0.5',
      },
      size: {
        default: 'h-11 px-5 py-2',
        sm: 'h-9 px-3 text-xs',
        lg: 'h-12 px-6',
        icon: 'size-10 rounded-full',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

type ButtonVariant = 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive'
type ButtonSize = 'default' | 'sm' | 'lg' | 'icon'

interface Props {
  variant?: ButtonVariant
  size?: ButtonSize
  class?: string
  type?: 'button' | 'submit' | 'reset'
}

const props = withDefaults(defineProps<Props>(), {
  type: 'button',
})

const classes = computed(() => cn(buttonVariants({ variant: props.variant, size: props.size }), props.class))
</script>

<template>
  <button :type="type" :class="classes">
    <slot />
  </button>
</template>
