import type { Character, CharMemory } from './types'
import { pronounsOf } from './pronouns'
import { hasTrait } from './traits'
import {
  MAX_AFFINITY,
  MIN_AFFINITY,
  pairKeyOf,
  type NpcEncounterGroup,
  type NpcRelationshipMap
} from './npcRelationships'

/**
 * Romance *between* roster characters — crushes, declarations, couples, exes and rejections —
 * rolled off the encounters and affinities the pair map already settles. Pure: the caller hands
 * in the slot and the store's state, and stores what comes back.
 */

/** The odds a positive encounter gives one of the two a crush on the other. */
export const CRUSH_CHANCE = 0.06
/** The affinity a pair must stand at for either of them to fall for the other. */
export const CRUSH_MIN_AFFINITY = 4
/** What High Standards multiplies her crush odds by. */
export const HIGH_STANDARDS_FACTOR = 0.5
/** What Promiscuous multiplies her crush odds by. */
export const PROMISCUOUS_FACTOR = 1.5
/** A crush is dropped once the pair's affinity falls below this. */
export const CRUSH_FADES_BELOW = 0

/** How many days a crush is held before it may be declared. */
export const DECLARE_AFTER_DAYS = 5
/** The odds a held crush is declared on a slot the two spend together. */
export const DECLARE_CHANCE = 0.35
/** The affinity at which the other says yes without a crush of their own. */
export const ACCEPT_AFFINITY = 5
/** No declaration is rolled while this many couples stand. */
export const MAX_COUPLES = 3

/** What a turned-down declaration costs the pair. */
export const REJECTION_AFFINITY_DROP = 2
/** How many days the one turned down waits before falling for the same person again. */
export const REJECTION_COOLDOWN_DAYS = 21

/** A couple's weekly odds of a fight. */
export const FIGHT_CHANCE = 0.2
/** What each Disagreeable partner adds to {@link FIGHT_CHANCE}. */
export const FIGHT_DISAGREEABLE_BONUS = 0.1
/** What each Good-natured partner takes off {@link FIGHT_CHANCE}. */
export const FIGHT_GOOD_NATURED_RELIEF = 0.05
/** What a fight costs the couple. */
export const FIGHT_AFFINITY_DROP = 3
/** A couple breaks up once its affinity falls below this. */
export const BREAKUP_BELOW = 0
/** What a breakup costs the pair on top of what brought it about. */
export const EX_AFFINITY_DROP = 1

/** The reader's lover starts drifting once her affection for him is this low or lower. */
export const DRIFT_OPENS_AT = -15
/** A cold drift ends once her affection climbs above this. */
export const DRIFT_HOLDS_ABOVE = -10
/** A recent betrayal opens a drift while her affection is this low or lower. */
export const BETRAYAL_OPENS_AT = 0
/** A drift over a betrayal ends once her affection climbs above this: she has forgiven him. */
export const DRIFT_FORGIVEN_ABOVE = 5
/** How many days a crush on the reader's lover is kept before it fades away unsaid. */
export const HELD_CRUSH_FADES_DAYS = 30
/** How many days a betrayal counts as recent for a drift. */
export const BETRAYAL_WINDOW_DAYS = 21
/** The fewest days a drift runs before she may leave the reader. */
export const DRIFT_MIN_DAYS = 10
/** The fewest days on which a sign of the drift must have been shown before she may leave. */
export const DRIFT_MIN_SIGNS = 2
/** How many days the reader's rival keeps his grudge for the reader taking his girlfriend. */
export const RIVAL_DAYS = 30

/** What the reader talking one character up to another adds to the pair. */
export const TALK_UP_AFFINITY = 1
/** What the reader badmouthing one character to another, or keeping them apart, costs the pair. */
export const TALK_DOWN_AFFINITY_DROP = 2
/** What talking somebody up multiplies the listener's crush odds by, on the extra roll it earns. */
export const TALK_UP_CRUSH_FACTOR = 3
/** How many days after the reader encouraged a crush it is declared at the two's next meeting. */
export const ENCOURAGED_DAYS = 7
/** How many days the reader's wingman actions stay on the map. */
export const WINGMAN_KEEP_DAYS = 30

/** One character's crush on another, keyed on the save by who holds it. */
export interface NpcCrush {
  to: string
  /** The date it began. */
  since: number
  /**
   * Set while the crush is on the reader's lover: the date its fading clock counts from, moved on
   * by the days a drift stood, which pause it. Absent otherwise.
   */
  heldSince?: number
  /** The date the reader encouraged its holder to confess; absent when he has not. */
  encouraged?: number
}

/** A couple, keyed by `pairKeyOf`. */
export interface NpcCouple {
  since: number
  /** The date of the couple's latest fight; absent when none is recorded. */
  lastFight?: number
}

/** A couple that broke up, keyed by `pairKeyOf`; the two never fall for each other again. */
export interface NpcEx {
  since: number
  ended: number
  /**
   * Set when the couple ended because one of them started dating the reader: the other, whom he
   * displaced and who is his rival.
   */
  displaced?: string
}

