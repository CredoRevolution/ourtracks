import type { Profile } from '~/types'

/**
 * Signing in and being let in are two different things.
 *
 * Anyone with a Google account can complete the login. Only the addresses on
 * the allowlist come back with is_member = true, and the database refuses to
 * show them a single pin otherwise. This composable is what the interface uses
 * to tell those two people apart.
 */
export function useMembership() {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()

  const profile = useState<Profile | null>('membership:profile', () => null)
  const checked = useState<boolean>('membership:checked', () => false)

  const isMember = computed(() => profile.value?.is_member === true)

  async function load(force = false) {
    if (!user.value) {
      profile.value = null
      checked.value = true
      return
    }

    if (checked.value && !force) return

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.value.id)
      .maybeSingle()

    profile.value = (data as unknown as Profile) ?? null
    checked.value = true
  }

  return { profile, isMember, checked, load }
}
