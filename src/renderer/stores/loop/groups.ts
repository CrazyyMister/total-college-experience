import { affectionFor } from '@shared/relationship'
import { homeOf, READER, STARTING_HOME, type HomeId } from '@shared/homes'
import {
  HOUSES,
  houseEventOf,
  leftHouseDesc,
  occasionHouses,
  rushEventOf,
  rushEventsOf,
  type BidOffer
} from '@shared/houses'
import { upsertJealousyMemory } from '@shared/rumors'
import { tierOf, type PlayerStats } from '@shared/playerStats'
import {
  BID_DAY,
  BID_HOUSES,
  bidScore,
  bidVerdict,
  rushEventsAttended,
  BID_THRESHOLD_CAST,
  BID_THRESHOLD_UNNAMED,
  GROUP_EVENT_TIME,
  GROUPS,
  gameResult,
  groupEventOf,
  initiationNightName,
  initiationSlot,
  PLEDGE_LAST_DAY,
  practiceShareOf,
  settleSessions as settleSessions_,
  teamStrength,
  TRYOUT_TIME,
  tryoutOf,
  tryoutVerdict,
  type GroupId,
  type GroupResult,
  type ReaderPlay
} from '@shared/groups'
import { classSlotForShift, globalSlotOf, shiftSlotFullLabel, slotFromId } from '@shared/jobs'
import { shuffle } from '@shared/shuffle'
import { wornSetOf } from '@shared/wardrobe'
import { memoryAt, type CharInfo, type Occasion, type OutfitSet, type TimeSlot } from '@shared/types'
import { formatGameDate } from '../../prompts/gameDate'
import { isMoodHomebound } from '../../prompts/moods'
import { SPRING_BREAK_LEAVE, SPRING_BREAK_RETURN } from '../../prompts/springBreak'
import { PORTRAIT_SLOTS, useGameStore, type SceneKind } from '../gameStore'
import {
  charTeamSessionNow,
  charUnavailableNow,
  groupEventAt,
  houseMeetingHeldAt,
  playerClassNow,
  playerGroupNow,
  practiceHeldAt,
  shiftNow
} from '../timetable'
import type { Verdict } from './classify'
import { resolveLocationId } from './casting'
import { coachTexts, houseTexts } from './coach'

/**
 * The impure edge of the groups: who is free for an event, how it ended, and the scene it
 * opens. The pure half is `shared/groups.ts`.
 */

/** The prefix of the action type that opens a group event's scene. */
const EVENT_ACTION = 'group:'

/** The charIds who belong to a group, in roster order. */
export function groupMembersOf(groupId: GroupId): string[] {
  const game = useGameStore.getState()
  return game.chars.filter((charId) => game.charInfo[charId]?.groups?.includes(groupId))
}

/**
 * The set her team puts her in for a scene set at `sceneLocation`, or null: she is in her
 * team's session now and the scene is at the session's place. A scene somewhere else, or one
 * with no place, is not her team's, whoever she is.
 */
export function teamSetInScene(
  charId: string,
  sceneLocation: string | null | undefined,
  date?: number,
  time?: TimeSlot
): OutfitSet | null {
  const group = charTeamSessionNow(charId, date, time)
  if (!group || resolveLocationId(sceneLocation) !== group.location) return null
  return group.sessionSet
}

/**
 * What stands in place of her usual clothes in a photo taken at `place` on a half-day: her
 * team's set when the photo is taken at her session's place while she is in the session, else
 * what she would wear anyway.
 */
export function photoWornSet(
  charId: string,
  place: string,
  date: number,
  time: TimeSlot
): OutfitSet | null {
  const group = charTeamSessionNow(charId, date, time)
  const team = group && group.location === place ? group.sessionSet : null
  return wornSetOf(date, useGameStore.getState().outfitReady[charId], team)
}

