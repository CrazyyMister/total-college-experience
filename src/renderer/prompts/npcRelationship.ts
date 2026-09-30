import { dormSpotLabel } from '@shared/dorms'
import { locationLabel, ROOM_LOCATION } from '@shared/locations'
import {
  npcBestFriendOf,
  npcPairOf,
  pairKeyOf,
  zoneOf,
  type NpcEncounter,
  type NpcRelationshipMap
} from '@shared/npcRelationships'
import {
  declarationOutcomeOf,
  emptyNpcRomance,
  EX_PROMPT_DAYS,
  isAttractedTo,
  isRivalGrudge,
  mayFallFor,
  npcPartnerOf,
  REJECTION_COOLDOWN_DAYS,
  wouldSayYes,
  type NpcRomanceMap
} from '@shared/npcRomance'
import {
  type Character,
  type CharacterBehavior,
  type CharInfo,
  type ClassEntry,
  fullNameOf,
  type Gender,
  type Haunt,
  type TimeSlot
} from '@shared/types'
import { pronounsOf } from '@shared/pronouns'
import { formatWeekday } from './gameDate'

/**
 * What the cast think of *each other*, as RITA reads it. Pure formatters over the
 * pair map.
 */

/** How long an encounter is worth mentioning. Older than this and it is just history. */
const ENCOUNTER_DAYS = 7

/** `"today"`, `"yesterday"`, or the weekday it fell on. */
function whenClause(date: number, today: number): string {
  const days = today - date
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return `on ${formatWeekday(date)}`
}

/**
 * `"at the BTB Arcade"`, `"in Chloe's room"`, `"in Western Civ"`, `"in the Lowrise kitchen"`.
 */
function whereClause(
  encounter: NpcEncounter,
  classes: Record<string, ClassEntry>,
  characters: Record<string, Character>
): string {
  if (encounter.kind === 'class') {
    return `in ${classes[encounter.ref]?.name ?? encounter.ref}`
  }
  if (encounter.kind === 'dorm') {
    return `in ${dormSpotLabel(encounter.ref)}`
  }
  if (encounter.ref === ROOM_LOCATION) {
    const host = encounter.roomOf ? characters[encounter.roomOf] : undefined
    return host ? `in ${host.firstName}'s room` : 'in their room'
  }
  return `at ${locationLabel(encounter.ref)}`
}

/** The one sentence about a pair. */
function pairLine(
  a: Character,
  b: Character,
  relationships: NpcRelationshipMap,
  today: number,
  classes: Record<string, ClassEntry>,
  characters: Record<string, Character>
): string {
  const names = `${a.firstName} and ${b.firstName}`
  const pair = npcPairOf(relationships, a.charId, b.charId)
  if (!pair) return npcStandingLine(a, b, relationships)

  const zone = zoneOf(pair.affinity)
  const encounter = pair.encounter
  const fresh =
    encounter && today - encounter.date <= ENCOUNTER_DAYS && today - encounter.date >= 0
      ? encounter
      : null
  const event = fresh
    ? `${fresh.positive ? 'bonded' : 'argued'} ${whereClause(fresh, classes, characters)} ${whenClause(fresh.date, today)}`
    : null

  if (zone === 'neutral') {
    const base = npcStandingLine(a, b, relationships)
    return event ? `${base} They ${event}.` : base
  }

  const standing = zone === 'friends' ? `${names} are friends` : `${names} are enemies`
  if (!event) return `${standing}.`

  if (zone === 'friends') {
    return fresh?.positive
      ? `${standing}, and they ${event}.`
      : `${standing}, but they ${event}.`
  }
  return fresh?.positive
    ? `${standing} but they got a bit closer ${whereClause(fresh, classes, characters)} ${whenClause(fresh.date, today)}.`
    : `${standing} and they ${event}.`
}

/**
 * The bare standing between two characters — what {@link pairLine} opens with, and the
 * whole of an absent character's lorebook entry.
 */
