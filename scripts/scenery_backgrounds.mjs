// Dev tool, run by hand: asks Gemini 3.1 Flash Image for a few options of each new background
// (the Laurel Row houses) and writes them to a review folder, never to `assets/`.
//
//   node scripts/scenery_backgrounds.mjs --stage day            options of every scenery, from a style reference
//   node scripts/scenery_backgrounds.mjs --stage night          night options, edited from the chosen day image
//   node scripts/scenery_backgrounds.mjs --stage rain           rain options (the facades only), same source
//   node scripts/scenery_backgrounds.mjs --pick kappa_row_front:day:2     choose day_2 as that scenery's day image
//   node scripts/scenery_backgrounds.mjs --stage day --dry-run  list what would be sent, send nothing
//   node scripts/scenery_backgrounds.mjs --stage day --dry-run --only kappa_row_front   ...and print its prompts
//   node scripts/scenery_backgrounds.mjs --stage day --only kappa_row_front,xi_delt_front   just those ids
//   node scripts/scenery_backgrounds.mjs --stage day --options 5    five options (an existing day_N is skipped)
//   node scripts/scenery_backgrounds.mjs --stage day --force        redo day_1..N even where the file exists
//
// A choice is a copy of the option as `chosen_<stage>.png` in the scenery's review folder. Choosing a new
// day image moves the night and rain options and choices built on the old one into an `old_<date-time>`
// folder beside them; nothing is ever deleted. Not part of the game; nothing imports it.