/** Whether a member could be at a half-day: not in class, on shift, away, or staying in. */
export function memberFreeAt(charId: string, date: number, time: Occasion['time']): boolean {
  const game = useGameStore.getState()
  const half = time ?? GROUP_EVENT_TIME
  if (charUnavailableNow(charId, date, half)) return false
  const gender = game.characters[charId]?.gender ?? 'woman'
  return !isMoodHomebound(date, game.charInfo[charId]?.moodCycleOffset ?? 0, gender)
}

/**
 * What the reader brings to a game, or undefined: he is on the team that plays it by then and
 * has the Body and the practices he has now. Only a game he is going to play has a part of his.
 */
function readerPlay(group: GroupId, slotId: number): ReaderPlay | undefined {
  const game = useGameStore.getState()
  const team = game.groupTeam
  if (!team || team.id !== group || team.since > slotId) return undefined
  return { tier: tierOf(game.stats.body), practiceShare: practiceShareOf(team) }
}

/**
 * How an event ended: the result already filed, or the one its night decides now and files. The
 * seed is the playthrough and the event, and the strength is how many of the team were free that
 * night, so the scene and the boundary reach the same score and the second never overwrites the
 * first. `playing` is the reader going to the game, as a player of his team: only then do his
 * Body and his practices count, read as they stand when the scene opens; the boundary's pass
 * after the night decides a game he did not go to without him.
 */
export function resultOfEvent(occasion: Occasion, playing = false): GroupResult | null {
  const game = useGameStore.getState()
  const filed = game.groupResults[occasion.id]
  if (filed) return filed
  const found = groupEventOf(occasion.id)
  if (!found || occasion.group !== found.group.id) return null

  const members = groupMembersOf(found.group.id)
  const strength = teamStrength(found.group, members, (charId) =>
    memberFreeAt(charId, occasion.startDate, occasion.time)
  )
  const reader = playing
    ? readerPlay(found.group.id, globalSlotOf(occasion.startDate, occasion.time ?? GROUP_EVENT_TIME))
    : undefined
  const result = gameResult(
    found.group,
    strength,
    `${game.playthroughId ?? 'game'}:${occasion.id}`,
    reader
  )
  console.log(
    `[groups] ${occasion.id}: ${reader ? `reader plays, Body tier ${reader.tier}, practices ${Math.round(reader.practiceShare * 100)}%` : 'reader not playing'}, team strength ${strength.toFixed(2)}, ${result.won ? 'won' : 'lost'} ${Math.max(result.home, result.away)}–${Math.min(result.home, result.away)}.`
  )
  game.setGroupResult(occasion.id, result)
  return useGameStore.getState().groupResults[occasion.id] ?? result
}

/**
 * The boundary's pass: every event that is over and has no result gets the one its night
 * decides. Idempotent, and it fills only what is missing.
 */
export function settleGroupResults(): void {
  const game = useGameStore.getState()
  for (const occasion of game.occasions) {
    if (!occasion.group) continue
    const last = occasion.time ?? GROUP_EVENT_TIME
    const over =
      occasion.endDate < game.date || (occasion.endDate === game.date && last < game.time)
    if (over) resultOfEvent(occasion)
  }
}

/**
 * How a tryout ends, decided and filed once when its scene is opened: the seed is the playthrough
 * and the tryout, and the Body is what he has now. Making the team puts him on it from the next
 * period, in the same write; the second to arrive finds the first's verdict and leaves it.
 */
function judgeTryout(occasion: Occasion): void {
  const game = useGameStore.getState()
  const filed = game.groupTryouts[occasion.id]
  if (filed || !occasion.group) return
  const result = tryoutVerdict(game.stats.body, `${game.playthroughId ?? 'game'}:${occasion.id}:tryout`)
  console.log(
    `[groups] ${occasion.id}: Body tier ${result.tier}, ${result.made ? 'made the team' : 'did not make it'}.`
  )
  const sessions = game.groups[occasion.group]?.sessions ?? []
  game.fileTryout(
    occasion.id,
    result,
    result.made
      ? { id: occasion.group, since: globalSlotOf(game.date, game.time) + 1 }
      : null,
    // His coach's welcome rides the same write that puts him on the team.
    result.made ? coachTexts(GROUPS[occasion.group], sessions, [{ kind: 'intro' }]) : undefined
  )
}

