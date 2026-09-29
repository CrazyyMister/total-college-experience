import { studentsOf } from '@shared/classes'
import { dormBuildingOf } from '@shared/dorms'
import {
  isLocationOpen,
  LOCATIONS,
  LOWRISE_LOCATION,
  OUTING_LOCATIONS,
  ROOM_LOCATION
} from '@shared/locations'
import {
  newFriendships,
  npcFriendsOf,
  settleNpcPairs,
  type NpcEncounterGroup,
  type NpcRelationshipMap,
  type NpcSlotOverlay
} from '@shared/npcRelationships'
import {
  rivalMemoryOf,
  settleNpcRomance,
  type NpcRomanceOutcome,
  type NpcSceneEvent,
  type ReaderBreakup,
  type ReaderLoverState
} from '@shared/npcRomance'
import { affectionFor } from '@shared/relationship'
import { upsertJealousyMemory } from '@shared/rumors'
import type { CharInfo, Haunt, TimeSlot } from '@shared/types'
import { globalSlotOf, shiftSlotOf } from '@shared/jobs'
import { classSlotOf, hauntClosedOn } from '../../prompts/occasions'
import { isMoodHomebound } from '../../prompts/moods'
import { prevSlot, shiftWeekdayOf, weekdayOf, weekendSaturdayOf } from '../../prompts/gameDate'
import { isSummerOutingWeek } from '../../prompts/graduation'
import { isSpringBreakOutingWeek } from '../../prompts/springBreak'
import { useGameStore } from '../gameStore'
import { rollNpcOverlay, type OutingWindow, type OverlayCharInput } from '../npcOverlay'
import { rollDormRunIns, rollLooseRunIns, type RunInCharInput } from '../npcRunIns'
import {
  charHiddenLocationNow,
  charOverlayGroupNow,
  charStandingHauntAt,
  charUnavailableNow
} from '../timetable'

/** The roster's own social life, where it meets the store. */

/** Where a character is this slot and who is with her. */
export interface NpcWhereabouts {
  /** A location id, or `'room'`. */
  location: string
  /** Companions whose names the reader has heard, in group order. */
  knownNames: string[]
  /** How many more are with her whose names he has not. */
  unknown: number
  /** Her own standing haunt, when that is where she is. */
  haunt?: Haunt
}

/** Rolls who spends `date`/`time` with whom. */
export function rollNpcOverlayNow(
  date: number,
  time: TimeSlot,
  relationships: NpcRelationshipMap = useGameStore.getState().npcRelationships
): NpcSlotOverlay {
  const game = useGameStore.getState()
  const window = outingWindowOf(date)
  const saturday = weekendSaturdayOf(date)
  const previous = prevSlot(date, time)

  const chars: Record<string, OverlayCharInput> = {}
  for (const charId of game.chars) {
    chars[charId] = {
      // The standing haunt, not `charHiddenLocationNow`, which reads the overlay this call is
      // producing and would deal a replay a second evening.
      haunt: charStandingHauntAt(charId, date, time)?.location ?? null,
      // Off campus takes her out of all three passes at once.
      busy: charUnavailableNow(charId, date, time),
      moodHomebound: isMoodHomebound(
        date,
        game.charInfo[charId]?.moodCycleOffset ?? 0,
        game.characters[charId]?.gender ?? 'woman'
      ),
      // Each window reads only its own record, off the arguments rather than the clock, which
      // at an ending names the slot before the one being rolled.
      wentOutRecently:
        window === 'break'
          ? game.outingSlots[charId] === globalSlotOf(previous.date, previous.time)
          : window === 'weekend' &&
            saturday !== null &&
            game.weekendOutings[charId] === saturday,
      friends: npcFriendsOf(relationships, charId, game.chars)
    }
  }

  // A spot shut this half of the day is never drawn for an outing.
  const spots = OUTING_LOCATIONS.filter((id) =>
    isLocationOpen(id, shiftSlotOf(shiftWeekdayOf(date), time))
  )
  return rollNpcOverlay(date, time, window, chars, spots)
}

/** Which fatigue window a date falls in. */
function outingWindowOf(date: number): OutingWindow {
  if (isSpringBreakOutingWeek(date) || isSummerOutingWeek(date)) return 'break'
  return weekendSaturdayOf(date) !== null ? 'weekend' : null
}

