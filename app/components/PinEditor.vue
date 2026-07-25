<script setup lang="ts">
import type { Pin, PinDraft, PinPhoto, PlaceResult, SpotifyMeta } from '~/types'

const props = defineProps<{
  /** Null when creating, the existing pin when editing. */
  pin: Pin | null
  coords: { lat: number, lng: number } | null
}>()

const emit = defineEmits<{
  close: []
  saved: [pin: Pin]
  /** Ask the map to let the user click a new spot. */
  relocate: []
  moveTo: [coords: { lat: number, lng: number }]
}>()

const { create, update, refresh, error: pinsError } = usePins()
const { upload, removePhoto } = usePhotos()

const isEditing = computed(() => Boolean(props.pin))

const draft = reactive<PinDraft>({
  title: props.pin?.title ?? '',
  note: props.pin?.note ?? '',
  lat: props.pin?.lat ?? props.coords?.lat ?? 0,
  lng: props.pin?.lng ?? props.coords?.lng ?? 0,
  place_label: props.pin?.place_label ?? '',
  spotify_url: props.pin?.spotify_url ?? '',
  happened_on: props.pin?.happened_on ?? '',
})

// The map keeps moving the pin while the editor is open.
watch(
  () => props.coords,
  (coords) => {
    if (!coords) return
    draft.lat = coords.lat
    draft.lng = coords.lng
    lookUpPlaceName(coords)
  },
)

// ---------------------------------------------------------------- the song --

const spotify = reactive({
  state: 'idle' as 'idle' | 'loading' | 'ok' | 'error',
  meta: null as SpotifyMeta | null,
})

// Restore the preview for a pin that already has a track attached.
if (props.pin?.spotify_id && props.pin.spotify_kind) {
  spotify.state = 'ok'
  spotify.meta = {
    kind: props.pin.spotify_kind,
    id: props.pin.spotify_id,
    url: props.pin.spotify_url!,
    title: props.pin.spotify_title,
    thumb: props.pin.spotify_thumb,
  }
}

watchDebounced(
  () => draft.spotify_url,
  async (value) => {
    const link = value.trim()

    if (!link) {
      spotify.state = 'idle'
      spotify.meta = null
      return
    }

    spotify.state = 'loading'

    try {
      spotify.meta = await $fetch<SpotifyMeta>('/api/spotify', { query: { url: link } })
      spotify.state = 'ok'
      // A link with no title of its own borrows the track's.
      if (!draft.title.trim() && spotify.meta.title) draft.title = spotify.meta.title
    }
    catch {
      spotify.meta = null
      spotify.state = 'error'
    }
  },
  { debounce: 500 },
)

// --------------------------------------------------------------- the place --

const placeQuery = ref('')
const placeResults = ref<PlaceResult[]>([])
const searching = ref(false)

watchDebounced(
  placeQuery,
  async (value) => {
    if (value.trim().length < 3) {
      placeResults.value = []
      return
    }

    searching.value = true
    placeResults.value = await $fetch<PlaceResult[]>('/api/geocode', { query: { q: value } })
    searching.value = false
  },
  { debounce: 450 },
)

function choosePlace(place: PlaceResult) {
  draft.lat = place.lat
  draft.lng = place.lng
  draft.place_label = place.label
  placeQuery.value = ''
  placeResults.value = []
  emit('moveTo', { lat: place.lat, lng: place.lng })
}

async function lookUpPlaceName(coords: { lat: number, lng: number }) {
  // Never overwrite a name the person typed themselves.
  if (draft.place_label.trim()) return

  const { label } = await $fetch<{ label: string | null }>('/api/reverse-geocode', {
    query: coords,
  })

  if (label && !draft.place_label.trim()) draft.place_label = label
}

if (!isEditing.value && props.coords) lookUpPlaceName(props.coords)

// -------------------------------------------------------------- the photos --

const pendingFiles = ref<File[]>([])
const pendingPreviews = ref<string[]>([])
const existingPhotos = ref<PinPhoto[]>([...(props.pin?.photos ?? [])])

function addFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const chosen = Array.from(input.files ?? [])

  pendingFiles.value.push(...chosen)
  pendingPreviews.value.push(...chosen.map(file => URL.createObjectURL(file)))

  // Let the same file be picked again later if it is dropped from the list.
  input.value = ''
}

function dropPending(index: number) {
  URL.revokeObjectURL(pendingPreviews.value[index]!)
  pendingFiles.value.splice(index, 1)
  pendingPreviews.value.splice(index, 1)
}

async function dropExisting(photo: PinPhoto) {
  const ok = await removePhoto(photo)
  if (ok) existingPhotos.value = existingPhotos.value.filter(item => item.id !== photo.id)
}