/** Asks to leave his house, which the next boundary carries out. */
export function leaveHouseNow(): void {
  useGameStore.getState().askToLeave()
}

/** Takes him off his team, and his coach says goodbye in the same write. */
export function leaveTeamNow(): void {
  const game = useGameStore.getState()
  const team = game.groupTeam
  if (!team) return
  game.leaveTeam(coachTexts(GROUPS[team.id], game.groups[team.id]?.sessions ?? [], [{ kind: 'quit' }]))
}

/**
 * Judges every practice the clock has passed since the last sweep: a practice his team held in
 * a slot he did not go to is a strike, and his coach texts for each. The strikes, the slot
 * judged through and the texts are filed by one store write, so a save never holds one without
 * the others and a replayed boundary finds the slots already judged.
 */
export function settleSessions(): void {
  const game = useGameStore.getState()
  const team = game.groupTeam
  if (!team) return

  // The slot that just ended — the current one has not been spent yet.
  const throughSlot = globalSlotOf(game.date, game.time) - 1
  const settled = settleSessions_(team, throughSlot, practiceHeldAt)
  if (settled.settledThrough === team.settledThrough) return

  let strikes = team.strikes
  const sends = settled.strikes.map(({ kind }) => ({ kind, strikes: ++strikes }))
  for (const { slotId, kind } of settled.strikes) {
    console.log(`[groups] ${team.id}: missed practice at slot ${slotId} (${kind}).`)
  }
  const sessions = game.groups[team.id]?.sessions ?? []
  game.settleTeam(settled, coachTexts(GROUPS[team.id], sessions, sends))
}

/**
 * Judges every pledge meeting the clock has passed since the last sweep: a meeting his house held
 * in a slot he did not go to is a strike, and the house texts for each. The strikes, the slot
 * judged through, the texts and, when the third puts him out, the house's mark are filed by one
 * store write, so a save never holds one without the others and a replayed boundary finds the
 * slots already judged. Nobody of the house is told anything: a pledge put out leaves no memory.
 */
export function settlePledge(): void {
  const game = useGameStore.getState()
  const house = game.groupHouse
  if (!house || house.stage !== 'pledge') return

  // The slot that just ended — the current one has not been spent yet. Past the last day of the
  // pledge nothing is held, so the pass only moves its mark.
  const throughSlot = globalSlotOf(game.date, game.time) - 1
  const settled = settleSessions_(house, throughSlot, houseMeetingHeldAt)
  if (settled.settledThrough === house.settledThrough) return

  let strikes = house.strikes
  const sends = settled.strikes.map(({ kind }) => ({ kind, strikes: ++strikes }))
  for (const { slotId, kind } of settled.strikes) {
    console.log(`[groups] ${house.id}: missed pledge meeting at slot ${slotId} (${kind}).`)
  }
  const sessions = game.houseAgendas[house.id]?.sessions ?? []
  game.settleHouse(settled, houseTexts(house.id, sessions, sends), game.date)
}

/**
 * Sets the night of his initiation, texts him about it, reminds him on the morning of the night,
 * and puts him out when the night has passed and he was not there. The decision is made once, at
 * the first slot on or after the last day of the pledge, off what holds his nights then.
 */