/**
 * The reader's lover growing distant from him and closer to somebody with a crush on her,
 * keyed by her charId: the run-up to her leaving him.
 */
export interface NpcDrift {
  /** The character with the crush on her she is drawn to. */
  to: string
  /** The date the drift opened. */
  since: number
  /** The days on which a scene or a thread carried the signs of it. */
  signs: number
  /** The latest of those days, so one day counts once. */
  lastSign?: number
}

/** A turned-down declaration, keyed by {@link directedKeyOf}. */
export interface NpcRejection {
  date: number
  /** A crush that faded unsaid: it holds off a new one for the same wait but nothing was declared. */
  quiet?: true
}

/** A crush the reader has found out about, keyed by the charId holding it. */
export interface NpcDiscovery {
  to: string
  /** The date he found out. */
  date: number
}

/** What the reader can do as a wingman, as a scene ledger reports it. */
export type WingmanKind = 'talked_up' | 'talked_down' | 'encouraged_confession' | 'revealed_crush'

/** Every wingman kind, in the order the ledger is told them. */
export const WINGMAN_KINDS: readonly WingmanKind[] = [
  'talked_up',
  'talked_down',
  'encouraged_confession',
  'revealed_crush'
]

/**
 * One wingman action the game took: the reader talked `from` up or down to `to`, encouraged
 * `from` to confess to `to`, or told `to` of `from`'s crush on them.
 */
export interface NpcWingmanEntry {
  kind: WingmanKind
  from: string
  to: string
  date: number
}

/** The whole of it, on the save beside the pair map. */
export interface NpcRomanceMap {
  /** Keyed by the charId holding the crush: one crush each at most. */
  crushes: Record<string, NpcCrush>
  couples: Record<string, NpcCouple>
  exes: Record<string, NpcEx>
  rejections: Record<string, NpcRejection>
  /** Crushes the reader knows of; dropped once the crush it names is gone. Absent means none. */
  discovered?: Record<string, NpcDiscovery>
  /** Drifts under way, keyed by the reader's lover. Absent means none. */
  drifts?: Record<string, NpcDrift>
  /** The wingman actions taken in the last {@link WINGMAN_KEEP_DAYS} days. Absent means none. */
  wingman?: NpcWingmanEntry[]
}

/** The kinds of row a scene ledger reports between two roster characters. */
export type NpcRomanceKind =
  | 'declared_accepted'
  | 'declared_rejected'
  | 'broke_up'
  | 'discovered'
  | WingmanKind

/**
 * What a finished scene showed between two roster characters, as charIds: a declaration and its
 * answer, a couple breaking up, the reader finding out that `from` has a crush on `to`, or one of
 * his wingman actions.
 */
export type NpcSceneEvent =
  | { kind: 'declared'; from: string; to: string; accepted: boolean }
  | { kind: 'broke_up'; from: string; to: string }
  | { kind: 'discovered'; from: string; to: string }
  | NpcWingmanEvent

/** A wingman action as a scene reported it. */
export interface NpcWingmanEvent {
  kind: WingmanKind
  from: string
  to: string
}

/** One thing a settle did, for the development build's read-out. Nothing stores it. */
export interface NpcRomanceLogEntry {
  date: number
  /** Whether a scene showed it or the settle rolled it. */
  source: 'scene' | 'system'
  kind:
    | 'crush'
    | 'accepted'
    | 'rejected'
    | 'fight'
    | 'breakup'
    | 'discovered'
    | 'discarded'
    | 'drift'
    | 'drift_ended'
    | 'left_reader'
    | 'crush_faded'
    | 'wingman'
    | 'encouragement_lapsed'
  from: string
  to: string
  /** For a discarded scene event, what it was and why it could not stand. */
  note?: string
}

/** What happened in one settle, for the simulation to count. Nothing stores it. */
export interface NpcRomanceTally {
  crushes: number
  declarations: number
  accepted: number
  rejected: number
  fights: number
  breakups: number
}

/** A map with nothing in it: where a playthrough starts, and what a save without one reads as. */
export function emptyNpcRomance(): NpcRomanceMap {
  return { crushes: {}, couples: {}, exes: {}, rejections: {} }
}

/** The key for `from`'s declaration to `to`: ordered, unlike `pairKeyOf`. */
export function directedKeyOf(from: string, to: string): string {
  return `${from}>${to}`
}

/** Whether `from` can fall for `to` at all: her attraction names his gender. */
export function isAttractedTo(from: Character | undefined, to: Character | undefined): boolean {
  return from !== undefined && to !== undefined && from.attractedTo === to.gender
}

/** How many couples stand. */
export function coupleCountOf(map: NpcRomanceMap): number {
  return Object.keys(map.couples).length
}

/** Who `charId` is dating among the roster, or null. */
export function npcPartnerOf(map: NpcRomanceMap, charId: string): string | null {
  for (const key of Object.keys(map.couples)) {
    const [a, b] = key.split('|')
    if (a === charId) return b
    if (b === charId) return a
  }
  return null
}

