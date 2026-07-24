<script setup lang="ts">
import type { Pin, Profile } from '~/types'

type Author = Pick<Profile, 'id' | 'display_name' | 'avatar_url'>

defineProps<{
  authors: Author[]
  /** Empty set means "show everyone" — the same thing, but nicer to look at. */
  mutedAuthors: Set<string>
  count: number
}>()

const emit = defineEmits<{
  toggleAuthor: [id: string]
  frameAll: []
}>()

const query = defineModel<string>('query', { default: '' })

const supabase = useSupabaseClient()
const user = useSupabaseUser()

const menuOpen = ref(false)
const menu = useTemplateRef<HTMLDivElement>('menu')

onClickOutside(menu, () => {
  menuOpen.value = false
})

const me = computed(() => ({
  name: (user.value?.user_metadata?.full_name as string | undefined) ?? user.value?.email ?? '',
  avatar: (user.value?.user_metadata?.avatar_url as string | undefined) ?? null,
}))

async function signOut() {
  await supabase.auth.signOut()
  await navigateTo('/login')
}
</script>

<template>
  <header class="pointer-events-none absolute inset-x-0 top-0 z-30 p-3 sm:p-4">
    <div class="pointer-events-auto mx-auto flex max-w-5xl items-center gap-2 sm:gap-3">
      <!-- Brand -->
      <button
        type="button"
        class="focus-ring glass flex h-11 shrink-0 items-center gap-2 rounded-full px-4 transition hover:bg-white/5"
        title="Fit every pin on screen"
        @click="emit('frameAll')"
      >
        <Icon name="lucide:audio-waveform" class="size-4 text-amber-glow" />
        <span class="text-sm font-medium tracking-tight text-ink-050">ourtracks</span>
        <span class="hidden text-xs text-ink-400 tabular-nums sm:inline">{{ count }}</span>
      </button>

      <!-- Search -->
      <div class="glass relative flex h-11 min-w-0 flex-1 items-center rounded-full px-4">
        <Icon name="lucide:search" class="size-4 shrink-0 text-ink-400" />
        <input
          v-model="query"
          type="search"
          placeholder="Search a memory, a place, a song"
          class="focus-ring w-full bg-transparent px-3 text-sm text-ink-050 placeholder:text-ink-600 focus:outline-none"
        >
      </div>

      <!-- Who is on the map -->
      <div v-if="authors.length > 1" class="glass hidden h-11 items-center gap-1 rounded-full px-2 md:flex">
        <button
          v-for="author in authors"
          :key="author.id"
          type="button"
          class="focus-ring grid size-8 place-items-center rounded-full transition"
          :class="mutedAuthors.has(author.id) ? 'opacity-30 grayscale' : 'opacity-100'"
          :title="author.display_name ?? 'Someone'"
          @click="emit('toggleAuthor', author.id)"
        >
          <img
            v-if="author.avatar_url"
            :src="author.avatar_url"
            alt=""
            class="size-7 rounded-full object-cover ring-1 ring-white/15"
            referrerpolicy="no-referrer"
          >
          <span
            v-else
            class="grid size-7 place-items-center rounded-full bg-ink-700 text-[11px] text-ink-200"
          >
            {{ (author.display_name ?? '?').charAt(0).toUpperCase() }}
          </span>
        </button>
      </div>

      <!-- Me -->
      <div ref="menu" class="relative shrink-0">
        <button
          type="button"
          class="focus-ring glass grid size-11 place-items-center rounded-full transition hover:bg-white/5"
          aria-label="Account"
          @click="menuOpen = !menuOpen"
        >
          <img
            v-if="me.avatar"
            :src="me.avatar"
            alt=""
            class="size-8 rounded-full object-cover"
            referrerpolicy="no-referrer"
          >
          <Icon v-else name="lucide:user" class="size-4 text-ink-200" />
        </button>

        <Transition name="menu">
          <div
            v-if="menuOpen"
            class="glass absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl p-1.5 shadow-2xl"
          >
            <p class="truncate px-3 py-2 text-xs text-ink-400">
              {{ me.name }}
            </p>
            <button
              type="button"
              class="focus-ring flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-ink-200 hover:bg-white/6"
              @click="signOut"
            >
              <Icon name="lucide:log-out" class="size-4" />
              Sign out
            </button>
          </div>
        </Transition>
      </div>
    </div>
  </header>
</template>

<style scoped>
.menu-enter-active,
.menu-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}

.menu-enter-from,
.menu-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.97);
}
</style>
