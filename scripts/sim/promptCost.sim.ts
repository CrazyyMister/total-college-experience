import { createHash } from 'crypto'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { it, vi } from 'vitest'

// A bridge that answers subscriptions and refuses every other call, so nothing can reach the disk.
vi.hoisted(() => {
  const bridge = (path: string): unknown =>
    new Proxy(() => {}, {
      get: (_target, key) => (key === 'platform' ? 'desktop' : bridge(`${path}.${String(key)}`)),
      apply: () => {
        if (/\.on[A-Z]\w*$/.test(path)) return () => {}
        throw new Error(`The measurement called the bridge: ${path}`)
      }
    })
  ;(globalThis as { window?: unknown }).window = { api: bridge('api') }
})
import { readCharacterRecord } from '@shared/characterRules'
import { leftTheReader, MEMORY_CAP } from '@shared/relationship'
import {
  charKeyOf,
  READER_SPEAKER,
  type Character,
  type GameSave,
  type Gender,
  type PlaythroughRecord,
  type SceneLine,
  type StructuredRequest
} from '@shared/types'
import type { NpcSceneEvent } from '@shared/npcRomance'
import { posterRomanceOf, type GuaranteedPosters } from '@shared/npcRomancePosts'
import type { GossipTopic } from '@shared/npcRomanceGossip'
import { useAssetStore } from '../../src/renderer/stores/assetStore'
import { useGameStore } from '../../src/renderer/stores/gameStore'
import {
  debugAffection,
  debugAffinity,
  debugCouple,
  debugCrush,
  debugDriftBack,
  debugLeakCrush,
  debugLover,
  type DebugResult
} from '../../src/renderer/stores/npcRomanceDebugActions'
import { loopState } from '../../src/renderer/stores/loop/state'
import {
  applyReaderLosses,
  rollNpcRomanceSettle,
  slotRomancePosters
} from '../../src/renderer/stores/loop/npc'
import { introGossipOf, slotGossipOf } from '../../src/renderer/stores/loop/gossip'
import {
  promptState,
  reader,
  recentSummaries,
  scheduleInput
} from '../../src/renderer/stores/loop/promptState'
import {
  buildClosingPrompt,
  buildContinuationPrompt,
  buildLedgerPrompt,
  buildScenePrompt,
  type PromptState,
  type ScenePromptState
} from '../../src/renderer/prompts/scenePrompt'
import { buildTextingPrompt, hasTexted } from '../../src/renderer/prompts/textingPrompt'
import {
  buildSlotIntroPrompt,
  type IntroBreakup,
  type IntroGossip,
  type IntroPoster,
  type SlotIntroInput
} from '../../src/renderer/prompts/slotIntroPrompt'
import { SETTING } from '../../src/renderer/prompts/setting'
import { occasionsAt } from '../../src/renderer/prompts/occasions'
import { shippedBackgrounds } from '../../src/renderer/views/bgAssets'

/**
 * Measures what the roster's romance and the men of the cast add to the four prompts that carry
 * them — scene, texting, ledger and slot opening — without calling the writer and without
 * writing anything: the test playthrough is loaded into the store in memory, each scenario is set
 * up through the development build's F9 actions and the romance settle a scene ending runs, and
 * the builders are called as the loop calls them. Tokens are estimated as characters ÷ 4.
 */

const ROOT = resolve(__dirname, '../..')
const FOLDER = resolve(ROOT, 'testsave/1790392968199')
/** Day 57, the week after spring break: every name known, nine contacts, nobody at the cap yet. */
const SAVE = 'manual04.json'
/** Day 113: most of the roster at the memory cap and a lover, for the memory check. */
const LATE_SAVE = 'manual05.json'
const GRABBAGS = resolve(ROOT, 'data/grabbags.json')
const SEED_WORD = 'lantern'

const tokens = (chars: number): number => Math.round(chars / 4)

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

type Identity = { gender: Gender; attractedTo: Gender }
const man = (attractedTo: Gender): Identity => ({ gender: 'man', attractedTo })
const WOMAN_FOR_WOMEN: Identity = { gender: 'woman', attractedTo: 'woman' }

