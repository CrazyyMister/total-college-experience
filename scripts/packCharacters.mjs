import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transcodeStats, webpFor } from './transcode.mjs'

/** Turns the shipped cast under `assets/characters` into a WebP copy for the desktop app's resources. */

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)))
const SRC_CHARS = join(REPO, 'assets', 'characters')
const DESKTOP_OUT = join(REPO, 'build', 'desktop-assets')

/** Working files the editor writes beside the sprites; the release does not ship them. */
const EDITOR_ONLY = new Set(['face.png', 'neutral.base.png', 'fix.png', 'hands.png'])

/** How many encodes run at once. */
const CONCURRENCY = 4

/** Every shippable PNG under one character folder, as `/`-joined relative paths. */
async function shippableImages(dir) {
  const out = []
  async function walk(sub) {
    for (const entry of await readdir(join(dir, sub), { withFileTypes: true })) {
      const rel = sub ? `${sub}/${entry.name}` : entry.name
      // Staging is a half-finished regenerate, never part of the character.
      if (entry.isDirectory()) {
        if (entry.name !== 'staging') await walk(rel)
        continue
      }
      if (!entry.name.endsWith('.png') || EDITOR_ONLY.has(entry.name)) continue
      out.push(rel)
    }
  }
  await walk('')
  out.sort()
  return out
}

/** Runs `task` over `items` with at most `CONCURRENCY` in flight, keeping the order. */
async function pooled(items, task) {
  const results = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      results[i] = await task(items[i], i)
    }
  })
  await Promise.all(workers)
  return results
}

/** The desktop's copy of one character, her images as WebP. */
async function packOne(charId) {
  const dir = join(SRC_CHARS, charId)
  const character = JSON.parse(await readFile(join(dir, 'character.json'), 'utf8'))
  const images = await shippableImages(dir)

  const desktopDir = join(DESKTOP_OUT, 'characters', charId)
  await mkdir(desktopDir, { recursive: true })
  await writeFile(join(desktopDir, 'character.json'), JSON.stringify(character))

  const files = []
  await pooled(images, async (rel) => {
    const webpRel = `${rel.slice(0, -'.png'.length)}.webp`

    const desktopFile = join(desktopDir, webpRel)
    await mkdir(dirname(desktopFile), { recursive: true })
    await cp(await webpFor(join(dir, rel)), desktopFile)

    files.push(webpRel)
  })
  files.sort()

  return { files }
}

/** Copies the folders main reads out of `resources/assets` at runtime. Backgrounds are not among them. */
async function copyDesktopExtras() {
  for (const name of ['pose', 'workflows', 'sound']) {
    await cp(join(REPO, 'assets', name), join(DESKTOP_OUT, name), { recursive: true })
  }
  await cp(join(REPO, 'assets', 'quickstart.json'), join(DESKTOP_OUT, 'quickstart.json'))
}

/** Builds `build/desktop-assets` from scratch. */
export async function packCharacters() {
  const started = Date.now()
  await rm(DESKTOP_OUT, { recursive: true, force: true })

  const charIds = (await readdir(SRC_CHARS, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()

  const packed = []
  for (const charId of charIds) packed.push(await packOne(charId))

  await copyDesktopExtras()

  const stats = transcodeStats()
  return {
    characters: packed.length,
    images: packed.reduce((n, p) => n + p.files.length, 0),
    seconds: (Date.now() - started) / 1000,
    ...stats
  }
}

/** Total bytes of a folder tree, for the summary. */
export async function folderBytes(dir) {
  let total = 0
  for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) total += (await stat(join(entry.parentPath, entry.name))).size
  }
  return total
}

async function main() {
  const summary = await packCharacters()
  console.log(
    `packed ${summary.characters} characters, ${summary.images} images in ${summary.seconds.toFixed(1)}s`
  )
  console.log(
    `  encoded ${summary.encoded}, cached ${summary.cached}, ` +
      `sharp ${summary.sharp} / libvips ${summary.libvips}`
  )
  console.log(`  desktop ${relative(REPO, DESKTOP_OUT)}`)
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
}
