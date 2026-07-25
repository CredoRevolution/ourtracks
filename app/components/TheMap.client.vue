<script setup lang="ts">
import type { LngLatLike } from 'maplibre-gl'
// maplibre-gl 6 dropped the default export — everything comes in by name now.
import {
  GeolocateControl,
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  setWorkerUrl,
} from 'maplibre-gl'
import type { Pin } from '~/types'
import 'maplibre-gl/dist/maplibre-gl.css'

const props = defineProps<{
  pins: Pin[]
  activeId: string | null
  /** In 'place' mode a click on the map reports coordinates instead of doing nothing. */
  mode: 'browse' | 'place'
  /** Preview marker shown while the editor is open. */
  draftAt: { lat: number, lng: number } | null
}>()

const emit = defineEmits<{
  select: [pin: Pin]
  place: [coords: { lat: number, lng: number }]
  ready: []
  /** The map could not be drawn at all. The message is meant for a human. */
  failed: [message: string]
}>()

/**
 * CARTO publish these vector styles for anyone to use without a key or an
 * account, which keeps the whole project free of API keys.
 */
const STYLE_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

/** Brest — the obvious place to open on, and a decent default for everyone else. */
const HOME: LngLatLike = [23.7341, 52.0976]

/**
 * MapLibre guesses its worker lives next to its own module file, which stops
 * being true the moment a bundler rolls that module into a hashed chunk. The
 * guess 404s, the worker never starts, and since vector tiles are parsed in
 * that worker the map hangs on a grey canvas without raising an error.
 *
 * scripts/sync-maplibre-worker.mjs copies the worker into public/maplibre on
 * every build; this is us telling MapLibre where it went.
 */
setWorkerUrl('/maplibre/maplibre-gl-worker.mjs')

const container = useTemplateRef<HTMLDivElement>('container')

let map: MapLibreMap | null = null
let draftMarker: Marker | null = null
const markers = new Map<string, Marker>()

/**
 * MapLibre 6 draws through WebGL2 and nothing else. A browser without it — most
 * often because hardware acceleration is switched off, sometimes an old driver
 * — gets a grey rectangle and an error nobody sees. Check first and say so.
 */
function webgl2Available(): boolean {
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'))
  }
  catch {
    return false
  }
}

let styleLoaded = false
let watchdog: number | null = null

/**
 * The watchdog measures patience, and patience only counts while the page is
 * on screen. A tab sitting in the background gets no animation frames, so it
 * makes no progress and must not be accused of being broken for it. Every time
 * the page comes forward, the clock starts over.
 */
function armWatchdog() {
  if (styleLoaded) return
  if (watchdog) window.clearTimeout(watchdog)
  if (document.visibilityState !== 'visible') return

  watchdog = window.setTimeout(async () => {
    if (styleLoaded || document.visibilityState !== 'visible') return
    emit('failed', await diagnose())
  }, 12000)
}

function onVisibilityChange() {
  if (document.visibilityState !== 'visible' || !map) return
  map.resize()
  map.triggerRepaint()
  armWatchdog()
}

/**
 * Work out why nothing drew, instead of guessing on the user's behalf. Two
 * questions settle it: can this browser reach the tile servers, and is it being
 * given animation frames to draw in.
 */
async function diagnose(): Promise<string> {
  const probe = async (url: string) => {
    const abort = new AbortController()
    const timer = window.setTimeout(() => abort.abort(), 5000)
    try {
      const response = await fetch(url, { signal: abort.signal })
      return String(response.status)
    }
    catch (error) {
      return error instanceof Error && error.name === 'AbortError' ? 'no answer' : 'blocked'
    }
    finally {
      window.clearTimeout(timer)
    }
  }

  const frames = await new Promise<number>((resolve) => {
    let count = 0
    const started = performance.now()
    const tick = () => {
      count++
      if (performance.now() - started < 1000) requestAnimationFrame(tick)
      else resolve(count)
    }
    requestAnimationFrame(tick)
    window.setTimeout(() => resolve(count), 1600)
  })

  const [style, tiles] = await Promise.all([
    probe(STYLE_URL),
    probe('https://tiles.basemaps.cartocdn.com/vector/carto.streets/v1/tiles.json'),
  ])

  return [
    `style.json → ${style}`,
    `tiles.json → ${tiles}`,
    `animation frames per second → ${frames}`,
    frames < 10
      ? 'Almost no frames: the browser is not letting this page draw. Bring the window to the front, or turn on Chrome → Settings → System → graphics acceleration.'
      : (style === '200' && tiles === '200')
          ? 'Both tile servers answered and the page is drawing, so this is something else — send this text over.'
          : 'A tile server did not answer, so there is nothing to draw with.',
  ].join('\n')
}