onBeforeUnmount(() => {
  pendingPreviews.value.forEach(url => URL.revokeObjectURL(url))
})

// --------------------------------------------------------------- saving it --

const saving = ref(false)
const problem = ref<string | null>(null)

const canSave = computed(() => draft.title.trim().length > 0 && draft.lat !== 0 && !saving.value)

async function save() {
  if (!canSave.value) return

  saving.value = true
  problem.value = null

  const pin = props.pin
    ? await update(props.pin.id, draft)
    : await create(draft)

  if (!pin) {
    saving.value = false
    // Show what the database actually said. A generic "try again" hides the one
    // piece of information that would explain the failure.
    problem.value = pinsError.value ?? 'Could not save this one. Check the connection and try again.'
    return
  }

  if (pendingFiles.value.length) {
    await upload(pin.id, pendingFiles.value, existingPhotos.value.length)
    await refresh(pin.id)
  }

  saving.value = false
  emit('saved', pin)
}
</script>

<template>
  <div class="flex h-full flex-col">
    <header class="flex items-center justify-between border-b border-white/8 px-5 py-4">
      <h2 class="text-sm font-medium tracking-wide text-ink-050">
        {{ isEditing ? 'Edit memory' : 'New memory' }}
      </h2>
      <button
        type="button"
        class="focus-ring grid size-8 place-items-center rounded-full text-ink-400 hover:bg-white/5 hover:text-ink-050"
        aria-label="Close"
        @click="emit('close')"
      >
        <Icon name="lucide:x" class="size-4" />
      </button>
    </header>

    <div class="flex-1 space-y-6 overflow-y-auto px-5 py-5">
      <!-- Title -->
      <div class="space-y-2">
        <label for="pin-title" class="block text-xs font-medium tracking-wide text-ink-400 uppercase">
          Title
        </label>
        <input
          id="pin-title"
          v-model="draft.title"
          type="text"
          placeholder="The night we walked home"
          class="focus-ring w-full rounded-xl border border-white/10 bg-ink-850 px-3.5 py-2.5 text-sm text-ink-050 placeholder:text-ink-600"
        >
      </div>

      <!-- Song -->
      <div class="space-y-2">
        <label for="pin-song" class="block text-xs font-medium tracking-wide text-ink-400 uppercase">
          Spotify link
        </label>
        <div class="relative">
          <input
            id="pin-song"
            v-model="draft.spotify_url"
            type="url"
            inputmode="url"
            placeholder="https://open.spotify.com/track/..."
            class="focus-ring w-full rounded-xl border border-white/10 bg-ink-850 py-2.5 pr-10 pl-3.5 text-sm text-ink-050 placeholder:text-ink-600"
          >
          <span class="absolute top-1/2 right-3 -translate-y-1/2">
            <Icon
              v-if="spotify.state === 'loading'"
              name="lucide:loader-circle"
              class="size-4 animate-spin text-ink-400"
            />
            <Icon
              v-else-if="spotify.state === 'ok'"
              name="lucide:check"
              class="size-4 text-amber-glow"
            />
            <Icon
              v-else-if="spotify.state === 'error'"
              name="lucide:triangle-alert"
              class="size-4 text-red-400"
            />
          </span>
        </div>

        <p v-if="spotify.state === 'error'" class="text-xs text-red-400">
          That link did not resolve. Copy it from Spotify with Share &rarr; Copy link.
        </p>

        <div
          v-else-if="spotify.state === 'ok' && spotify.meta"
          class="flex items-center gap-3 rounded-xl border border-white/8 bg-ink-850 p-2.5"
        >
          <img
            v-if="spotify.meta.thumb"
            :src="spotify.meta.thumb"
            alt=""
            class="size-11 rounded-lg object-cover"
          >
          <div class="min-w-0">
            <p class="truncate text-sm text-ink-050">
              {{ spotify.meta.title ?? 'Attached' }}
            </p>
            <p class="text-xs text-ink-400 capitalize">
              {{ spotify.meta.kind }}
            </p>
          </div>
        </div>
      </div>

      <!-- Place -->
      <div class="space-y-2">
        <label for="pin-place" class="block text-xs font-medium tracking-wide text-ink-400 uppercase">
          Place
        </label>
        <input
          id="pin-place"
          v-model="draft.place_label"
          type="text"
          placeholder="Where this happened"
          class="focus-ring w-full rounded-xl border border-white/10 bg-ink-850 px-3.5 py-2.5 text-sm text-ink-050 placeholder:text-ink-600"
        >

        <div class="relative">
          <input
            v-model="placeQuery"
            type="search"
            placeholder="Search the map for an address..."
            class="focus-ring w-full rounded-xl border border-white/10 bg-ink-850 px-3.5 py-2 text-xs text-ink-200 placeholder:text-ink-600"
          >
          <ul
            v-if="placeResults.length"
            class="absolute z-20 mt-1.5 max-h-56 w-full overflow-y-auto rounded-xl border border-white/10 bg-ink-800 p-1 shadow-2xl"
          >
            <li v-for="place in placeResults" :key="`${place.lat},${place.lng}`">
              <button
                type="button"
                class="focus-ring w-full rounded-lg px-3 py-2 text-left text-xs text-ink-200 hover:bg-white/6"
                @click="choosePlace(place)"
              >
                {{ place.label }}
              </button>
            </li>
          </ul>
        </div>

        <div class="flex items-center justify-between gap-3 pt-0.5">
          <p class="font-mono text-[11px] text-ink-400">
            {{ draft.lat.toFixed(5) }}, {{ draft.lng.toFixed(5) }}
          </p>
          <button
            type="button"
            class="focus-ring inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] text-ink-200 hover:bg-white/6"
            @click="emit('relocate')"
          >
            <Icon name="lucide:move" class="size-3.5" />
            Pick on the map
          </button>
        </div>
      </div>

      <!-- Story -->
      <div class="space-y-2">
        <label for="pin-note" class="block text-xs font-medium tracking-wide text-ink-400 uppercase">
          What happened
        </label>
        <textarea
          id="pin-note"
          v-model="draft.note"
          rows="4"
          placeholder="Anything you want to remember about this."
          class="focus-ring w-full resize-y rounded-xl border border-white/10 bg-ink-850 px-3.5 py-2.5 text-sm leading-relaxed text-ink-050 placeholder:text-ink-600"
        />
      </div>

      <!-- When -->
      <div class="space-y-2">
        <label for="pin-date" class="block text-xs font-medium tracking-wide text-ink-400 uppercase">
          When
        </label>
        <input
          id="pin-date"
          v-model="draft.happened_on"
          type="date"
          class="focus-ring w-full rounded-xl border border-white/10 bg-ink-850 px-3.5 py-2.5 text-sm text-ink-050 [color-scheme:dark]"
        >
      </div>

      <!-- Photos -->
      <div class="space-y-2">
        <span class="block text-xs font-medium tracking-wide text-ink-400 uppercase">Photos</span>

        <div class="grid grid-cols-4 gap-1.5">
          <div
            v-for="photo in existingPhotos"
            :key="photo.id"
            class="group relative aspect-square overflow-hidden rounded-lg bg-ink-800"
          >
            <img :src="photo.url" alt="" class="size-full object-cover">
            <button
              type="button"
              class="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-ink-950/80 text-ink-200 opacity-0 transition group-hover:opacity-100 hover:text-white"
              aria-label="Remove photo"
              @click="dropExisting(photo)"
            >
              <Icon name="lucide:trash-2" class="size-3" />
            </button>
          </div>

          <div
            v-for="(preview, index) in pendingPreviews"
            :key="preview"
            class="group relative aspect-square overflow-hidden rounded-lg bg-ink-800 ring-1 ring-amber-glow/40"
          >
            <img :src="preview" alt="" class="size-full object-cover">
            <button
              type="button"
              class="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-ink-950/80 text-ink-200 opacity-0 transition group-hover:opacity-100 hover:text-white"
              aria-label="Remove photo"
              @click="dropPending(index)"
            >
              <Icon name="lucide:x" class="size-3" />
            </button>
          </div>

          <label
            class="focus-ring grid aspect-square cursor-pointer place-items-center rounded-lg border border-dashed border-white/15 text-ink-400 transition hover:border-amber-glow/50 hover:text-amber-glow"
          >
            <Icon name="lucide:image-plus" class="size-5" />
            <input type="file" accept="image/*" multiple class="sr-only" @change="addFiles">
          </label>
        </div>
      </div>

      <p v-if="problem" class="rounded-xl bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300">
        {{ problem }}
      </p>
    </div>

    <footer class="flex items-center gap-2 border-t border-white/8 px-5 py-4">
      <button
        type="button"
        class="focus-ring flex-1 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-ink-200 hover:bg-white/5"
        @click="emit('close')"
      >
        Cancel
      </button>
      <button
        type="button"
        :disabled="!canSave"
        class="focus-ring flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-glow px-4 py-2.5 text-sm font-medium text-ink-950 transition hover:bg-amber-glow/90 disabled:cursor-not-allowed disabled:opacity-40"
        @click="save"
      >
        <Icon v-if="saving" name="lucide:loader-circle" class="size-4 animate-spin" />
        {{ saving ? 'Saving' : 'Save' }}
      </button>
    </footer>
  </div>
</template>
