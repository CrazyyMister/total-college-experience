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
/** A drift ends once her affection climbs above this, unless he betrayed her lately. */
export const DRIFT_HOLDS_ABOVE = -10
/** How many days a betrayal counts as recent for a drift. */
export const BETRAYAL_WINDOW_DAYS = 21
/** The fewest days a drift runs before she may leave the reader. */
export const DRIFT_MIN_DAYS = 10
/** The fewest days on which a sign of the drift must have been shown before she may leave. */
export const DRIFT_MIN_SIGNS = 2
/** How many days the reader's rival keeps his grudge for the reader taking his girlfriend. */
export const RIVAL_DAYS = 30

/** One character's crush on another, keyed on the save by who holds it. */
export interface NpcCrush {
  to: string
  /** The date it began. */
  since: number
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
}

/** A crush the reader has found out about, keyed by the charId holding it. */
export interface NpcDiscovery {
  to: string
  /** The date he found out. */
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
}

/** The kinds of row a scene ledger reports between two roster characters. */
export type NpcRomanceKind = 'declared_accepted' | 'declared_rejected' | 'broke_up' | 'discovered'

/**
 * What a finished scene showed between two roster characters, as charIds: a declaration and its
 * answer, a couple breaking up, or the reader finding out that `from` has a crush on `to`.
 */
export type NpcSceneEvent =
  | { kind: 'declared'; from: string; to: string; accepted: boolean }
  | { kind: 'broke_up'; from: string; to: string }
  | { kind: 'discovered'; from: string; to: string }

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
}

