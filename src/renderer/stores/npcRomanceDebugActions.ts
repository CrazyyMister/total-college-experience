import { romancesReader } from '@shared/characterRules'
import { pairKeyOf, type NpcRelationshipMap } from '@shared/npcRelationships'
import {
  ACCEPT_AFFINITY,
  acceptDeclaration,
  clampAffinity,
  CRUSH_MIN_AFFINITY,
  declarationOutcomeOf,
  directedKeyOf,
  isAttractedTo,
  npcPartnerOf,
  REJECTION_COOLDOWN_DAYS
} from '@shared/npcRomance'
import { pronounsOf } from '@shared/pronouns'
import { affectionFor } from '@shared/relationship'
import { charKeyOf, type MemoryType } from '@shared/types'
import { readerLoversOf } from '../prompts/npcRelationship'
import { useGameStore } from './gameStore'
import { loopState } from './loop/state'
import { applyLedger } from './sceneSanitizer'
import { unblockContact } from './textingLoop'

/**
 * What the development build's test buttons do to a game. Each one writes through the store the
 * game itself writes through, after the checks the game's own rules make, so it never leaves a
 * state a game could not reach; and each answers with what it did or why it would not.
 */

/** What a button reports back. */
export interface DebugResult {
  ok: boolean
  text: string
}

const refused = (text: string): DebugResult => ({ ok: false, text })
const done = (text: string): DebugResult => ({ ok: true, text })
const NOT_DEV: DebugResult = refused('Only in the development build.')

/** Raises one pair's affinity to at least `floor`, leaving a higher one alone. */
function withAffinityAtLeast(
  map: NpcRelationshipMap,
  a: string,
  b: string,
  floor: number
): NpcRelationshipMap {
  const key = pairKeyOf(a, b)
  const current = map[key]
  if ((current?.affinity ?? 0) >= floor) return map
  return { ...map, [key]: { ...current, affinity: clampAffinity(floor) } }
}

/** A crush of `from` on `to` that began `days` ago. */
export function debugCrush(from: string, to: string, days: number): DebugResult {
  if (!import.meta.env.DEV) return NOT_DEV
  const game = useGameStore.getState()
  const { characters, npcRomance: map, date } = game
  const [holder, object] = [characters[from], characters[to]]
  if (!holder || !object) return refused('Pick two characters.')
  if (from === to) return refused('Nobody has a crush on themselves.')
  if (!isAttractedTo(holder, object)) {
    return refused(`${holder.firstName} is not attracted to ${object.firstName}'s gender.`)
  }
  if (readerLoversOf(game.charInfo).includes(from)) {
    return refused(`${holder.firstName} is the reader's lover and falls for nobody.`)
  }
  if (npcPartnerOf(map, from) !== null) return refused(`${holder.firstName} is dating somebody.`)
  if (map.crushes[from]) return refused(`${holder.firstName} already has a crush.`)
  if (map.exes[pairKeyOf(from, to)]) return refused('They are exes and never fall for each other again.')
  const rejection = map.rejections[directedKeyOf(from, to)]
  if (rejection && date - rejection.date < REJECTION_COOLDOWN_DAYS) {
    const left = REJECTION_COOLDOWN_DAYS - (date - rejection.date)
    return refused(`The same crush is barred for ${left} more days.`)
  }
  game.setNpcRomance({
    ...map,
    crushes: { ...map.crushes, [from]: { to, since: Math.max(0, date - Math.max(0, days)) } }
  })
  game.setNpcRelationships(
    withAffinityAtLeast(game.npcRelationships, from, to, CRUSH_MIN_AFFINITY)
  )
  return done(`${holder.firstName} has a crush on ${object.firstName}, ${Math.max(0, days)} days old.`)
}

/** A couple, as an accepted declaration makes one. */
export function debugCouple(a: string, b: string): DebugResult {
  if (!import.meta.env.DEV) return NOT_DEV
  const game = useGameStore.getState()
  const { characters, npcRomance: map, date } = game
  if (!characters[a] || !characters[b]) return refused('Pick two characters.')
  const outcome = declarationOutcomeOf(map, a, b, {
    date,
    characters,
    readerLovers: readerLoversOf(game.charInfo)
  })
  if (outcome !== 'open') {
    return refused(
      'The rules do not let these two become a couple now: each must be attracted to the other and single, neither the reader’s lover, not exes, not inside a wait, and the couples under the cap.'
    )
  }
  const romance = {
    ...map,
    crushes: { ...map.crushes },
    couples: { ...map.couples }
  }
  acceptDeclaration(romance, a, b, date)
  // The next ending reads the couple as news against the map from before the first such button.
  loopState.debugRomanceBefore ??= map
  game.setNpcRomance(romance)
  game.setNpcRelationships(withAffinityAtLeast(game.npcRelationships, a, b, ACCEPT_AFFINITY))
  return done(`${characters[a].firstName} and ${characters[b].firstName} are a couple. The next scene's ending reads it as news.`)
}