/** Files an overlay as the slot's own, and banks its fatigue. */
export function applyNpcOverlay(overlay: NpcSlotOverlay): void {
  const game = useGameStore.getState()
  game.setNpcOverlay(overlay)
  if (outingWindowOf(overlay.date) === 'break') {
    game.recordOutingSlots(overlay.wentOut, globalSlotOf(overlay.date, overlay.time))
    return
  }
  const saturday = weekendSaturdayOf(overlay.date)
  if (saturday !== null) game.recordWeekendOutings(overlay.wentOut, saturday)
}

/**
 * Every encounter the finished slot held — the lectures, the hour's hangouts and the
 * run-ins. Rolled once per ending, because the run-ins are dice, and read by both settles.
 */
export function rollSlotEncounterGroups(): NpcEncounterGroup[] {
  const game = useGameStore.getState()
  const groups: NpcEncounterGroup[] = []

  // Who sat in a lecture together; null on a weekend or a closed day.
  const slot = classSlotOf(game.date, game.time, game.occasions)
  if (slot !== null) {
    for (const entry of Object.values(game.classes)) {
      if (entry.slot !== slot) continue
      const members = studentsOf(entry, game.chars, game.charInfo)
      if (members.length >= 2) groups.push({ kind: 'class', ref: entry.code, members })
    }
  }

  // Who spent the hour together; a stale overlay contributes nothing.
  const overlay = game.npcOverlay
  if (overlay && overlay.date === game.date && overlay.time === game.time) {
    for (const group of overlay.groups) {
      if (group.members.length < 2) continue
      groups.push({
        kind: 'hangout',
        ref: group.location,
        members: group.members,
        ...(group.host ? { host: group.host } : {})
      })
    }
  }

  // Nobody is counted twice: the cast and everybody already grouped above are out of both rolls.
  const spokenFor = new Set([...game.cast, ...groups.flatMap((group) => group.members)])
  const runIns: Record<string, RunInCharInput> = {}
  for (const charId of game.chars) {
    runIns[charId] = {
      busy: charUnavailableNow(charId, game.date, game.time),
      location: charHiddenLocationNow(charId, game.date, game.time),
      haunt: charStandingHauntAt(charId, game.date, game.time)?.location ?? null,
      building: dormBuildingOf(game.charInfo[charId]?.dorm),
      spokenFor: spokenFor.has(charId)
    }
  }
  groups.push(...rollDormRunIns(runIns), ...rollLooseRunIns(runIns, runInSpots()))

  return groups
}

/** Rolls every affinity the finished slot earned and returns the settled map, writing nothing. */
export function rollNpcRelationshipSettle(
  bonded: readonly string[] = [],
  groups: readonly NpcEncounterGroup[] = rollSlotEncounterGroups()
): NpcRelationshipMap {
  const game = useGameStore.getState()
  return settleNpcPairs({
    date: game.date,
    relationships: game.npcRelationships,
    cast: game.cast,
    bonded,
    groups,
    characters: game.characters
  })
}

/**
 * Rolls the finished slot's romance between the roster off the affinities just settled, with
 * what the scene showed applied first, and returns both maps, writing nothing. `charInfo` is the
 * ending's projection, so a girl the scene just made the reader's lover counts as taken.
 */
export function rollNpcRomanceSettle(
  relationships: NpcRelationshipMap,
  groups: readonly NpcEncounterGroup[],
  charInfo: Readonly<Record<string, CharInfo | undefined>>,
  sceneEvents: readonly NpcSceneEvent[] = []
): NpcRomanceOutcome {
  const game = useGameStore.getState()
  const readerLovers = game.chars.filter((charId) => charInfo[charId]?.flags?.isLover)
  const loverStates: Record<string, ReaderLoverState> = {}
  for (const charId of readerLovers) {
    const info = charInfo[charId]
    loverStates[charId] = {
      affection: affectionFor(info, game.date, game.characters[charId]),
      harem: info?.flags?.harem === true,
      ...(info?.betrayedOn !== undefined ? { betrayedOn: info.betrayedOn } : {}),
      ...(info?.datingSince !== undefined ? { datingSince: info.datingSince } : {})
    }
  }
  return settleNpcRomance({
    date: game.date,
    // Sunday night closes the week.
    endsWeek: weekdayOf(game.date) === 0 && game.time === 1,
    relationships,
    romance: game.npcRomance,
    groups,
    cast: game.cast,
    readerLovers,
    characters: game.characters,
    sceneEvents,
    loverStates,
    signed: driftSignsShown(readerLovers)
  })
}