export function settleInitiation(): void {
  const game = useGameStore.getState()
  const house = game.groupHouse
  if (!house || house.stage !== 'pledge') return

  const now = globalSlotOf(game.date, game.time)
  const set = house.initiation
  if (set) {
    // The night is over and he is still a pledge: a pledge who went is a member by now.
    if (set.slot < now) {
      console.log(`[initiation] ${house.id}: he was not at the initiation of slot ${set.slot}; the pledge is over.`)
      game.missInitiation(houseTexts(house.id, [], [{ kind: 'noShow' }]), game.date)
      return
    }
    if (!set.reminded && Math.floor(set.slot / 2) === game.date && game.time === 0) {
      game.remindInitiation(houseTexts(house.id, [], [{ kind: 'reminder' }]))
    }
    return
  }
  if (game.date < PLEDGE_LAST_DAY) return

  // What holds one of his nights: a class (an exam is the class's meeting), a shift, his practice
  // or a plan he has already made.
  const busyAt = (slotId: number): string | null => {
    const { date, time } = slotFromId(slotId)
    if (playerClassNow(date, time) !== null) return 'a class'
    if (shiftNow(date, time) !== null) return 'a shift'
    if (practiceHeldAt(slotId)) return 'his practice'
    return game.events.some((event) => event.date === date && event.time === time) ? 'a plan' : null
  }
  const pick = initiationSlot({
    fromSlot: now,
    busyAt,
    closed: [{ startDate: SPRING_BREAK_LEAVE, endDate: SPRING_BREAK_RETURN - 1 }]
  })
  const day = Math.floor(pick.slot / 2)
  const tonight = day === game.date
  console.log(
    `[initiation] ${HOUSES[house.id].nickname}: ${initiationNightName(pick.slot)} of day ${day} (${formatGameDate(day)}): ${pick.why}${pick.lastResort ? ' (last resort)' : ''}.`
  )
  game.fileInitiation(
    { slot: pick.slot, why: pick.why, ...(tonight ? { reminded: true } : {}) },
    houseTexts(
      house.id,
      [],
      [
        tonight
          ? { kind: 'initiationTonight' }
          : { kind: 'initiation', when: `${initiationNightName(pick.slot)}, ${formatGameDate(day)}` }
      ]
    )
  )
}

/** What the initiation button answers when it is not his night. */
export const NO_INITIATION_MESSAGE = "You don't have an initiation tonight."

/** The action type of the initiation button, which opens the initiation scene. */
export const INITIATION_ACTION = 'initiation'

/**
 * Whether a verdict is going to his initiation: its own button, or a Go from the map to his house
 * on the night. A phrase he typed is never one.
 */
export function isInitiationVerdict(verdict: Verdict): boolean {
  if (verdict.actionType === INITIATION_ACTION) return true
  const night = playerGroupNow()
  return (
    verdict.actionType === MAP_ACTION &&
    night?.kind === 'initiation' &&
    resolveLocationId(verdict.sceneLocation) === night.location
  )
}

/** The scene his initiation opens now, or null: the house's free people, up to three of them. */
export function planInitiation(): { cast: string[]; scene: SceneKind } | null {
  const game = useGameStore.getState()
  const night = playerGroupNow()
  if (night?.kind !== 'initiation' || !night.house) return null
  const house = night.house
  const cast = shuffle(
    game.chars.filter(
      (charId) =>
        game.charInfo[charId]?.house === house && memberFreeAt(charId, game.date, game.time)
    )
  ).slice(0, PORTRAIT_SLOTS)
  return { cast, scene: { houseInitiation: house } }
}

/**
 * Where the ending of a scene moves the reader at the boundary it leads into, or nothing: into
 * the house whose initiation the scene is, and out of it to the dorm when he has asked to leave.
 * A pledge who leaves never moved, so there is nothing to move back.
 */
export function readerHomeMove(): HomeId | undefined {
  const game = useGameStore.getState()
  const house = game.groupHouse
  if (!house) return undefined
  if (game.sceneHouseInitiation && house.stage === 'pledge') return house.id
  if (house.leaving && homeOf(game, READER) === house.id) return STARTING_HOME
  return undefined
}

/**
 * Carries out his leaving at the boundary: the members of the house who are of the roster keep a
 * memory of it, in the permanent list, he goes back to the dorm if he had moved, and the house is
 * marked as one he left. Idempotent, so a replayed boundary finds it done.
 */