/** Everything {@link settleNpcRomance} folds over. */
export interface NpcRomanceInput {
  date: number
  /** Whether this settle closes the week, which is when couples roll their fight. */
  endsWeek: boolean
  /** The pair map after this slot's affinity settle, whose encounters say who got on. */
  relationships: NpcRelationshipMap
  romance: NpcRomanceMap
  /** The slot's encounter groups. */
  groups: readonly NpcEncounterGroup[]
  /** The scene's cast, whose pairs the slot's encounters never include. */
  cast: readonly string[]
  /** Whoever is the reader's lover: taken, so never falling for anybody and never saying yes. */
  readerLovers: readonly string[]
  characters: Record<string, Character>
  /** What the finished scene showed, applied before anything is rolled; absent means nothing. */
  sceneEvents?: readonly NpcSceneEvent[]
  /** How each of the reader's lovers stands with him; absent means no drift is judged. */
  loverStates?: Readonly<Record<string, ReaderLoverState>>
  /** The lovers a scene or a thread with the signs of their drift was held for this slot. */
  signed?: readonly string[]
  /** The cast who came out of the scene liking the reader: two of them met as friends do. */
  bonded?: readonly string[]
}

/** What a drift reads of the reader's lover. */
export interface ReaderLoverState {
  /** Her affection for the reader, as the prompts carry it. */
  affection: number
  /** She agreed to share him: nothing to be cold or betrayed over. */
  harem: boolean
  /** The date she last found out he cheated on her. */
  betrayedOn?: number
  /** The date she and the reader last became lovers. */
  datingSince?: number
}

/** A lover who leaves the reader, and why. */
export interface ReaderBreakup {
  charId: string
  /** Who she is drawn to. */
  forCharId: string
  reason: 'coldness' | 'betrayal'
}

/** What a settle returns: both maps, and what happened. */
export interface NpcRomanceOutcome {
  relationships: NpcRelationshipMap
  romance: NpcRomanceMap
  tally: NpcRomanceTally
  log: NpcRomanceLogEntry[]
  /** The reader's lovers whose drift ended in leaving him; the boundary breaks them up. */
  readerBreakups: ReaderBreakup[]
  /** The men the reader displaced this settle, who each owe him a grudge memory. */
  rivals: string[]
}

/** What a declaration between two characters can come to: nothing, only a no, or either answer. */
export type DeclarationOutcome = 'impossible' | 'refusal_only' | 'open'

/** What {@link declarationOutcomeOf} reads besides the map. */
export interface DeclarationContext {
  date: number
  characters: Record<string, Character>
  readerLovers: readonly string[]
}

/**
 * Whether `from` can declare to `to`, and whether `to` could say yes: never between exes, from or
 * to the reader's lover, from somebody dating or not attracted, inside the wait after the same
 * declaration was turned down, or while the couples are at the cap; a yes also needs `to`
 * attracted back and single.
 */
export function declarationOutcomeOf(
  map: NpcRomanceMap,
  from: string,
  to: string,
  context: DeclarationContext
): DeclarationOutcome {
  const { characters, readerLovers, date } = context
  if (from === to || !characters[from] || !characters[to]) return 'impossible'
  if (readerLovers.includes(from) || readerLovers.includes(to)) return 'impossible'
  if (!isAttractedTo(characters[from], characters[to])) return 'impossible'
  if (npcPartnerOf(map, from) !== null) return 'impossible'
  if (map.exes[pairKeyOf(from, to)]) return 'impossible'
  const rejection = map.rejections[directedKeyOf(from, to)]
  if (rejection && date - rejection.date < REJECTION_COOLDOWN_DAYS) return 'impossible'
  if (coupleCountOf(map) >= MAX_COUPLES) return 'impossible'
  if (!isAttractedTo(characters[to], characters[from]) || npcPartnerOf(map, to) !== null) {
    return 'refusal_only'
  }
  return 'open'
}

/** Whether the reader betrayed her lately enough for a drift. */
export function betrayalIsRecent(betrayedOn: number | undefined, date: number): boolean {
  return betrayedOn !== undefined && date - betrayedOn < BETRAYAL_WINDOW_DAYS
}

/**
 * Whether a recent betrayal stands between the reader and his lover: she is not warm enough to
 * have forgiven it. The bar to open is lower than the bar to keep, so a lover hovering near it
 * does not flicker.
 */
export function betrayalHolds(state: ReaderLoverState, date: number, running: boolean): boolean {
  if (!betrayalIsRecent(state.betrayedOn, date)) return false
  return running ? state.affection <= DRIFT_FORGIVEN_ABOVE : state.affection <= BETRAYAL_OPENS_AT
}

/**
 * Whether the reader's lover is cold enough, or hurt enough, for a drift: the bar to open one
 * is lower than the bar to keep one, so a lover hovering near it does not flicker. A lover who
 * shares him never drifts.
 */
export function driftsFrom(state: ReaderLoverState, date: number, running: boolean): boolean {
  if (state.harem) return false
  if (betrayalHolds(state, date, running)) return true
  return running ? state.affection <= DRIFT_HOLDS_ABOVE : state.affection <= DRIFT_OPENS_AT
}

