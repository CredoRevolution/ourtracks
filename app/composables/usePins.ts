import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Pin, PinDraft, PinPhoto } from '~/types'

/**
 * Everything the map knows about pins: loading them, keeping them in sync with
 * what other people are doing, and writing changes back.
 *
 * State lives in useState so the map, the sidebar and the editor all read from
 * one array instead of three copies drifting apart.
 */

const PIN_SELECT = `
  *,
  author:profiles!pins_author_id_fkey ( id, display_name, avatar_url ),
  photos:pin_photos ( id, pin_id, storage_path, sort_order, created_at )
` as const

export function usePins() {
  const supabase = useSupabaseClient()
  const { signPaths, removeStoredPhotos } = usePhotos()

  const pins = useState<Pin[]>('pins', () => [])
  const loading = useState<boolean>('pins:loading', () => false)
  const error = useState<string | null>('pins:error', () => null)

  async function load() {
    loading.value = true
    error.value = null

    await supabase.auth.getSession()

    const { data, error: queryError } = await supabase
      .from('pins')
      .select(PIN_SELECT)
      .order('created_at', { ascending: false })

    loading.value = false

    if (queryError) {
      error.value = queryError.message
      return
    }

    pins.value = await withPhotoUrls((data ?? []) as unknown as Pin[])
  }

  async function create(draft: PinDraft): Promise<Pin | null> {
    // Ask for the session rather than the user object. Both name the same
    // person, but awaiting the session also guarantees the client has its
    // access token attached — without it the insert goes out anonymously and
    // row level security refuses it, which reads as a permissions bug rather
    // than the timing one it is.
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      error.value = 'You are not signed in any more. Reload the page and sign in again.'
      return null
    }

    const { data, error: insertError } = await supabase
      .from('pins')
      .insert({ ...(await toRow(draft)), author_id: session.user.id })
      .select(PIN_SELECT)
      .single()

    if (insertError) {
      error.value = insertError.message
      return null
    }

    const pin = (await withPhotoUrls([data as unknown as Pin]))[0]!
    upsertLocal(pin)
    return pin
  }

  async function update(id: string, draft: PinDraft): Promise<Pin | null> {
    // Same reason as in create(): make sure the token is on the request.
    await supabase.auth.getSession()

    const { data, error: updateError } = await supabase
      .from('pins')
      .update(await toRow(draft))
      .eq('id', id)
      .select(PIN_SELECT)
      .single()

    if (updateError) {
      error.value = updateError.message
      return null
    }

    const pin = (await withPhotoUrls([data as unknown as Pin]))[0]!
    upsertLocal(pin)
    return pin
  }

  async function remove(id: string): Promise<boolean> {
    // Deleting the pin cascades to its photo rows, but Storage keeps the files
    // themselves until we say otherwise — so grab the paths before they vanish.
    const target = pins.value.find(pin => pin.id === id)

    await supabase.auth.getSession()

    const { error: deleteError } = await supabase.from('pins').delete().eq('id', id)

    if (deleteError) {
      error.value = deleteError.message
      return false
    }

    if (target?.photos?.length) {
      await removeStoredPhotos(target.photos.map(photo => photo.storage_path))
    }

    pins.value = pins.value.filter(pin => pin.id !== id)
    return true
  }

  /** Re-read one pin from the server, e.g. after photos were attached to it. */
  async function refresh(id: string) {
    const { data } = await supabase.from('pins').select(PIN_SELECT).eq('id', id).maybeSingle()
    if (!data) return
    upsertLocal((await withPhotoUrls([data as unknown as Pin]))[0]!)
  }

  /**
   * Live updates. The payload from Postgres holds raw columns only — no author,
   * no photos — so we re-read the row properly instead of trusting it.
   */
  function subscribe(): RealtimeChannel {
    return supabase
      .channel('pins-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pins' },
        async (payload) => {
          if (payload.eventType === 'DELETE') {
            pins.value = pins.value.filter(pin => pin.id !== (payload.old as Pin).id)
            return
          }
          await refresh((payload.new as Pin).id)
        },
      )
      .subscribe()
  }

  function upsertLocal(pin: Pin) {
    const index = pins.value.findIndex(existing => existing.id === pin.id)
    if (index === -1) pins.value = [pin, ...pins.value]
    else pins.value[index] = pin
  }

  /** Swap stored paths for short-lived signed links, in one round trip for all pins. */
  async function withPhotoUrls(list: Pin[]): Promise<Pin[]> {
    const paths = list.flatMap(pin => pin.photos?.map(photo => photo.storage_path) ?? [])
    if (!paths.length) return list.map(pin => ({ ...pin, photos: sortPhotos(pin.photos) }))

    const signed = await signPaths(paths)

    return list.map(pin => ({
      ...pin,
      photos: sortPhotos(pin.photos).map(photo => ({
        ...photo,
        url: signed.get(photo.storage_path),
      })),
    }))
  }

  return { pins, loading, error, load, create, update, remove, refresh, subscribe }
}

function sortPhotos(photos: PinPhoto[] | undefined): PinPhoto[] {
  return [...(photos ?? [])].sort((a, b) => a.sort_order - b.sort_order)
}

/**
 * Turn a form draft into a database row.
 *
 * Empty strings in a form mean "not set", which in the database means null.
 * The Spotify link is resolved here rather than in the editor, so a pin can
 * never end up with a link but no cover art — whatever path it was saved from.
 */
async function toRow(draft: PinDraft) {
  const spotifyUrl = blankToNull(draft.spotify_url)
  const meta = spotifyUrl ? await resolveSpotify(spotifyUrl) : null

  return {
    title: draft.title.trim(),
    note: blankToNull(draft.note),
    lat: draft.lat,
    lng: draft.lng,
    place_label: blankToNull(draft.place_label),
    happened_on: blankToNull(draft.happened_on),

    spotify_url: meta?.url ?? spotifyUrl,
    spotify_id: meta?.id ?? null,
    spotify_kind: meta?.kind ?? null,
    spotify_title: meta?.title ?? null,
    spotify_thumb: meta?.thumb ?? null,
  }
}

async function resolveSpotify(url: string) {
  try {
    return await $fetch('/api/spotify', { query: { url } })
  }
  catch {
    // A dead or mistyped link should not block saving the memory itself.
    return null
  }
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed.length ? trimmed : null
}