/** The two rosters the romance simulation uses, by roster position; the rest stay as they are. */
const FOUR_MEN: Identity[] = [man('woman'), man('woman'), man('woman'), man('man'), WOMAN_FOR_WOMEN]
const EIGHT_MEN: Identity[] = [
  man('woman'),
  man('woman'),
  man('woman'),
  man('woman'),
  man('woman'),
  man('woman'),
  man('man'),
  man('man')
]

/** Loads a save of the test playthrough into the store, with some of its cast made men. */
function load(file: string, identities: readonly Identity[]): string[] {
  const record = readJson<PlaythroughRecord>(resolve(FOLDER, 'playthrough.json'))
  const save = readJson<GameSave>(resolve(FOLDER, file))
  const characters: Record<string, Character> = {}
  record.chars.forEach((charId, i) => {
    const path = resolve(ROOT, 'assets/characters', charId, 'character.json')
    const character = readCharacterRecord(readJson<unknown>(path), path).character
    characters[charId] = identities[i] ? { ...character, ...identities[i] } : character
  })
  useGameStore.getState().loadSave({ ...save, playthroughId: 'measure', saveId: 'measure' }, record, characters)
  useAssetStore.setState({ backgrounds: shippedBackgrounds() })
  loopState.debugRomanceBefore = null
  loopState.debugGossipLeak = null
  return record.chars
}

/** Runs an F9 action and stops the measurement if the game's rules refused it. */
function f9(result: DebugResult): void {
  if (!result.ok) throw new Error(`F9 refused: ${result.text}`)
}

/**
 * One scene ending's romance settle, stored the way the boundary stores it, with the grudge
 * memories of any man the reader displaced. Returns who the next opening has posting for sure.
 */
function sceneEnding(cast: string[] = [], events: NpcSceneEvent[] = []): GuaranteedPosters {
  const game = useGameStore.getState()
  useGameStore.setState({ cast })
  const out = rollNpcRomanceSettle(game.npcRelationships, [], game.charInfo, events)
  const guaranteed = slotRomancePosters(out.romance, game.charInfo, game.date, game.time)
  game.setNpcRelationships(out.relationships)
  game.setNpcRomance(out.romance)
  applyReaderLosses(out.readerBreakups, out.rivals)
  useGameStore.setState({ cast: [] })
  loopState.debugRomanceBefore = null
  return guaranteed
}

// ─── What counts as ours ────────────────────────────────────────────────────────────────────

/** The blocks the men of the cast and the roster's romance added, each with the step it came in. */
const BLOCKS = [
  ['Gênero do personagem', '2'],
  ['Não é opção romântica + respeito', '3'],
  ['Casais e ex (conhecimento comum)', '5a'],
  ['Paixões de quem está presente', '5a'],
  ['Recusas recentes', '5a'],
  ['Casal presente na cena', '5a'],
  ['Confissões possíveis', '5a'],
  ['Comportamento com parceiro/paixão', '5a'],
  ['Ciúme de quem gosta da namorada', '5a'],
  ['Afastamento', '5b'],
  ['Rival', '5b'],
  ['Resumo: instruções de romance', '5a'],
  ['Resumo: campo romance no formato', '5a'],
  ['Abertura: motivo do término', '5b'],
  ['Abertura: vida amorosa de quem posta', '6c'],
  ['Abertura: post garantido/dica', '6c'],
  ['Abertura: instruções de romance nos posts', '6c'],
  ['Abertura: fofoca', '6d'],
  ['Abertura: instruções da fofoca', '6d'],
  ['Abertura: campo fofoca no formato', '6d']
] as const
type Block = (typeof BLOCKS)[number][0]

/** The romance heading's own line counts with the common-knowledge lines under it. */
const ROMANCE_LINES: ReadonlyArray<readonly [RegExp, Block]> = [
  [/^ROMANCE BETWEEN CHARACTERS$/, 'Casais e ex (conhecimento comum)'],
  [/ are a couple; they got together | are exes: they got together |^Who is dating whom/, 'Casais e ex (conhecimento comum)'],
  [/ has had a secret crush on /, 'Paixões de quem está presente'],
  [/ is dating the reader, so .* is jealous of him/, 'Ciúme de quem gosta da namorada'],
  [/ and the reader are drifting apart/, 'Afastamento'],
  [/ resents the reader for it/, 'Rival'],
  [/ turned (him|her|them) down\. Both of them remember it\./, 'Recusas recentes'],
  [/ are both here, and they are a couple\./, 'Casal presente na cena'],
  [/^Of the characters here, the only romantic confessions|^Nobody here can confess romantic/, 'Confissões possíveis']
]

