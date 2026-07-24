<script setup lang="ts">
/**
 * Where the OAuth provider drops people back off. The Supabase module has
 * already exchanged the code for a session by the time this renders, so all
 * that is left is to wait for the user object and step aside.
 */
const user = useSupabaseUser()

watchEffect(() => {
  if (user.value) navigateTo('/', { replace: true })
})
</script>

<template>
  <main class="grid h-dvh place-items-center">
    <div class="flex items-center gap-3 text-sm text-ink-400">
      <Icon name="lucide:loader-circle" class="size-4 animate-spin" />
      Signing you in
    </div>
  </main>
</template>