export function npcStandingLine(
  a: Character,
  b: Character,
  relationships: NpcRelationshipMap
): string {
  const names = `${a.firstName} and ${b.firstName}`
  const pair = npcPairOf(relationships, a.charId, b.charId)
  if (!pair) return `${names} don't know each other yet.`
  const zone = zoneOf(pair.affinity)
  if (zone === 'friends') return `${names} are friends.`
  if (zone === 'enemies') return `${names} are enemies.`
  return `${names} know each other but aren't close.`
}

/** The one sentence naming a character's closest friend, or nothing at all. */
export function bestFriendLines(
  character: Character,
  roster: readonly Character[],
  relationships: NpcRelationshipMap
): string[] {
  const candidates = roster.filter((other) => other.charId !== character.charId)
  const best = npcBestFriendOf(
    relationships,
    character.charId,
    candidates.map((other) => other.charId)
  )
  const friend = candidates.find((other) => other.charId === best)
  return friend ? [`${character.firstName}'s closest friend is ${fullNameOf(friend)}.`] : []
}

/** What one cast member is called in a companion clause. */
export interface NpcCompanions {
  knownNames: readonly string[]
  unknown: number
}

/**
 * `"with Sarah"`, `"with Sarah and a friend"`, `"with friends"` — or `''` when she is on her
 * own.
 */
