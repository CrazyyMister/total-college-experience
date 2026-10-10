import { spawnSync } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  rmSync,
  rmdirSync,
  symlinkSync
} from 'node:fs'
import { basename, dirname, isAbsolute, join, parse, relative, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

/**
 * The folder the game is played from, kept by hand: `update` makes it the first time and
 * brings it up to the latest `release/win-unpacked` after that; `remove` deletes it. Its `data`
 * is its own, except `services` and `characters`, which are links to the project's. Nothing
 * here ever writes inside `data` or follows a link.
 */

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)))
const DEFAULT_TO = 'D:\\Total College Experience'
const EXE = 'Total College Experience.exe'
/** The program file of the build this one replaced, and the name its folder went by. */
const OLD_EXE = 'Venus University.exe'
const OLD_FOLDER = 'Venus University'
/** The folders of the project's `data` the played copy shares. */
const SHARED = ['services', 'characters']
/** What a finished build holds, relative to `release/win-unpacked`. */
const BUILD_FILES = [
  EXE,
  'resources/app.asar',
  'resources/app.asar.unpacked/node_modules/7zip-bin/win/x64/7za.exe'
]

/** A reason to stop, worded for the person at the keyboard; nothing has been changed when it is thrown. */
class Refusal extends Error {}

function refuse(message) {
  throw new Refusal(message)
}

const lower = (path) => path.toLowerCase()
const same = (a, b) => lower(a) === lower(b)

/** True when `child` is `parent` or anything below it. */
function within(parent, child) {
  const rel = relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/** The paths one run works on, from the project and the folder asked for. */
export function contextFor(repo, to, hooks = {}) {
  const dst = resolve(to)
  return {
    repo,
    src: join(repo, 'release', 'win-unpacked'),
    given: to,
    dst,
    dataDir: join(dst, 'data'),
    shared: SHARED.map((name) => ({
      name,
      target: join(repo, 'data', name),
      link: join(dst, 'data', name)
    })),
    listProcesses: hooks.listProcesses ?? listProcesses,
    confirm: hooks.confirm ?? confirmByTyping,
    say: hooks.say ?? console.log
  }
}

/** Every running program as `{ pid, name, path }`; a listing Windows will not give is a refusal, never an empty one. */
function listProcesses() {
  if (process.platform !== 'win32') refuse('This script is for Windows.')
  const result = spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId)|$($_.Name)|$($_.ExecutablePath)" }'
    ],
    { windowsHide: true, encoding: 'utf8', timeout: 30_000 }
  )
  if (result.error || result.status !== 0) {
    refuse('Windows would not list the running programs, so I cannot tell whether the game is open.')
  }
  return result.stdout
    .split('\n')
    .map((line) => line.trim().split('|'))
    .filter((parts) => parts.length >= 3)
    .map(([pid, name, ...path]) => ({ pid, name, path: path.join('|') }))
}

/** Refuses while the packaged game, the dev app or the ComfyUI either started is running. */
function refuseIfGameOpen(ctx) {
  const watched = [
    ctx.dst,
    ctx.src,
    join(ctx.repo, 'node_modules', 'electron', 'dist'),
    join(ctx.repo, 'data', 'services')
  ]
  const open = ctx
    .listProcesses()
    .filter(
      (one) =>
        lower(one.name) === lower(EXE) || (one.path !== '' && watched.some((root) => within(root, one.path)))
    )
  if (open.length > 0) {
    const names = open.map((one) => `${one.name} ${one.pid}`).join(', ')
    refuse(`The game is open (${names}). Close it, wait for its ComfyUI to stop, and run this again.`)
  }
}

/** Refuses a folder the script has no business writing to or deleting. */
function checkTarget(ctx) {
  const { dst, repo } = ctx
  if (!isAbsolute(ctx.given)) refuse(`"${ctx.given}" is not a full path. Use one like ${DEFAULT_TO}.`)
  if (same(basename(dst), OLD_FOLDER) || (existsSync(dst) && existsSync(join(dst, OLD_EXE)))) {
    refuse(
      `${dst} is the old Venus University build (a folder by that name, or one holding ${OLD_EXE}). ` +
        'This script never touches it.'
    )
  }
  if (same(parse(dst).root, dst)) refuse(`${dst} is the root of a drive. Pick a folder.`)
  if (within(repo, dst) || within(dst, repo)) {
    refuse(`${dst} is inside the project or holds it. Pick a folder outside ${repo}.`)
  }
  if (!existsSync(dirname(dst))) {
    refuse(`The folder ${dirname(dst)} does not exist, so ${dst} cannot be made there.`)
  }
  if (existsSync(dst)) {
    const info = lstatSync(dst)
    if (info.isSymbolicLink()) refuse(`${dst} is a link, not a folder.`)
    if (!info.isDirectory()) refuse(`${dst} exists and is not a folder.`)
  }
}