onMounted(() => {
  if (!container.value) return

  if (!webgl2Available()) {
    emit(
      'failed',
      'This browser cannot use WebGL2, which the map needs in order to draw. '
      + 'It is usually switched off with hardware acceleration: Chrome → Settings → '
      + 'System → "Use graphics acceleration when available", then restart Chrome.',
    )
    return
  }

  try {
    map = new MapLibreMap({
      container: container.value,
      style: STYLE_URL,
      center: HOME,
      zoom: 11,
      attributionControl: { compact: true },
    })
  }
  catch (error) {
    emit('failed', error instanceof Error ? error.message : 'The map failed to start.')
    return
  }

  // Tile hiccups after the style is up are noise; anything before it is fatal.
  map.on('error', (event) => {
    const message = event.error?.message ?? 'Unknown map error'
    console.error('[ourtracks] map error:', message)
    if (!styleLoaded) emit('failed', message)
  })

  map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right')
  map.addControl(
    new GeolocateControl({ trackUserLocation: false, showAccuracyCircle: false }),
    'bottom-right',
  )

  map.on('click', (event) => {
    if (props.mode !== 'place') return
    emit('place', { lat: event.lngLat.lat, lng: event.lngLat.lng })
  })

  // A tab that is not in front gets no animation frames, and MapLibre draws on
  // animation frames. Open the page in a background tab and the canvas can sit
  // there grey. Nudge it awake when the tab comes forward.
  document.addEventListener('visibilitychange', onVisibilityChange)
  armWatchdog()

  map.on('load', () => {
    styleLoaded = true
    if (watchdog) window.clearTimeout(watchdog)
    // A container that was briefly zero-sized leaves the canvas the wrong size
    // for good unless it is told to measure itself again.
    map?.resize()
    syncMarkers()
    frameAll({ animate: false })
    emit('ready')
  })
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
  if (watchdog) window.clearTimeout(watchdog)
  markers.forEach(marker => marker.remove())
  markers.clear()
  draftMarker?.remove()
  map?.remove()
  map = null
})

watch(() => props.pins, syncMarkers, { deep: true })
watch(() => props.activeId, paintActiveState)
watch(() => props.mode, (mode) => {
  if (!container.value) return
  container.value.dataset.placing = mode === 'place' ? 'true' : 'false'
})

watch(() => props.draftAt, (coords) => {
  if (!map) return

  if (!coords) {
    draftMarker?.remove()
    draftMarker = null
    return
  }

  if (!draftMarker) {
    const element = document.createElement('div')
    element.className = 'ot-draft-marker'
    draftMarker = new Marker({ element, anchor: 'bottom' })
  }

  draftMarker.setLngLat([coords.lng, coords.lat]).addTo(map)
})

/**
 * Rebuild only what changed. Recreating every marker on each update makes the
 * map flicker and throws away the element the browser is mid-animation on.
 */
function syncMarkers() {
  if (!map) return

  const seen = new Set<string>()

  for (const pin of props.pins) {
    seen.add(pin.id)

    const existing = markers.get(pin.id)
    if (existing) {
      existing.setLngLat([pin.lng, pin.lat])
      fillMarker(existing.getElement(), pin)
      continue
    }

    const element = document.createElement('button')
    element.type = 'button'
    element.className = 'ot-marker'
    element.addEventListener('click', (event) => {
      event.stopPropagation()
      emit('select', pin)
    })
    fillMarker(element, pin)

    markers.set(pin.id, new Marker({ element }).setLngLat([pin.lng, pin.lat]).addTo(map))
  }

  for (const [id, marker] of markers) {
    if (seen.has(id)) continue
    marker.remove()
    markers.delete(id)
  }

  paintActiveState()
}

