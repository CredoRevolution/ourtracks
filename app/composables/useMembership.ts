import type { Profile } from '~/types'

/**
 * Signing in and being let in are two different things.
 *
 * Anyone with a Google account can complete the login. Only the addresses on
 * the allowlist come back with is_member = true, and the database refuses to
 * show them a single pin otherwise. This composable is what the interface uses
 * to tell those two people apart.
 *
 * Three outcomes, not two: a member, a stranger, and "the check itself failed".
 * Collapsing the third into the second is how you end up telling an invited
 * person they were never invited.
 */
export function useMembership() {
  const supabase = useSupabaseClient()

  const profile = useState<Profile | null>('membership:profile', () => null)
  const checked = useState<boolean>('membership:checked', () => false)
  const failure = useState<string | null>('membership:failure', () => null)

  const isMember = computed(() => profile.value?.is_member === true)

  async function load(force = false) {
    // Wait for the *session*, not the user.
    //
    // The user object is rehydrated from the cookie while the page renders, so
    // it shows up almost immediately. The access token the browser client signs
    // requests with arrives a beat later. Query in that gap and it goes out
    // anonymously: row level security quite correctly returns nothing, with no
    // error, and the interface concludes the person is a stranger. getSession()
    // resolves only once the client has its token, which closes that gap.
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      profile.value = null
      checked.value = false
      failure.value = null
      return
    }

    if (checked.value && !force) return

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle()

    if (error) {
      profile.value = null
      failure.value = `${error.message}${error.code ? ` (${error.code})` : ''}`
      checked.value = true
      return
    }

    // A signed-in user with no profile row at all is its own kind of broken:
    // the sign-up trigger is supposed to create one. Say so rather than
    // pretending we know they are a stranger.
    if (!data) {
      profile.value = null
      failure.value = 'No profile row for this account.'
      checked.value = true
      return
    }

    profile.value = data as unknown as Profile
    failure.value = null
    checked.value = true
  }

  return { profile, isMember, checked, failure, load }
}