export function applyLeaving(): void {
  const game = useGameStore.getState()
  const house = game.groupHouse
  if (!house?.leaving) return
  const desc = leftHouseDesc(house.id, house.stage)
  for (const charId of game.chars) {
    if (game.charInfo[charId]?.house !== house.id) continue
    game.setJealousyMemories(
      charId,
      upsertJealousyMemory(
        useGameStore.getState().charInfo[charId]?.jealousyMemories,
        memoryAt({ date: game.date, time: game.time }, 'disliked', desc)
      )
    )
  }
  if (homeOf(game, READER) === house.id) game.moveHome(READER, STARTING_HOME)
  console.log(`[groups] ${house.id}: he left the ${house.stage === 'member' ? 'house' : 'pledge'}.`)
  game.leaveHouse(game.date)
}

/** What the pledge meeting button answers when his house is not meeting now. */
export const NO_MEETING_MESSAGE = "You don't have a pledge meeting right now."

/** The action type of the pledge meeting button, which opens a meeting scene. */
export const MEETING_ACTION = 'meeting'

/**
 * Whether a verdict is going to his pledge meeting: its own button, or a Go from the map to his
 * house while it meets. A phrase he typed is never one.
 */
export function isMeetingVerdict(verdict: Verdict): boolean {
  if (verdict.actionType === MEETING_ACTION) return true
  const meeting = playerGroupNow()
  return (
    verdict.actionType === MAP_ACTION &&
    meeting?.kind === 'house' &&
    resolveLocationId(verdict.sceneLocation) === meeting.location
  )
}

/** The scene his pledge meeting opens now, or null: the house's free people, up to three of them. */
export function planMeeting(): { cast: string[]; scene: SceneKind } | null {
  const game = useGameStore.getState()
  const meeting = playerGroupNow()
  if (meeting?.kind !== 'house' || !meeting.house) return null
  const house = meeting.house
  const cast = shuffle(
    game.chars.filter(
      (charId) =>
        game.charInfo[charId]?.house === house && memberFreeAt(charId, game.date, game.time)
    )
  ).slice(0, PORTRAIT_SLOTS)
  return { cast, scene: { houseMeeting: house } }
}

/** What the practice button answers when his team is not practicing now. */
export const NO_PRACTICE_MESSAGE = "You don't have practice right now."

/** The action type of the practice button, which opens a practice scene. */
export const PRACTICE_ACTION = 'practice'

/** The action type of a Go from the map, which a phrase he typed never has. */
export const MAP_ACTION = 'go'

/**
 * Whether a verdict is going to his practice: its own button, or a Go from the map to the place
 * his team practices at while it does. A phrase he typed is never one.
 */
export function isPracticeVerdict(verdict: Verdict): boolean {
  if (verdict.actionType === PRACTICE_ACTION) return true
  const practice = playerGroupNow()
  return (
    verdict.actionType === MAP_ACTION &&
    practice?.kind === 'team' &&
    resolveLocationId(verdict.sceneLocation) === practice.location
  )
}

/** The scene his practice opens now, or null when his team is not practicing: up to three of the team who are free. */
export function planPractice(): { cast: string[]; scene: SceneKind; slotId: number } | null {
  const game = useGameStore.getState()
  const practice = playerGroupNow()
  if (practice?.kind !== 'team' || !practice.group) return null
  const cast = shuffle(
    groupMembersOf(practice.group.id).filter((charId) => memberFreeAt(charId, game.date, game.time))
  ).slice(0, PORTRAIT_SLOTS)
  return {
    cast,
    scene: { groupId: practice.group.id, groupPractice: true },
    slotId: globalSlotOf(game.date, game.time)
  }
}

/**
 * The bid the end of rush decides, for the opening of the slot after its last night, or undefined
 * for any other slot, for a game that dealt no rush and for one whose bid is already decided. Read
 * off the store and the post-scene projection the ending narrates from, and kept with the opening.
 */