function fillMarker(element: HTMLElement, pin: Pin) {
  element.dataset.pinId = pin.id
  element.title = pin.title
  element.setAttribute('aria-label', pin.title)

  const cover = pin.spotify_thumb ?? pin.photos?.[0]?.url ?? null

  element.innerHTML = cover
    ? `<img src="${escapeAttribute(cover)}" alt="" loading="lazy" /><span class="ot-marker-ring"></span>`
    : `<span class="ot-marker-dot"></span><span class="ot-marker-ring"></span>`
}

function paintActiveState() {
  for (const [id, marker] of markers) {
    marker.getElement().classList.toggle('is-active', id === props.activeId)
  }
}

/** Bring one pin to the middle of the visible map, above the detail panel. */
function focus(pin: Pin, options: { zoom?: number } = {}) {
  map?.flyTo({
    center: [pin.lng, pin.lat],
    zoom: Math.max(map.getZoom(), options.zoom ?? 13),
    speed: 1.1,
    curve: 1.4,
    offset: window.innerWidth >= 1024 ? [-190, 0] : [0, -120],
  })
}

function flyTo(coords: { lat: number, lng: number }, zoom = 14) {
  map?.flyTo({ center: [coords.lng, coords.lat], zoom, speed: 1.2 })
}

/** Zoom out far enough to hold every pin, with room to breathe. */
function frameAll({ animate = true } = {}) {
  if (!map || props.pins.length === 0) return

  if (props.pins.length === 1) {
    const only = props.pins[0]!
    map.jumpTo({ center: [only.lng, only.lat], zoom: 13 })
    return
  }

  const bounds = new LngLatBounds()
  for (const pin of props.pins) bounds.extend([pin.lng, pin.lat])

  map.fitBounds(bounds, { padding: 96, maxZoom: 14, duration: animate ? 900 : 0 })
}

function escapeAttribute(value: string): string {
  return value.replace(/"/g, '&quot;')
}

defineExpose({ focus, flyTo, frameAll })
</script>

<template>
  <div ref="container" class="ot-map" data-placing="false" />
</template>

<style>
.ot-map {
  position: absolute;
  inset: 0;
}

.ot-map[data-placing='true'] .maplibregl-canvas-container {
  cursor: crosshair;
}

/* --- pin markers ---------------------------------------------------------- */
.ot-marker {
  position: relative;
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: #101317;
  box-shadow:
    0 0 0 2px rgb(255 255 255 / 0.14),
    0 6px 18px rgb(0 0 0 / 0.55);
  cursor: pointer;
  transition:
    transform 0.18s cubic-bezier(0.16, 1, 0.3, 1),
    box-shadow 0.18s ease;
}

.ot-marker img {
  width: 100%;
  height: 100%;
  border-radius: 999px;
  object-fit: cover;
}

.ot-marker-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #f0b429;
  box-shadow: 0 0 12px #f0b429;
}

.ot-marker:hover {
  transform: scale(1.12);
  box-shadow:
    0 0 0 2px rgb(240 180 41 / 0.6),
    0 8px 22px rgb(0 0 0 / 0.6);
  z-index: 2;
}

.ot-marker.is-active {
  transform: scale(1.22);
  box-shadow:
    0 0 0 3px #f0b429,
    0 10px 26px rgb(0 0 0 / 0.65);
  z-index: 3;
}

/* A slow halo so an opened pin stays findable among its neighbours */
.ot-marker.is-active .ot-marker-ring {
  position: absolute;
  inset: -6px;
  border-radius: 999px;
  border: 2px solid rgb(240 180 41 / 0.55);
  animation: ot-pulse 2.4s ease-out infinite;
}

@keyframes ot-pulse {
  0% {
    transform: scale(0.9);
    opacity: 0.9;
  }
  100% {
    transform: scale(1.5);
    opacity: 0;
  }
}

/* --- the "you are about to drop it here" marker --------------------------- */
.ot-draft-marker {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: #f0b429;
  border: 3px solid #08090b;
  box-shadow: 0 0 0 4px rgb(240 180 41 / 0.25);
  animation: ot-drop 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes ot-drop {
  from {
    transform: translateY(-14px) scale(0.6);
    opacity: 0;
  }
  to {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
}
</style>
