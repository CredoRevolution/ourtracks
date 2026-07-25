<script setup lang="ts">
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Pin, Profile } from '~/types'

const user = useSupabaseUser()
const supabase = useSupabaseClient()
const { pins, loading, load, subscribe } = usePins()
const { isMember, checked, failure, load: loadMembership } = useMembership()

const rechecking = ref(false)

/** Set when the map cannot draw at all — the grey-rectangle case. */
const mapFailure = ref<string | null>(null)

function reloadPage() {
  window.location.reload()
}

const mapRef = useTemplateRef<{
  focus: (pin: Pin, options?: { zoom?: number }) => void
  flyTo: (coords: { lat: number, lng: number }, zoom?: number) => void
  frameAll: () => void
}>('map')

let channel: RealtimeChannel | null = null

/** Check membership, and if we are in, fill the map and start listening. */
async function hydrate() {
  await loadMembership(true)
  if (!isMember.value) return

  if (!pins.value.length) await load()
  if (!channel) channel = subscribe()
}

async function recheck() {
  rechecking.value = true
  await hydrate()
  rechecking.value = false
}

let stopAuthListener: (() => void) | null = null

// onAuthStateChange fires once the browser client has finished restoring the
// session — the moment our queries can actually carry a token — and again on
// every sign-in and token refresh. That is the signal to (re)check, not the
// user object, which is already there from the cookie.
onMounted(() => {
  const { data } = supabase.auth.onAuthStateChange(() => {
    void hydrate()
  })

  stopAuthListener = () => data.subscription.unsubscribe()
  void hydrate()
})

onBeforeUnmount(() => {
  stopAuthListener?.()
  if (channel) supabase.removeChannel(channel)
})

// ------------------------------------------------------------- filtering ---

const query = ref('')
const mutedAuthors = ref(new Set<string>())

const authors = computed<Pick<Profile, 'id' | 'display_name' | 'avatar_url'>[]>(() => {
  const found = new Map<string, Pick<Profile, 'id' | 'display_name' | 'avatar_url'>>()
  for (const pin of pins.value) {
    if (pin.author && !found.has(pin.author.id)) found.set(pin.author.id, pin.author)
  }
  return [...found.values()]
})

const visiblePins = computed(() => {
  const needle = query.value.trim().toLowerCase()

  return pins.value.filter((pin) => {
    if (mutedAuthors.value.has(pin.author_id)) return false
    if (!needle) return true

    return [pin.title, pin.place_label, pin.note, pin.spotify_title]
      .filter(Boolean)
      .some(field => field!.toLowerCase().includes(needle))
  })
})

