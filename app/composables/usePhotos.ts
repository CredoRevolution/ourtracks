import type { PinPhoto } from '~/types'

const BUCKET = 'pin-photos'

/** Uploads are downscaled first — a 12 MP phone photo is wasted on a 400px card. */
const MAX_EDGE = 2000
const JPEG_QUALITY = 0.82

/** Signed links are handed out per page load; an hour is far longer than anyone looks. */
const SIGN_TTL_SECONDS = 3600

export function usePhotos() {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()

  /**
   * Trade storage paths for temporary links, in a single request.
   * Returns a lookup keyed by the original path so callers can zip them back up.
   */
  async function signPaths(paths: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>()
    const unique = [...new Set(paths)]
    if (!unique.length) return result

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(unique, SIGN_TTL_SECONDS)

    if (error || !data) return result

    for (const entry of data) {
      // The API returns the path it was given, minus the bucket prefix.
      if (entry.signedUrl && entry.path) result.set(entry.path, entry.signedUrl)
    }

    return result
  }

  /**
   * Push files into Storage and record them against a pin.
   * Anything that fails is skipped rather than aborting the whole batch —
   * losing one photo is better than losing the four that worked.
   */
  async function upload(pinId: string, files: File[], startOrder = 0): Promise<PinPhoto[]> {
    if (!user.value || !files.length) return []

    const saved: PinPhoto[] = []

    for (const [index, file] of files.entries()) {
      const prepared = await downscale(file)
      const path = `${user.value.id}/${pinId}/${crypto.randomUUID()}.${extensionFor(prepared.type)}`

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, prepared, { contentType: prepared.type, upsert: false })

      if (uploadError) continue

      const { data, error: insertError } = await supabase
        .from('pin_photos')
        .insert({ pin_id: pinId, storage_path: path, sort_order: startOrder + index })
        .select('id, pin_id, storage_path, sort_order, created_at')
        .single()

      if (insertError || !data) {
        // Nothing points at the file now, so do not leave it lying in the bucket.
        await supabase.storage.from(BUCKET).remove([path])
        continue
      }

      saved.push(data as unknown as PinPhoto)
    }

    return saved
  }

  async function removePhoto(photo: PinPhoto): Promise<boolean> {
    const { error } = await supabase.from('pin_photos').delete().eq('id', photo.id)
    if (error) return false

    await removeStoredPhotos([photo.storage_path])
    return true
  }

  async function removeStoredPhotos(paths: string[]): Promise<void> {
    if (!paths.length) return
    await supabase.storage.from(BUCKET).remove(paths)
  }

  return { signPaths, upload, removePhoto, removeStoredPhotos }
}

/**
 * Shrink a photo in the browser before it ever reaches the network.
 * Falls back to the untouched file whenever the canvas route is unavailable —
 * some formats (HEIC on desktop, mainly) simply will not decode.
 */
async function downscale(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))

    if (scale === 1 && file.size < 1_500_000) {
      bitmap.close()
      return file
    }

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)

    const context = canvas.getContext('2d')
    if (!context) return file

    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()

    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    )

    return blob && blob.size < file.size ? blob : file
  }
  catch {
    return file
  }
}

function extensionFor(mime: string): string {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/gif') return 'gif'
  return 'jpg'
}