import { copyFile, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import sharp from 'sharp'

// ── Settings ─────────────────────────────────────────────────────────────────────────────

/** Paid Gemini API key. Leave empty and set the GEMINI_API_KEY environment variable to keep it out of git. */
const GEMINI_API_KEY = ''

const MODEL_ID = 'gemini-3.1-flash-image'
const BG_DIR = resolve(import.meta.dirname, '..', 'assets', 'bg')
/** Not `data/tmp`: finishing the ComfyUI setup empties that one. */
const REVIEW_DIR = resolve(import.meta.dirname, '..', 'data', 'scenery_review')
const DEFAULT_OPTIONS = 3
const MAX_OPTIONS = 9
const CONCURRENCY = 3
const ATTEMPTS = 3
const BACKOFF_MS = [5_000, 15_000, 45_000]
const REQUEST_TIMEOUT_MS = 5 * 60_000
/** The size every shipped background has; a day option of another size is flagged. */
const DAY_SIZE = { width: 2752, height: 1536 }
const STAGES = ['day', 'night', 'rain']

const SAFETY_OFF = [
  'HARM_CATEGORY_HARASSMENT',
  'HARM_CATEGORY_HATE_SPEECH',
  'HARM_CATEGORY_SEXUALLY_EXPLICIT',
  'HARM_CATEGORY_DANGEROUS_CONTENT'
].map((category) => ({ category, threshold: 'BLOCK_NONE' }))

// ── Prompts ──────────────────────────────────────────────────────────────────────────────

const DAY_PREAMBLE =
  'Create a photorealistic wide 16:9 background for a visual novel set at a university in a sheltered, leafy valley town. ' +
  'The attached image is a style reference only: match its photographic look, natural light, colour grading, level of detail and camera height, but do not copy its buildings, furniture or objects. ' +
  'No people, figures, silhouettes, faces or body parts anywhere, not even in far windows or reflections. ' +
  'No readable text of any kind: no signs, lettering, numbers, banners, posters with words, book titles or screens showing words; no Greek letters, no logos, crests, emblems or flags. ' +
  'Eye level, with open space in the middle of the frame where characters will be placed later.'

const DAY_TAIL = {
  exterior: 'Bright late-morning sun, lush green trees.',
  interior: 'Natural daylight through the windows, nobody home.'
}

const NIGHT_TEXT = {
  exterior:
    'Generate a version of this image at night. Keep the same camera, framing and composition, with every object exactly where it is. ' +
    'Deep blue night sky with a few stars, warm light glowing in the windows, the porch and street lamps lit, soft pools of light on the ground.',
  interior:
    'Generate a version of this image at night: the same room, camera and objects, with the daylight gone. ' +
    'The windows show a dark night, and the room is lit by lamps, wall lights and ceiling lights, chandeliers lit where there are any. Warm artificial light.'
}
const NIGHT_CLOSING = 'Do not add any people or any text.'

const RAIN_TEXT = 'Generate a version of this image where it just finished raining outside and is still a little overcast.'

/** What every interior of one house shares, added after the scenery's own text so the rooms read as one building. */
const HOUSE_INTERIOR = {
  kappa_row: 'The house inside: dark-stained wooden beams and chunky wooden window frames, wide worn honey-coloured floorboards, plain off-white walls.',
  xi_delt: 'The house inside: dark wood panelling and deep green walls with white cornice moulding, tall multi-pane sash windows, polished oak and parquet floors.'
}

const FRONT_STREET = 'on Laurel Row, a quiet street of large old houses beside the campus, lined with laurel trees.'

/**
 * Every scenery: `reference` is an existing background (under assets/bg, without `.png`) that sets the style,
 * `rain` marks the ones that also get a rain version, `house` picks the interior sentence, `nightNote` is
 * added to the night text.
 */
const SCENERY = [
  {
    id: 'kappa_row_front',
    kind: 'exterior',
    reference: 'exterior/elysium_road_day',
    rain: true,
    text:
      `The front of Kappa Row, a fraternity house ${FRONT_STREET} ` +
      'A big, boxy two-and-a-half-storey Craftsman house clad in weathered dark grey-green wooden shingles, with low wide eaves, thick stone porch piers and a deep front porch crowded with mismatched sofas, a cooler and a hammock, cleats and a towel hung over the rail, a few plastic cups on the rail, a string of coloured party lights along the porch eaves; ' +
      'a basketball hoop on a pole at the edge of a cracked concrete driveway, a football on a trampled lawn, bicycles dumped on the grass, a scorched fire-pit ring in the side yard. ' +
      'Athletic, noisy, cheerful, a little messy; lived in hard and loved loudly.'
  },
  {
    id: 'xi_delt_front',
    kind: 'exterior',
    reference: 'exterior/elysium_road_day',
    rain: true,
    text:
      `The front of Xi Delt, a fraternity house ${FRONT_STREET} ` +
      'A stately symmetrical Georgian mansion of aged red brick with pale stone trim and a slate roof, a white-columned portico, a glossy black front door with a brass knocker, ivy climbing the walls, tall multi-pane windows, a clipped boxwood hedge and a low wrought-iron fence, a raked gravel drive with a stone urn on each side, a manicured lawn and an old oak. ' +
      'Old money, quiet, immaculate and a little imposing; nothing out of place.'
  },
  {
    id: 'sig_lam_front',
    kind: 'exterior',
    reference: 'exterior/elysium_road_day',
    rain: true,
    text:
      `The front of Sig Lam, a sorority house ${FRONT_STREET} ` +
      'A bright, welcoming painted-lady Queen Anne Victorian in soft coral, cream and sage green, with a round corner turret, a gingerbread-trimmed porch with a swing and wicker chairs, hanging flower baskets and pots of blooms on every step, fairy lights and plain paper bunting across the porch, a café table on the patio, a volleyball net strung across the side lawn with a ball resting beneath it, a pastel bicycle with a basket. ' +
      'Social, sunny, inviting, made for parties.'
  },
  {
    id: 'pi_theta_front',
    kind: 'exterior',
    reference: 'exterior/elysium_road_day',
    rain: true,
    text:
      `The front of Pi Theta, a sorority house ${FRONT_STREET} ` +
      'A dignified, tidy Tudor Revival house of grey stone and dark timber with a steep gabled roof, leaded-glass windows, a bay window with books lined along the sill, an arched oak door, neat raised beds of vegetables and herbs, a small wooden book-sharing box on a post by the gate, its glass door showing a few books, a wooden bench under a flowering crab-apple tree, a row of bicycles in a rack, trimmed hedges. ' +
      'Studious, orderly, warm and a little proper; sage green, grey stone and warm wood tones.'
  },
  {
    id: 'kappa_row_common',
    kind: 'interior',
    reference: 'interior/elysium_living_room_day',
    house: 'kappa_row',
    text:
      'The ground-floor common room of Kappa Row, a fraternity house in a big old Craftsman house. ' +
      'A big, loud, much-used living room: scuffed hardwood floor, an oversized worn sectional sofa and a mismatched armchair, a large TV switched off, a ping-pong table pushed against one wall with a few plastic cups on it, a mini-fridge, shelves crowded with trophies and game balls, a basketball and a football on the floor, a pile of sneakers by the door, hoodies and a duffel bag thrown over the furniture, throw blankets in red and charcoal, a bay window onto the porch. ' +
      'Athletic, comfortable, untidy.'
  },
  {
    id: 'xi_delt_common',
    kind: 'interior',
    reference: 'interior/elysium_living_room_day',
    house: 'xi_delt',
    text:
      'The ground-floor drawing room of Xi Delt, a fraternity house in a stately Georgian brick mansion. ' +
      'A formal old-money room: dark wood panelling, a stone fireplace with a mantel and a fire laid, oxblood leather Chesterfield sofas and wingback armchairs around a low table, a Persian rug over polished floorboards, brass lamps, built-in shelves of leather-bound books, landscape and still-life oil paintings in gilt frames (no portraits of people), a bar cart with crystal decanters, tall windows with heavy drapes onto a lawn, a chess table set up by the window. ' +
      'Refined, hushed, expensive, immaculate.'
  },
  {
    id: 'sorority_common',
    kind: 'interior',
    reference: 'interior/elysium_living_room_day',
    text:
      'The shared common room of the two sorority houses on Laurel Row. ' +
      'A large, bright, elegant-but-cosy living room in an old house: tall windows with sheer curtains, cream and sage upholstered sofas and armchairs around a coffee table, a long wooden table with chairs at one end for studying, built-in shelves of books and board games, fresh flowers in vases, a record player, string lights, soft rugs, and a clear open space in the middle of the room for gatherings. ' +
      'Warm, welcoming and tasteful; neither rowdy nor stuffy.'
  },
  {
    id: 'kappa_row_room',
    kind: 'interior',
    reference: 'interior/lowrise_dorm_room_day',
    house: 'kappa_row',
    text:
      "A member's private bedroom in Kappa Row, upstairs in an old house: " +
      'high ceiling, wooden floor, a tall sash window onto the leafy street, a single bed unmade with a dark red blanket, a desk with a closed laptop and clutter, a dumbbell rack and a pull-up bar in the doorframe, a basketball hoop hung on the door, sneakers and a duffel bag on the floor, a mini-fridge, a game console under a small TV, blank pennants and framed close-ups of balls on the walls, clothes thrown over a chair. ' +
      'Sporty, messy, personal; a room someone really lives in.'
  },
  {
    id: 'xi_delt_room',
    kind: 'interior',
    reference: 'interior/lowrise_dorm_room_day',
    house: 'xi_delt',
    text:
      "A member's private bedroom in Xi Delt, in a stately old house: " +
      'high ceiling with cornice moulding, polished wooden floor with a woollen rug, a tall window with heavy drapes onto a lawn and an old oak, a neatly made bed with crisp white linen and a tartan wool blanket, a dark wood desk with a brass lamp and a leather blotter, a leather armchair, a small bookshelf of leather-bound books, tailored jackets and ties hung on the wardrobe door, an antique rowing oar mounted on the wall, a framed landscape painting. ' +
      'Neat, refined, a little formal.'
  },
  {
    id: 'kappa_row_party',
    kind: 'interior',
    reference: 'interior/dorm_lounge_day',
    house: 'kappa_row',
    nightNote: 'The party lights are on: coloured string lights and the disco light glowing, the main lights low. Still empty.',
    text:
      'The party room of Kappa Row: the big ground-floor room of an old house, cleared for a party. ' +
      'Furniture pushed to the walls, speakers on stands, a folding table lined with rows of plastic cups, a table with cups arranged in triangles, a pool table, coloured string lights and a disco light, balloons, scuffed floor and wide-open space in the middle for dancing. ' +
      'Shown empty in daylight, the morning before the party. Loud, high-energy, casual.'
  },
  {
    id: 'xi_delt_party',
    kind: 'interior',
    reference: 'interior/elysium_living_room_day',
    house: 'xi_delt',
    nightNote: 'The chandeliers and wall sconces are lit, warm light on the bar and the glasses, the terrace dark beyond the French doors. Still empty.',
    text:
      'The party room of Xi Delt: the long reception room at the back of a stately Georgian brick mansion, set for an evening cocktail party. ' +
      'A polished parquet floor left open for dancing, a pair of crystal chandeliers, tall multi-pane windows and French doors with floor-length drapes opening onto a stone terrace, a long bar with crystal glasses, an ice bucket and champagne flutes, a few tall cocktail tables with white cloths, a grand piano in one corner, wall sconces. ' +
      'Elegant, old-money, glittering but private: a house, not a hotel or a ballroom. Shown empty.'
  }
]

const versionsOf = (scenery) => (scenery.rain ? STAGES : STAGES.slice(0, 2))
const sceneryOf = (id) => SCENERY.find((scenery) => scenery.id === id)

function promptOf(scenery, stage) {
  if (stage === 'rain') return RAIN_TEXT
  if (stage === 'night') {
    return [NIGHT_TEXT[scenery.kind], scenery.nightNote, NIGHT_CLOSING].filter(Boolean).join(' ')
  }
  return [DAY_PREAMBLE, scenery.text, scenery.house && HOUSE_INTERIOR[scenery.house], DAY_TAIL[scenery.kind]]
    .filter(Boolean)
    .join(' ')
}

// ── Arguments ────────────────────────────────────────────────────────────────────────────

function fail(message) {
  console.error(message)
  process.exit(2)
}

const KNOWN_FLAGS = ['--stage', '--only', '--options', '--pick', '--force', '--dry-run']
const argv = process.argv.slice(2)
for (const arg of argv.filter((a) => a.startsWith('--'))) {
  if (!KNOWN_FLAGS.includes(arg)) fail(`Unknown option ${arg}. Known: ${KNOWN_FLAGS.join(' ')}`)
}

function valueOf(flag) {
  const index = argv.indexOf(flag)
  if (index < 0) return null
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) fail(`${flag} needs a value`)
  return value
}

