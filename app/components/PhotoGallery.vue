<script setup lang="ts">
import type { PinPhoto } from '~/types'

const props = defineProps<{ photos: PinPhoto[] }>()

const openIndex = ref<number | null>(null)

const visible = computed(() => props.photos.filter(photo => photo.url))
const current = computed(() => (openIndex.value === null ? null : visible.value[openIndex.value]))

function open(index: number) {
  openIndex.value = index
}

function step(direction: 1 | -1) {
  if (openIndex.value === null || visible.value.length === 0) return
  const next = (openIndex.value + direction + visible.value.length) % visible.value.length
  openIndex.value = next
}

onKeyStroke('Escape', () => {
  openIndex.value = null
})
onKeyStroke('ArrowRight', () => step(1))
onKeyStroke('ArrowLeft', () => step(-1))
</script>

<template>
  <div v-if="visible.length" class="space-y-2">
    <!-- One photo gets the full width; several share a grid -->
    <div :class="visible.length === 1 ? '' : 'grid grid-cols-3 gap-1.5'">
      <button
        v-for="(photo, index) in visible"
        :key="photo.id"
        type="button"
        class="focus-ring group relative overflow-hidden rounded-xl bg-ink-800"
        :class="visible.length === 1 ? 'aspect-4/3 w-full' : 'aspect-square'"
        @click="open(index)"
      >
        <img
          :src="photo.url"
          alt=""
          loading="lazy"
          class="size-full object-cover transition duration-300 group-hover:scale-[1.04]"
        >
      </button>
    </div>

    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="current"
          class="fixed inset-0 z-100 grid place-items-center bg-ink-950/95 p-4 backdrop-blur-sm"
          @click="openIndex = null"
        >
          <img
            :src="current.url"
            alt=""
            class="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
            @click.stop
          >

          <button
            type="button"
            class="focus-ring absolute top-4 right-4 grid size-10 place-items-center rounded-full glass text-ink-200 hover:text-white"
            aria-label="Close"
            @click="openIndex = null"
          >
            <Icon name="lucide:x" class="size-5" />
          </button>

          <template v-if="visible.length > 1">
            <button
              type="button"
              class="focus-ring absolute left-4 grid size-10 place-items-center rounded-full glass text-ink-200 hover:text-white"
              aria-label="Previous photo"
              @click.stop="step(-1)"
            >
              <Icon name="lucide:chevron-left" class="size-5" />
            </button>
            <button
              type="button"
              class="focus-ring absolute right-4 grid size-10 place-items-center rounded-full glass text-ink-200 hover:text-white"
              aria-label="Next photo"
              @click.stop="step(1)"
            >
              <Icon name="lucide:chevron-right" class="size-5" />
            </button>
          </template>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
