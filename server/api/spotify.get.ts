import { isShortSpotifyLink, parseSpotifyUrl } from '#shared/utils/spotify'

interface OEmbedResponse {
  title?: string
  thumbnail_url?: string
}

/**
 * Resolve a pasted Spotify link into { kind, id, title, thumb }.
 *
 * Spotify's oEmbed endpoint is public — no client id, no token, no rate limit
 * worth worrying about at our scale. We proxy it through the server for two
 * reasons: the browser would be blocked by cross-origin rules, and short
 * share-sheet links need a redirect followed before they can be parsed.
 */
export default defineEventHandler(async (event): Promise<{
  kind: string
  id: string
  url: string
  title: string | null
  thumb: string | null
}> => {
  const url = String(getQuery(event).url ?? '').trim()

  if (!url) {
    throw createError({ statusCode: 400, statusMessage: 'Missing url' })
  }

  const ref = parseSpotifyUrl(await expandShortLink(url))

  if (!ref) {
    throw createError({
      statusCode: 422,
      statusMessage: 'That does not look like a Spotify link',
    })
  }

  // A failed lookup is not fatal: the embed still works, we just lose the
  // cover art and title we would have shown on the map.
  let meta: OEmbedResponse = {}
  try {
    meta = await $fetch<OEmbedResponse>('https://open.spotify.com/oembed', {
      query: { url: ref.url },
      timeout: 6000,
    })
  }
  catch {
    meta = {}
  }

  return {
    ...ref,
    title: meta.title ?? null,
    thumb: meta.thumbnail_url ?? null,
  }
})

/** Follow spotify.link redirects to the real open.spotify.com address. */
async function expandShortLink(url: string): Promise<string> {
  if (!isShortSpotifyLink(url)) return url

  try {
    const response = await fetch(url, { redirect: 'follow' })
    return response.url || url
  }
  catch {
    return url
  }
}