const force = argv.includes('--force')
const dryRun = argv.includes('--dry-run')
const stage = valueOf('--stage')
const pickArg = valueOf('--pick')
const onlyArg = valueOf('--only')
const optionsArg = valueOf('--options')

if (pickArg && (stage || onlyArg || optionsArg || force || dryRun)) {
  fail('--pick stands alone: it only copies a chosen option and sends nothing.')
}
if (!pickArg && !stage) {
  fail('Say what to do: --stage day|night|rain, or --pick <id>:<stage>:<number>. The header of this file lists the options.')
}
if (stage && !STAGES.includes(stage)) fail(`--stage is ${STAGES.join(', ')}, not "${stage}"`)

let optionCount = DEFAULT_OPTIONS
if (optionsArg !== null) {
  optionCount = Number(optionsArg)
  if (!Number.isInteger(optionCount) || optionCount < 1 || optionCount > MAX_OPTIONS) {
    fail(`--options is a whole number from 1 to ${MAX_OPTIONS}, not "${optionsArg}"`)
  }
}

const only = onlyArg ? onlyArg.split(',').filter(Boolean) : null
if (only) {
  const unknown = only.filter((id) => !sceneryOf(id))
  if (unknown.length) fail(`--only: unknown ${unknown.join(', ')}. Ids: ${SCENERY.map((s) => s.id).join(', ')}`)
  const without = only.filter((id) => !versionsOf(sceneryOf(id)).includes(stage))
  if (without.length) fail(`--only: ${without.join(', ')} has no ${stage} version (only the facades get rain).`)
}