function companionClause(companions: NpcCompanions): string {
  const parts = [...companions.knownNames]
  if (companions.unknown === 1) parts.push('a friend')
  else if (companions.unknown > 1) parts.push(parts.length > 0 ? 'some friends' : 'friends')
  if (parts.length === 0) return ''
  if (parts.length === 1) return `with ${parts[0]}`
  return `with ${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/**
 * What she's doing at her own haunt, phrased by kind. `null` when there's nothing to name: a
 * room location, no haunt, a fun/grocery/room haunt, or an activity haunt left blank.
 */
export function hauntActivity(
  location: string,
  haunt: Haunt | null | undefined,
  time: TimeSlot
): string | null {
  if (location === ROOM_LOCATION || !haunt) return null
  const label = locationLabel(location)
  if (haunt.kind === 'study') return `studying at ${label}`
  if (haunt.kind === 'meal') return `having ${time === 1 ? 'dinner' : 'lunch'} at ${label}`
  if (haunt.kind === 'activity') return haunt.doing || null
  return null
}

/**
 * `"at the BTB Arcade"`, `"studying at the Kendall Library"`, `"having dinner at Bobby's Diner"`,
 * or the activity phrase itself — what she is doing where she is; a girl somewhere that is not
 * her own haunt, or with nothing to name there, is simply at it.
 */
export function hauntClause(
  location: string,
  haunt: Haunt | null | undefined,
  time: TimeSlot,
  gender: Gender
): string {
  return (
    hauntActivity(location, haunt, time) ??
    (location === ROOM_LOCATION
      ? `in ${pronounsOf(gender).possessive} room`
      : `at ${locationLabel(location)}`)
  )
}

/**
 * The one sentence saying where a character is this hour and what she is doing there,
 * companions included — shared by texts and invitations.
 */
export function whereaboutsLine(
  character: Pick<Character, 'firstName' | 'gender'>,
  location: string,
  companions: NpcCompanions,
  haunt?: Haunt | null,
  time: TimeSlot = 0
): string {
  const withWhom = companionClause(companions)
  const tail = withWhom ? ` ${withWhom}` : ''
  return `${character.firstName} is ${hauntClause(location, haunt, time, character.gender)}${tail} right now.`
}

/** What the pair lines need, which is a slice of `ScenePromptState`. */
export interface NpcPairContext {
  date: number
  npcRelationships: NpcRelationshipMap
  classes: Record<string, ClassEntry>
  characters: Record<string, Character>
}

/** One line per pair of cast members, closing the cast block. */
export function npcPairLines(
  cast: readonly Character[],
  context: NpcPairContext
): string[] {
  if (cast.length < 2) return []
  const lines: string[] = ['']
  for (let i = 0; i < cast.length; i++) {
    for (let j = i + 1; j < cast.length; j++) {
      lines.push(
        pairLine(
          cast[i],
          cast[j],
          context.npcRelationships,
          context.date,
          context.classes,
          context.characters
        )
      )
    }
  }
  return lines
}

/** Fixed emission order, so the block does not move when the cast is reshuffled. */
const NPC_BEHAVIOR_ORDER: ReadonlyArray<keyof CharacterBehavior> = [
  'withStrangers',
  'withFriends',
  'withEnemy'
]

/**
 * How she behaves towards the *rest of the cast*, when that is not how she behaves towards the
 * reader.
 */
export function npcBehaviorLines(
  character: Character,
  cast: readonly Character[],
  relationships: NpcRelationshipMap,
  readerLevel: keyof CharacterBehavior
): string[] {
  const levels = new Set<keyof CharacterBehavior>()
  for (const other of cast) {
    if (other.charId === character.charId) continue
    const pair = npcPairOf(relationships, character.charId, other.charId)
    const zone = pair ? zoneOf(pair.affinity) : 'neutral'
    levels.add(
      zone === 'friends' ? 'withFriends' : zone === 'enemies' ? 'withEnemy' : 'withStrangers'
    )
  }
  const lines: string[] = []
  for (const level of NPC_BEHAVIOR_ORDER) {
    if (level === readerLevel || !levels.has(level)) continue
    const behavior = character.behavior[level]
    if (behavior) lines.push(behavior)
  }
  return lines
}

/** How recent a couple's fight must be for a scene to hear of it. */
const FIGHT_DAYS = 7

/** The heading that opens the romance section, and what the development build looks for. */
export const NPC_ROMANCE_HEADING = 'ROMANCE BETWEEN CHARACTERS'

/** What the romance section says, picked off the map before a word of it is written. */
export interface NpcRomanceFacts {
  /** Every couple on the save. */
  couples: Array<{ a: string; b: string; since: number }>
  /** Ex pairs whose breakup is recent, or with either of the two present. */
  exes: Array<{ a: string; b: string; since: number; ended: number }>
  /** Crushes held by somebody present, with the date the reader found out where he has. */
  crushes: Array<{ from: string; to: string; since: number; found?: number }>
  /** Turned-down declarations inside the wait, with somebody present on either side. */
  rejections: Array<{ from: string; to: string; date: number }>
  /** Present crush holders whose crush is the reader's lover. */
  jealous: Array<{ from: string; lover: string }>
  /** Drifts where the reader's lover or the one she is drawn to is present. */
  drifting: Array<{ lover: string; suitor: string }>
  /** Men the reader displaced, present, while their grudge runs. */
  rivals: Array<{ rival: string; lover: string; ended: number }>
}

/** Whoever the charInfo marks as the reader's lover, sorted. */
export function readerLoversOf(charInfo: Readonly<Record<string, CharInfo | undefined>>): string[] {
  return Object.keys(charInfo)
    .filter((charId) => charInfo[charId]?.flags?.isLover)
    .sort()
}

/**
 * The romance a prompt carries for `present`: every couple, and the exes who broke up recently or
 * have either of the two present, since those are common knowledge; and the crushes and recent
 * turn-downs of those present alone.
 */
export function npcRomanceFactsOf(
  map: NpcRomanceMap | undefined,
  present: readonly string[],
  readerLovers: readonly string[],
  date: number
): NpcRomanceFacts {
  const facts: NpcRomanceFacts = {
    couples: [],
    exes: [],
    crushes: [],
    rejections: [],
    jealous: [],
    drifting: [],
    rivals: []
  }
  if (!map) return facts
  const here = new Set(present)
  for (const key of Object.keys(map.couples).sort()) {
    const [a, b] = key.split('|')
    facts.couples.push({ a, b, since: map.couples[key].since })
  }
  for (const key of Object.keys(map.exes).sort()) {
    const [a, b] = key.split('|')
    const ex = map.exes[key]
    if (date - ex.ended < EX_PROMPT_DAYS || here.has(a) || here.has(b)) {
      facts.exes.push({ a, b, since: ex.since, ended: ex.ended })
    }
    if (ex.displaced !== undefined && here.has(ex.displaced) && isRivalGrudge(ex, date)) {
      facts.rivals.push({
        rival: ex.displaced,
        lover: ex.displaced === a ? b : a,
        ended: ex.ended
      })
    }
  }
  for (const lover of Object.keys(map.drifts ?? {}).sort()) {
    const { to } = map.drifts![lover]
    if (here.has(lover) || here.has(to)) facts.drifting.push({ lover, suitor: to })
  }
  for (const from of Object.keys(map.crushes).sort()) {
    if (!here.has(from)) continue
    const crush = map.crushes[from]
    const found = map.discovered?.[from]
    facts.crushes.push({
      from,
      to: crush.to,
      since: crush.since,
      ...(found?.to === crush.to ? { found: found.date } : {})
    })
    if (readerLovers.includes(crush.to)) facts.jealous.push({ from, lover: crush.to })
  }
  for (const key of Object.keys(map.rejections).sort()) {
    const [from, to] = key.split('>')
    const rejection = map.rejections[key]
    // A crush that faded unsaid held nothing anybody was told.
    if (rejection.quiet) continue
    if (date - rejection.date >= REJECTION_COOLDOWN_DAYS) continue
    if (!here.has(from) && !here.has(to)) continue
    facts.rejections.push({ from, to, date: rejection.date })
  }
  return facts
}

/** `"today"`, `"yesterday"`, `"12 days ago"`. */
function daysAgo(date: number, today: number): string {
  const days = today - date
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

/** `"since today"`, `"since yesterday"`, `"for 12 days"`. */
function heldFor(since: number, today: number): string {
  const days = today - since
  if (days <= 0) return 'since today'
  if (days === 1) return 'since yesterday'
  return `for ${days} days`
}

/**
 * The romance section a scene or a thread carries: couples and exes anybody may know and talk
 * about, then the crushes only their holders know of, the jealousy a crush on the reader's lover
 * earns him, and the recent turn-downs.
 */
export function npcRomanceLines(
  facts: NpcRomanceFacts,
  characters: Readonly<Record<string, Character | undefined>>,
  today: number
): string[] {
  const person = (id: string): Character | undefined => characters[id]
  const lines: string[] = []

  let common = 0
  for (const { a, b, since } of facts.couples) {
    const [x, y] = [person(a), person(b)]
    if (!x || !y) continue
    common++
    lines.push(
      `${fullNameOf(x)} and ${fullNameOf(y)} are a couple; they got together ${daysAgo(since, today)}.`
    )
  }
  for (const { a, b, since, ended } of facts.exes) {
    const [x, y] = [person(a), person(b)]
    if (!x || !y) continue
    common++
    lines.push(
      `${fullNameOf(x)} and ${fullNameOf(y)} are exes: they got together ${daysAgo(since, today)} and broke up ${daysAgo(ended, today)}.`
    )
  }
  if (common > 0) {
    lines.push(
      'Who is dating whom, and who broke up, is no secret: anybody may know it and bring it up.'
    )
  }

  for (const { from, to, since, found } of facts.crushes) {
    const [holder, object] = [person(from), person(to)]
    if (!holder || !object) continue
    const knows =
      found === undefined
        ? `Only ${holder.firstName} knows`
        : `Only ${holder.firstName} and the reader know (the reader found out ${daysAgo(found, today)})`
    lines.push(
      `${holder.firstName} has had a secret crush on ${fullNameOf(object)} ${heldFor(since, today)}. ${knows}: ${object.firstName} does not, nobody else does, and ${pronounsOf(holder.gender).subject} tells no one without a strong reason in the scene. Show it only in subtle signs — nerves, lingering glances, badly hidden jealousy.`
    )
  }
  for (const { from, lover } of facts.jealous) {
    const [holder, object] = [person(from), person(lover)]
    if (!holder || !object) continue
    lines.push(
      `${object.firstName} is dating the reader, so ${holder.firstName} is jealous of him and treats him coolly or with thinly veiled resentment.`
    )
  }
  for (const { lover, suitor } of facts.drifting) {
    const [she, he] = [person(lover), person(suitor)]
    if (!she || !he) continue
    const p = pronounsOf(she.gender)
    lines.push(
      `${she.firstName} and the reader are drifting apart, and ${she.firstName} has been growing closer to ${he.firstName}, who has a secret crush on ${p.object}. Nothing has been said or done: ${she.firstName} is still the reader's partner and nobody has confessed anything. Show it only in small signs — ${she.firstName} pulling away from the reader, distracted or cool with him, finding reasons to be near ${he.firstName}, ${he.firstName} a little too warm with ${p.object}. It is not for this scene to end things; the reader can still turn it around by how he treats ${p.object}.`
    )
  }
  for (const { rival, lover, ended } of facts.rivals) {
    const [man, woman] = [person(rival), person(lover)]
    if (!man || !woman) continue
    lines.push(
      `${man.firstName} used to date ${woman.firstName}, and ${daysAgo(ended, today)} ${pronounsOf(woman.gender).subject} started dating the reader and ended it. ${man.firstName} resents the reader for it: cold, sarcastic or openly hostile towards him, in the way that suits ${pronounsOf(man.gender).possessive} personality.`
    )
  }
  for (const { from, to, date } of facts.rejections) {
    const [asker, answer] = [person(from), person(to)]
    if (!asker || !answer) continue
    const p = pronounsOf(asker.gender)
    const when = daysAgo(date, today)
    lines.push(
      `${when[0].toUpperCase()}${when.slice(1)}, ${asker.firstName} told ${answer.firstName} how ${p.subject} felt, and ${answer.firstName} turned ${p.object} down. Both of them remember it.`
    )
  }

  return lines
}