/** Every line of ours in a scene, texting or ledger message, and the block it belongs to. */
function classifyLine(line: string): Block | null {
  if (/^Gender: (man|woman) \(/.test(line)) return 'Gênero do personagem'
  if (/ is not a romantic option for the reader: | respects people with /.test(line)) {
    return 'Não é opção romântica + respeito'
  }
  if (/^Towards \S+, (his|her|their) (partner|secret crush): /.test(line)) {
    return 'Comportamento com parceiro/paixão'
  }
  for (const [pattern, block] of ROMANCE_LINES) if (pattern.test(line)) return block
  return null
}

/** What one prompt weighs, and how much of it is ours. */
interface Measure {
  total: number
  blocks: Partial<Record<Block, number>>
  /** Where in `user` our last line ends, for the cache check. */
  lastOurs: number
  /** Our lines, joined, to compare turn with turn. */
  ours: string
}

const schemaText = (request: StructuredRequest): string => JSON.stringify(request.schema)
const totalOf = (request: StructuredRequest): number =>
  request.system.length + request.user.length + schemaText(request).length

/** Measures a scene, texting or ledger request line by line. */
function measure(request: StructuredRequest): Measure {
  const blocks: Partial<Record<Block, number>> = {}
  const add = (block: Block, chars: number): void => {
    blocks[block] = (blocks[block] ?? 0) + chars
  }
  let at = 0
  let lastOurs = 0
  const ours: string[] = []
  let inRomanceRules = false
  const lines = request.user.split('\n')
  lines.forEach((line, i) => {
    const end = at + line.length + 1
    // The ledger's rules for its romance field: the heading followed by the gloss, up to a blank.
    if (line === 'ROMANCE BETWEEN CHARACTERS' && lines[i + 1]?.startsWith('Report what this scene')) {
      inRomanceRules = true
    }
    if (inRomanceRules) {
      add('Resumo: instruções de romance', line.length + 1)
      if (line === '') inRomanceRules = false
    } else {
      const block = classifyLine(line)
      if (block) {
        add(block, line.length + 1)
        ours.push(line)
        lastOurs = end
      }
    }
    at = end
  })
  const romanceField = (request.schema.schema as { properties?: Record<string, unknown> }).properties?.romance
  if (request.cacheKey === 'ledger' && romanceField) {
    add('Resumo: campo romance no formato', JSON.stringify({ romance: romanceField }).length + ',"romance"'.length)
  }
  return { total: totalOf(request), blocks, lastOurs, ours: ours.join('\n') }
}

/** Measures a slot opening, whose romance rides the posters' keys and its own blocks. */
function measureIntroRequest(request: StructuredRequest, input: SlotIntroInput): Measure {
  const base = measure({ ...request, cacheKey: 'intro' })
  const blocks = { ...base.blocks }
  const add = (block: Block, chars: number): void => {
    if (chars > 0) blocks[block] = (blocks[block] ?? 0) + chars
  }
  const lines = request.user.split('\n')
  const keys = new Set(input.posters.map((poster) => poster.charKey))
  for (const line of lines) {
    const match = /^- (\S+) — (.*)$/.exec(line)
    if (match && keys.has(match[1])) {
      // Everything past the bare key is a note of ours; a post's topic or hint is told apart.
      const topics = match[2].split('; ').filter((note) => note.startsWith('THIS POST'))
      const topicChars = topics.reduce((sum, note) => sum + note.length + 2, 0)
      add('Abertura: post garantido/dica', topicChars)
      add('Abertura: vida amorosa de quem posta', line.length - `- ${match[1]}`.length - topicChars)
    }
    if (/^Where their love life is given beside a character/.test(line)) {
      add('Abertura: instruções de romance nos posts', line.length + 1)
    }
    if (/^- \S+ — (things have gone cold|.* could not forgive him for cheating)/.test(line)) {
      const breakup = input.breakups.find((entry) => line.startsWith(`- ${entry.charKey} — `))
      const plain = breakup ? `- ${breakup.charKey} — he started dating ${breakup.forFirstName}`.length : 0
      add('Abertura: motivo do término', line.length - plain)
    }
  }
  const mayMention =
    ' They may mention a partner, an ex or a new relationship given beside them, by the name given there and no other, and never name somebody given as "someone"; otherwise they do not refer to meeting anyone.'
  if (request.user.includes(mayMention)) {
    add('Abertura: instruções de romance nos posts', mayMention.length - ' They do not refer to meeting anyone.'.length)
  }
  const closer =
    ' Where the reason names somebody they have grown closer to, that person is not their partner and nothing has happened with them yet: do not say otherwise.'
  if (request.user.includes(closer)) add('Abertura: motivo do término', closer.length)
  const gossipAt = lines.indexOf('CAMPUS GOSSIP')
  if (gossipAt >= 0) add('Abertura: fofoca', lines.slice(gossipAt, gossipAt + 4).join('\n').length + 1)
  for (const line of lines) {
    if (/^Then fill "gossip"|^The narration in "lines" must not mention this gossip|^Return nothing at all for "gossip"\.$/.test(line)) {
      add('Abertura: instruções da fofoca', line.length + 2)
    }
  }
  const gossipField = (request.schema.schema as { properties?: Record<string, unknown> }).properties?.gossip
  if (gossipField) add('Abertura: campo fofoca no formato', JSON.stringify({ gossip: gossipField }).length)
  return { ...base, blocks }
}

const oursOf = (m: Measure): number => Object.values(m.blocks).reduce((sum, n) => sum + (n ?? 0), 0)

// ─── The calls, built as the loop builds them ───────────────────────────────────────────────

const byId = (id: string): Character => useGameStore.getState().characters[id]

/** A made-up exchange of the scene so far, long enough to stand for two turns. */
function transcriptFor(cast: readonly Character[], turns: number): SceneLine[] {
  const lines: SceneLine[] = [{ speaker: '', text: 'You head over and find them already talking.', bg: 'lowrise_dorm_room' }]
  for (let turn = 0; turn < turns; turn++) {
    lines.push({ speaker: READER_SPEAKER, text: `"So what are you two up to?" I ask. (turn ${turn + 1})` })
    for (const character of cast) {
      lines.push({
        speaker: charKeyOf(character.firstName, character.lastName),
        text: `${character.firstName} shrugs and says something about the week so far.`
      })
    }
  }
  return lines
}

interface SceneMeasures {
  opening: Measure
  turn2: Measure
  turn3: Measure
  closing: Measure
  ledger: Measure
  /** Characters the opening and the second turn share from the start, system included. */
  sharedPrefix: number
  /** Where our last line ends in the opening, system included. */
  oursEnd: number
  stable: boolean
}

/** A scene with `castIds`: its opening, two continuations, its closing and its ledger. */
function measureScene(castIds: readonly string[]): SceneMeasures {
  useGameStore.setState({ cast: [...castIds] })
  const cast = castIds.map(byId)
  const base: PromptState = promptState()
  const state: ScenePromptState = { ...base, seedWord: SEED_WORD }
  const later = (turn: number): ScenePromptState => ({
    ...state,
    // What moves between turns: where the stage stands.
    bg: 'lowrise_dorm_room',
    emotions: Object.fromEntries(cast.map((c, i) => [c.charId, i % 2 === 0 ? 'happy' : 'neutral'])),
    onStage: cast.map((c) => c.charId),
    seedWord: `${SEED_WORD}${turn}`
  })
  const who = reader()
  const opening = buildScenePrompt(cast, 'I go say hi.', state, SETTING, who)
  const turn2 = buildContinuationPrompt(cast, 'I ask how they are.', transcriptFor(cast, 1), later(2), SETTING, who, null, 2)
  const turn3 = buildContinuationPrompt(cast, 'I tell a joke.', transcriptFor(cast, 2), later(3), SETTING, who, 'The reader said hi and asked how they were.', 3)
  const closing = buildClosingPrompt(cast, transcriptFor(cast, 3), later(4), SETTING, who, 'The reader chatted with them.')
  const ledger = buildLedgerPrompt(cast, transcriptFor(cast, 3), base, who, scheduleInput(base.date, base.time))
  useGameStore.setState({ cast: [] })

  const m = [opening, turn2, turn3, closing].map(measure)
  const a = `${opening.system}\n${opening.user}`
  const b = `${turn2.system}\n${turn2.user}`
  let shared = 0
  while (shared < a.length && a[shared] === b[shared]) shared++
  return {
    opening: m[0],
    turn2: m[1],
    turn3: m[2],
    closing: m[3],
    ledger: measure(ledger),
    sharedPrefix: shared,
    oursEnd: opening.system.length + 1 + m[0].lastOurs,
    stable: m.every((one) => one.ours === m[0].ours)
  }
}

/** A thread with `charId`, as the texting loop builds it. */
function measureTexting(charId: string): Measure {
  const game = useGameStore.getState()
  const character = byId(charId)
  const request = buildTextingPrompt(
    character,
    game.charInfo[charId],
    game.bunnyboard.conversations[charId],
    'hey, what are you up to tonight?',
    {
      date: game.date,
      time: game.time,
      stats: game.stats,
      roster: game.chars.filter((id) => id !== charId).map(byId),
      charInfo: game.charInfo,
      npcRelationships: game.npcRelationships,
      npcRomance: game.npcRomance,
      classes: game.classes,
      playerSchedule: game.playerSchedule,
      playerJob: game.job,
      occasions: game.occasions,
      weather: game.weather,
      charLocation: null,
      springBreakAway: game.springBreakAway
    },
    reader()
  )
  return measure(request)
}

/**
 * The next slot's opening with `posterIds` rolled in, whoever the ending has posting for sure,
 * the gossip it picked and any lover leaving the reader.
 */
function measureIntro(
  posterIds: readonly string[],
  guaranteed: GuaranteedPosters | null,
  gossipTopic: GossipTopic | null,
  breakups: IntroBreakup[] = []
): Measure {
  const game = useGameStore.getState()
  const sure = new Map((guaranteed?.posters ?? []).map((poster) => [poster.charId, poster]))
  const knownName = (id: string): string | undefined =>
    game.charInfo[id]?.nameKnown ? game.characters[id]?.firstName : undefined
  const ids = game.chars.filter((id) => posterIds.includes(id) || sure.has(id))
  const posters: IntroPoster[] = ids.map((id) => {
    const character = byId(id)
    const loveLife = posterRomanceOf(game.npcRomance, id, game.date, knownName)
    const one = sure.get(id)
    return {
      charKey: charKeyOf(character.firstName, character.lastName),
      character,
      info: game.charInfo[id],
      texted: hasTexted(game.bunnyboard.conversations[id]),
      ...(loveLife ? { romance: loveLife } : {}),
      ...(one && one.news.length > 0
        ? {
            news: one.news.map(({ kind, with: other }) => {
              const name = knownName(other)
              return { kind, ...(name ? { name } : {}) }
            })
          }
        : {}),
      ...(one?.driftHint ? { driftHint: one.driftHint } : {})
    }
  })
  const gossip: IntroGossip | null = gossipTopic ? introGossipOf(gossipTopic, game.charInfo) : null
  const input: SlotIntroInput = {
    playthroughId: 'measure',
    date: game.date,
    time: game.time,
    stats: game.stats,
    opening: 'You open your eyes.',
    lessNsfwText: false,
    recent: recentSummaries(game.date, game.time),
    askers: [],
    breakups,
    posters,
    occasions: occasionsAt(game.date, game.time, game.occasions),
    weather: game.weather,
    springBreakAway: game.springBreakAway,
    ...(gossip ? { gossip } : {})
  }
  return measureIntroRequest(buildSlotIntroPrompt(input, SETTING, reader()), input)
}

// ─── The scenarios ──────────────────────────────────────────────────────────────────────────

interface ScenarioResult {
  name: string
  scenes: Array<{ label: string; result: SceneMeasures }>
  texting: Array<{ label: string; result: Measure }>
  intro: Measure
  notes: string[]
}

function defaultCast(): ScenarioResult {
  const chars = load(SAVE, [])
  return {
    name: 'Elenco padrão, sem homens',
    scenes: [
      { label: `cena a dois (${byId(chars[5]).firstName}, ${byId(chars[6]).firstName})`, result: measureScene([chars[5], chars[6]]) },
      { label: 'cena a três', result: measureScene([chars[5], chars[6], chars[7]]) }
    ],
    texting: [{ label: `celular com ${byId(chars[5]).firstName}`, result: measureTexting(chars[5]) }],
    intro: measureIntro([chars[5], chars[6]], null, null),
    notes: []
  }
}

function menAndACouple(): ScenarioResult {
  const c = load(SAVE, FOUR_MEN)
  f9(debugCouple(c[0], c[5]))
  const guaranteed = slotRomancePosters(useGameStore.getState().npcRomance, useGameStore.getState().charInfo, useGameStore.getState().date, useGameStore.getState().time)
  const name = (i: number): string => byId(c[i]).firstName
  return {
    name: `4 homens + 1 mulher atraída por mulheres; um casal (${name(0)} e ${name(5)})`,
    scenes: [
      { label: `cena com o casal (${name(0)}, ${name(5)})`, result: measureScene([c[0], c[5]]) },
      { label: `cena a três (casal + ${name(1)})`, result: measureScene([c[0], c[5], c[1]]) },
      { label: `cena a dois sem o casal (${name(1)}, ${name(6)})`, result: measureScene([c[1], c[6]]) }
    ],
    texting: [
      { label: `celular com ${name(0)} (homem, no casal)`, result: measureTexting(c[0]) },
      { label: `celular com ${name(6)} (fora do casal)`, result: measureTexting(c[6]) }
    ],
    intro: measureIntro([c[6], c[7]], guaranteed, null),
    notes: []
  }
}

/** The part of both worst cases that comes before the couples: two exes, a rival and a turn-down. */
function exesAndRival(c: readonly string[]): void {
  f9(debugCouple(c[2], c[10]))
  f9(debugCouple(c[3], c[9]))
  f9(debugAffinity(c[2], c[10], -1))
  f9(debugLover(c[9], true))
  // The ending that breaks both couples up, and a scene where one turned a declaration down.
  sceneEnding([c[4], c[10]], [{ kind: 'declared', from: c[4], to: c[10], accepted: false }])
}

function worstThreeCouples(): ScenarioResult {
  const c = load(SAVE, EIGHT_MEN)
  exesAndRival(c)
  f9(debugCouple(c[0], c[8]))
  f9(debugCouple(c[1], c[11]))
  f9(debugCouple(c[6], c[7]))
  const game = useGameStore.getState()
  const guaranteed = slotRomancePosters(game.npcRomance, game.charInfo, game.date, game.time)
  f9(debugCrush(c[4], c[8], 8))
  f9(debugCrush(c[5], c[9], 8))
  f9(debugCrush(c[3], c[11], 8))
  f9(debugLeakCrush(c[5]))
  const gossip = slotGossipOf(useGameStore.getState().npcRomance, [], useGameStore.getState().charInfo, useGameStore.getState().date).topic
  const name = (i: number): string => byId(c[i]).firstName
  return {
    name: '8 homens; 3 casais formados no mesmo fim de cena, 2 ex (um rival), 1 recusa recente, 3 paixões, 1 namorada do jogador',
    scenes: [
      { label: `casal + quem gosta dela (${name(0)}, ${name(8)}, ${name(4)})`, result: measureScene([c[0], c[8], c[4]]) },
      { label: `namorada + quem gosta dela + rival (${name(9)}, ${name(5)}, ${name(3)})`, result: measureScene([c[9], c[5], c[3]]) }
    ],
    texting: [
      { label: `celular com ${name(4)} (paixão + recusa)`, result: measureTexting(c[4]) },
      { label: `celular com ${name(9)} (namorada)`, result: measureTexting(c[9]) }
    ],
    intro: measureIntro([c[4], c[5]], guaranteed, gossip),
    notes: [`fofoca: ${gossip?.kind ?? 'nenhuma'}`]
  }
}

function worstDrift(): ScenarioResult {
  const c = load(SAVE, EIGHT_MEN)
  exesAndRival(c)
  f9(debugCouple(c[0], c[8]))
  f9(debugCouple(c[6], c[7]))
  f9(debugCrush(c[5], c[9], 8))
  f9(debugAffinity(c[5], c[9], 5))
  f9(debugCrush(c[4], c[8], 8))
  const before = useGameStore.getState().charInfo[c[9]]?.memories.length ?? 0
  f9(debugAffection(c[9], -16))
  const written = (useGameStore.getState().charInfo[c[9]]?.memories.length ?? 0) - before
  // The ending that opens the drift, with the couples above as its news.
  const guaranteed = sceneEnding()
  const drift = useGameStore.getState().npcRomance.drifts?.[c[9]]
  if (!drift) throw new Error('The drift did not open.')
  f9(debugDriftBack(c[9], 5))
  const game = useGameStore.getState()
  const gossip = slotGossipOf(game.npcRomance, [], game.charInfo, game.date).topic
  const name = (i: number): string => byId(c[i]).firstName
  const lover = byId(c[9])
  const breakup: IntroBreakup = {
    character: lover,
    info: game.charInfo[c[9]],
    charKey: charKeyOf(lover.firstName, lover.lastName),
    texted: hasTexted(game.bunnyboard.conversations[c[9]]),
    forFirstName: name(5),
    reason: 'coldness'
  }
  return {
    name: '8 homens; 2 casais formados no mesmo fim de cena, 2 ex (um rival), 1 recusa recente, 2 paixões, afastamento aberto da namorada',
    scenes: [
      { label: `namorada + pretendente + rival (${name(9)}, ${name(5)}, ${name(3)})`, result: measureScene([c[9], c[5], c[3]]) },
      { label: `casal + quem gosta dela (${name(0)}, ${name(8)}, ${name(4)})`, result: measureScene([c[0], c[8], c[4]]) }
    ],
    texting: [
      { label: `celular com ${name(9)} (namorada se afastando)`, result: measureTexting(c[9]) },
      { label: `celular com ${name(5)} (pretendente)`, result: measureTexting(c[5]) }
    ],
    intro: measureIntro([c[4], c[9]], guaranteed, gossip, [breakup]),
    notes: [
      `fofoca: ${gossip?.kind ?? 'nenhuma'}`,
      `a abertura inclui, além disso, o término por texto da namorada (motivo: frieza)`,
      `o botão de afeto do F9 gravou ${written} memórias de hoje na namorada para chegar a −16`
    ]
  }
}

// ─── The memory cap ─────────────────────────────────────────────────────────────────────────

/** Who is at the memory cap late in the semester, and what a drift's breakup would push out. */
function memoryCheck(): string[] {
  const chars = load(LATE_SAVE, [])
  const game = useGameStore.getState()
  const atCap = chars.filter((id) => (game.charInfo[id]?.memories.length ?? 0) >= MEMORY_CAP)
  const lover = chars.find((id) => game.charInfo[id]?.flags?.isLover)
  const lines = [
    `Save de fim de semestre (${LATE_SAVE}, dia ${game.date}): ${atCap.length} de ${chars.length} personagens no limite de ${MEMORY_CAP} memórias.`
  ]
  if (lover) {
    const info = game.charInfo[lover]
    const after = leftTheReader(info, game.date, byId(lover).gender, 'Someone', 'coldness')
    const dropped = info.memories.filter((memory) => !after.memories.includes(memory))
    const added = after.memories.filter((memory) => !info.memories.includes(memory))
    lines.push(
      `Se a namorada (${byId(lover).firstName}) terminasse agora por afastamento: entra "${added.map((m) => `${m.type}: ${m.desc}`).join('; ')}"`,
      `e sai a mais antiga: ${dropped.map((m) => `dia ${m.date}, ${m.type}: "${m.desc}"`).join('; ') || 'nenhuma'}.`
    )
  }
  return lines
}

// ─── The report ─────────────────────────────────────────────────────────────────────────────

const row = (cells: Array<string | number>): string => `| ${cells.join(' | ')} |`
const pct = (part: number, whole: number): string => `${whole === 0 ? 0 : ((part / whole) * 100).toFixed(1)}%`

function blockRows(label: string, m: Measure): string[] {
  const out: string[] = []
  for (const [block, step] of BLOCKS) {
    const chars = m.blocks[block]
    if (chars) out.push(row([label, `${block} (${step})`, chars, tokens(chars)]))
  }
  const ours = oursOf(m)
  out.push(row([label, `**total nosso / prompt inteiro**`, `${ours} / ${m.total}`, `**${tokens(ours)} / ${tokens(m.total)}** (${pct(ours, m.total)})`]))
  return out
}

function report(results: ScenarioResult[]): string {
  const out: string[] = ['', '# Medição de custo dos prompts', '']
  for (const scenario of results) {
    out.push(`## ${scenario.name}`, '')
    for (const note of scenario.notes) out.push(`- ${note}`)
    if (scenario.notes.length > 0) out.push('')
    out.push(row(['Chamada', 'Bloco (etapa)', 'Caracteres', 'Tokens ≈']), row(['---', '---', '---', '---']))
    for (const { label, result } of scenario.scenes) {
      out.push(...blockRows(`Cena, abertura — ${label}`, result.opening))
      out.push(...blockRows(`Resumo pós-cena — ${label}`, result.ledger))
    }
    for (const { label, result } of scenario.texting) out.push(...blockRows(`Celular — ${label}`, result))
    out.push(...blockRows('Abertura do período', scenario.intro), '')

    out.push('Estabilidade dentro da cena (abertura, 2º turno, 3º turno, fechamento):', '')
    for (const { label, result } of scenario.scenes) {
      const t = [result.opening, result.turn2, result.turn3, result.closing].map((m) => tokens(oursOf(m)))
      out.push(
        `- ${label}: nossos blocos ${result.stable ? 'idênticos em todos os turnos' : 'MUDAM entre turnos'} (${t.join(' / ')} tokens); ` +
          `terminam no caractere ${result.oursEnd} e o começo comum entre o 1º e o 2º turno vai até o ${result.sharedPrefix} ` +
          `(${result.oursEnd <= result.sharedPrefix ? 'dentro' : 'FORA'} do prefixo que se repete)`
      )
    }
    out.push('')
  }
  return out.join('\n')
}

/**
 * One slot as a player spends it: the first scene measured (opening, two continuations, closing
 * and its ledger), the next slot's opening and one thread.
 */
function summary(results: ScenarioResult[]): string {
  const out = [
    '## Resumo por período',
    '',
    'Um período típico: a primeira cena medida (abertura, dois turnos, fechamento e resumo pós-cena), a abertura do período seguinte e uma conversa de celular.',
    '',
    row(['Cenário', 'Tokens nossos', 'Tokens do período', 'Parte nossa', 'Nossos tokens no prefixo que se repete']),
    row(['---', '---', '---', '---', '---'])
  ]
  for (const scenario of results) {
    const scene = scenario.scenes[0].result
    const calls = [scene.opening, scene.turn2, scene.turn3, scene.closing, scene.ledger, scenario.intro, scenario.texting[0].result]
    const ours = calls.reduce((sum, m) => sum + oursOf(m), 0)
    const total = calls.reduce((sum, m) => sum + m.total, 0)
    // The turns after the first repeat the opening's prefix, ours included.
    const repeated = [scene.turn2, scene.turn3, scene.closing].reduce((sum, m) => sum + oursOf(m), 0)
    out.push(row([scenario.name, tokens(ours), tokens(total), pct(ours, total), tokens(repeated)]))
  }
  return out.join('\n')
}

function sha(path: string): string | null {
  return existsSync(path) ? createHash('sha256').update(readFileSync(path)).digest('hex') : null
}

it(
  'measures what the romance adds to each prompt',
  () => {
    const bagsBefore = existsSync(GRABBAGS) ? readFileSync(GRABBAGS) : null
    const hashBefore = sha(GRABBAGS)
    try {
      const results = [defaultCast(), menAndACouple(), worstThreeCouples(), worstDrift()]
      const text = [report(results), summary(results), '', '## Memórias', '', ...memoryCheck().map((line) => `- ${line}`), ''].join('\n')
      process.stdout.write(text + '\n')
    } finally {
      const hashAfter = sha(GRABBAGS)
      if (hashAfter !== hashBefore && bagsBefore) {
        writeFileSync(GRABBAGS, bagsBefore)
        process.stdout.write('grabbags.json mudou durante a medição e foi restaurado.\n')
      } else {
        process.stdout.write(`grabbags.json ${hashBefore ? 'intacto' : 'ausente'}.\n`)
      }
    }
  },
  600_000
)
