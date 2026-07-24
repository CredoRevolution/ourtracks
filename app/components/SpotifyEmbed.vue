<script setup lang="ts">
import { spotifyEmbedUrl } from '#shared/utils/spotify'
import type { SpotifyKind } from '~/types'

const props = withDefaults(
  defineProps<{
    kind: SpotifyKind
    id: string
    /** The 80px player: cover, title, play button. Anything taller is a tracklist. */
    compact?: boolean
  }>(),
  { compact: false },
)

/**
 * Spotify's own player. We never touch audio ourselves — hosting it would be
 * both illegal and a much bigger project. Listeners without Premium get the
 * 30-second preview, which is Spotify's rule, not ours.
 */
const height = computed(() => {
  if (props.compact) return 80
  return props.kind === 'track' || props.kind === 'episode' ? 152 : 352
})

const src = computed(() => spotifyEmbedUrl(props.kind, props.id))
</script>

<template>
  <iframe
    :key="src"
    :src="src"
    :height="height"
    class="w-full rounded-xl border-0"
    style="color-scheme: normal"
    loading="lazy"
    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
    :title="`Spotify ${kind}`"
  />
</template>