/** What the folder holds: nothing there, an empty folder, a game folder, or something else. */
function stateOf(dst) {
  if (!existsSync(dst)) return 'missing'
  if (readdirSync(dst).length === 0) return 'empty'
  return existsSync(join(dst, EXE)) ? 'install' : 'foreign'
}

function checkSource(ctx) {
  for (const rel of BUILD_FILES) {
    if (!existsSync(join(ctx.src, rel))) {
      refuse(`The build in ${ctx.src} is not finished: ${rel} is missing. Run npm run release first.`)
    }
  }
}

/** Every link under `root` except `skip`, without going into any of them. */
function findLinks(root, skip = null) {
  const found = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (skip !== null && same(full, skip)) continue
      if (entry.isSymbolicLink()) found.push(full)
      else if (entry.isDirectory()) walk(full)
    }
  }
  walk(root)
  return found
}

/** Where a link really leads, or `null` when it leads nowhere. */
function linkLeadsTo(link) {
  try {
    return realpathSync(link)
  } catch {
    return null
  }
}

/** Bytes under `dir`, links not entered. */
function folderBytes(dir) {
  let total = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) total += folderBytes(full)
    else if (entry.isFile()) total += lstatSync(full).size
  }
  return total
}

function mb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** `package.json`'s version inside a build's `app.asar`, or `unknown`. */
async function versionOf(folder) {
  try {
    const mod = await import('@electron/asar')
    const asar = mod.default ?? mod
    const text = asar.extractFile(join(folder, 'resources', 'app.asar'), 'package.json').toString()
    return JSON.parse(text).version ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * One robocopy run, `data` skipped by full path on both sides and links skipped, with only the
 * operations printed. Returns each one as `{ kind: 'copy' | 'delete' | 'other', path, line }`.
 */
function robocopy(ctx, flags, listOnly) {
  const args = [
    ctx.src,
    ctx.dst,
    ...flags,
    '/XJ',
    '/XD',
    ctx.dataDir,
    join(ctx.src, 'data'),
    '/R:2',
    '/W:1',
    '/NP',
    '/NJH',
    '/NJS',
    '/NDL',
    '/FP',
    ...(listOnly ? ['/L'] : [])
  ]
  const result = spawnSync('robocopy', args, { windowsHide: true, maxBuffer: 512 * 1024 * 1024 })
  if (result.error) refuse(`Could not start robocopy: ${result.error.message}`)
  if (result.status === null || result.status >= 8) {
    refuse(`robocopy failed with exit code ${result.status}. ${listOnly ? 'Nothing was changed.' : 'The folder may be half updated; run the update again.'}`)
  }
  const operations = []
  for (const line of result.stdout.toString('latin1').split(/\r?\n/)) {
    const path = line.split('\t').map((part) => part.trim()).filter(Boolean).pop()
    if (path === undefined) continue
    if (/^[A-Za-z]:\\/.test(path)) {
      operations.push({ kind: within(ctx.src, path) ? 'copy' : 'delete', path, line: line.trim() })
    } else {
      operations.push({ kind: 'other', path, line: line.trim() })
    }
  }
  return operations
}

/** Refuses outright when any listed operation lands inside either `data` folder. */
function assertOutsideData(ctx, operations) {
  const inside = operations.find(
    (one) => within(ctx.dataDir, one.path) || within(join(ctx.src, 'data'), one.path)
  )
  if (inside) {
    refuse(`Stopped: robocopy listed an operation inside data\\ (${inside.path}). Nothing was changed.`)
  }
}

function plural(count) {
  return `${count} file${count === 1 ? '' : 's'}`
}

function describeOperations(ctx, operations, tense) {
  const copies = operations.filter((one) => one.kind === 'copy')
  const deletes = operations.filter((one) => one.kind === 'delete')
  const others = operations.filter((one) => one.kind === 'other')
  const show = (list, shown = 12) => {
    for (const one of list.slice(0, shown)) ctx.say(`    ${one.path}`)
    if (list.length > shown) ctx.say(`    ... and ${list.length - shown} more`)
  }
  ctx.say(`  ${tense.copy} ${plural(copies.length)} (new or different) from ${ctx.src}`)
  show(copies)
  ctx.say(`  ${tense.delete} ${plural(deletes.length)} the new build no longer has`)
  show(deletes)
  if (others.length > 0) {
    ctx.say(`  robocopy also said:`)
    show(others, 20)
  }
  ctx.say(`  Operations inside data\\: 0 of ${operations.length}, checked against:`)
  ctx.say(`    ${ctx.dataDir}`)
  ctx.say(`    ${join(ctx.src, 'data')}`)
}

/** Reports whether each shared link is in place; a missing or misdirected one is a warning, never touched. */
function reportLinks(ctx) {
  for (const { name, target, link } of ctx.shared) {
    let status
    if (!existsSync(link) && !isLink(link)) status = 'MISSING: the game would make its own empty one'
    else if (!isLink(link)) status = 'NOT A LINK: a real folder the game fills by itself'
    else if (linkLeadsTo(link) === null || !same(linkLeadsTo(link), realpathSync(target))) {
      status = `POINTS AT ${linkLeadsTo(link) ?? 'nothing'}, not ${target}`
    } else status = 'ok'
    ctx.say(`  data\\${name} -> ${target}: ${status}`)
  }
}

function isLink(path) {
  try {
    return lstatSync(path).isSymbolicLink()
  } catch {
    return false
  }
}

/** Makes the folder the first time, or brings it up to date; `dryRun` only says what it would do. */
export async function update(ctx, { dryRun }) {
  checkTarget(ctx)
  checkSource(ctx)
  refuseIfGameOpen(ctx)

  const state = stateOf(ctx.dst)
  if (state === 'foreign') {
    refuse(
      `${ctx.dst} already has files but no ${EXE}, so it is not a game folder this script made. ` +
        `Pick another folder or empty this one.`
    )
  }
  const first = state === 'missing' || state === 'empty'
  const heading = dryRun ? ' (dry run: nothing will be written)' : ''
  ctx.say(`${first ? 'First time' : 'Update'}: ${ctx.dst}${heading}`)
  ctx.say(`  from ${ctx.src} (version ${await versionOf(ctx.src)})`)

  if (first) {
    for (const { target } of ctx.shared) {
      if (!existsSync(target)) {
        refuse(`${target} does not exist in the project. Run the game once with npm run dev so it makes it, then run this again.`)
      }
    }
    ctx.say(`  checks passed: the game is not open; the two folders to link exist`)
    const operations = robocopy(ctx, ['/E'], true)
    assertOutsideData(ctx, operations)
    describeOperations(ctx, operations, dryRun ? { copy: 'Would copy', delete: 'Would delete' } : { copy: 'Will copy', delete: 'Will delete' })
    ctx.say(`  ${dryRun ? 'Would create' : 'Will create'} ${ctx.dataDir} and these links:`)
    for (const { name, target, link } of ctx.shared) ctx.say(`    ${link} -> ${target}`)
    if (dryRun) return void ctx.say('Nothing was written.')

    if (state === 'missing') mkdirSync(ctx.dst)
    robocopy(ctx, ['/E'], false)
    mkdirSync(ctx.dataDir)
    for (const { target, link } of ctx.shared) symlinkSync(target, link, 'junction')
    ctx.say(`Done. Open ${EXE} there; it should not ask to install ComfyUI.`)
    return
  }

  const links = findLinks(ctx.dst, ctx.dataDir)
  if (links.length > 0) {
    refuse(`Found a link inside ${ctx.dst} outside data\\: ${links[0]}. Nothing was copied.`)
  }
  if (!existsSync(ctx.dataDir)) {
    refuse(`${ctx.dataDir} is missing, so this is not a folder this script set up. Nothing was copied.`)
  }
  if (isLink(ctx.dataDir)) refuse(`${ctx.dataDir} is a link, not a folder. Nothing was copied.`)
  ctx.say(`  installed version ${await versionOf(ctx.dst)}`)
  ctx.say(`  checks passed: the game is not open; no link in the folder outside data\\`)
  reportLinks(ctx)

  const operations = robocopy(ctx, ['/MIR'], true)
  assertOutsideData(ctx, operations)
  describeOperations(ctx, operations, dryRun ? { copy: 'Would copy', delete: 'Would delete' } : { copy: 'Will copy', delete: 'Will delete' })
  if (dryRun) return void ctx.say('Nothing was written.')

  const done = robocopy(ctx, ['/MIR'], false)
  assertOutsideData(ctx, done)
  ctx.say(`Done: copied ${plural(done.filter((one) => one.kind === 'copy').length)}, deleted ${plural(done.filter((one) => one.kind === 'delete').length)}; data\\ was not touched.`)
}

/** Asks for the folder's name to be typed; anything else is no. */
async function confirmByTyping(question, expected) {
  if (!process.stdin.isTTY) {
    refuse('Removing needs you to type the folder name, and there is no terminal to type it in.')
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return (await rl.question(question)) === expected
  } finally {
    rl.close()
  }
}

/** Deletes the folder, taking the two links off first so nothing on the far side of one is reached. */
export async function remove(ctx, { dryRun }) {
  checkTarget(ctx)
  const state = stateOf(ctx.dst)
  if (state === 'missing') refuse(`There is no folder at ${ctx.dst}; nothing to remove.`)
  if (state !== 'install') {
    refuse(`${ctx.dst} does not hold ${EXE}, so it is not a game folder and this script will not delete it.`)
  }
  refuseIfGameOpen(ctx)

  const expected = ctx.shared.map((one) => one.link)
  const links = findLinks(ctx.dst)
  for (const link of links) {
    if (!expected.some((one) => same(one, link))) {
      refuse(`Found a link this script did not make: ${link}. Nothing was deleted. See where it points and remove it by hand first.`)
    }
  }
  for (const { target, link } of ctx.shared) {
    if (!links.some((one) => same(one, link))) continue
    const leads = linkLeadsTo(link)
    if (leads === null || !existsSync(target) || !same(leads, realpathSync(target))) {
      refuse(`${link} points at ${leads ?? 'nothing'}, not at ${target}. Nothing was deleted.`)
    }
  }

  const total = folderBytes(ctx.dst)
  const heading = dryRun ? ' (dry run: nothing will be deleted)' : ''
  ctx.say(`Remove: ${ctx.dst}${heading}`)
  ctx.say(`  ${mb(total)} will be deleted, including its own data\\ (saves, settings, log):`)
  if (existsSync(ctx.dataDir)) ctx.say(`    ${ctx.dataDir}: ${mb(folderBytes(ctx.dataDir))}`)
  ctx.say(`  These links are taken off first; what they lead to is NOT deleted:`)
  for (const { target, link } of ctx.shared) {
    ctx.say(`    ${link} -> ${target}: ${links.some((one) => same(one, link)) ? 'link found' : 'not there'}`)
  }
  if (dryRun) return void ctx.say('Nothing was deleted.')

  const typed = await ctx.confirm(`Type the folder name (${basename(ctx.dst)}) to delete it: `, basename(ctx.dst))
  if (!typed) refuse('That is not the folder name. Nothing was deleted.')

  for (const link of links) rmdirSync(link)
  for (const { target } of ctx.shared) {
    if (!existsSync(target)) refuse(`${target} is missing after the links were removed. Stopped before deleting the rest.`)
  }
  const left = findLinks(ctx.dst)
  if (left.length > 0) refuse(`A link is still inside ${ctx.dst} (${left[0]}). Stopped before deleting the rest.`)
  rmSync(ctx.dst, { recursive: true, force: true })
  ctx.say(`Deleted ${ctx.dst}.`)
}

const USAGE = 'Usage: npm run exe:update|exe:remove -- [--dry-run] [--to "D:\\folder"]'

/** Reads `update`/`remove`, `--dry-run` and `--to <folder>`; anything else is a refusal. */
function readArguments(argv) {
  const [command, ...rest] = argv
  if (command !== 'update' && command !== 'remove') refuse(USAGE)
  let to = DEFAULT_TO
  let dryRun = false
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--dry-run') dryRun = true
    else if (rest[i] === '--to' && rest[i + 1] !== undefined) to = rest[++i]
    else refuse(USAGE)
  }
  return { command, to, dryRun }
}

async function main() {
  try {
    const { command, to, dryRun } = readArguments(process.argv.slice(2))
    const ctx = contextFor(REPO, to)
    await (command === 'update' ? update : remove)(ctx, { dryRun })
  } catch (err) {
    if (!(err instanceof Refusal)) throw err
    console.error(`\nRefused: ${err.message}`)
    process.exitCode = 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
}
