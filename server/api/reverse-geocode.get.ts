interface NominatimReverse {
  display_name?: string
  address?: Record<string, string>
}

/**
 * Given coordinates, guess a human name for the spot so that clicking the map
 * fills in "Brest, Belarus" instead of leaving the field blank.
 */
export default defineEventHandler(async (event): Promise<{ label: string | null }> => {
  const query = getQuery(event)
  const lat = Number(query.lat)
  const lng = Number(query.lng)

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw createError({ statusCode: 400, statusMessage: 'Bad coordinates' })
  }

  try {
    const result = await $fetch<NominatimReverse>('https://nominatim.openstreetmap.org/reverse', {
      query: { 'lat': lat, 'lon': lng, 'format': 'json', 'zoom': 16, 'accept-language': 'en' },
      headers: { 'User-Agent': 'ourtracks/1.0 (personal shared map)' },
      timeout: 8000,
    })

    return { label: shorten(result) }
  }
  catch {
    return { label: null }
  }
})

/**
 * Nominatim's display_name is a full postal address. Keep the parts a person
 * would actually say out loud: the place, the city, the country.
 */
function shorten(result: NominatimReverse): string | null {
  const address = result.address ?? {}

  const spot
    = address.amenity
      ?? address.tourism
      ?? address.leisure
      ?? address.building
      ?? address.road
      ?? null

  const city
    = address.city
      ?? address.town
      ?? address.village
      ?? address.municipality
      ?? address.county
      ?? null

  const parts = [spot, city, address.country].filter(Boolean)

  if (parts.length) return parts.join(', ')
  return result.display_name ?? null
}