/**
 * The memory a man the reader displaced keeps of him. It names nobody, so upserting it files one
 * entry per rival however many times or for whomever he is displaced.
 */
export function rivalMemoryOf(character: Character | undefined, date: number): CharMemory {
  const possessive = pronounsOf(character?.gender ?? 'man').possessive
  return { date, type: 'hated', desc: `the reader started dating ${possessive} girlfriend` }
}

/** Whether an ex pair is one the reader broke up and the grudge for it still runs. */
export function isRivalGrudge(ex: NpcEx, date: number): boolean {
  return ex.displaced !== undefined && date - ex.ended < RIVAL_DAYS
}

/** Holds an affinity inside the pair map's range. */
export function clampAffinity(affinity: number): number {
  return Math.max(MIN_AFFINITY, Math.min(MAX_AFFINITY, Math.round(affinity)))
}

/** Moves one pair's affinity by `delta`, leaving its encounter as it was. */
function shiftAffinity(map: NpcRelationshipMap, a: string, b: string, delta: number): void {
  const key = pairKeyOf(a, b)
  const current = map[key]
  map[key] = { ...current, affinity: clampAffinity((current?.affinity ?? 0) + delta) }
}

/** A yes: both crushes are dropped and the two stand as a couple from `date`. Mutates `romance`. */
export function acceptDeclaration(
  romance: NpcRomanceMap,
  from: string,
  to: string,
  date: number
): void {
  delete romance.crushes[from]
  delete romance.crushes[to]
  romance.couples[pairKeyOf(from, to)] = { since: date }
}

/** Her odds of falling for somebody this encounter, her traits applied. */
export function crushChanceOf(character: Character | undefined): number {
  let chance = CRUSH_CHANCE
  if (hasTrait(character, 'High Standards')) chance *= HIGH_STANDARDS_FACTOR
  if (hasTrait(character, 'Promiscuous')) chance *= PROMISCUOUS_FACTOR
  return chance
}

/**
 * Whether `from` could fall for `to` now: attracted, single, holding no crush, not the reader's
 * lover, not exes, and not inside the wait after the same declaration was turned down.
 */
export function mayFallFor(
  map: NpcRomanceMap,
  from: string,
  to: string,
  context: DeclarationContext
): boolean {
  const { characters, readerLovers, date } = context
  if (from === to || map.crushes[from] || readerLovers.includes(from)) return false
  if (npcPartnerOf(map, from) !== null) return false
  if (!isAttractedTo(characters[from], characters[to])) return false
  if (map.exes[pairKeyOf(from, to)]) return false
  const rejection = map.rejections[directedKeyOf(from, to)]
  return !(rejection && date - rejection.date < REJECTION_COOLDOWN_DAYS)
}

/**
 * Whether `to` says yes to `from`'s declaration: it can be answered at all, and `to` holds a crush
 * on `from` back or stands at the accepting affinity with them.
 */
export function wouldSayYes(
  map: NpcRomanceMap,
  relationships: NpcRelationshipMap,
  from: string,
  to: string,
  context: DeclarationContext
): boolean {
  if (declarationOutcomeOf(map, from, to, context) !== 'open') return false
  const affinity = relationships[pairKeyOf(from, to)]?.affinity ?? 0
  return map.crushes[to]?.to === from || affinity >= ACCEPT_AFFINITY
}

/** What {@link wingmanRefusalOf} reads besides the map. */
export interface WingmanContext extends DeclarationContext {
  /** The scene's cast. */
  cast: readonly string[]
}

/** The talk-up's opposite and the talk-down's; nothing for the other two. */
function opposedKindOf(kind: WingmanKind): WingmanKind | null {
  if (kind === 'talked_up') return 'talked_down'
  if (kind === 'talked_down') return 'talked_up'
  return null
}

/**
 * Why the game cannot take a wingman action as the map stands, or null when it can: whoever the
 * reader spoke to must be in the scene, a talk-up never touches his lover, a confession he urges
 * or a crush he tells of must exist and not be on his lover, a told crush must be answerable, and
 * each kind lands once a day per pair, a talk-up and a talk-down of the same day cancelling the
 * later one.
 */
export function wingmanRefusalOf(
  map: NpcRomanceMap,
  event: NpcWingmanEvent,
  context: WingmanContext
): string | null {
  const { kind, from, to } = event
  const { characters, readerLovers, cast, date } = context
  if (from === to || !characters[from] || !characters[to]) return 'not two characters'
  const here = (charId: string): boolean => cast.includes(charId)
  const lover = (charId: string): boolean => readerLovers.includes(charId)
  const key = pairKeyOf(from, to)
  const today = (map.wingman ?? []).filter(
    (entry) => entry.date === date && pairKeyOf(entry.from, entry.to) === key
  )
  if (today.some((entry) => entry.kind === kind)) return 'already done today'
  const opposed = opposedKindOf(kind)
  if (opposed && today.some((entry) => entry.kind === opposed)) {
    return 'cancelled by the opposite action earlier today'
  }
  if (kind === 'talked_up') {
    if (!here(to)) return 'the one spoken to is not in the scene'
    if (lover(from) || lover(to)) return "the reader's lover"
    return null
  }
  if (kind === 'talked_down') {
    return here(from) || here(to) ? null : 'neither is in the scene'
  }
  if (map.crushes[from]?.to !== to) return 'no such crush'
  if (lover(to)) return "a crush on the reader's lover"
  if (kind === 'encouraged_confession') {
    return here(from) ? null : 'the one urged is not in the scene'
  }
  if (!here(to)) return 'the one told is not in the scene'
  if (declarationOutcomeOf(map, from, to, context) === 'impossible') return 'no declaration possible'
  return null
}

