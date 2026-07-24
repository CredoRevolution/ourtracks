<script setup lang="ts">
import type { Pin } from '~/types'

const props = defineProps<{
  pin: Pin
  canEdit: boolean
}>()

const emit = defineEmits<{
  close: []
  edit: [pin: Pin]
  deleted: [id: string]
}>()

const { remove } = usePins()

const confirmingDelete = ref(false)
const deleting = ref(false)

// Reset the "are you sure" state when the panel switches to another pin.
watch(() => props.pin.id, () => {
  confirmingDelete.value = false
})

const when = computed(() => {
  const raw = props.pin.happened_on ?? props.pin.created_at
  return new Date(raw).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
})

async function confirmDelete() {
  deleting.value = true
  const ok = await remove(props.pin.id)
  deleting.value = false
  if (ok) emit('deleted', props.pin.id)
}
</script>

<template>
  <div class="flex h-full flex-col">
    <header class="flex items-start justify-between gap-3 border-b border-white/8 px-5 py-4">
      <div class="min-w-0 space-y-1">
        <h2 class="text-base leading-snug font-medium text-ink-050">
          {{ pin.title }}
        </h2>
        <p v-if="pin.place_label" class="flex items-center gap-1.5 text-xs text-ink-400">
          <Icon name="lucide:map-pin" class="size-3.5 shrink-0" />
          <span class="truncate">{{ pin.place_label }}</span>
        </p>
      </div>

      <button
        type="button"
        class="focus-ring grid size-8 shrink-0 place-items-center rounded-full text-ink-400 hover:bg-white/5 hover:text-ink-050"
        aria-label="Close"
        @click="emit('close')"
      >
        <Icon name="lucide:x" class="size-4" />
      </button>
    </header>

    <div class="flex-1 space-y-5 overflow-y-auto px-5 py-5">
      <SpotifyEmbed
        v-if="pin.spotify_id && pin.spotify_kind"
        :kind="pin.spotify_kind"
        :id="pin.spotify_id"
      />

      <PhotoGallery v-if="pin.photos?.length" :photos="pin.photos" />

      <p v-if="pin.note" class="text-sm leading-relaxed whitespace-pre-line text-ink-200">
        {{ pin.note }}
      </p>

      <div class="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/8 pt-4">
        <AuthorChip :author="pin.author" />
        <span class="flex items-center gap-1.5 text-xs text-ink-400">
          <Icon name="lucide:calendar" class="size-3.5" />
          {{ when }}
        </span>
      </div>
    </div>

    <footer v-if="canEdit" class="border-t border-white/8 px-5 py-4">
      <div v-if="!confirmingDelete" class="flex items-center gap-2">
        <button
          type="button"
          class="focus-ring flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-ink-200 hover:bg-white/5"
          @click="emit('edit', pin)"
        >
          <Icon name="lucide:pencil" class="size-4" />
          Edit
        </button>
        <button
          type="button"
          class="focus-ring grid size-10 place-items-center rounded-xl border border-white/10 text-ink-400 hover:bg-red-500/10 hover:text-red-300"
          aria-label="Delete this memory"
          @click="confirmingDelete = true"
        >
          <Icon name="lucide:trash-2" class="size-4" />
        </button>
      </div>

      <div v-else class="space-y-2.5">
        <p class="text-xs text-ink-200">
          Delete this memory for everyone? The photos go with it.
        </p>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="focus-ring flex-1 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-ink-200 hover:bg-white/5"
            @click="confirmingDelete = false"
          >
            Keep it
          </button>
          <button
            type="button"
            :disabled="deleting"
            class="focus-ring flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-500/90 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
            @click="confirmDelete"
          >
            <Icon v-if="deleting" name="lucide:loader-circle" class="size-4 animate-spin" />
            Delete
          </button>
        </div>
      </div>
    </footer>
  </div>
</template>