/**
 * The drifting lovers whose signs a scene or a thread carried this slot: she or the one she is
 * drawn to was in the cast, or a message was exchanged with either today. The drift was on the
 * map before the slot, which is what put the signs in those prompts.
 */
function driftSignsShown(readerLovers: readonly string[]): string[] {
  const game = useGameStore.getState()
  const drifts = game.npcRomance.drifts ?? {}
  const spoke = (charId: string): boolean =>
    game.bunnyboard.conversations[charId]?.messages.some(
      (message) => message.sender !== 'system' && message.date === game.date
    ) === true
  return readerLovers.filter((lover) => {
    const drift = drifts[lover]
    if (!drift) return false
    return [lover, drift.to].some((charId) => game.cast.includes(charId) || spoke(charId))
  })
}

/**
 * Files what an ending banked about the reader's losses: the lovers who leave him, through the
 * same fold a reported breakup takes, and the grudge memory of each man he displaced. Idempotent,
 * so the boundary can replay off its own save.
 */
export function applyReaderLosses(breakups: readonly ReaderBreakup[], rivals: readonly string[]): void {
  const game = useGameStore.getState()
  game.applyReaderBreakups(breakups)
  for (const charId of rivals) {
    const held = game.charInfo[charId]?.jealousyMemories
    game.setJealousyMemories(
      charId,
      upsertJealousyMemory(held, rivalMemoryOf(game.characters[charId], game.date))
    )
  }
}

/**
 * Where a pair with no haunt between them can be run into: on campus, open today, and never the
 * Lowrises, whose label is one girl's own dorm.
 */
function runInSpots(): string[] {
  const game = useGameStore.getState()
  return LOCATIONS.filter(
    (def) =>
      def.onCampus === true &&
      def.id !== LOWRISE_LOCATION &&
      !hauntClosedOn(def.id, 'fun', game.date, game.occasions)
  ).map((def) => def.id)
}

/**
 * Records whoever the settle just made friends for the first time, stamped with the slot
 * that did it. **Run before the settled map is stored**, since the crossing is the difference
 * between the two; idempotent under the boundary's replay, where the two maps agree.
 */
export function applyNewFriendships(before: NpcRelationshipMap, after: NpcRelationshipMap): void {
  const game = useGameStore.getState()
  const fresh = newFriendships(before, after, game.npcFriendships)
  if (fresh.length === 0) return
  game.recordNpcFriendships(
    fresh.map((pair) => ({ ...pair, date: game.date, time: game.time }))
  )
}

/**
 * Where a character is and who is with her, for the two prompts that say so.
 */
export function npcWhereaboutsFor(
  charId: string,
  date: number,
  time: TimeSlot,
  overlay: NpcSlotOverlay | null,
  charInfo: Readonly<Record<string, CharInfo | undefined>> = useGameStore.getState().charInfo
): NpcWhereabouts | null {
  const game = useGameStore.getState()
  // Ahead of the homebound branch: a girl abroad on a stay-in day is not in her room.
  if (charUnavailableNow(charId, date, time)) return null

  const stamped = overlay && overlay.date === date && overlay.time === time ? overlay : null
  const group = stamped
    ? (stamped.groups.find((g) => g.members.includes(charId)) ?? null)
    : charOverlayGroupNow(charId, date, time)

  const homebound = isMoodHomebound(
    date,
    charInfo[charId]?.moodCycleOffset ?? 0,
    game.characters[charId]?.gender ?? 'woman'
  )
  const standing = charStandingHauntAt(charId, date, time)
  const location = homebound ? ROOM_LOCATION : (group?.location ?? standing?.location)
  if (!location) return null

  const knownNames: string[] = []
  let unknown = 0
  // A homebound girl is alone whatever the overlay said: a stale one from before the day
  // turned can still list her.
  for (const member of homebound ? [] : (group?.members ?? [])) {
    if (member === charId) continue
    const character = game.characters[member]
    if (!character) continue
    if (charInfo[member]?.nameKnown) knownNames.push(character.firstName)
    else unknown++
  }

  const atHaunt = !homebound && standing && location === standing.location
  return { location, knownNames, unknown, ...(atHaunt ? { haunt: standing } : {}) }
}