/** A couple's odds of a fight this week, both partners' traits applied. */
export function fightChanceOf(a: Character | undefined, b: Character | undefined): number {
  let chance = FIGHT_CHANCE
  for (const partner of [a, b]) {
    if (hasTrait(partner, 'Disagreeable')) chance += FIGHT_DISAGREEABLE_BONUS
    if (hasTrait(partner, 'Good-natured')) chance -= FIGHT_GOOD_NATURED_RELIEF
  }
  return Math.max(0, chance)
}

/**
 * Every pair that spent the slot together off the scene, as sorted `pairKeyOf` keys, so the
 * rolls below run in one order whatever order the groups came in.
 */
function metPairsOf(groups: readonly NpcEncounterGroup[], cast: readonly string[]): string[] {
  const inScene = new Set(cast)
  const met = new Set<string>()
  for (const group of groups) {
    const members = group.members
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        if (inScene.has(members[i]) || inScene.has(members[j])) continue
        if (members[i] === members[j]) continue
        met.add(pairKeyOf(members[i], members[j]))
      }
    }
  }
  return [...met].sort()
}

/** Every pair among `members`, as sorted `pairKeyOf` keys. */
function pairsAmong(members: readonly string[]): string[] {
  const pairs = new Set<string>()
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      if (members[i] !== members[j]) pairs.add(pairKeyOf(members[i], members[j]))
    }
  }
  return [...pairs].sort()
}

/** A scene event that is not one of the reader's wingman actions. */
type ShownEvent = Exclude<NpcSceneEvent, NpcWingmanEvent>

/** Whether a scene event is one of the reader's wingman actions. */
export function isWingmanEvent(event: NpcSceneEvent): event is NpcWingmanEvent {
  return (WINGMAN_KINDS as readonly string[]).includes(event.kind)
}

/**
 * One slot's romance: the reader's talk moves pairs, couples break up or fight, crushes fade,
 * what the scene showed lands, crushes held long enough, or urged on by the reader, are declared
 * to someone met this slot and answered, and a positive encounter or the reader's talk may start
 * a crush.
 */
