export const SPOTIFY_KINDS = ['track', 'album', 'playlist', 'episode', 'artist'] as const

export type SpotifyKind = (typeof SPOTIFY_KINDS)[number]

export interface SpotifyRef {
  kind: SpotifyKind
  id: string
  /** Canonical https://open.spotify.com/<kind>/<id> form, tracking params stripped. */
  url: string
}

/** Short links handed out by the mobile share sheet. They need a network hop to resolve. */
const SHORT_HOSTS = new Set(['spotify.link', 'spotify.app.link'])

/**
 * Turn anything a person might paste into a canonical Spotify reference.
 *
 * Handles the desktop URL, the localised /intl-xx/ variant, the bare
 * spotify:track:ID scheme, and a naked ID pasted on its own alongside a kind.
 * Returns null for everything else — including short links, which cannot be
 * resolved without a request (see isShortSpotifyLink).
 */
export function parseSpotifyUrl(input: string): SpotifyRef | null {
  const raw = input.trim()
  if (!raw) return null

  // spotify:track:6rqhFgbbKwnb9MLmUQDhG6
  const uriMatch = raw.match(/^spotify:([a-z]+):([A-Za-z0-9]+)$/)
  if (uriMatch) {
    const [, kind, id] = uriMatch
    return isKind(kind) ? { kind, id: id!, url: canonicalUrl(kind, id!) } : null
  }

  let parsed: URL
  try {
    parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`)
  }
  catch {
    return null
  }

  if (!/(^|\.)spotify\.com$/.test(parsed.hostname)) return null

  // /track/ID  or  /intl-de/track/ID
  const segments = parsed.pathname.split('/').filter(Boolean)
  const kindIndex = segments.findIndex(segment => isKind(segment))
  if (kindIndex === -1) return null

  const kind = segments[kindIndex] as SpotifyKind
  const id = segments[kindIndex + 1]
  if (!id || !/^[A-Za-z0-9]+$/.test(id)) return null

  return { kind, id, url: canonicalUrl(kind, id) }
}

export function isShortSpotifyLink(input: string): boolean {
  try {
    const parsed = new URL(input.trim())
    return SHORT_HOSTS.has(parsed.hostname)
  }
  catch {
    return false
  }
}

export function canonicalUrl(kind: SpotifyKind, id: string): string {
  return `https://open.spotify.com/${kind}/${id}`
}

/**
 * The embed player URL. `theme=0` is the dark player, which is the only one
 * that does not fight with the rest of the interface.
 */
export function spotifyEmbedUrl(kind: SpotifyKind, id: string): string {
  return `https://open.spotify.com/embed/${kind}/${id}?theme=0`
}

function isKind(value: string | undefined): value is SpotifyKind {
  return !!value && (SPOTIFY_KINDS as readonly string[]).includes(value)
}