export function decideBid(
  date: number,
  time: TimeSlot,
  charInfo: Readonly<Record<string, CharInfo>>,
  stats: PlayerStats
): BidOffer | undefined {
  const game = useGameStore.getState()
  if (date !== BID_DAY + 1 || time !== 0) return undefined
  if (game.groupRush.bid) return undefined
  if (!game.occasions.some((occasion) => rushEventOf(occasion.id))) return undefined

  const team = game.groupTeam
  const teamSessions = team ? (game.groups[team.id]?.sessions ?? []) : []
  const inputs = BID_HOUSES.map((house) => {
    const members = game.chars.filter((charId) => game.charInfo[charId]?.house === house)
    return {
      house,
      events: rushEventsAttended(game.groupRush.attended, house),
      affections: members.map((charId) =>
        affectionFor(charInfo[charId], BID_DAY, game.characters[charId])
      ),
      tier: tierOf(stats[HOUSES[house].values]),
      sessions: game.houseAgendas[house]?.sessions ?? []
    }
  })
  const verdict = bidVerdict(inputs, teamSessions)
  for (const input of inputs) {
    const needed = input.affections.length === 0 ? BID_THRESHOLD_UNNAMED : BID_THRESHOLD_CAST
    const outcome = verdict.invited.includes(input.house)
      ? 'bids'
      : verdict.clashed.includes(input.house)
        ? 'would bid but its meetings clash with his team'
        : input.events < 1
          ? 'does not bid: he went to none of its events'
          : 'does not bid'
    console.log(
      `[bid] ${input.house}: ${input.events} of ${rushEventsOf(input.house).length} events, ${input.affections.length === 0 ? 'nobody of the roster' : `affection ${input.affections.map((a) => a.toFixed(0)).join(', ')}`}, ${HOUSES[input.house].values} tier ${input.tier}, score ${bidScore(input).toFixed(2)} (needs ${needed.toFixed(2)}) → ${outcome}.`
    )
  }
  return { day: BID_DAY, ...verdict }
}

/** The verdict that opens an event's scene, naming nobody and setting it at the event's place. */
export function groupEventVerdict(occasion: Occasion): Verdict {
  return {
    mentioned: [],
    mentionedOnly: [],
    actionType: `${EVENT_ACTION}${occasion.id}`,
    inPublic: true,
    sceneLocation: occasion.where ?? ''
  }
}

/** The event id a verdict opens, or null for any other verdict. */
export function groupEventIdOf(verdict: Verdict): string | null {
  return verdict.actionType.startsWith(EVENT_ACTION)
    ? verdict.actionType.slice(EVENT_ACTION.length)
    : null
}

/**
 * The event a verdict opens: the one it names, or the one held at the place it sets the scene in
 * while that event is on, so going to the pool on the night of the meet is the meet.
 */
export function groupEventIdFor(verdict: Verdict): string | null {
  const id = eventIdNamed(verdict)
  if (id === null) return null
  // The night of his initiation is not the night of his own house's event: the initiation wins.
  const game = useGameStore.getState()
  const occasion = game.occasions.find((entry) => entry.id === id)
  if (
    game.groupHouse &&
    occasion &&
    houseEventOf(id) &&
    occasionHouses(occasion).includes(game.groupHouse.id) &&
    playerGroupNow()?.kind === 'initiation'
  ) {
    return null
  }
  return id
}

function eventIdNamed(verdict: Verdict): string | null {
  const named = groupEventIdOf(verdict)
  if (named) return named
  const game = useGameStore.getState()
  const event = groupEventAt(game.date, game.time)
  if (!event?.where || !verdict.sceneLocation) return null
  // A tryout he can no longer go to is a place like any other.
  if (tryoutOf(event.id) && !canTryOut(event.id)) return null
  return resolveLocationId(verdict.sceneLocation) === event.where ? event.id : null
}