/** One pair's affinity, held to the pair map's range. */
export function debugAffinity(a: string, b: string, value: number): DebugResult {
  if (!import.meta.env.DEV) return NOT_DEV
  const game = useGameStore.getState()
  if (a === b || !game.characters[a] || !game.characters[b]) return refused('Pick two characters.')
  const key = pairKeyOf(a, b)
  const affinity = clampAffinity(value)
  game.setNpcRelationships({
    ...game.npcRelationships,
    [key]: { ...game.npcRelationships[key], affinity }
  })
  return done(`${game.characters[a].firstName} and ${game.characters[b].firstName} stand at ${affinity}.`)
}

/** The memories that move affection, four points a step, worded as ordinary conversations. */
const MEMORY_WORDS: Record<MemoryType, (object: string, subject: string) => string[]> = {
  hated: (o) => [
    `the reader brushed ${o} off in a cold, clipped conversation`,
    `the reader snapped at ${o} for no good reason`,
    `the reader talked over ${o} the whole evening`,
    `the reader laughed off something that mattered to ${o}`,
    `the reader made ${o} feel like an afterthought`,
    `the reader cancelled on ${o} with a shrug`,
    `the reader said something careless that stung ${o}`,
    `the reader ignored ${o} in front of everybody`
  ],
  disliked: (o, s) => [
    `the reader seemed distracted while ${s} talked`,
    `the reader gave ${o} short, flat answers`,
    `the reader turned up late and barely apologized`,
    `the reader was curt over text`,
    `the reader checked his phone through the whole conversation`,
    `the reader forgot something ${s} had told him`,
    `the reader was dismissive about what ${s} had planned`,
    `the reader left ${o} waiting`
  ],
  loved: (o) => [
    `the reader spent a warm, attentive evening with ${o}`,
    `the reader listened to ${o} and remembered every detail`,
    `the reader made ${o} laugh until it hurt`,
    `the reader stood up for ${o} without being asked`,
    `the reader turned up with exactly what ${o} needed`,
    `the reader stayed with ${o} through a rough afternoon`,
    `the reader said something sweet that ${o} kept thinking about`,
    `the reader planned a small surprise for ${o}`
  ],
  liked: (o, s) => [
    `the reader was kind and easy to talk to`,
    `the reader walked ${o} to class`,
    `the reader asked how ${s} was doing and meant it`,
    `the reader shared his lunch with ${o}`,
    `the reader was patient when ${s} was having a bad day`,
    `the reader complimented ${o} out of nowhere`,
    `the reader helped ${o} with something small`,
    `the reader was on time and good company`
  ]
}

/**
 * Her affection for the reader, moved towards `target` by memories filed today, which weigh four
 * times over: steps of four points, the newest memories crowding out the oldest at the cap.
 */
export function debugAffection(charId: string, target: number): DebugResult {
  if (!import.meta.env.DEV) return NOT_DEV
  const game = useGameStore.getState()
  const character = game.characters[charId]
  if (!character) return refused('Pick a character.')
  const now = (): number =>
    affectionFor(useGameStore.getState().charInfo[charId], game.date, character)
  const current = now()
  const steps = Math.round((target - current) / 4)
  if (steps === 0) return done(`${character.firstName} is already at ${current}.`)

  // Two steps are one strong memory (±8 today), one step a mild one (±4).
  const [strong, mild]: MemoryType[] = steps > 0 ? ['loved', 'liked'] : ['hated', 'disliked']
  const p = pronounsOf(character.gender)
  const pools = {
    [strong]: MEMORY_WORDS[strong](p.object, p.subject),
    [mild]: MEMORY_WORDS[mild](p.object, p.subject)
  }
  const wanted: MemoryType[] = [
    ...Array<MemoryType>(Math.floor(Math.abs(steps) / 2)).fill(strong),
    ...Array<MemoryType>(Math.abs(steps) % 2).fill(mild)
  ]
  const used: Record<string, number> = {}
  for (const type of wanted) {
    const at = used[type] ?? 0
    if (at >= pools[type].length) break
    used[type] = at + 1
    game.recordMemory(charId, { date: game.date, type, desc: pools[type][at] })
  }
  return done(
    `${character.firstName}'s affection is now ${now()} (was ${current}, asked ${target}; steps of four, and the oldest memories drop at the cap).`
  )
}

