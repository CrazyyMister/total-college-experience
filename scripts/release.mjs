import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, readdir, rm, stat } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { folderBytes, packCharacters } from './packCharacters.mjs'

/**
 * The one release command: the Windows app folder, out of one tree and one version.
 * It never bumps the version.
 */

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)))
const RELEASE = join(REPO, 'release')
const UNPACKED = join(RELEASE, 'win-unpacked')

const allowDirty = process.argv.includes('--allow-dirty')

/** How long each step took, printed as a table at the end. */
const timings = []

function mb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Spawns a child with no shell and fails the run on a non-zero exit. */
function run(file, argv, opts = {}) {
  return new Promise((ok, fail) => {
    const child = spawn(file, argv, { cwd: REPO, stdio: 'inherit', shell: false, ...opts })
    child.on('error', fail)
    child.on('exit', (code) => {
      if (code === 0) ok()
      else fail(new Error(`${basename(file)} ${argv.join(' ')} exited with ${code}`))
    })
  })
}

/** The same, but the child's stdout comes back as a string. */
function capture(file, argv, opts = {}) {
  return new Promise((ok, fail) => {
    const child = spawn(file, argv, {
      cwd: REPO,
      stdio: ['ignore', 'pipe', 'inherit'],
      shell: false,
      ...opts
    })
    let out = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => (out += chunk))
    child.on('error', fail)
    child.on('exit', (code) => ok({ code, out }))
  })
}

/**
 * npm's own JS entry point. Spawning `npm.cmd` would need a shell, which Node
 * refuses for a `.cmd` file unless `shell: true`; running the CLI under this
 * interpreter keeps every child shell-free.
 */
function npmCli() {
  const fromEnv = process.env.npm_execpath
  if (fromEnv && fromEnv.endsWith('.js') && existsSync(fromEnv)) return fromEnv
  const beside = resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
  if (existsSync(beside)) return beside
  throw new Error('Could not find npm-cli.js; run this through `npm run release`.')
}

/** A JS CLI inside `node_modules`, run under this interpreter. */
function nodeBin(rel) {
  const path = join(REPO, 'node_modules', rel)
  if (!existsSync(path)) throw new Error(`Missing build tool: node_modules/${rel}`)
  return path
}

async function step(name, fn) {
  const started = Date.now()
  console.log(`\n=== ${name}`)
  const value = await fn()
  const seconds = (Date.now() - started) / 1000
  timings.push({ name, seconds })
  console.log(`--- ${name} in ${seconds.toFixed(1)}s`)
  return value
}

/** Node version, build tools and a clean tree. */
async function preflight() {
  const major = Number(process.versions.node.split('.')[0])
  if (major < 22) throw new Error(`Node 22 or newer is required; this is ${process.versions.node}.`)

  for (const pkg of ['sharp', '7zip-bin', 'electron-builder']) {
    if (!existsSync(join(REPO, 'node_modules', pkg))) {
      throw new Error(`${pkg} is not installed; run npm install --legacy-peer-deps.`)
    }
  }

  if (!existsSync(join(REPO, 'build', 'icon.ico'))) {
    console.warn('  warning: build/icon.ico is missing, so the exe gets electron-builder’s stock icon.')
  }

  const status = await capture('git', ['status', '--porcelain'])
  const dirty = status.out.trim()
  if (dirty && !allowDirty) {
    console.error(dirty)
    throw new Error('The working tree is dirty. Commit first, or pass --allow-dirty for a test build.')
  }
  if (dirty) console.warn('  warning: building a dirty tree (--allow-dirty).')

  const head = (await capture('git', ['rev-parse', 'HEAD'])).out.trim()
  const sha = head.slice(0, 8)

  const { version } = JSON.parse(await readFile(join(REPO, 'package.json'), 'utf8'))
  console.log(`  version ${version}, HEAD ${sha}, node ${process.versions.node}`)
  return { version, sha }
}