/** The romance lines under their heading, or nothing when there are none. */
export function npcRomanceSection(lines: readonly string[]): string[] {
  return lines.length > 0 ? [NPC_ROMANCE_HEADING, ...lines] : []
}

/**
 * For a scene: which couples are here together and how the scene might play them, and which
 * confessions between those present the game can take, so the writer shows no other.
 */
export function npcSceneRomanceLines(
  cast: readonly Character[],
  map: NpcRomanceMap | undefined,
  readerLovers: readonly string[],
  today: number
): string[] {
  if (cast.length < 2) return []
  const romance = map ?? emptyNpcRomance()
  const lines: string[] = []

  for (let i = 0; i < cast.length; i++) {
    for (let j = i + 1; j < cast.length; j++) {
      const [a, b] = [cast[i], cast[j]]
      const couple = romance.couples[pairKeyOf(a.charId, b.charId)]
      if (!couple) continue
      const fight =
        couple.lastFight !== undefined && today - couple.lastFight <= FIGHT_DAYS
          ? ` They had a fight ${daysAgo(couple.lastFight, today)}.`
          : ''
      lines.push(
        `${a.firstName} and ${b.firstName} are both here, and they are a couple.${fight} Let it shape the scene where it fits — a double date, the reader as the third wheel, the two of them bickering in front of him.`
      )
    }
  }

  const context = {
    date: today,
    characters: Object.fromEntries(cast.map((c) => [c.charId, c])),
    readerLovers
  }
  const possible: string[] = []
  for (const from of cast) {
    for (const to of cast) {
      const outcome = declarationOutcomeOf(romance, from.charId, to.charId, context)
      if (outcome === 'impossible') continue
      possible.push(
        outcome === 'open'
          ? `${from.firstName} to ${to.firstName}`
          : `${from.firstName} to ${to.firstName} (${to.firstName} can only say no)`
      )
    }
  }
  // Said only where somebody here is drawn to somebody else here at all.
  const drawn = cast.some((from) => cast.some((to) => from !== to && isAttractedTo(from, to)))
  if (possible.length === 0 && !drawn) return lines
  lines.push(
    possible.length === 0
      ? 'Nobody here can confess romantic feelings to anybody else here, and no two of them can start dating.'
      : `Of the characters here, the only romantic confessions that can happen are: ${possible.join('; ')}. No other two of them can confess feelings or start dating.`
  )
  return lines
}