const apiKey = GEMINI_API_KEY || process.env.GEMINI_API_KEY || ''

// ── Helpers ──────────────────────────────────────────────────────────────────────────────

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff])

/** The type the bytes really are; the file extension and the API's declared type both lie. */
function sniffMime(bytes) {
  if (bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return 'image/png'
  if (bytes.subarray(0, JPEG_SIGNATURE.length).equals(JPEG_SIGNATURE)) return 'image/jpeg'
  return null
}

const mb = (bytes) => `${(bytes.length / 1024 / 1024).toFixed(1)}MB`
const short = (mime) => (mime ?? 'unknown').replace('image/', '')
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

const dirOf = (scenery) => join(REVIEW_DIR, scenery.id)
const optionPathOf = (scenery, name, number) => join(dirOf(scenery), `${name}_${number}.png`)
const chosenPathOf = (scenery, name) => join(dirOf(scenery), `chosen_${name}.png`)
const referencePathOf = (scenery) => join(BG_DIR, `${scenery.reference}.png`)

const warnings = []
function warn(message) {
  warnings.push(message)
  console.warn(`⚠ ${message}`)
}

class RequestError extends Error {
  constructor(message, retryable) {
    super(message)
    this.retryable = retryable
  }
}

/** One generateContent call: the source image first, then the prompt. Answers the raw image bytes and the declared type. */
async function requestImage(bytes, mime, prompt, imageConfig) {
  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ inlineData: { mimeType: mime, data: bytes.toString('base64') } }, { text: prompt }]
      }
    ],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      thinkingConfig: { thinkingLevel: 'high' },
      imageConfig
    },
    safetySettings: SAFETY_OFF
  }

  let response
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      }
    )
  } catch (error) {
    throw new RequestError(`network: ${error?.message ?? error}`, true)
  }

  const text = await response.text()
  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500
    throw new RequestError(`HTTP ${response.status}: ${text.slice(0, 500)}`, retryable)
  }

  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new RequestError(`not JSON: ${text.slice(0, 200)}`, true)
  }

  const candidate = parsed.candidates?.[0]
  const parts = candidate?.content?.parts ?? []
  for (const part of parts) {
    if (!part.thought && part.inlineData?.data) {
      return { bytes: Buffer.from(part.inlineData.data, 'base64'), mime: part.inlineData.mimeType }
    }
  }
  const reason = [
    candidate?.finishReason && `finishReason=${candidate.finishReason}`,
    parsed.promptFeedback?.blockReason && `blockReason=${parsed.promptFeedback.blockReason}`,
    parts.map((part) => part.text ?? '').join('').slice(0, 300)
  ]
    .filter(Boolean)
    .join(' | ')
  throw new RequestError(`no image in reply: ${reason || text.slice(0, 300)}`, true)
}