/**
 * Whether he can go to a tryout: he is on no team, and has not been judged at it before today.
 * The half-day of a tryout he has just been judged at still counts, so the scene that filed it
 * can be opened again.
 */
export function canTryOut(eventId: string): boolean {
  const game = useGameStore.getState()
  if (!tryoutOf(eventId)) return false
  const occasion = game.occasions.find((entry) => entry.id === eventId)
  if (!occasion) return false
  if (game.groupTryouts[eventId]) {
    return occasion.startDate === game.date && (occasion.time ?? TRYOUT_TIME) === game.time
  }
  return !game.groupTeam
}

/**
 * Why he cannot go to a tryout though it is on, or null: a class or a shift of his is at a time
 * the team practices. The line says which time and what to free.
 */
export function tryoutRefusal(eventId: string): string | null {
  const found = tryoutOf(eventId)
  if (!found) return null
  const game = useGameStore.getState()
  const held = [...(game.job?.shifts ?? []), ...(game.job?.pendingShifts ?? [])]
  const clashes = (game.groups[found.group.id]?.sessions ?? []).flatMap((slot) => {
    const classSlot = classSlotForShift(slot)
    const code = classSlot === null ? undefined : game.playerSchedule[classSlot]
    if (code) return [`${shiftSlotFullLabel(slot)} (your ${game.classes[code]?.name ?? code} class)`]
    return held.includes(slot) ? [`${shiftSlotFullLabel(slot)} (one of your shifts)`] : []
  })
  if (clashes.length === 0) return null
  return `The ${found.group.practice} would meet ${clashes.join(' and ')}. Free that time first, then come back to the tryout.`
}

/** What opening an event's scene settles. */
export interface GroupEventPlan {
  cast: string[]
  scene: SceneKind
}

/**
 * The scene an event opens now, or null when it is not on this half-day: its result decided and
 * filed, and up to three of the team who are free cast, the one who asked first.
 */
export function planGroupEvent(eventId: string, required?: string): GroupEventPlan | null {
  const game = useGameStore.getState()
  const occasion = game.occasions.find((entry) => entry.id === eventId)
  if (houseEventOf(eventId)) {
    // A house's own event: whoever lives in it, or in the other house of a mixer, and is free is
    // there, the two houses taking turns, and nothing is decided.
    if (!occasion?.house || occasion.startDate !== game.date) return null
    if ((occasion.time ?? GROUP_EVENT_TIME) !== game.time) return null
    const homes = occasionHouses(occasion).map((house) =>
      shuffle(
        game.chars.filter(
          (charId) =>
            game.charInfo[charId]?.house === house && memberFreeAt(charId, game.date, game.time)
        )
      )
    )
    const turns = Array.from({ length: Math.max(0, ...homes.map((home) => home.length)) }, (_, at) =>
      homes.flatMap((home) => (at < home.length ? [home[at]] : []))
    ).flat()
    const cast = [...new Set([...(required ? [required] : []), ...turns])].slice(0, PORTRAIT_SLOTS)
    return { cast, scene: { groupEvent: occasion.id } }
  }
  if (!occasion?.group || occasion.startDate !== game.date) return null
  const tryout = tryoutOf(eventId)
  if ((occasion.time ?? (tryout ? TRYOUT_TIME : GROUP_EVENT_TIME)) !== game.time) return null
  if (tryout) {
    if (!canTryOut(eventId) || tryoutRefusal(eventId)) return null
    judgeTryout(occasion)
  } else if (!resultOfEvent(occasion, true)) return null

  const free = shuffle(
    groupMembersOf(occasion.group).filter((charId) =>
      memberFreeAt(charId, game.date, game.time)
    )
  )
  const cast = [...new Set([...(required ? [required] : []), ...free])].slice(0, PORTRAIT_SLOTS)
  return { cast, scene: { groupId: occasion.group, groupEvent: occasion.id } }
}
