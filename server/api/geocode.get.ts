interface NominatimPlace {
  display_name: string
  lat: string
  lon: string
}

interface PlaceResult {
  label: string
  lat: number
  lng: number
}

/**
 * Search for a place by name, via OpenStreetMap's Nominatim.
 *
 * Free, no key, but their usage policy asks for an identifying User-Agent and
 * no more than one request a second — neither of which a browser can promise,
 * which is exactly why this runs on the server.
 */
export default defineEventHandler(async (event): Promise<PlaceResult[]> => {
  const query = String(getQuery(event).q ?? '').trim()

  if (query.length < 3) return []

  try {
    const results = await $fetch<NominatimPlace[]>('https://nominatim.openstreetmap.org/search', {
      // accept-language keeps the results in the interface language instead of
      // whatever the locals call the place.
      query: { 'q': query, 'format': 'json', 'limit': 6, 'addressdetails': 0, 'accept-language': 'en' },
      headers: { 'User-Agent': 'ourtracks/1.0 (personal shared map)' },
      timeout: 8000,
    })

    return results.map(place => ({
      label: place.display_name,
      lat: Number(place.lat),
      lng: Number(place.lon),
    }))
  }
  catch {
    // Search going quiet is an inconvenience, not an error worth a red banner:
    // you can always drop the pin by hand.
    return []
  }
})
