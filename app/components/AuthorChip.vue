<script setup lang="ts">
import type { Profile } from '~/types'

const props = withDefaults(
  defineProps<{
    author?: Pick<Profile, 'id' | 'display_name' | 'avatar_url'> | null
    size?: 'sm' | 'md'
  }>(),
  { author: null, size: 'sm' },
)

const name = computed(() => props.author?.display_name?.trim() || 'Someone')
const initial = computed(() => name.value.charAt(0).toUpperCase())
const box = computed(() => (props.size === 'md' ? 'size-8' : 'size-6'))
</script>

<template>
  <span class="inline-flex items-center gap-2">
    <img
      v-if="author?.avatar_url"
      :src="author.avatar_url"
      :alt="name"
      :class="box"
      class="rounded-full object-cover ring-1 ring-white/15"
      referrerpolicy="no-referrer"
    >
    <span
      v-else
      :class="box"
      class="grid place-items-center rounded-full bg-ink-700 text-[11px] font-medium text-ink-200 ring-1 ring-white/10"
    >
      {{ initial }}
    </span>
    <span :class="size === 'md' ? 'text-sm' : 'text-xs'" class="text-ink-200">{{ name }}</span>
  </span>
</template>
