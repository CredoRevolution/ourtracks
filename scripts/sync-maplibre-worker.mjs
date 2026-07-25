/**
 * Put MapLibre's worker where MapLibre can actually find it.
 *
 * MapLibre 6 works out its worker's address as "./maplibre-gl-worker.mjs"
 * relative to its own module URL. That is fine when the library is served as
 * loose files, and wrong the moment a bundler rolls it into a hashed chunk:
 * the worker URL then points next to that chunk, where no such file exists.
 * The request 404s, the worker never starts, and the map hangs on a grey
 * canvas without raising a single error — vector tiles are parsed in that
 * worker and nothing downstream happens without it.
 *
 * So we copy the worker, and the shared chunk it imports, into public/ and
 * hand MapLibre the real address with setWorkerUrl(). Copied on every build
 * rather than committed, so the files can never drift from the installed
 * version.
 */
import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const from = join(root, 'node_modules', 'maplibre-gl', 'dist')
const to = join(root, 'public', 'maplibre')

// The worker imports the shared chunk by relative path, so they must stay
// neighbours on disk.
const files = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']

await mkdir(to, { recursive: true })

for (const file of files) {
  await copyFile(join(from, file), join(to, file))
}

console.log(`[maplibre] worker files copied to public/maplibre/ (${files.join(', ')})`)