export function settleNpcRomance(
  input: NpcRomanceInput,
  rand: () => number = Math.random
): NpcRomanceOutcome {
  const { date, characters } = input
  const relationships: NpcRelationshipMap = { ...input.relationships }
  const romance: NpcRomanceMap = {
    crushes: { ...input.romance.crushes },
    couples: { ...input.romance.couples },
    exes: { ...input.romance.exes },
    rejections: { ...input.romance.rejections },
    ...(input.romance.discovered ? { discovered: { ...input.romance.discovered } } : {}),
    ...(input.romance.drifts ? { drifts: { ...input.romance.drifts } } : {}),
    ...(input.romance.wingman ? { wingman: [...input.romance.wingman] } : {})
  }
  const readerBreakups: ReaderBreakup[] = []
  const rivals: string[] = []
  const tally: NpcRomanceTally = {
    crushes: 0,
    declarations: 0,
    accepted: 0,
    rejected: 0,
    fights: 0,
    breakups: 0
  }
  const log: NpcRomanceLogEntry[] = []
  const note = (
    source: NpcRomanceLogEntry['source'],
    kind: NpcRomanceLogEntry['kind'],
    from: string,
    to: string,
    detail?: string
  ): void => {
    log.push({ date, source, kind, from, to, ...(detail ? { note: detail } : {}) })
  }
  const readerLovers = new Set(input.readerLovers)
  const affinityOf = (a: string, b: string): number =>
    relationships[pairKeyOf(a, b)]?.affinity ?? 0
  const inScene = new Set(input.cast)
  const context: DeclarationContext = { date, characters, readerLovers: input.readerLovers }
  const wingmanContext: WingmanContext = { ...context, cast: input.cast }

  // The reader's wingman actions apart from the rest, one per kind and pair.
  const shown: ShownEvent[] = []
  const wingman: NpcWingmanEvent[] = []
  const seen = new Set<string>()
  for (const event of input.sceneEvents ?? []) {
    if (!isWingmanEvent(event)) {
      shown.push(event)
      continue
    }
    const once = `${event.kind}|${pairKeyOf(event.from, event.to)}`
    if (seen.has(once)) {
      note('scene', 'discarded', event.from, event.to, `${event.kind}: repeated`)
      continue
    }
    seen.add(once)
    wingman.push(event)
  }
  const record = (action: NpcWingmanEvent): void => {
    romance.wingman = [...(romance.wingman ?? []), { ...action, date }]
    note('scene', 'wingman', action.from, action.to, action.kind)
  }
  // Whether the game takes the action, noting why where it does not. A talk-up and a talk-down
  // of the same pair in one scene cancel each other out.
  const takes = (action: NpcWingmanEvent): boolean => {
    const opposed = opposedKindOf(action.kind)
    const why =
      opposed !== null && seen.has(`${opposed}|${pairKeyOf(action.from, action.to)}`)
        ? 'cancelled by the opposite action in the same scene'
        : wingmanRefusalOf(romance, action, wingmanContext)
    if (why === null) return true
    note('scene', 'discarded', action.from, action.to, `${action.kind}: ${why}`)
    return false
  }

  // Talk moves the pair first, so what it does to a couple or a crush lands in this same settle.
  const talkedUp: NpcWingmanEvent[] = []
  for (const action of wingman) {
    if (action.kind !== 'talked_up' && action.kind !== 'talked_down') continue
    if (!takes(action)) continue
    const up = action.kind === 'talked_up'
    shiftAffinity(
      relationships,
      action.from,
      action.to,
      up ? TALK_UP_AFFINITY : -TALK_DOWN_AFFINITY_DROP
    )
    record(action)
    if (up) talkedUp.push(action)
  }

  const breakUp = (key: string, a: string, b: string, byReader = false): void => {
    const couple = romance.couples[key]
    delete romance.couples[key]
    // The one of the two who is not the reader's lover is the man he displaced.
    const rival = byReader ? (readerLovers.has(a) ? b : a) : undefined
    const displaced = rival !== undefined && !readerLovers.has(rival) ? rival : undefined
    romance.exes[key] = {
      since: couple.since,
      ended: date,
      ...(displaced !== undefined ? { displaced } : {})
    }
    shiftAffinity(relationships, a, b, -EX_AFFINITY_DROP)
    if (displaced !== undefined && !rivals.includes(displaced)) rivals.push(displaced)
  }

  // Couples: the week's fight, then the breakup a sour pair or the reader's lover ends in.
  for (const key of Object.keys(romance.couples).sort()) {
    const [a, b] = key.split('|')
    if (input.endsWeek && rand() < fightChanceOf(characters[a], characters[b])) {
      shiftAffinity(relationships, a, b, -FIGHT_AFFINITY_DROP)
      romance.couples[key] = { ...romance.couples[key], lastFight: date }
      tally.fights++
      note('system', 'fight', a, b)
    }
    const byReader = readerLovers.has(a) || readerLovers.has(b)
    if (affinityOf(a, b) < BREAKUP_BELOW || byReader) {
      breakUp(key, a, b, byReader)
      tally.breakups++
      note('system', 'breakup', a, b)
    }
  }

  // A crush on somebody the holder has soured on, or held by the reader's lover, is gone.
  for (const from of Object.keys(romance.crushes).sort()) {
    const crush = romance.crushes[from]
    if (readerLovers.has(from) || affinityOf(from, crush.to) < CRUSH_FADES_BELOW) {
      delete romance.crushes[from]
    }
  }

  // An encouragement the two never met to act on lapses, and the crush is back on the usual rules.
  for (const from of Object.keys(romance.crushes).sort()) {
    const { encouraged, ...rest } = romance.crushes[from]
    if (encouraged === undefined || date - encouraged <= ENCOURAGED_DAYS) continue
    romance.crushes[from] = rest
    note('system', 'encouragement_lapsed', from, rest.to)
  }

  // A crush the reader urged on is marked, and he knows of it; the mark counts from the next settle.
  const urgedNow = new Set<string>()
  for (const action of wingman) {
    if (action.kind !== 'encouraged_confession' || !takes(action)) continue
    urgedNow.add(action.from)
    romance.crushes[action.from] = { ...romance.crushes[action.from], encouraged: date }
    romance.discovered = { ...romance.discovered, [action.from]: { to: action.to, date } }
    record(action)
  }

  const accept = (from: string, to: string): void => acceptDeclaration(romance, from, to, date)
  const turnDown = (from: string, to: string): void => {
    delete romance.crushes[from]
    romance.rejections[directedKeyOf(from, to)] = { date }
    shiftAffinity(relationships, from, to, -REJECTION_AFFINITY_DROP)
  }
  // The pairs a declaration was settled between in the scene, so no roll adds a second.
  const declared = new Set<string>()

  // A crush the reader told its object of is answered now: as the scene showed it where it
  // reported the answer and the rules allow that answer, by the usual rule otherwise.
  for (const action of wingman) {
    if (action.kind !== 'revealed_crush' || !takes(action)) continue
    const { from, to } = action
    const at = shown.findIndex(
      (event) => event.kind === 'declared' && event.from === from && event.to === to
    )
    const reported = at === -1 ? undefined : shown.splice(at, 1)[0]
    const outcome = declarationOutcomeOf(romance, from, to, context)
    const yes =
      reported?.kind === 'declared' && (!reported.accepted || outcome === 'open')
        ? reported.accepted
        : wouldSayYes(romance, relationships, from, to, context)
    romance.discovered = { ...romance.discovered, [from]: { to, date } }
    record(action)
    if (yes) accept(from, to)
    else turnDown(from, to)
    declared.add(pairKeyOf(from, to))
    note('scene', yes ? 'accepted' : 'rejected', from, to, 'the reader told')
  }

  // What the scene showed, each event checked against the map as the ones before it left it.
  for (const event of shown) {
    const { from, to } = event
    const refuse = (why: string): void => note('scene', 'discarded', from, to, why)
    if (event.kind === 'declared') {
      const what = event.accepted ? 'accepted declaration' : 'turned-down declaration'
      if (!inScene.has(from) || !inScene.has(to)) {
        refuse(`${what}: not both in the scene`)
        continue
      }
      const outcome = declarationOutcomeOf(romance, from, to, context)
      if (outcome === 'impossible' || (event.accepted && outcome !== 'open')) {
        refuse(`${what}: ${outcome === 'impossible' ? 'impossible' : 'only a no was possible'}`)
        continue
      }
      if (event.accepted) accept(from, to)
      else turnDown(from, to)
      declared.add(pairKeyOf(from, to))
      note('scene', event.accepted ? 'accepted' : 'rejected', from, to)
    } else if (event.kind === 'broke_up') {
      const key = pairKeyOf(from, to)
      if (!romance.couples[key]) {
        refuse('breakup: not a couple')
        continue
      }
      if (!inScene.has(from) && !inScene.has(to)) {
        refuse('breakup: neither in the scene')
        continue
      }
      breakUp(key, from, to)
      note('scene', 'breakup', from, to)
    } else {
      if (!inScene.has(from) || romance.crushes[from]?.to !== to) {
        refuse('discovery: no such crush in the scene')
        continue
      }
      romance.discovered = { ...romance.discovered, [from]: { to, date } }
      note('scene', 'discovered', from, to)
    }
  }

  const taken = (charId: string): boolean =>
    readerLovers.has(charId) || npcPartnerOf(romance, charId) !== null
  // Who spent the slot together: the pairs met off the scene, and the cast with each other.
  const castPairs = new Set(pairsAmong(input.cast))
  const met = [...new Set([...metPairsOf(input.groups, input.cast), ...castPairs])].sort()

  // Declarations, one roll per crush held long enough whose object was met this slot; a crush the
  // reader urged on before this slot is declared at the first meeting, whatever its age.
  for (const key of met) {
    if (declared.has(key)) continue
    const [a, b] = key.split('|')
    for (const [from, to] of [
      [a, b],
      [b, a]
    ] as const) {
      const crush = romance.crushes[from]
      if (!crush || crush.to !== to) continue
      // A crush on the reader's lover is kept to itself while she is his: no roll, no answer.
      if (readerLovers.has(to)) continue
      const urged = crush.encouraged !== undefined && !urgedNow.has(from)
      if (!urged && date - crush.since < DECLARE_AFTER_DAYS) continue
      if (coupleCountOf(romance) >= MAX_COUPLES) continue
      if (!urged && rand() >= DECLARE_CHANCE) continue

      tally.declarations++
      const answersYes =
        !taken(to) &&
        isAttractedTo(characters[to], characters[from]) &&
        (romance.crushes[to]?.to === from || affinityOf(from, to) >= ACCEPT_AFFINITY)
      const why = urged ? 'encouraged by the reader' : undefined
      if (answersYes) {
        accept(from, to)
        tally.accepted++
        note('system', 'accepted', from, to, why)
      } else {
        turnDown(from, to)
        tally.rejected++
        note('system', 'rejected', from, to, why)
      }
    }
  }

  // Drifts: the signs shown count, the ones that no longer hold end, and the ones that have run
  // their course end with her leaving the reader. Only drifts already on the map carried their
  // signs into this slot's scene, so a drift opened below counts none yet.
  const signed = new Set(input.signed ?? [])
  const loverStates = input.loverStates ?? {}
  const suitorContext: DeclarationContext = { date, characters, readerLovers: [] }
  // Whether `from` could still declare to her and be answered, her being counted as free, and
  // stands at least at `closeness` with her.
  const suitorStands = (from: string, lover: string, closeness: number): boolean =>
    romance.crushes[from]?.to === lover &&
    declarationOutcomeOf(romance, from, lover, suitorContext) === 'open' &&
    affinityOf(from, lover) >= closeness

  for (const lover of Object.keys(romance.drifts ?? {}).sort()) {
    const drift = romance.drifts![lover]
    const state = loverStates[lover]
    const endDrift = (): void => {
      delete romance.drifts![lover]
      note('system', 'drift_ended', lover, drift.to)
      // The days it stood do not count against the crush's fading.
      const crush = romance.crushes[drift.to]
      if (crush?.heldSince !== undefined) {
        romance.crushes[drift.to] = { ...crush, heldSince: crush.heldSince + (date - drift.since) }
      }
    }
    if (!readerLovers.has(lover) || !state || !driftsFrom(state, date, true)) {
      endDrift()
      continue
    }
    if (!suitorStands(drift.to, lover, CRUSH_MIN_AFFINITY)) {
      endDrift()
      continue
    }
    let running = drift
    if (signed.has(lover) && drift.lastSign !== date) {
      running = { ...drift, signs: drift.signs + 1, lastSign: date }
      romance.drifts![lover] = running
    }
    if (date - running.since >= DRIFT_MIN_DAYS && running.signs >= DRIFT_MIN_SIGNS) {
      delete romance.drifts![lover]
      readerBreakups.push({
        charId: lover,
        forCharId: running.to,
        reason: betrayalHolds(state, date, true) ? 'betrayal' : 'coldness'
      })
      note('system', 'left_reader', lover, running.to)
    }
  }

  // A lover who has cause and somebody who could take her: the oldest crush wins, so the pick is
  // the same whatever order the map was written in.
  for (const lover of [...readerLovers].sort()) {
    const state = loverStates[lover]
    if (!state || romance.drifts?.[lover] || !driftsFrom(state, date, false)) continue
    if (readerBreakups.some(({ charId }) => charId === lover)) continue
    const suitors = Object.keys(romance.crushes)
      .filter((from) => suitorStands(from, lover, ACCEPT_AFFINITY))
      .sort((a, b) => romance.crushes[a].since - romance.crushes[b].since || (a < b ? -1 : 1))
    if (suitors.length === 0) continue
    romance.drifts = { ...romance.drifts, [lover]: { to: suitors[0], since: date, signs: 0 } }
    note('system', 'drift', lover, suitors[0])
  }

  // A crush on the reader's lover is kept unsaid, and fades once it has been kept long enough
  // with no drift standing: no declaration, no cost, only the wait before it can form again.
  for (const from of Object.keys(romance.crushes).sort()) {
    const crush = romance.crushes[from]
    if (!readerLovers.has(crush.to)) {
      if (crush.heldSince !== undefined) {
        const { heldSince: _held, ...rest } = crush
        romance.crushes[from] = rest
      }
      continue
    }
    const heldSince =
      crush.heldSince ?? Math.max(crush.since, loverStates[crush.to]?.datingSince ?? crush.since)
    if (crush.heldSince === undefined) romance.crushes[from] = { ...crush, heldSince }
    if (romance.drifts?.[crush.to]?.to === from) continue
    if (date - heldSince < HELD_CRUSH_FADES_DAYS) continue
    delete romance.crushes[from]
    romance.rejections[directedKeyOf(from, crush.to)] = { date, quiet: true }
    note('system', 'crush_faded', from, crush.to)
  }

  // New crushes, off the encounters this slot's affinity settle stamped as positive, and between
  // the cast who both came out of the scene liking the reader.
  const bondedPairs = new Set(pairsAmong((input.bonded ?? []).filter((charId) => inScene.has(charId))))
  for (const key of met) {
    const pair = relationships[key]
    if (!pair) continue
    const positive = castPairs.has(key)
      ? bondedPairs.has(key)
      : pair.encounter?.date === date && pair.encounter.positive
    if (!positive || pair.affinity < CRUSH_MIN_AFFINITY) continue
    if (romance.exes[key] || romance.couples[key]) continue
    const [a, b] = key.split('|')
    for (const [from, to] of [
      [a, b],
      [b, a]
    ] as const) {
      if (!mayFallFor(romance, from, to, context)) continue
      if (rand() >= crushChanceOf(characters[from])) continue
      romance.crushes[from] = { to, since: date }
      tally.crushes++
      note('system', 'crush', from, to)
    }
  }

  // Talking somebody up to a listener drawn to them earns the listener an extra, likelier roll.
  for (const { from, to } of talkedUp) {
    if (romance.couples[pairKeyOf(from, to)] || affinityOf(from, to) < CRUSH_MIN_AFFINITY) continue
    if (!mayFallFor(romance, to, from, context)) continue
    if (rand() >= crushChanceOf(characters[to]) * TALK_UP_CRUSH_FACTOR) continue
    romance.crushes[to] = { to: from, since: date }
    tally.crushes++
    note('scene', 'crush', to, from, 'talked up by the reader')
  }

  // A discovery outlives nothing: once the crush it names is gone, so is it.
  if (romance.discovered) {
    for (const [from, found] of Object.entries(romance.discovered)) {
      if (romance.crushes[from]?.to !== found.to) delete romance.discovered[from]
    }
  }

  if (romance.drifts && Object.keys(romance.drifts).length === 0) delete romance.drifts

  // The wingman record keeps what the reader did lately, and nothing older.
  if (romance.wingman) {
    romance.wingman = romance.wingman.filter((entry) => date - entry.date < WINGMAN_KEEP_DAYS)
    if (romance.wingman.length === 0) delete romance.wingman
  }

  return { relationships, romance, tally, log, readerBreakups, rivals }
}
