export interface Profile {
  id: string
  email: string | null
  display_name: string | null
  avatar_url: string | null
  is_member: boolean
  created_at: string
}

export interface PinPhoto {
  id: string
  pin_id: string
  storage_path: string
  sort_order: number
  created_at: string
  /** Filled in on the client — signed links expire, so they never live in the database. */
  url?: string
}

export type SpotifyKind = 'track' | 'album' | 'playlist' | 'episode' | 'artist'

export interface Pin {
  id: string
  author_id: string

  title: string
  note: string | null

  lat: number
  lng: number
  place_label: string | null

  spotify_url: string | null
  spotify_id: string | null
  spotify_kind: SpotifyKind | null
  spotify_title: string | null
  spotify_thumb: string | null

  happened_on: string | null
  created_at: string
  updated_at: string

  /** Joined in by the select, not columns on the table. */
  author?: Pick<Profile, 'id' | 'display_name' | 'avatar_url'> | null
  photos?: PinPhoto[]
}

/** What the pin editor hands back — no ids, no timestamps, no server concerns. */
export interface PinDraft {
  title: string
  note: string
  lat: number
  lng: number
  place_label: string
  spotify_url: string
  happened_on: string
}

export interface SpotifyRef {
  kind: SpotifyKind
  id: string
  /** Canonical https://open.spotify.com/<kind>/<id> form. */
  url: string
}

export interface SpotifyMeta extends SpotifyRef {
  title: string | null
  thumb: string | null
}

/** A place returned by the search box, before it becomes a pin. */
export interface PlaceResult {
  label: string
  lat: number
  lng: number
}