/**
 * For a scene: how somebody here would answer if the reader told them of a crush on them he has
 * found out about, whose holder is not here, by the rule the game answers such a telling with.
 */
export function npcRevealLines(
  cast: readonly Character[],
  map: NpcRomanceMap | undefined,
  relationships: NpcRelationshipMap,
  characters: Readonly<Record<string, Character | undefined>>,
  readerLovers: readonly string[],
  today: number
): string[] {
  if (!map?.discovered) return []
  const here = new Set(cast.map((character) => character.charId))
  const known = Object.fromEntries(
    Object.values(characters).flatMap((c) => (c ? [[c.charId, c]] : []))
  )
  const context = { date: today, characters: known, readerLovers }
  const lines: string[] = []
  for (const from of Object.keys(map.discovered).sort()) {
    const to = map.discovered[from].to
    if (here.has(from) || !here.has(to) || map.crushes[from]?.to !== to) continue
    if (readerLovers.includes(to)) continue
    const [holder, object] = [characters[from], characters[to]]
    if (!holder || !object) continue
    const answer =
      declarationOutcomeOf(map, from, to, context) === 'impossible'
        ? 'nothing could come of it for now'
        : wouldSayYes(map, relationships, from, to, context)
          ? `${object.firstName} would be glad and say yes to ${holder.firstName}`
          : `${object.firstName} would turn ${holder.firstName} down`
    lines.push(
      `The reader knows ${fullNameOf(holder)} has a secret crush on ${object.firstName}. If he tells ${object.firstName}, ${answer}.`
    )
  }
  return lines
}