/** What a drift reads of the reader's lover. */
export interface ReaderLoverState {
  /** Her affection for the reader, as the prompts carry it. */
  affection: number
  /** She agreed to share him: nothing to be cold or betrayed over. */
  harem: boolean
  /** The date she last found out he cheated on her. */
  betrayedOn?: number
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
 * Whether the reader's lover is cold enough, or betrayed enough, for a drift: the bar to open one
 * is lower than the bar to keep one, so a lover hovering near it does not flicker. A lover who
 * shares him never drifts.
 */
export function driftsFrom(state: ReaderLoverState, date: number, running: boolean): boolean {
  if (state.harem) return false
  if (betrayalIsRecent(state.betrayedOn, date)) return true
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
function clampAffinity(affinity: number): number {
  return Math.max(MIN_AFFINITY, Math.min(MAX_AFFINITY, Math.round(affinity)))
}

/** Moves one pair's affinity by `delta`, leaving its encounter as it was. */
function shiftAffinity(map: NpcRelationshipMap, a: string, b: string, delta: number): void {
  const key = pairKeyOf(a, b)
  const current = map[key]
  map[key] = { ...current, affinity: clampAffinity((current?.affinity ?? 0) + delta) }
}

/** Her odds of falling for somebody this encounter, her traits applied. */
export function crushChanceOf(character: Character | undefined): number {
  let chance = CRUSH_CHANCE
  if (hasTrait(character, 'High Standards')) chance *= HIGH_STANDARDS_FACTOR
  if (hasTrait(character, 'Promiscuous')) chance *= PROMISCUOUS_FACTOR
  return chance
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

/**
 * One slot's romance: couples break up or fight, crushes fade, what the scene showed lands,
 * crushes held long enough are declared to someone met this slot and answered, and a positive
 * encounter may start a crush.
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
    ...(input.romance.drifts ? { drifts: { ...input.romance.drifts } } : {})
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

  const accept = (from: string, to: string): void => {
    delete romance.crushes[from]
    delete romance.crushes[to]
    romance.couples[pairKeyOf(from, to)] = { since: date }
  }
  const turnDown = (from: string, to: string): void => {
    delete romance.crushes[from]
    romance.rejections[directedKeyOf(from, to)] = { date }
    shiftAffinity(relationships, from, to, -REJECTION_AFFINITY_DROP)
  }

  // What the scene showed, each event checked against the map as the ones before it left it.
  const inScene = new Set(input.cast)
  const context: DeclarationContext = { date, characters, readerLovers: input.readerLovers }
  for (const event of input.sceneEvents ?? []) {
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
  const met = metPairsOf(input.groups, input.cast)

  // Declarations, one roll per crush held long enough whose object was met this slot.
  for (const key of met) {
    const [a, b] = key.split('|')
    for (const [from, to] of [
      [a, b],
      [b, a]
    ] as const) {
      const crush = romance.crushes[from]
      if (!crush || crush.to !== to) continue
      // A crush on the reader's lover is kept to itself while she is his: no roll, no answer.
      if (readerLovers.has(to)) continue
      if (date - crush.since < DECLARE_AFTER_DAYS) continue
      if (coupleCountOf(romance) >= MAX_COUPLES) continue
      if (rand() >= DECLARE_CHANCE) continue

      tally.declarations++
      const answersYes =
        !taken(to) &&
        isAttractedTo(characters[to], characters[from]) &&
        (romance.crushes[to]?.to === from || affinityOf(from, to) >= ACCEPT_AFFINITY)
      if (answersYes) {
        accept(from, to)
        tally.accepted++
        note('system', 'accepted', from, to)
      } else {
        turnDown(from, to)
        tally.rejected++
        note('system', 'rejected', from, to)
      }
    }
  }

  // Drifts: the signs shown count, the ones that no longer hold end, and the ones that have run
  // their course end with her leaving the reader. Only drifts already on the map carried their
  // signs into this slot's scene, so a drift opened below counts none yet.
  const signed = new Set(input.signed ?? [])
  const loverStates = input.loverStates ?? {}
  const suitorContext: DeclarationContext = { date, characters, readerLovers: [] }
  // Whether `from` could still declare to her and be answered, her being counted as free.
  const suitorStands = (from: string, lover: string): boolean =>
    romance.crushes[from]?.to === lover &&
    declarationOutcomeOf(romance, from, lover, suitorContext) === 'open'

  for (const lover of Object.keys(romance.drifts ?? {}).sort()) {
    const drift = romance.drifts![lover]
    const state = loverStates[lover]
    const endDrift = (): void => {
      delete romance.drifts![lover]
      note('system', 'drift_ended', lover, drift.to)
    }
    if (!readerLovers.has(lover) || !state || !driftsFrom(state, date, true)) {
      endDrift()
      continue
    }
    if (!suitorStands(drift.to, lover)) {
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
        reason: betrayalIsRecent(state.betrayedOn, date) ? 'betrayal' : 'coldness'
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
      .filter(
        (from) =>
          suitorStands(from, lover) && affinityOf(from, lover) >= ACCEPT_AFFINITY
      )
      .sort((a, b) => romance.crushes[a].since - romance.crushes[b].since || (a < b ? -1 : 1))
    if (suitors.length === 0) continue
    romance.drifts = { ...romance.drifts, [lover]: { to: suitors[0], since: date, signs: 0 } }
    note('system', 'drift', lover, suitors[0])
  }

  // New crushes, off the encounters this slot's affinity settle stamped as positive.
  for (const key of met) {
    const pair = relationships[key]
    if (!pair?.encounter || pair.encounter.date !== date || !pair.encounter.positive) continue
    if (pair.affinity < CRUSH_MIN_AFFINITY) continue
    if (romance.exes[key] || romance.couples[key]) continue
    const [a, b] = key.split('|')
    for (const [from, to] of [
      [a, b],
      [b, a]
    ] as const) {
      if (romance.crushes[from] || taken(from)) continue
      if (!isAttractedTo(characters[from], characters[to])) continue
      const rejection = romance.rejections[directedKeyOf(from, to)]
      if (rejection && date - rejection.date < REJECTION_COOLDOWN_DAYS) continue
      if (rand() >= crushChanceOf(characters[from])) continue
      romance.crushes[from] = { to, since: date }
      tally.crushes++
      note('system', 'crush', from, to)
    }
  }

  // A discovery outlives nothing: once the crush it names is gone, so is it.
  if (romance.discovered) {
    for (const [from, found] of Object.entries(romance.discovered)) {
      if (romance.crushes[from]?.to !== found.to) delete romance.discovered[from]
    }
  }

  if (romance.drifts && Object.keys(romance.drifts).length === 0) delete romance.drifts

  return { relationships, romance, tally, log, readerBreakups, rivals }
}
