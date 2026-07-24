<script setup lang="ts">
const supabase = useSupabaseClient()
const user = useSupabaseUser()

const busy = ref<'google' | 'github' | null>(null)
const problem = ref<string | null>(null)

// Someone who is already signed in has no business on this page.
watchEffect(() => {
  if (user.value) navigateTo('/')
})

async function signIn(provider: 'google' | 'github') {
  busy.value = provider
  problem.value = null

  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${window.location.origin}/confirm` },
  })

  if (error) {
    busy.value = null
    problem.value = error.message
  }
}
</script>

<template>
  <main class="relative grid h-dvh place-items-center overflow-hidden px-6">
    <!-- A quiet suggestion of a map behind the card -->
    <div
      class="pointer-events-none absolute inset-0 opacity-60"
      style="
        background:
          radial-gradient(900px 500px at 20% 15%, rgba(240, 180, 41, 0.08), transparent 60%),
          radial-gradient(700px 500px at 85% 80%, rgba(56, 120, 220, 0.1), transparent 60%);
      "
    />

    <div class="relative w-full max-w-sm animate-rise space-y-8">
      <div class="space-y-3 text-center">
        <Icon name="lucide:audio-waveform" class="mx-auto size-8 text-amber-glow" />
        <h1 class="text-2xl font-medium tracking-tight text-ink-050">
          ourtracks
        </h1>
        <p class="text-sm leading-relaxed text-ink-400">
          A map of the places that meant something, and the songs that were playing there.
        </p>
      </div>

      <div class="space-y-2.5">
        <button
          type="button"
          :disabled="busy !== null"
          class="focus-ring flex w-full items-center justify-center gap-3 rounded-xl bg-ink-050 px-4 py-3 text-sm font-medium text-ink-950 transition hover:bg-white disabled:opacity-60"
          @click="signIn('google')"
        >
          <Icon
            :name="busy === 'google' ? 'lucide:loader-circle' : 'lucide:chrome'"
            class="size-4"
            :class="{ 'animate-spin': busy === 'google' }"
          />
          Continue with Google
        </button>

        <button
          type="button"
          :disabled="busy !== null"
          class="focus-ring flex w-full items-center justify-center gap-3 rounded-xl border border-white/12 bg-ink-850 px-4 py-3 text-sm text-ink-050 transition hover:bg-ink-800 disabled:opacity-60"
          @click="signIn('github')"
        >
          <Icon
            :name="busy === 'github' ? 'lucide:loader-circle' : 'lucide:github'"
            class="size-4"
            :class="{ 'animate-spin': busy === 'github' }"
          />
          Continue with GitHub
        </button>
      </div>

      <p v-if="problem" class="rounded-xl bg-red-500/10 px-4 py-3 text-center text-xs text-red-300">
        {{ problem }}
      </p>

      <p class="text-center text-xs leading-relaxed text-ink-600">
        Invite only. Signing in with an address that has not been invited will not show you anything.
      </p>
    </div>
  </main>
</template>