/** Re-encodes whatever the model answered as a PNG and reads its size. */
async function toPng(bytes) {
  const png = await sharp(bytes).png().toBuffer()
  const { width, height } = await sharp(png).metadata()
  return { png, width, height }
}

async function withRetries(fn, label) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn()
    } catch (error) {
      const canRetry = error instanceof RequestError && error.retryable && attempt < ATTEMPTS
      if (!canRetry) throw error
      const wait = BACKOFF_MS[attempt - 1] ?? BACKOFF_MS.at(-1)
      console.warn(`  ${label}: attempt ${attempt} failed (${error.message}); retrying in ${wait / 1000}s`)
      await sleep(wait)
    }
  }
}

// ── Picking ──────────────────────────────────────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, '0')
function stamp() {
  const d = new Date()
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

/** Moves files into the scenery's `old_<date-time>` folder, keeping every name; nothing is deleted. */
async function moveAside(scenery, paths, folderName) {
  const folder = join(dirOf(scenery), folderName)
  await mkdir(folder, { recursive: true })
  for (const path of paths) {
    const name = path.slice(dirOf(scenery).length + 1)
    let target = join(folder, name)
    for (let n = 2; existsSync(target); n++) target = join(folder, `${n}_${name}`)
    await rename(path, target)
  }
  return folder
}

function parsePick(spec) {
  const parts = spec.split(':')
  if (parts.length !== 3) fail(`--pick ${spec}: write it as <id>:<stage>:<number>, e.g. kappa_row_front:day:2`)
  const [id, pickStage, numberText] = parts
  const scenery = sceneryOf(id)
  if (!scenery) fail(`--pick ${spec}: unknown id "${id}". Ids: ${SCENERY.map((s) => s.id).join(', ')}`)
  if (!versionsOf(scenery).includes(pickStage)) {
    fail(`--pick ${spec}: ${id} has no "${pickStage}" version (${versionsOf(scenery).join(', ')}).`)
  }
  if (!/^[1-9]\d*$/.test(numberText)) fail(`--pick ${spec}: the number is the option's, e.g. 2 for ${pickStage}_2.png`)
  const source = optionPathOf(scenery, pickStage, Number(numberText))
  if (!existsSync(source)) fail(`--pick ${spec}: there is no ${source}`)
  return { scenery, pickStage, source }
}

async function applyPick({ scenery, pickStage, source }) {
  const dest = chosenPathOf(scenery, pickStage)
  const next = await readFile(source)
  const current = existsSync(dest) ? await readFile(dest) : null
  if (current?.equals(next)) {
    console.log(`${scenery.id} ${pickStage}: that option is already the chosen one`)
    return
  }

  const names = await readdir(dirOf(scenery))
  const moving = []
  if (current) moving.push(dest)
  if (pickStage === 'day') {
    for (const name of names) {
      if (/^(night|rain)_\d+\.png$/.test(name) || name === 'chosen_night.png' || name === 'chosen_rain.png') {
        moving.push(join(dirOf(scenery), name))
      }
    }
  }
  if (moving.length) {
    const folder = await moveAside(scenery, moving, `old_${stamp()}`)
    warn(
      `${scenery.id}: moved ${moving.length} file(s) built on the previous choice into ${folder}` +
        (pickStage === 'day' ? '; generate the night and rain options again from the new day image' : '')
    )
  }

  const temp = `${dest}.tmp`
  await copyFile(source, temp)
  await rename(temp, dest)
  console.log(`${scenery.id}: ${pickStage} → ${dest}`)
}

if (pickArg) {
  const picks = pickArg.split(',').filter(Boolean).map(parsePick)
  for (const pick of picks) await applyPick(pick)
  process.exit(0)
}

// ── Jobs ─────────────────────────────────────────────────────────────────────────────────

const sourcePathOf = (scenery) => (stage === 'day' ? referencePathOf(scenery) : chosenPathOf(scenery, 'day'))

let targets = SCENERY.filter((scenery) => !only || only.includes(scenery.id)).filter((scenery) =>
  versionsOf(scenery).includes(stage)
)

const noSource = targets.filter((scenery) => !existsSync(sourcePathOf(scenery)))
if (noSource.length) {
  const what = stage === 'day' ? 'reference background' : 'chosen day image'
  const fixOf = (scenery) => (stage === 'day' ? '' : ` Choose one first: --pick ${scenery.id}:day:<number>`)
  if (stage === 'day' || only) {
    const list = noSource.map((scenery) => `${scenery.id} (${sourcePathOf(scenery)})`).join(', ')
    fail(`No ${what} for ${list}.${fixOf(noSource[0])}`)
  }
  for (const scenery of noSource) warn(`${scenery.id}: no ${what}, skipped.${fixOf(scenery)}`)
  targets = targets.filter((scenery) => !noSource.includes(scenery))
}

const skipped = []
const queue = []
for (const scenery of targets) {
  for (let number = 1; number <= optionCount; number++) {
    const job = { scenery, number, label: `${scenery.id} ${stage}_${number}` }
    if (!force && existsSync(optionPathOf(scenery, stage, number))) skipped.push(job)
    else queue.push(job)
  }
}

const labelsOf = (list) => list.map((job) => job.label).join(', ')
const imageConfig = stage === 'day' ? { aspectRatio: '16:9', imageSize: '2K' } : { imageSize: '2K' }
console.log(`${MODEL_ID}, thinking high, 2K, aspect ${stage === 'day' ? '16:9' : 'auto'}; stage ${stage}, ${optionCount} option(s); ${REVIEW_DIR}`)
if (skipped.length) console.log(`skipping (file exists, --force to redo): ${labelsOf(skipped)}`)
if (queue.length === 0) {
  console.log('nothing to send')
  process.exit(0)
}
if (!dryRun && !apiKey) {
  fail('No API key: fill in GEMINI_API_KEY at the top of scripts/scenery_backgrounds.mjs or set the GEMINI_API_KEY environment variable.')
}
console.log(`${dryRun ? 'would send' : 'sending'} ${queue.length}: ${labelsOf(queue)}`)

if (dryRun) {
  const shown = new Set()
  for (const { scenery } of queue) {
    if (shown.has(scenery.id)) continue
    shown.add(scenery.id)
    const source = stage === 'day' ? `reference ${scenery.reference}.png` : 'chosen_day.png'
    console.log(`  ${scenery.id}: source ${source}`)
    if (only) console.log(`\n${promptOf(scenery, stage)}\n`)
  }
  process.exit(0)
}

async function processOne({ scenery, number, label }) {
  const targetPath = optionPathOf(scenery, stage, number)
  const tempPath = `${targetPath}.tmp`

  const source = await readFile(sourcePathOf(scenery))
  const sourceMime = sniffMime(source)
  if (!sourceMime) throw new Error(`${label}: source is neither PNG nor JPEG`)
  console.log(`→ ${label} (${short(sourceMime)}, ${mb(source)})`)

  const started = Date.now()
  const answer = await withRetries(
    () => requestImage(source, sourceMime, promptOf(scenery, stage), imageConfig),
    label
  )
  const realMime = sniffMime(answer.bytes)
  if (!realMime) throw new Error(`${label}: the model answered ${answer.bytes.length} bytes that are not an image (declared ${answer.mime})`)
  const declared = realMime === answer.mime ? short(realMime) : `${short(realMime)}, declared ${short(answer.mime)}`

  const { png, width, height } = await toPng(answer.bytes)
  await mkdir(dirOf(scenery), { recursive: true })
  await writeFile(tempPath, png)
  await rename(tempPath, targetPath)
  const seconds = Math.round((Date.now() - started) / 1000)
  console.log(`← ${label} ${width}×${height} ${declared} → png ${mb(png)} in ${seconds}s`)

  const expected = stage === 'day' ? DAY_SIZE : await sharp(source).metadata()
  if (width !== expected.width || height !== expected.height) {
    warn(`${label} is ${width}×${height}, expected ${expected.width}×${expected.height}${stage === 'day' ? '' : ' (the chosen day image)'}`)
  }
}

const failures = []
let written = 0
let next = 0
async function worker() {
  while (next < queue.length) {
    const job = queue[next++]
    try {
      await processOne(job)
      written++
    } catch (error) {
      failures.push({ label: job.label, message: error?.message ?? String(error) })
      console.error(`✗ ${job.label}: ${error?.message ?? error}`)
      await rm(`${optionPathOf(job.scenery, stage, job.number)}.tmp`, { force: true })
    }
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker))

console.log(`\nwritten ${written}, skipped ${skipped.length}, failed ${failures.length}, warnings ${warnings.length}`)
for (const { label, message } of failures) console.log(`  ${label}: ${message}`)
for (const message of warnings) console.log(`  ⚠ ${message}`)
process.exit(failures.length ? 1 : 0)