/** Makes her the reader's lover, or ends it, through the scene ledger's own path. */
export function debugLover(charId: string, on: boolean): DebugResult {
  if (!import.meta.env.DEV) return NOT_DEV
  const game = useGameStore.getState()
  const character = game.characters[charId]
  if (!character) return refused('Pick a character.')
  if (!romancesReader(character)) return refused(`${character.firstName} cannot be the reader's romance.`)
  const isLover = game.charInfo[charId]?.flags?.isLover === true
  if (on === isLover) {
    return refused(`${character.firstName} is ${isLover ? 'already' : 'not'} the reader's lover.`)
  }
  applyLedger({
    memories: [],
    events: [{ charKey: charKeyOf(character.firstName, character.lastName), event: on ? 'became_lovers' : 'broke_up' }]
  })
  const now = useGameStore.getState().charInfo[charId]?.flags?.isLover === true
  if (now !== on) return refused('The game did not take it.')
  return done(
    on
      ? `${character.firstName} is the reader's lover. The romance rolls end a couple of hers at the next scene's ending.`
      : `${character.firstName} and the reader broke up.`
  )
}

/** Dates the day she learned he cheated on her, or clears it. */
export function debugBetrayed(charId: string, on: boolean): DebugResult {
  if (!import.meta.env.DEV) return NOT_DEV
  const game = useGameStore.getState()
  const character = game.characters[charId]
  if (!character) return refused('Pick a character.')
  if (on && game.charInfo[charId]?.flags?.isLover !== true) {
    return refused(`Only a lover learns she was cheated on, and ${character.firstName} is not one.`)
  }
  game.setBetrayedOn(charId, on ? game.date : null)
  return done(
    on ? `${character.firstName} learned today that the reader cheated on ${pronounsOf(character.gender).object}.` : `${character.firstName} was never betrayed.`
  )
}

/** Moves the day a drift opened back, so the days it needs have already gone by. */
export function debugDriftBack(charId: string, days: number): DebugResult {
  if (!import.meta.env.DEV) return NOT_DEV
  const game = useGameStore.getState()
  const drift = game.npcRomance.drifts?.[charId]
  if (!drift) return refused('No drift is standing for her.')
  const since = Math.max(0, drift.since - Math.max(0, days))
  game.setNpcRomance({
    ...game.npcRomance,
    drifts: { ...game.npcRomance.drifts, [charId]: { ...drift, since } }
  })
  return done(`The drift began on day ${since}, ${game.date - since} days ago. Its signs are as they were.`)
}

/** Moves the day a crush on the reader's lover began being kept back, ageing it towards fading. */
export function debugAgeHeld(charId: string, days: number): DebugResult {
  if (!import.meta.env.DEV) return NOT_DEV
  const game = useGameStore.getState()
  const crush = game.npcRomance.crushes[charId]
  if (!crush) return refused('That character holds no crush.')
  if (crush.heldSince === undefined) {
    return refused('The crush is not on the reader’s lover yet, or no scene has ended since it was.')
  }
  const heldSince = Math.max(0, crush.heldSince - Math.max(0, days))
  game.setNpcRomance({
    ...game.npcRomance,
    crushes: { ...game.npcRomance.crushes, [charId]: { ...crush, heldSince } }
  })
  return done(`The crush has been kept unsaid for ${game.date - heldSince} days.`)
}

/** Marks the crush she already holds as found out today, as a scene reporting it would. */
export function debugDiscover(charId: string): DebugResult {
  if (!import.meta.env.DEV) return NOT_DEV
  const game = useGameStore.getState()
  const character = game.characters[charId]
  const crush = game.npcRomance.crushes[charId]
  if (!character) return refused('Pick a character.')
  if (!crush) return refused(`${character.firstName} holds no crush.`)
  game.setNpcRomance({
    ...game.npcRomance,
    discovered: { ...game.npcRomance.discovered, [charId]: { to: crush.to, date: game.date } }
  })
  const object = game.characters[crush.to]?.firstName ?? 'somebody'
  return done(`The reader knows ${character.firstName} has a crush on ${object}.`)
}

/** Has her block the reader or lift it, as a thread of hers would, with its system line. */
export function debugBlocked(charId: string, on: boolean): DebugResult {
  if (!import.meta.env.DEV) return NOT_DEV
  const game = useGameStore.getState()
  const character = game.characters[charId]
  if (!character) return refused('Pick a character.')
  const flags = game.charInfo[charId]?.flags
  if (!flags?.gaveContactInfo) return refused(`${character.firstName} is not a contact.`)
  if (on === (flags.blocked === true)) {
    return refused(`${character.firstName} has ${on ? 'already' : 'not'} blocked the reader.`)
  }
  if (!on) {
    unblockContact(charId)
    return done(`${character.firstName} unblocked the reader.`)
  }
  game.setBlocked(charId, true)
  game.setPendingHangout(charId, null)
  game.appendChatMessage(
    charId,
    {
      id: crypto.randomUUID(),
      sender: 'system',
      text: `${character.firstName} blocked you.`,
      date: game.date,
      time: game.time
    },
    1
  )
  return done(`${character.firstName} blocked the reader.`)
}