function toggleAuthor(id: string) {
  const next = new Set(mutedAuthors.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  mutedAuthors.value = next
}

// ------------------------------------------------------- panels and modes ---

type Panel = { kind: 'none' } | { kind: 'detail', pin: Pin } | { kind: 'editor', pin: Pin | null }

const panel = ref<Panel>({ kind: 'none' })
const placing = ref(false)
const draftCoords = ref<{ lat: number, lng: number } | null>(null)

const activeId = computed(() => (panel.value.kind === 'detail' ? panel.value.pin.id : null))

/** While picking a spot the editor gets out of the way, then comes back. */
const panelVisible = computed(() => panel.value.kind !== 'none' && !placing.value)

function startAdding() {
  panel.value = { kind: 'none' }
  draftCoords.value = null
  placing.value = true
}

function onPlace(coords: { lat: number, lng: number }) {
  draftCoords.value = coords
  placing.value = false

  // Picking a new spot for a pin that is already being edited keeps the editor.
  if (panel.value.kind !== 'editor') panel.value = { kind: 'editor', pin: null }
}

function openPin(pin: Pin) {
  draftCoords.value = null
  panel.value = { kind: 'detail', pin }
  nextTick(() => mapRef.value?.focus(pin))
}

function editPin(pin: Pin) {
  draftCoords.value = { lat: pin.lat, lng: pin.lng }
  panel.value = { kind: 'editor', pin }
}

function closePanel() {
  panel.value = { kind: 'none' }
  draftCoords.value = null
  placing.value = false
}

function onSaved(pin: Pin) {
  draftCoords.value = null
  panel.value = { kind: 'detail', pin }
  nextTick(() => mapRef.value?.focus(pin))
}

function onDeleted() {
  closePanel()
}

// Keep the detail panel pointing at fresh data when a pin changes underneath it.
watch(pins, (list) => {
  if (panel.value.kind !== 'detail') return
  const fresh = list.find(pin => pin.id === (panel.value as { pin: Pin }).pin.id)
  if (fresh) panel.value = { kind: 'detail', pin: fresh }
  else closePanel()
})

onKeyStroke('Escape', () => {
  if (placing.value) placing.value = false
  else closePanel()
})
</script>

<template>
  <main class="relative h-dvh w-full overflow-hidden">
    <!-- Waiting room: signed in, not on the allowlist -->
    <div
      v-if="checked && !isMember"
      class="grid h-full place-items-center px-6 text-center"
    >
      <div class="max-w-sm space-y-4">
        <Icon
          :name="failure ? 'lucide:triangle-alert' : 'lucide:lock'"
          class="mx-auto size-8"
          :class="failure ? 'text-red-400' : 'text-ink-400'"
        />

        <h1 class="text-lg font-medium text-ink-050">
          {{ failure ? 'Could not check your access' : 'This map is a small one' }}
        </h1>

        <p v-if="failure" class="text-sm leading-relaxed text-ink-400">
          Signed in as <span class="text-ink-200">{{ user?.email }}</span>, but the membership
          check itself failed — this is not a "you are not invited" message.
        </p>
        <p v-else class="text-sm leading-relaxed text-ink-400">
          You are signed in as <span class="text-ink-200">{{ user?.email }}</span>, but this address
          is not part of the circle yet. Ask Alex to add you and reload the page.
        </p>

        <p
          v-if="failure"
          class="rounded-xl bg-red-500/10 px-3.5 py-2.5 text-left font-mono text-xs break-words text-red-300"
        >
          {{ failure }}
        </p>

        <div class="flex items-center justify-center gap-2">
          <button
            type="button"
            :disabled="rechecking"
            class="focus-ring inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-ink-200 hover:bg-white/5 disabled:opacity-50"
            @click="recheck"
          >
            <Icon v-if="rechecking" name="lucide:loader-circle" class="size-4 animate-spin" />
            Check again
          </button>
          <button
            type="button"
            class="focus-ring rounded-xl border border-white/10 px-4 py-2 text-sm text-ink-200 hover:bg-white/5"
            @click="supabase.auth.signOut().then(() => navigateTo('/login'))"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>

    <template v-else-if="checked">
      <ClientOnly>
        <TheMap
          ref="map"
          :pins="visiblePins"
          :active-id="activeId"
          :mode="placing ? 'place' : 'browse'"
          :draft-at="draftCoords"
          @select="openPin"
          @place="onPlace"
          @failed="mapFailure = $event"
          @ready="mapFailure = null"
        />
        <template #fallback>
          <div class="grid h-full place-items-center">
            <Icon name="lucide:loader-circle" class="size-5 animate-spin text-ink-600" />
          </div>
        </template>
      </ClientOnly>

      <TopBar
        v-model:query="query"
        :authors="authors"
        :muted-authors="mutedAuthors"
        :count="visiblePins.length"
        @toggle-author="toggleAuthor"
        @frame-all="mapRef?.frameAll()"
      />

      <!-- The map itself could not draw -->
      <div
        v-if="mapFailure"
        class="absolute inset-0 z-50 grid place-items-center bg-ink-950 px-6"
      >
        <div class="max-w-md space-y-4 text-center">
          <Icon name="lucide:map-pin-off" class="mx-auto size-8 text-red-400" />
          <h2 class="text-lg font-medium text-ink-050">
            The map cannot be drawn here
          </h2>
          <p class="text-sm leading-relaxed text-ink-400">
            Your memories are safe — this is the drawing surface failing, not the data.
          </p>
          <p
            class="rounded-xl bg-red-500/10 px-4 py-3 text-left font-mono text-xs leading-relaxed whitespace-pre-line text-red-300"
          >{{ mapFailure }}</p>
          <button
            type="button"
            class="focus-ring rounded-xl border border-white/10 px-4 py-2 text-sm text-ink-200 hover:bg-white/5"
            @click="reloadPage"
          >
            Reload
          </button>
        </div>
      </div>

      <!-- Placing hint -->
      <Transition name="rise">
        <div
          v-if="placing"
          class="pointer-events-none absolute inset-x-0 top-20 z-30 flex justify-center px-4"
        >
          <p class="glass flex items-center gap-2 rounded-full px-4 py-2.5 text-sm text-ink-050 shadow-2xl">
            <Icon name="lucide:mouse-pointer-click" class="size-4 text-amber-glow" />
            Click the map where this memory belongs
            <button
              type="button"
              class="pointer-events-auto ml-1 rounded-full px-2 py-0.5 text-xs text-ink-400 hover:text-ink-050"
              @click="placing = false"
            >
              Cancel
            </button>
          </p>
        </div>
      </Transition>

      <!-- Empty state -->
      <div
        v-if="!loading && pins.length === 0 && !placing"
        class="pointer-events-none absolute inset-0 z-20 grid place-items-center px-6"
      >
        <div class="glass pointer-events-auto max-w-sm space-y-3 rounded-panel p-6 text-center shadow-2xl">
          <Icon name="lucide:map-pinned" class="mx-auto size-7 text-amber-glow" />
          <h2 class="text-base font-medium text-ink-050">
            Nothing here yet
          </h2>
          <p class="text-sm leading-relaxed text-ink-400">
            Pick a place that means something, attach the song that goes with it, and it stays here
            for good.
          </p>
          <button
            type="button"
            class="focus-ring rounded-xl bg-amber-glow px-4 py-2 text-sm font-medium text-ink-950 hover:bg-amber-glow/90"
            @click="startAdding"
          >
            Drop the first one
          </button>
        </div>
      </div>

      <!-- Side panel: detail or editor -->
      <Transition name="panel">
        <aside
          v-if="panelVisible"
          class="glass absolute z-40 flex flex-col shadow-2xl inset-x-0 bottom-0 max-h-[82dvh] rounded-t-panel lg:inset-y-4 lg:right-4 lg:left-auto lg:max-h-none lg:w-[400px] lg:rounded-panel"
        >
          <PinPanel
            v-if="panel.kind === 'detail'"
            :pin="panel.pin"
            :can-edit="panel.pin.author_id === user?.id"
            @close="closePanel"
            @edit="editPin"
            @deleted="onDeleted"
          />
          <PinEditor
            v-else-if="panel.kind === 'editor'"
            :key="panel.pin?.id ?? 'new'"
            :pin="panel.pin"
            :coords="draftCoords"
            @close="closePanel"
            @saved="onSaved"
            @relocate="placing = true"
            @move-to="coords => mapRef?.flyTo(coords)"
          />
        </aside>
      </Transition>

      <!-- Add button -->
      <Transition name="rise">
        <button
          v-if="!placing && panel.kind === 'none' && pins.length > 0"
          type="button"
          class="focus-ring absolute bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-amber-glow px-5 py-3 text-sm font-medium text-ink-950 shadow-[0_10px_40px_-8px_rgba(240,180,41,0.6)] transition hover:scale-[1.03] hover:bg-amber-glow/90 lg:left-auto lg:translate-x-0 lg:right-6"
          @click="startAdding"
        >
          <Icon name="lucide:plus" class="size-4" />
          Add a memory
        </button>
      </Transition>
    </template>

    <!-- First paint, before we know who this is -->
    <div v-else class="grid h-full place-items-center">
      <Icon name="lucide:loader-circle" class="size-5 animate-spin text-ink-600" />
    </div>
  </main>
</template>

<style scoped>
.panel-enter-active,
.panel-leave-active {
  transition:
    opacity 0.24s ease,
    transform 0.24s cubic-bezier(0.16, 1, 0.3, 1);
}

.panel-enter-from,
.panel-leave-to {
  opacity: 0;
  transform: translateY(16px);
}

@media (min-width: 1024px) {
  .panel-enter-from,
  .panel-leave-to {
    transform: translateX(24px);
  }
}

.rise-enter-active,
.rise-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.rise-enter-from,
.rise-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