/**
 * Whether a scene ledger is asked about romance between characters: somebody here is either end
 * of a crush or in a couple, or could fall for somebody else here.
 */
export function ledgerAsksNpcRomance(
  cast: readonly Character[],
  map: NpcRomanceMap | undefined,
  readerLovers: readonly string[],
  today: number
): boolean {
  if (cast.length === 0 || !map) return false
  const present = cast.map((character) => character.charId)
  const targets = new Set(Object.values(map.crushes).map((crush) => crush.to))
  if (present.some((id) => map.crushes[id] || targets.has(id) || npcPartnerOf(map, id))) return true
  const context = {
    date: today,
    characters: Object.fromEntries(cast.map((c) => [c.charId, c])),
    readerLovers
  }
  return present.some((from) => present.some((to) => mayFallFor(map, from, to, context)))
}

/**
 * How she behaves towards a partner or a crush in the cast, named, off her own behavior strings;
 * where the string is empty the writer is told to work it out from her personality.
 */
export function npcRomanceBehaviorLines(
  character: Character,
  cast: readonly Character[],
  map: NpcRomanceMap | undefined
): string[] {
  if (!map) return []
  const p = pronounsOf(character.gender)
  const infer = `nothing is written for this, so work out how ${character.firstName} acts from ${p.possessive} personality.`
  const partnerId = npcPartnerOf(map, character.charId)
  const partner = cast.find((other) => other.charId === partnerId)
  const crush = cast.find((other) => other.charId === map.crushes[character.charId]?.to)
  const lines: string[] = []
  if (partner) {
    lines.push(
      `Towards ${partner.firstName}, ${p.possessive} partner: ${character.behavior.withLover || infer}`
    )
  }
  if (crush) {
    lines.push(
      `Towards ${crush.firstName}, ${p.possessive} secret crush: ${character.behavior.withCrush || infer}`
    )
  }
  return lines
}