/** Everything the packaged folder has to contain, and the things it must not. */
async function assertDesktopPayload() {
  const required = [
    'Total College Experience.exe',
    'LICENSE',
    'LICENSE-ASSETS.md',
    'NOTICE',
    'PERMISSION.md',
    'README.md',
    'docs/tce_logo.svg',
    'resources/app.asar',
    'resources/app.asar.unpacked/node_modules/7zip-bin/win/x64/7za.exe'
  ]
  for (const rel of required) {
    if (!existsSync(join(UNPACKED, rel))) throw new Error(`The build is missing ${rel}.`)
  }
  // The original's music is not ours to ship, and a player's data is never in the folder.
  for (const rel of ['resources/assets/sound/music', 'resources/assets/sound/ambient_music', 'data']) {
    if (existsSync(join(UNPACKED, rel))) throw new Error(`The build holds ${rel}, which it must not ship.`)
  }

  // Only the unzipped folders ship; the zips beside them are the source archives, as packCharacters reads them.
  const shipped = (await readdir(join(REPO, 'assets/characters'), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  const cast = (await readdir(join(UNPACKED, 'resources/assets/characters'))).sort()
  if (cast.join('\n') !== shipped.join('\n')) {
    const missing = shipped.filter((id) => !cast.includes(id))
    const stray = cast.filter((id) => !shipped.includes(id))
    throw new Error(
      `resources/assets/characters holds ${cast.length} characters, but assets/characters has ${shipped.length}` +
        (missing.length > 0 ? `; missing ${missing.join(', ')}` : '') +
        (stray.length > 0 ? `; stray ${stray.join(', ')}` : '') +
        '.'
    )
  }
  if (existsSync(join(UNPACKED, 'resources/assets/bg'))) {
    throw new Error('resources/assets/bg was shipped; the renderer bundles the backgrounds.')
  }

  const asar = join(UNPACKED, 'resources/app.asar')
  const asarBytes = (await stat(asar)).size
  let listed = null
  try {
    listed = (await import('@electron/asar')).listPackage(asar)
  } catch {
    // electron-builder brings @electron/asar with it; if a future version stops,
    // the size is the coarse stand-in for the listing.
  }
  if (listed) {
    const stray = listed.filter((entry) =>
      /^[/\\](data|src|test)([/\\]|$)/.test(entry)
    )
    if (stray.length > 0) throw new Error(`app.asar carries ${stray.slice(0, 5).join(', ')}.`)
    console.log(`  app.asar: ${listed.length} entries, ${mb(asarBytes)}`)
  } else {
    // The renderer's bundled backgrounds are most of the archive, so the coarse
    // cap sits well above them rather than near the code's own size.
    if (asarBytes > 200 * 1024 * 1024) {
      throw new Error(`app.asar is ${mb(asarBytes)}; something outside out/ was packaged.`)
    }
    console.log(`  app.asar: ${mb(asarBytes)} (unlisted)`)
  }
  return asarBytes
}

async function main() {
  const started = Date.now()
  const { version, sha } = await step('preflight', preflight)

  await step('clean release/', () => rm(RELEASE, { recursive: true, force: true }))
  await step('typecheck', () => run(process.execPath, [npmCli(), 'run', 'typecheck']))
  await step('test', () => run(process.execPath, [npmCli(), 'test']))

  const packed = await step('pack the shipped cast', packCharacters)
  console.log(
    `  ${packed.characters} characters, ${packed.images} images; ` +
      `encoded ${packed.encoded}, cached ${packed.cached}`
  )

  await step('build the desktop bundles', () =>
    run(process.execPath, [nodeBin('electron-vite/bin/electron-vite.js'), 'build'])
  )

  await step('package the desktop app', () =>
    run(process.execPath, [
      nodeBin('electron-builder/cli.js'),
      '--win',
      'dir',
      '--publish',
      'never',
      '--config',
      'electron-builder.yml'
    ])
  )

  const asarBytes = await step('check the desktop payload', assertDesktopPayload)

  const unpackedBytes = await folderBytes(UNPACKED)

  console.log(`\n=== Total College Experience ${version} (${sha})`)
  const rows = [
    ['desktop folder', UNPACKED, `${mb(unpackedBytes)}, app.asar ${mb(asarBytes)}`],
    [
      'transcode cache',
      `${packed.encoded} encoded / ${packed.cached} cached`,
      `sharp ${packed.sharp}, libvips ${packed.libvips}`
    ]
  ]
  for (const [label, where, measure] of rows) {
    console.log(`  ${label.padEnd(16)} ${measure.padEnd(34)} ${where}`)
  }
  for (const { name, seconds } of timings) {
    console.log(`  ${seconds.toFixed(1).padStart(7)}s  ${name}`)
  }
  console.log(`  ${((Date.now() - started) / 1000).toFixed(1)}s total`)

  console.log(`\nThe game folder is ${UNPACKED}`)
}

main().catch((err) => {
  console.error(`\nRelease failed: ${err.message}`)
  process.exitCode = 1
})
